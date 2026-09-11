"""Create local-only environment files without overwriting existing configuration."""
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parents[1]


def create(relative: str, content: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        print(f"Kept existing {relative}")
        return
    path.write_text(content, encoding="utf-8")
    print(f"Created {relative}")


create("apps/api/.env", f'''APP_ENV=development
DATABASE_URL=postgresql+psycopg://thienlong:local-development-only@127.0.0.1:55432/thienlong_dev
REDIS_URL=redis://127.0.0.1:56379/0
JWT_SECRET={secrets.token_urlsafe(48)}
JWT_EXPIRE_MINUTES=480
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
PUBLIC_FRONTEND_URL=http://localhost:3000
EVENT_NAME="Thiên Long · Hội nghị khách hàng"
EVENT_START_AT=2026-12-12T18:00:00+07:00
EVENT_VENUE="Trung tâm hội nghị · TP. Hồ Chí Minh"
EVENT_COUNTERS=COUNTER_01,COUNTER_02,COUNTER_03
EVENT_MAX_COMPANIONS=3
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=LocalDemo-ChangeMe-2026!
PG_ACCESS_CODE=thienlong-pg
WELCOME_SCREEN_TOKEN={secrets.token_urlsafe(32)}
''')
create("apps/web/.env.local", '''NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_ADMIN_EMAIL=admin@example.com
NEXT_PUBLIC_DEMO_ADMIN_PASSWORD=LocalDemo-ChangeMe-2026!
''')
print("Local demo credentials: admin@example.com / LocalDemo-ChangeMe-2026!; PG: thienlong-pg")
print("These credentials are for local development only. Production uses your own secrets.")
