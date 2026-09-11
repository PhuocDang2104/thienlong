# Thiên Long · Event Check-in

Hệ thống quản lý khách mời cho một sự kiện khoảng 350 khách: một QR dùng cho RSVP và check-in, quản trị khách, import/export, màn hình chào và cập nhật realtime bằng **Redis Streams + SSE**.

**Stack:** Next.js / TypeScript / Tailwind / shadcn/ui / TanStack Table; FastAPI / SQLAlchemy / Alembic / PostgreSQL; Redis; Docker. Frontend triển khai Vercel, backend chạy VNPT Cloud sau Caddy Docker hiện có.

| Giao diện | Đường dẫn |
|---|---|
| Cổng truy cập | `/` |
| Khách xác nhận tham dự | `/i/{invite_token}` |
| PG quét QR / tìm khách | `/pg` |
| BTC / Admin | `/admin` |
| Màn hình chào | `/welcome/{screen_token}` |

## Chạy local

Cần Node.js 22+, Python 3.11+ và Docker Desktop/Compose. Các lệnh dưới đây chạy từ thư mục repo; dùng hai terminal cho API và web.

```powershell
python -m venv .venv
python scripts/setup_local.py
docker compose -f deploy/docker-compose.dev.yml up -d --wait
.venv/Scripts/python -m pip install -r apps/api/requirements-dev.txt
cd apps/api
../../.venv/Scripts/python -m alembic upgrade head
../../.venv/Scripts/python -m app.seed --demo
../../.venv/Scripts/python -m uvicorn app.main:app --reload --no-access-log
```

Terminal thứ hai:

```powershell
cd apps/web
npm ci
npm run dev
```

Mở http://localhost:3000. Tài khoản local do script tạo và điền sẵn trên form: `admin@example.com` / `LocalDemo-ChangeMe-2026!`; mã PG `TL-DEMO-2026`. Lệnh `--demo` đồng bộ đúng ba khách trong [`apps/api/data/demo-guests.csv`](apps/api/data/demo-guests.csv), tự sinh token cho khách mới và giữ token khi chạy lại. Script không ghi đè cấu hình đã tồn tại. Link Welcome và QR thật lấy trong giao diện quản trị. Trên Linux/macOS thay `.venv/Scripts/python` bằng `.venv/bin/python`.

## Tài liệu bàn giao

- [Báo cáo dataflow, nguyên lý, API và hướng dẫn sử dụng](docs/BAO_CAO_HE_THONG.md).
- [Hướng dẫn deploy VNPT Cloud, Redis, PostgreSQL, Caddy và Vercel](docs/HUONG_DAN_DEPLOY.md).
- [Hợp đồng API](docs/API_CONTRACT.md).
- [Blueprint gốc](docs/THIENLONG_EVENT_TECHNICAL_BLUEPRINT.md). Yêu cầu bổ sung Redis/SSE của chủ sản phẩm được ưu tiên hơn phần polling trong blueprint.

## Cấu trúc

```text
apps/api/       API, database models, migrations, seed, tests
apps/web/       Bốn giao diện dùng cùng Next.js App Router
deploy/         Compose production/dev/managed và block Caddy bổ sung
scripts/        Khởi tạo local, backup và kiểm tra tích hợp
docs/           Yêu cầu gốc và tài liệu bàn giao
.github/        CI kiểm tra backend và frontend
```

Cloud production dùng tài khoản riêng trong `.env.example`; môi trường demo có thể cấu hình Vercel để điền sẵn tài khoản theo hướng dẫn deploy. Container backend tự chạy migration và đồng bộ CSV ba khách khi khởi động; không cần tạo tài khoản PG riêng.

## Kiểm tra

```powershell
cd apps/api
../../.venv/Scripts/python -m pytest -q
cd ../web
npm run lint
npm run typecheck
npm test
npm run build
```

Để chạy thêm kiểm tra đồng thời trên PostgreSQL, khai `TEST_DATABASE_URL` trỏ database riêng tên **`thienlong_test`** trước pytest. Test tạo/xóa schema tạm riêng trong database này. Không dùng database khách thật.

Khi API/web local đang chạy, từ root:

```powershell
.venv/Scripts/python scripts/smoke_realtime.py
.venv/Scripts/python -m pip install -r scripts/requirements-test.txt
.venv/Scripts/python -m playwright install chromium webkit
.venv/Scripts/python scripts/e2e_browser.py
.venv/Scripts/python scripts/e2e_admin.py
```

Các script tích hợp tạo khách kiểm thử trong dữ liệu development. Ảnh kiểm tra nằm ở `.local/screenshots`. Next.js dùng Webpack và một build worker để hạn chế bộ nhớ khi build trên máy local; nên chạy build xong rồi `npm start` trước khi kiểm tra trình duyệt.
