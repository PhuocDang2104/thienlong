"""Local browser acceptance checks against the running web/API, without mocks for data.

Requires scripts/requirements-test.txt and `python -m playwright install chromium
webkit`. Synthetic camera frames verify QR decoding; real phone cameras still
require event-site acceptance. Adds clearly named development guests.
"""
import base64
import json
import re
import shutil
import uuid
from pathlib import Path

import httpx
from dotenv import dotenv_values
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CONFIG = dotenv_values(ROOT / "apps/api/.env")
ARTIFACTS = ROOT / ".local/screenshots"
WEB = "http://localhost:3000"
API = "http://localhost:8000/api/v1"


def main():
    if CONFIG.get("APP_ENV") != "development":
        raise RuntimeError("Browser checks require development configuration")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(timeout=30)
    login = client.post(API + "/admin/login", json={"email": CONFIG["ADMIN_EMAIL"], "password": CONFIG["ADMIN_PASSWORD"]})
    login.raise_for_status()
    auth = {"Authorization": "Bearer " + login.json()["access_token"]}
    event = client.get(API + "/admin/event", headers=auth).json()
    batch = uuid.uuid4().hex[:7]
    names = [f"Khách kiểm thử {batch} {index}" for index in range(1, 4)]
    csv = "name,company,email,phone\n" + "\n".join(f"{name},Đối tác Thiên Long,browser-{batch}-{i}@example.com," for i, name in enumerate(names))
    result = client.post(API + "/admin/guests/import", headers=auth, files={"file": ("browser.csv", csv.encode(), "text/csv")})
    result.raise_for_status()
    guests = [client.get(API + "/admin/guests", headers=auth, params={"search": name}).json()["items"][0] for name in names]
    qr = client.get(API + f"/admin/guests/{guests[0]['id']}/qr.png", headers=auth)
    qr.raise_for_status()
    qr_data_url = "data:image/png;base64," + base64.b64encode(qr.content).decode()
    console_errors = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        desktop = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="vi-VN")
        admin = desktop.new_page()
        admin.on("pageerror", lambda error: console_errors.append(str(error)))
        admin.goto(WEB + "/admin/login")
        admin.get_by_label("Email", exact=True).fill(CONFIG["ADMIN_EMAIL"])
        admin.get_by_label("Mật khẩu", exact=True).fill(CONFIG["ADMIN_PASSWORD"])
        admin.get_by_role("button", name="Đăng nhập", exact=True).click()
        expect(admin).to_have_url(WEB + "/admin", timeout=20000)
        expect(admin.get_by_role("heading", name="Tổng quan", exact=True)).to_be_visible(timeout=20000)
        admin.screenshot(path=str(ARTIFACTS / "admin-desktop.png"), full_page=True)

        mobile_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="vi-VN")
        invitation = mobile_context.new_page()
        invitation.on("pageerror", lambda error: console_errors.append(str(error)))
        invitation.goto(WEB + "/i/" + guests[0]["invite_token"])
        expect(invitation.get_by_role("heading", name=names[0], exact=True)).to_be_visible()
        invitation.get_by_label("Có, tôi tham dự", exact=True).check()
        invitation.get_by_role("button", name="Tăng số người đi cùng").click()
        invitation.get_by_label("Lời nhắn cho Ban tổ chức").fill("Cần hỗ trợ chỗ ngồi gần lối đi")
        invitation.screenshot(path=str(ARTIFACTS / "invitation-mobile.png"), full_page=True)
        invitation.get_by_role("button", name="Xác nhận phản hồi").click()
        expect(invitation.get_by_role("heading", name="Đã ghi nhận phản hồi")).to_be_visible()
        assert invitation.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        mobile_context.close()

        welcome_context = browser.new_context(viewport={"width": 1920, "height": 1080})
        welcome = welcome_context.new_page()
        welcome.on("pageerror", lambda error: console_errors.append(str(error)))
        screen = event["welcome_screen_url"].rsplit("/", 1)[-1]
        welcome.goto(WEB + "/welcome/" + screen)

        # Feed the real backend-generated PNG into a synthetic browser camera.
        pg_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg_context.add_init_script("""(() => {
          const source = """ + json.dumps(qr_data_url) + """;
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => {
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
            const ctx = canvas.getContext('2d'); const image = new Image();
            image.src = source; await image.decode();
            function draw() { ctx.fillStyle='white'; ctx.fillRect(0,0,640,480); ctx.drawImage(image,160,80,320,320); }
            draw(); const interval = setInterval(draw, 70); const stream = canvas.captureStream(15);
            stream.getTracks().forEach(track => track.addEventListener('ended', () => clearInterval(interval)));
            window.__testCameraCanvas = canvas; return stream;
          }});
        })();""")
        pg = pg_context.new_page()
        pg.on("pageerror", lambda error: console_errors.append(str(error)))
        pg.goto(WEB + "/pg")
        pg.get_by_label("Mã truy cập sự kiện").fill(CONFIG["PG_ACCESS_CODE"])
        pg.get_by_role("button", name="Bắt đầu check-in").click()
        pg.get_by_role("button", name="Mở camera", exact=True).click()
        expect(pg.get_by_role("heading", name=names[0], exact=True)).to_be_visible(timeout=25000)
        pg.get_by_role("button", name="Xác nhận check-in", exact=True).click()
        expect(pg.get_by_text("Check-in thành công", exact=True)).to_be_visible()
        expect(welcome.get_by_text(names[0], exact=True)).to_be_visible(timeout=15000)
        pg.screenshot(path=str(ARTIFACTS / "pg-success-mobile.png"), full_page=True)
        welcome.screenshot(path=str(ARTIFACTS / "welcome-desktop.png"))
        expect(welcome.get_by_text(names[0], exact=True)).not_to_be_visible(timeout=11000)

        pg.get_by_role("button", name="Khách tiếp theo").click()
        pg.get_by_role("button", name=re.compile("Tìm theo tên")).click()
        pg.get_by_label("Tìm khách theo tên", exact=True).fill(names[0])
        pg.get_by_role("button", name=re.compile(re.escape(names[0]))).click()
        expect(pg.get_by_text("Khách đã check-in", exact=True)).to_be_visible()
        pg.get_by_role("button", name="Khách tiếp theo").click()
        pg.get_by_role("button", name=re.compile("Tìm theo tên")).click()
        pg.get_by_label("Tìm khách theo tên", exact=True).fill(names[1])
        pg.get_by_role("button", name=re.compile(re.escape(names[1]))).click()
        pg.get_by_role("button", name="Xác nhận check-in", exact=True).click()
        expect(pg.get_by_text("Check-in thành công", exact=True)).to_be_visible()

        # Exercise desktop table search and mobile drawer/layout on the same real session.
        admin.get_by_role("navigation", name="Điều hướng quản trị").get_by_role("link", name="Khách mời", exact=True).click()
        expect(admin.get_by_role("table")).to_be_visible(timeout=15000)
        expect(admin.get_by_text("Cần hỗ trợ chỗ ngồi gần lối đi", exact=True).last).to_be_visible(timeout=15000)
        admin.screenshot(path=str(ARTIFACTS / "guests-desktop.png"), full_page=True)
        admin.set_viewport_size({"width": 390, "height": 844})
        admin.get_by_role("button", name="Mở menu", exact=True).click()
        expect(admin.get_by_role("dialog")).to_be_visible()
        admin.get_by_role("button", name="Đóng menu", exact=True).click()
        assert admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        admin.screenshot(path=str(ARTIFACTS / "guests-mobile.png"), full_page=True)

        # Release Chromium pages before WebKit; both engines are memory-heavy on CI/dev hosts.
        desktop.close()
        welcome_context.close()
        pg_context.close()

        # WebKit needs temporary disk space to create a browser profile. Keep the
        # functional suite useful on constrained handoff machines and report the skip.
        webkit_status = "passed"
        if shutil.disk_usage(ROOT).free < 512 * 1024 * 1024:
            webkit_status = "skipped: less than 512 MB free disk space"
            webkit = None
        else:
            webkit = playwright.webkit.launch()
            safari_context = webkit.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            safari_context.add_init_script("if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => { throw new DOMException('Denied', 'NotAllowedError'); }});")
            safari = safari_context.new_page()
            safari.on("pageerror", lambda error: console_errors.append(str(error)))
            safari.goto(WEB + "/i/" + guests[2]["invite_token"])
            safari.get_by_label("Không thể tham dự", exact=True).check()
            safari.get_by_role("button", name="Xác nhận phản hồi").click()
            expect(safari.get_by_role("heading", name="Đã ghi nhận phản hồi")).to_be_visible()
            safari.goto(WEB + "/pg")
            safari.get_by_label("Mã truy cập sự kiện").fill(CONFIG["PG_ACCESS_CODE"])
            safari.get_by_role("button", name="Bắt đầu check-in").click()
            safari.get_by_role("button", name="Mở camera", exact=True).click()
            expect(safari.get_by_role("alert").filter(has_text=re.compile("camera", re.I))).to_be_visible(timeout=15000)
            safari.screenshot(path=str(ARTIFACTS / "camera-fallback-webkit.png"), full_page=True)
            safari_context.close()
        denied_context = browser.new_context(viewport={"width": 390, "height": 844})
        denied_context.add_init_script("Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => { throw new DOMException('Denied', 'NotAllowedError'); }});")
        denied = denied_context.new_page()
        denied.goto(WEB + "/pg")
        denied.get_by_label("Mã truy cập sự kiện").fill(CONFIG["PG_ACCESS_CODE"])
        denied.get_by_role("button", name="Bắt đầu check-in").click()
        denied.get_by_role("button", name="Mở camera", exact=True).click()
        expect(denied.get_by_role("alert").filter(has_text="Chưa được cấp quyền camera")).to_be_visible(timeout=15000)
        denied.screenshot(path=str(ARTIFACTS / "camera-denied-chromium.png"), full_page=True)
        denied_context.close()
        assert not console_errors, console_errors
        if webkit:
            webkit.close()
        browser.close()
    client.close()
    print("PASS: real admin login, mobile RSVP Chromium, synthetic-camera QR decoding, check-in, duplicate, manual search, welcome SSE/reset, responsive table/drawer, camera denied.")
    print(f"WebKit: {webkit_status}")
    print(f"Screenshots: {ARTIFACTS}")


if __name__ == "__main__":
    main()
