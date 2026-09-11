# Hướng dẫn triển khai toàn bộ hệ thống

Mô hình: **Vercel → trình duyệt → HTTPS / Caddy `minute_caddy` → FastAPI → PostgreSQL + Redis → SSE về trình duyệt**. Frontend gọi trực tiếp API cloud, không chạy SSE qua Vercel Function. Redis và PostgreSQL không mở cổng ra Internet.

Các tên miền trong tài liệu là ví dụ; cần thay bằng tên miền bạn quản lý. Repo cung cấp cấu hình, chưa tự tạo tài khoản VNPT/Vercel/DNS hoặc thay đổi server thật.

## 1. Chuẩn bị

- VNPT Cloud Linux đã có Docker Engine, Compose v2 và Caddy container `minute_caddy` như hệ thống hiện tại.
- Một domain API, ví dụ `thienlong-api.duckdns.org`, bản ghi A trỏ về IP cloud. Nếu dùng IPv6, AAAA phải trỏ đúng; xóa bản ghi AAAA sai.
- Cổng 80/443 vào Caddy; cổng 5432/6379/8000 không public.
- Tài khoản Vercel và Git repository chứa mã nguồn. Không đẩy file `.env`, guest exports hoặc backups lên Git.
- Mốc khởi đầu để kiểm thử tải: 2 vCPU / 2 GB RAM còn trống cho hệ thống này, SSD; điều chỉnh theo tải các app hiện có. Đây là cấu hình khởi điểm, không phải cam kết hiệu năng.

Repo không tạo thêm Caddy và không chiếm cổng 80/443. `thienlong-api` là alias riêng, tránh trùng `backend` của app BĐS.

## 2. Xác định mạng và file cấu hình của Caddy

Chạy trên **VNPT Cloud**, không chạy ở máy Windows local:

```bash
docker inspect minute_caddy --format '{{json .NetworkSettings.Networks}}'
docker inspect minute_caddy --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker exec minute_caddy caddy version
```

Ghi lại tên network, IP nội bộ Caddy và vị trí host được mount thành `/etc/caddy/Caddyfile` (đường dẫn có thể khác, dùng kết quả thực tế). Chọn network dùng để reverse proxy tới app.

