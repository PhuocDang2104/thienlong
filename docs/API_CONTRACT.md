# API contract triển khai

Base `/api/v1`. JSON snake_case; datetimes ISO 8601 UTC. Auth `Authorization: Bearer ...`, sessionStorage phía trình duyệt. Lỗi `{detail: string | validation_errors}`; duplicate HTTP 409 trả object check-in trực tiếp. Mọi response riêng tư `Cache-Control: no-store`.

## Types

`Event`: `{id, name, start_at, venue, counters: string[], max_companions: number}`.

`Guest`: `{id, name, company, email, phone, notes, invite_token, invitation_url, rsvp_status: pending|accepted|declined, companions, checked_in_at: string|null, counter: string|null, created_at}`. `notes` là lời nhắn khách gửi cho BTC, tối đa 1.000 ký tự; chỉ trang mời mang đúng token và API Admin được đọc.

`PgGuest`: `{guest_token, name, company, rsvp_status, companions, checked_in_at, counter}` (không email, phone, id).

`Checkin`: `{status: checked_in|already_checked_in, guest_name, company, checked_in_at, counter}`.

## Public / PG

- GET `/public/event`: Event bỏ id (name, start_at, venue, counters, max_companions).
- GET `/public/invitations/{token}`: `{guest_name, company, event_name, start_at, venue, rsvp_status, companions, notes, max_companions}`.
- PUT `/public/invitations/{token}/rsvp`: body `{status: accepted|declined, companions: number, notes?: string}`, response cùng invitation. Declined companions phải 0.
- POST `/pg/session`: `{access_code, counter}` -> `{access_token, token_type: bearer, expires_in, counter}`.
- GET `/pg/guests/search?q=...`: `PgGuest[]` tối đa 30, min 2 ký tự.
- GET `/pg/guests/by-token/{token}`: PgGuest.
- POST `/pg/checkins`: `{guest_token, counter}` -> Checkin; counter phải khớp JWT.
- GET `/public/welcome/{screen_token}`: `{event_name, latest_guest: {id, name, company, checked_in_at}|null}`. Snapshot ban đầu. Hiển thị 7 giây, client bỏ qua id đã hiển thị.

## Admin

- POST `/admin/login`: `{email,password}` -> `{access_token, token_type: bearer, expires_in}`.
- GET `/admin/me`: `{id,email}`.
- GET `/admin/event`: Event + `{welcome_screen_url}`.
- GET `/admin/guests?search=&rsvp_status=&checkin_status=checked_in|not_checked_in&page=1&page_size=20&sort=name|-name|created_at|-created_at|checked_in_at|-checked_in_at`: `{items: Guest[], total, page, page_size}`.
- POST `/admin/guests`: `{name,company?,email?,phone?,rsvp_status?,companions?}` -> Guest, HTTP 201. Backend tự sinh `invite_token`; request không được tự truyền token hoặc ghi chú thay khách.
- GET `/admin/guests/{id}`: Guest.
- PATCH `/admin/guests/{id}`: `{name?,company?,email?,phone?,rsvp_status?,companions?}` -> Guest.
- POST `/admin/guests/import/preview`: multipart field `file` CSV/XLSX -> `{rows: [{row_number,name,company,email,phone,notes}], errors: [{row_number,message}], total, valid_count}`. Không ghi DB.
- POST `/admin/guests/import`: multipart `file` -> `{imported, skipped}`. Atomic, reject nếu lỗi; skip email trùng, không skip tên trùng; token random sinh khi commit.
- GET `/admin/guests/template.csv`: file mẫu.
- GET `/admin/guests/qr.zip`: zip QR PNG + mapping CSV (tất cả khách, admin only).
- GET `/admin/guests/{id}/qr.png`: QR riêng.
- GET `/admin/dashboard/summary`: `{total_guests,accepted,declined,pending,expected_attendance,checked_in,not_arrived,no_show,checkin_rate,registered_arrived, recent_checkins: [{id,guest_name,company,checked_in_at,counter}], checkins_by_counter: [{counter,count}]}`. checked_in là số thư mời đã đến; expected_attendance là accepted + companions; not_arrived = total_guests - checked_in; no_show = accepted chưa checkin; checkin_rate = checked_in / total_guests *100; registered_arrived = sum(1 + companions) khách đã check-in (ước tính, không khẳng định thực tế người đi cùng).
- GET `/admin/dashboard/checkins`: `[{time: ISO datetime, count}]`, nhóm 15 phút; optional `from`, `to` ISO.
- GET `/admin/export/checkins.xlsx` hoặc `.csv`: báo cáo toàn bộ khách (bao gồm chưa đến), định nghĩa KPI như trên.

Seed CLI nhập event/admin/mã PG từ biến env. `--guests-file data/demo-guests.csv` upsert khách theo email: khách mới tự sinh token; khách cũ chỉ cập nhật tên, công ty, email, điện thoại và giữ token/RSVP/check-in/notes. Docker production tự chạy migration và lệnh này trước Uvicorn. `--replace-guests` chỉ được phép ở development để reset toàn bộ dữ liệu khách/check-in. Config EVENT_NAME, EVENT_START_AT, EVENT_VENUE, EVENT_COUNTERS (comma separated), EVENT_MAX_COMPANIONS, ADMIN_EMAIL, ADMIN_PASSWORD, PG_ACCESS_CODE, WELCOME_SCREEN_TOKEN. Backend dùng DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_EXPIRE_MINUTES, APP_ENV, CORS_ORIGINS (comma separated), PUBLIC_FRONTEND_URL.

## Cập nhật yêu cầu: Redis + SSE

Yêu cầu mới của chủ sản phẩm thay thế polling/không Redis trong blueprint gốc.

- Ghi business data và outbox trong cùng PostgreSQL transaction. Dispatcher phát outbox vào Redis Streams sau commit, retry khi Redis gián đoạn. SSE đọc Redis và gửi trực tiếp đến trình duyệt. PostgreSQL là nguồn dữ liệu chuẩn.
- GET `/admin/stream`: Bearer JWT qua `fetch()` streaming; `ready`, `checkin`, `rsvp`, `guests_changed` để làm mới snapshot/table. Không đặt JWT trong URL.
- GET `/public/welcome/{screen_token}/stream`: chỉ phát check-in tối thiểu cho màn hình chào.
- Headers: `Accept: text/event-stream`, `Last-Event-ID` khi nối lại. SSE `id` là Redis stream ID; bỏ qua checkin trùng theo ID bản ghi checkin.
- Heartbeat tối đa 15 giây; client reconnect có backoff. Welcome xếp hàng khách từ event, mỗi khách 7 giây. Không polling định kỳ trong hoạt động bình thường.
- Backend cần `REDIS_URL`; Redis nằm trong mạng Docker nội bộ, không kết nối trực tiếp từ frontend.
