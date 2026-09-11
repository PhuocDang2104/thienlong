"""Exercise the running local API, real PostgreSQL, Redis and SSE end to end.

Adds one clearly named test guest to the development event. Never targets a
remote host. Run: .venv/Scripts/python scripts/smoke_realtime.py
"""
import asyncio
import io
import json
import uuid
import zipfile
from pathlib import Path

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
CONFIG = dotenv_values(ROOT / "apps/api/.env")
BASE = "http://localhost:8000/api/v1"


async def consume_sse(client, path, headers, queue):
    async with client.stream("GET", BASE + path, headers=headers, timeout=None) as response:
        assert response.status_code == 200, f"SSE status {response.status_code}"
        assert "text/event-stream" in response.headers["content-type"]
        event, event_id, data = "message", "", []
        async for line in response.aiter_lines():
            if not line:
                if data:
                    await queue.put((event, event_id, json.loads("\n".join(data))))
                event, event_id, data = "message", "", []
            elif line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("id:"):
                event_id = line[3:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].lstrip())


async def await_event(queue, wanted, predicate=lambda data: True):
    async with asyncio.timeout(20):
        while True:
            event, cursor, data = await queue.get()
            if event == wanted and predicate(data):
                return cursor, data


async def main():
    if CONFIG.get("APP_ENV") != "development":
        raise RuntimeError("Smoke test requires apps/api/.env APP_ENV=development")
    async with httpx.AsyncClient(timeout=20) as client:
        health = await client.get("http://localhost:8000/health/ready")
        assert health.status_code == 200, health.text
        auth = await client.post(BASE + "/admin/login", json={
            "email": CONFIG["ADMIN_EMAIL"], "password": CONFIG["ADMIN_PASSWORD"],
        })
        assert auth.status_code == 200, auth.text
        headers = {"Authorization": "Bearer " + auth.json()["access_token"]}
        event = (await client.get(BASE + "/admin/event", headers=headers)).json()
        screen_token = event["welcome_screen_url"].rstrip("/").rsplit("/", 1)[-1]
        admin_queue, welcome_queue = asyncio.Queue(), asyncio.Queue()
        tasks = [
            asyncio.create_task(consume_sse(client, "/admin/stream", headers, admin_queue)),
            asyncio.create_task(consume_sse(client, f"/public/welcome/{screen_token}/stream", {}, welcome_queue)),
        ]
        try:
            await await_event(admin_queue, "ready")
            await await_event(welcome_queue, "ready")
            batch = uuid.uuid4().hex[:8]
            name = f"Kiểm thử SSE {batch}"
            content = f"name,company,email,phone\n{name},Thiên Long test,smoke-{batch}@example.com,0900000000\n"
            files = {"file": ("smoke.csv", content.encode("utf-8"), "text/csv")}
            preview = await client.post(BASE + "/admin/guests/import/preview", headers=headers, files=files)
            assert preview.status_code == 200 and preview.json()["valid_count"] == 1, preview.text
            imported = await client.post(BASE + "/admin/guests/import", headers=headers, files=files)
            assert imported.status_code == 200 and imported.json()["imported"] == 1, imported.text
            await await_event(admin_queue, "guests_changed")
            repeated = await client.post(BASE + "/admin/guests/import", headers=headers, files=files)
            assert repeated.json()["imported"] == 0 and repeated.json()["skipped"] == 1, repeated.text
            rows = await client.get(BASE + "/admin/guests", headers=headers, params={"search": name})
            guest = rows.json()["items"][0]
            token = guest["invite_token"]
            invitation = await client.get(BASE + f"/public/invitations/{token}")
            assert invitation.json()["guest_name"] == name
            assert "email" not in invitation.json() and "id" not in invitation.json()
            rsvp = await client.put(BASE + f"/public/invitations/{token}/rsvp", json={"status": "accepted", "companions": 1})
            assert rsvp.status_code == 200, rsvp.text
            await await_event(admin_queue, "rsvp")
            pg = await client.post(BASE + "/pg/session", json={"access_code": CONFIG["PG_ACCESS_CODE"], "counter": event["counters"][0]})
            assert pg.status_code == 200, pg.text
            pg_headers = {"Authorization": "Bearer " + pg.json()["access_token"]}
            forbidden = await client.get(BASE + "/admin/guests", headers=pg_headers)
            assert forbidden.status_code == 403
            search = await client.get(BASE + "/pg/guests/search", headers=pg_headers, params={"q": name})
            assert search.status_code == 200 and len(search.json()) == 1
            assert "email" not in search.json()[0]
            payload = {"guest_token": token, "counter": event["counters"][0]}
            results = await asyncio.gather(*[
                client.post(BASE + "/pg/checkins", headers=pg_headers, json=payload) for _ in range(2)
            ])
            statuses = sorted(result.status_code for result in results)
            assert statuses in ([200, 409], [201, 409]), [r.text for r in results]
            cursor, pushed = await await_event(welcome_queue, "checkin", lambda d: d["name"] == name)
            assert pushed["company"] == "Thiên Long test" and "counter" not in pushed
            await await_event(admin_queue, "checkin", lambda d: d["name"] == name)
            assert cursor and pushed["id"]
            changed_rsvp = await client.put(BASE + f"/public/invitations/{token}/rsvp", json={"status": "declined", "companions": 0})
            assert changed_rsvp.status_code == 409
            summary = await client.get(BASE + "/admin/dashboard/summary", headers=headers)
            assert summary.status_code == 200 and summary.json()["checked_in"] >= 1
            exported = await client.get(BASE + "/admin/export/checkins.xlsx", headers=headers)
            assert exported.status_code == 200 and zipfile.is_zipfile(io.BytesIO(exported.content))
            qr = await client.get(BASE + f"/admin/guests/{guest['id']}/qr.png", headers=headers)
            assert qr.status_code == 200 and qr.content.startswith(b"\x89PNG")
            print("PASS: health, auth, import preview/commit/dedupe, RSVP, PostgreSQL concurrent check-in, roles, exports, QR, Redis -> admin/welcome SSE.")
            print(f"Development test batch retained for review: {batch}")
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