Thiết lập `CADDY_NETWORK` bằng đúng tên đó. Compose dùng `external: true` để backend tham gia network đã tồn tại; đây là cơ chế nối service giữa các Compose project. [Docker networking](https://docs.docker.com/compose/how-tos/networking/).

Nếu network là default bridge không có DNS service hoặc chưa có mạng proxy phù hợp, tạo mạng riêng:

```bash
docker network create thienlong-proxy
docker network connect thienlong-proxy minute_caddy
```

Khi chọn phương án này, thêm `thienlong-proxy` dưới dạng external network vào **Compose nguồn đang quản lý Caddy** và gắn service Caddy vào mạng đó, để lần recreate Caddy không mất kết nối. Chỉ chạy `network connect` là chưa đủ cho các lần recreate sau.

`FORWARDED_ALLOW_IPS` đặt IP nội bộ Caddy, hoặc subnet của mạng proxy chuyên dụng. Tra subnet:

```bash
docker network inspect YOUR_CADDY_NETWORK --format '{{json .IPAM.Config}}'
```

Không dùng `*` khi có client không đáng tin truy cập được container; FastAPI/Uvicorn chỉ nên tin forwarded headers từ proxy đã xác định. [FastAPI behind a proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/).

## 3. Clone và khai báo backend

```bash
git clone YOUR_REPOSITORY_URL /opt/thienlong-checkin
cd /opt/thienlong-checkin
cp .env.example .env
chmod 600 .env
```

Sinh **mỗi secret một giá trị khác nhau**, ví dụ `openssl rand -hex 32`, rồi nhập vào `.env`. Không để nguyên `CHANGE_ME`. Dùng hex giúp password trong URL PostgreSQL/Redis không cần percent-encoding.

| Biến | Giá trị / ý nghĩa |
|---|---|
| `APP_ENV` | `production` |
| `POSTGRES_DB` | `thienlong` |
| `POSTGRES_USER` | `thienlong` |
| `POSTGRES_PASSWORD` | Secret DB |
| `DATABASE_URL` | `postgresql+psycopg://thienlong:DB_PASSWORD@postgres:5432/thienlong` |
| `REDIS_PASSWORD` | Secret Redis riêng |
| `REDIS_URL` | `redis://:REDIS_PASSWORD@redis:6379/0` |
| `JWT_SECRET` | Chuỗi ngẫu nhiên mạnh, tối thiểu 32 byte |
| `JWT_EXPIRE_MINUTES` | `480` (8 giờ) |
| `CORS_ORIGINS` | Origin Vercel chính xác, không có `/` cuối; nhiều origin ngăn bởi dấu phẩy |
| `PUBLIC_FRONTEND_URL` | URL chính thức dùng tạo QR, ví dụ `https://thienlong-event.vercel.app` |
| `CADDY_NETWORK` | Tên Docker network đã xác định |
| `FORWARDED_ALLOW_IPS` | IP Caddy hoặc subnet proxy đáng tin |
| `EVENT_NAME` | Tên sự kiện, đặt trong dấu nháy nếu có khoảng trắng |
| `EVENT_START_AT` | ISO 8601 có múi giờ, ví dụ `2026-12-12T18:00:00+07:00` |
| `EVENT_VENUE` | Địa điểm thực tế |
| `EVENT_COUNTERS` | `COUNTER_01,COUNTER_02,COUNTER_03` |
| `EVENT_MAX_COMPANIONS` | Số người đi cùng tối đa mỗi lời mời |
| `ADMIN_EMAIL` | Email đăng nhập BTC |
| `ADMIN_PASSWORD` | Mật khẩu mạnh do bạn đặt |
| `PG_ACCESS_CODE` | Mã chung chỉ cấp cho PG của sự kiện |
| `WELCOME_SCREEN_TOKEN` | Token ngẫu nhiên dài; bảo vệ link màn hình chào |

Chọn tên frontend trước khi in QR. URL QR dùng `PUBLIC_FRONTEND_URL`; sau khi in phải duy trì domain và đường dẫn `/i/{token}`. Đổi env không sửa QR đã in.

## 4. Build, migration, tạo sự kiện, tài khoản và ba khách demo

Các lệnh từ `/opt/thienlong-checkin`:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml config --quiet
docker compose --env-file .env -f deploy/docker-compose.yml up -d --wait postgres redis
docker compose --env-file .env -f deploy/docker-compose.yml build backend
docker compose --env-file .env -f deploy/docker-compose.yml up -d --wait backend
docker compose --env-file .env -f deploy/docker-compose.yml ps
```

Lệnh khởi động của container tự chạy tuần tự:

```text
alembic upgrade head
python -m app.seed --guests-file data/demo-guests.csv
uvicorn
```

Vì vậy lần deploy đầu sẽ tạo schema, sự kiện, Admin và đúng ba khách **Diệp Gia Luật, Ánh Hiếu, Đặng Như Phước** từ [`demo-guests.csv`](../apps/api/data/demo-guests.csv). Với mỗi email mới, backend tạo một token mật mã 256 bit rồi lưu ngay trên bản ghi khách. QR không phải file cố định trong database; endpoint QR và ZIP dựng PNG từ `PUBLIC_FRONTEND_URL + /i/{token}`, nên dùng được ngay sau khi seed.

Các lần restart/deploy sau **upsert theo email**: tên, công ty và điện thoại thay đổi theo CSV; token, RSVP, check-in và lời nhắn khách đã gửi được giữ nguyên. Khách được tạo thêm trên Admin cũng không bị xóa. Cơ chế này giúp việc restart an toàn và không làm hỏng QR đã phát.

Muốn sửa hoặc bổ sung danh sách tự động trên cloud: cập nhật file CSV đã commit, mỗi dòng phải có email duy nhất, push code rồi build/redeploy backend. Có thể chạy đồng bộ ngay trên image hiện tại bằng:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml run --rm backend \
  python -m app.seed --guests-file data/demo-guests.csv
docker compose --env-file .env -f deploy/docker-compose.yml up -d --force-recreate backend
```

Không dùng `--replace-guests` trên cloud; tùy chọn này chỉ hoạt động với `APP_ENV=development` và xóa toàn bộ khách/check-in để đưa local về dữ liệu demo sạch. Seed tạo event và admin nếu chưa tồn tại; chạy lại không tự đổi cấu hình đang dùng. Khi cần cập nhật cấu hình event/mật khẩu/mã PG, sửa `.env`, chạy có chủ đích:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml run --rm backend python -m app.seed --update-config
docker compose --env-file .env -f deploy/docker-compose.yml up -d --force-recreate backend
```

Đổi `JWT_SECRET` buộc các phiên đăng nhập lại. Nếu cần thu hồi ngay toàn bộ phiên PG/Admin sau khi lộ mã, xoay JWT secret cùng credentials. Đổi welcome token làm link màn hình cũ hết hiệu lực; cập nhật thiết bị LED.

Chạy **một backend replica, một Uvicorn worker** trong cấu hình bàn giao. Không tự tăng `--workers` mà chưa rà soát rate limiter và kiểm thử dispatcher/SSE.

### Khi đã có PostgreSQL và Redis managed

Dùng **riêng** `deploy/docker-compose.managed.yml`, không ghép với file Compose mặc định. Đặt `DATABASE_URL` trỏ DB managed (thêm `?sslmode=require` hoặc chế độ kiểm chứng certificate theo nhà cung cấp), `REDIS_URL=rediss://...` nếu TLS. Cho phép IP/subnet backend trong firewall dịch vụ managed.

Thay `-f deploy/docker-compose.yml` bằng `-f deploy/docker-compose.managed.yml` trong các lệnh build/run/up, bỏ bước up postgres/redis. Cấu hình backup/PITR tại nhà cung cấp; script backup của repo chỉ dành cho Postgres container.

## 5. Thêm block vào Caddyfile hiện tại

Giữ các site `minute-api`, `bds-api`, `greenflow-api`, `pillars-api`, `dauvi-api` đang có. Thêm block trong [caddy.thienlong.caddyfile](../deploy/caddy.thienlong.caddyfile) vào cuối **Caddyfile trên host đã xác định ở bước 2**, thay domain nếu cần:

```caddyfile
thienlong-api.duckdns.org {
    @stream path /api/v1/admin/stream /api/v1/public/welcome/*/stream
    handle @stream {
        reverse_proxy thienlong-api:8000 {
            flush_interval -1
        }
    }

    handle {
        encode zstd gzip
        request_body {
            max_size 6MB
        }
        reverse_proxy thienlong-api:8000
    }
}
```

SSE có nhánh riêng để truyền ngay và không nén. Caddy hỗ trợ streaming `text/event-stream`; `flush_interval -1` yêu cầu flush ngay. Không dùng `handle_path` vì nó bỏ prefix mà backend cần. [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Backup Caddyfile host trước khi sửa. Validate rồi reload, không dừng container:

```bash
docker exec minute_caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec minute_caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec minute_caddy wget -qO- http://thienlong-api:8000/health
curl -fsS https://thienlong-api.duckdns.org/health
curl -fsS https://thienlong-api.duckdns.org/health/ready
```

Nếu Caddy mount một file đơn lẻ, một số editor thay file bằng rename khiến container còn thấy inode cũ. Kiểm tra nội dung bằng `docker exec minute_caddy cat /etc/caddy/Caddyfile`; đảm bảo container nhận đúng bản vừa sửa trước reload. Không recreate Caddy khi chưa đánh giá ảnh hưởng các app khác.

Không bật access log chứa nguyên URL `/i/{token}`, `/public/invitations/{token}` hoặc `/welcome/{token}`; link là thông tin truy cập. Backend đã che token trong request log và tắt access log mặc định Uvicorn.

## 6. Deploy frontend lên Vercel

1. Import Git repo trong Vercel → Add New Project.
2. Framework preset: **Next.js**. Root Directory: **`apps/web`**.
3. Node.js: **22.x**. Install: `npm ci`. Build: `npm run build`. Output Directory để framework tự nhận.
4. Thêm hai biến bắt buộc dưới đây cho **Production**; Preview chỉ thêm khi có API và CORS phù hợp.
5. Deploy và lấy domain thực tế. Đồng bộ domain này vào `.env` backend, recreate backend nếu đã đổi CORS/URL.

| Biến trên Vercel | Ví dụ |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://thienlong-api.duckdns.org/api/v1` |
| `NEXT_PUBLIC_APP_URL` | `https://thienlong-event.vercel.app` |

Để form Admin tự điền tài khoản trên một deployment demo, thêm hai biến tùy chọn và đặt trùng với `ADMIN_EMAIL` / `ADMIN_PASSWORD` của backend:

| Biến demo tùy chọn | Ví dụ local |
|---|---|
| `NEXT_PUBLIC_DEMO_ADMIN_EMAIL` | `admin@example.com` |
| `NEXT_PUBLIC_DEMO_ADMIN_PASSWORD` | `LocalDemo-ChangeMe-2026!` |

Tên `NEXT_PUBLIC_*` có nghĩa các giá trị này được đóng vào JavaScript gửi đến browser. Chỉ dùng cặp tự điền cho môi trường demo có dữ liệu giả; môi trường vận hành thật bỏ hai biến này để form trống. Không đưa `DATABASE_URL`, `REDIS_URL`, mật khẩu DB/Redis hay `JWT_SECRET` lên frontend. Thay biến `NEXT_PUBLIC_*` cần **redeploy**, không chỉ restart. Root Directory cấu hình tại Project Settings. [Vercel monorepos](https://vercel.com/docs/monorepos), [Vercel environment variables](https://vercel.com/docs/environment-variables).

CORS chỉ chấp nhận origin được liệt kê. Không dùng `*.vercel.app` hay wildcard `*`. Preview URL thay đổi cần whitelist chính xác hoặc domain staging ổn định, dùng database staging riêng.

### Domain theo đề xuất sản phẩm

Phương án chuẩn là một domain frontend với `/pg`, `/admin`, `/i/...`, `/welcome/...`. Có thể gắn các domain `pg.event.thienlong.vn`, `admin.event.thienlong.vn`, `invite.event.thienlong.vn` vào **cùng một Vercel project**. Khi muốn truy cập domain PG/Admin ở `/`, thêm redirect tại Vercel tương ứng `/` → `/pg` hoặc `/admin`; whitelist các origin đó ở backend. Các route vẫn cùng code và API.

## 7. Kiểm tra kết nối, SSE và vận hành

```bash
curl -i -X OPTIONS https://thienlong-api.duckdns.org/api/v1/admin/stream \
  -H 'Origin: https://thienlong-event.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,last-event-id'
```

Đăng nhập Admin bằng UI. DevTools → Network → `/admin/stream`: HTTP 200, `Content-Type: text/event-stream`, request ở trạng thái pending là bình thường. Header Authorization chứa session; không chia sẻ ảnh chụp có token.

Mở dashboard và welcome ở hai màn hình. PG check-in một khách thử đã import: dashboard tự cập nhật, welcome hiện đúng tên, trở về chờ sau 7 giây. Tắt mạng tab rồi bật lại: SSE reconnect, không check-in lại và không hiện trùng khách. Mở 2 PG check-in cùng một QR: một request thành công, request còn lại HTTP 409 với giờ/quầy đầu tiên.

Mở **Admin → Khách mời** ở tab **Danh sách check-in**, sau đó xác nhận RSVP của một khách bằng link mời trên điện thoại. Khách phải xuất hiện ngay mà không tải lại trang; tab **Thư mời** vẫn hiển thị toàn bộ danh sách và trạng thái phản hồi. Đây là bước nghiệm thu event `rsvp` qua Redis/SSE và bộ lọc `rsvp_status=accepted`.

## 8. Backup và khôi phục

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

Cron chạy hằng ngày bằng account có quyền Docker, ví dụ:

```cron
0 2 * * * /opt/thienlong-checkin/scripts/backup.sh >> /var/log/thienlong-backup.log 2>&1
```

Backup dùng `pg_dump -Fc`, quyền file chỉ chủ sở hữu; kiểm tra log, dung lượng và copy bản mã hóa ra máy khác. Dump chứa thông tin khách và token, không gửi qua kênh công khai. Chạy thêm backup trước import, nâng version và sau sự kiện. Lịch/retention tùy thời hạn lưu dữ liệu của BTC.

Khôi phục thử vào **database mới**; chỉ chuyển ứng dụng sau khi kiểm tra xong. Ví dụ:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" thienlong_restore'
docker compose --env-file .env -f deploy/docker-compose.yml exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d thienlong_restore --no-owner --no-acl' \
  < backups/YOUR_BACKUP.dump
```

Không dùng `docker compose down -v`: thao tác đó xóa volume dữ liệu. Redis dùng AOF để hỗ trợ reconnect; PostgreSQL và backup mới là nơi phục hồi dữ liệu nghiệp vụ. Sau khi restore DB hoặc mất Redis, tải lại các màn hình để lấy snapshot; không hứa phát lại vô hạn lịch sử SSE đã bị trim.

## 9. Cập nhật và rollback

1. Backup DB và ghi lại Git commit/image đang chạy.
2. Checkout phiên bản đã kiểm thử; chạy build, migration bằng lệnh bước 4.
3. Recreate backend; kiểm tra `/health/ready`, login và luồng thử.
4. Deploy frontend tương ứng trên Vercel; kiểm tra biến môi trường của deployment mới.

Tag image bằng `IMAGE_TAG=<git-sha>` khi build/deploy để giữ bản trước. Rollback code chỉ an toàn khi schema tương thích. Không tự downgrade migration có dữ liệu; ưu tiên fix tiến hoặc restore có kế hoạch. Vercel có thể promote deployment cũ, nhưng phải đảm bảo API contract tương thích.

## 10. Xử lý sự cố

| Hiện tượng | Kiểm tra / xử lý |
|---|---|
| API 502 | `minute_caddy` cùng network với backend; alias `thienlong-api`; container healthy |
| HTTPS không cấp được | DNS A/AAAA, 80/443, firewall, log Caddy |
| CORS blocked | Origin chính xác trong `CORS_ORIGINS`; backend đã recreate; không có dấu `/` cuối |
| SSE đến thành từng đợt | Nhánh stream Caddy không nén, không proxy qua Vercel, không đặt buffer ở proxy khác |
| SSE nối lại liên tục | Redis health/auth, JWT hết hạn, proxy timeout, CORS `Last-Event-ID` |
| Check-in đã lưu, màn hình chưa đổi | Redis/dispatcher có thể gián đoạn; xem readiness/log; outbox tự retry, không thao tác insert thủ công |
| Camera không hoạt động | HTTPS, quyền camera, camera đang được app khác dùng; dùng tìm tên tạm thời |
| PG báo trùng | Giữ thông tin quầy/giờ check-in đầu tiên; không xóa bản ghi để quét lại |
| Không đăng nhập sau sửa env | Seed không tự cập nhật credentials; dùng `--update-config`, recreate và đăng nhập lại |
| Import lỗi | Header `name`, mã UTF-8, xem dòng lỗi, sửa file rồi preview lại |
| DB đổi password env nhưng không vào được | PostgreSQL volume cũ không tự đổi password; cần đổi role có kế hoạch, đồng bộ URL |

Logs:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=100 backend redis
docker logs --tail=100 minute_caddy
```

## 11. Nghiệm thu trước sự kiện

- [ ] HTTPS frontend/API, CORS và SSE chạy qua domain thật.
- [ ] Cấu hình đúng tên, địa điểm, thời gian, quầy, giới hạn người đi cùng.
- [ ] Import dữ liệu khách thật; số khách đúng, token/QR không trùng, mapping in được đối soát.
- [ ] RSVP đồng ý/từ chối, sửa RSVP trước check-in, báo lỗi link sai.
- [ ] Quét camera bằng **Android Chrome và iPhone Safari thật**; thử từ chối quyền camera.
- [ ] Hai PG đồng thời một QR chỉ có một check-in.
- [ ] Dashboard, welcome LED/TV, reconnect mạng và mất Redis rồi phục hồi.
- [ ] Kiểm tra file Excel/CSV/QR ZIP và thời gian hiển thị múi giờ Việt Nam.
- [ ] Backup và phục hồi thử thành công; Wi-Fi + 4G dự phòng; PG nhận mã và quầy.

Các bước cần tài khoản cloud, DNS, dữ liệu 350 khách và thiết bị thật phải được thực hiện trên môi trường sự kiện; kiểm thử local không thay thế nghiệm thu này.
