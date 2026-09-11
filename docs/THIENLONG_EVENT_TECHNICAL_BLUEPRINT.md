# THIÊN LONG EVENT CHECK-IN — TECHNICAL BLUEPRINT

> Version: v1  
> Scope: ~350 guests / 1 corporate event  
> Deployment: Frontend on Vercel, Backend on VNPT Cloud via Docker  
> Principle: production-ready, simple, maintainable, no unnecessary infrastructure

---

## 1. System Goal

Build a web-based event guest management and check-in system covering:

1. Guest RSVP before the event.
2. QR check-in by PG at the event.
3. Admin guest management and live operational dashboard.
4. Welcome Screen showing the latest successfully checked-in guest.
5. Post-event Excel/CSV export.

The same guest QR is used throughout:

`Invitation QR -> RSVP -> Event Check-in`

No native mobile app is required.

---

## 2. Architecture

```text
                         INTERNET
                            |
            +---------------+----------------+
            |                                |
            v                                v
   VERCEL FRONTEND                    VNPT CLOUD
 thienlong-event.vercel.app              |
            |                             |
            | HTTPS API                   v
            +----------------------> CADDY PROXY
                                          |
                                          v
                                   BACKEND CONTAINER
                                      FastAPI
                                          |
                                          v
                                      PostgreSQL
```

### Core rule

Use **one frontend application** and **one backend API service**.

Do not create separate backend services for Guest, PG, Admin, and Welcome Screen.

Frontend route and permission determine which API group is used.

Caddy already exists on VNPT Cloud and is **not included in this repository**.

---

## 3. Recommended Technology Stack

### Frontend

- Next.js + TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- Lucide Icons
- TanStack Table for admin guest tables
- React Hook Form + Zod for forms
- QR scanner using browser camera APIs through a lightweight QR library

Deployment:

```text
Vercel
└── thienlong-event.vercel.app
```

### Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic migrations
- PostgreSQL
- Pydantic validation
- JWT for Admin / PG sessions
- Docker

Deployment:

```text
VNPT Cloud
└── Docker
    └── Backend API
```

### Infrastructure intentionally NOT required for v1

- Redis
- Kafka
- Microservices
- Kubernetes
- Separate realtime server
- Native mobile application

For ~350 guests, these add complexity without meaningful operational benefit.

---

## 4. Frontend Route Design

Base URL:

```text
https://thienlong-event.vercel.app
```

### Guest

```text
/i/[token]
```

Example:

```text
https://thienlong-event.vercel.app/i/AB12CD34...
```

Purpose:

- Display invited guest information.
- RSVP Yes / No.
- Enter number of companions.
- Show confirmation state.

No login.

The token itself identifies the invitation.

---

### PG Check-in

```text
/pg
```

Flow:

```text
Open /pg
-> Enter Event Access Code
-> Select Check-in Counter
-> Open Scanner
-> Scan Guest QR
-> Show Guest
-> Confirm Check-in
```

PG does not have an individual account.

After validating the event access code, backend issues a temporary PG session.

PG functions:

- Scan guest QR.
- Extract guest token from QR URL.
- Display guest name/company.
- Confirm check-in.
- Detect duplicate check-in.
- Search guest by name.
- Manual check-in.
- Display check-in success/error state.

---

### Admin

```text
/admin/login
/admin
/admin/guests
```

Admin requires authentication.

Main functions:

- Import Excel/CSV guest list.
- View/edit guest records.
- Search/filter/sort guests.
- Track RSVP.
- Track check-in.
- View operational KPIs.
- Export final report.

Do not create unnecessary dashboard pages.

Recommended main navigation:

```text
Dashboard
Guests
Import
Export
```

---

### Welcome Screen

```text
/welcome/[screenToken]
```

Example:

```text
https://thienlong-event.vercel.app/welcome/X7K9...
```

Purpose:

- Full-screen display on laptop connected to LED/TV.
- Show latest successfully checked-in guest.
- Automatically return to idle state after configurable timeout.

Display:

```text
WELCOME

NGUYỄN VĂN A
CÔNG TY ABC
```

The Welcome Screen is read-only.

---

## 5. Backend API

Recommended backend public URL behind existing Caddy:

```text
https://<backend-domain>/api/v1
```

Example only:

```text
https://api.event.thienlong.vn/api/v1
```

Frontend environment:

```env
NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>/api/v1
```

Caddy handles HTTPS and reverse proxy to the backend Docker container.

---

## 6. API Groups

### 6.1 Guest RSVP

```http
GET  /public/invitations/{token}
PUT  /public/invitations/{token}/rsvp
```

`GET` returns only fields needed by the guest page.

Example response:

```json
{
  "guest_name": "Nguyễn Văn A",
  "company": "ABC",
  "event_name": "Thiên Long Event",
  "rsvp_status": "pending",
  "companions": 0
}
```

RSVP request:

```json
{
  "status": "accepted",
  "companions": 1
}
```

Do not expose internal IDs or unnecessary guest data.

---

### 6.2 PG Session

```http
POST /pg/session
```

Request:

```json
{
  "access_code": "******",
  "counter": "COUNTER_01"
}
```

Response:

```json
{
  "access_token": "...",
  "expires_in": 28800
}
```

Store the PG session only for the active browser session.

---

### 6.3 PG Check-in

```http
GET  /pg/guests/search?q={keyword}
GET  /pg/guests/by-token/{token}
POST /pg/checkins
```

Check-in request:

```json
{
  "guest_token": "AB12CD34...",
  "counter": "COUNTER_01"
}
```

Successful response:

```json
{
  "status": "checked_in",
  "guest_name": "Nguyễn Văn A",
  "company": "ABC",
  "checked_in_at": "2026-09-11T18:30:10+07:00"
}
```

Duplicate response:

```json
{
  "status": "already_checked_in",
  "guest_name": "Nguyễn Văn A",
  "checked_in_at": "2026-09-11T18:30:10+07:00",
  "counter": "COUNTER_01"
}
```

Duplicate prevention must be enforced at the **database level**, not only in frontend logic.

---

### 6.4 Admin Authentication

```http
POST /admin/login
GET  /admin/me
```

Admin access token is required for all `/admin/*` endpoints.

---

### 6.5 Admin Guests

```http
GET    /admin/guests
GET    /admin/guests/{guest_id}
PATCH  /admin/guests/{guest_id}
POST   /admin/guests/import
```

Supported query parameters:

```text
search
rsvp_status
checkin_status
page
page_size
sort
```

---

### 6.6 Admin Dashboard

```http
GET /admin/dashboard/summary
```

Return only operational KPIs required by the UI:

```json
{
  "total_guests": 350,
  "accepted": 280,
  "declined": 20,
  "pending": 50,
  "expected_attendance": 315,
  "checked_in": 190,
  "not_arrived": 125,
  "checkin_rate": 60.3
}
```

Optional:

```http
GET /admin/dashboard/checkins?from=...&to=...
```

Used for a simple check-in-over-time chart.

---

### 6.7 Welcome Screen

```http
GET /public/welcome/{screen_token}
```

Response:

```json
{
  "event_name": "Thiên Long Event",
  "latest_guest": {
    "name": "Nguyễn Văn A",
    "company": "ABC",
    "checked_in_at": "2026-09-11T18:30:10+07:00"
  }
}
```

Recommended v1 behavior:

- Welcome Screen polls every **1 second**.
- Admin Dashboard refreshes every **3–5 seconds**.

For this event size, polling is simpler and sufficiently responsive.

Do not add Redis/WebSocket infrastructure unless later testing proves it is required.

---

### 6.8 Export

```http
GET /admin/export/checkins.xlsx
```

Recommended columns:

```text
Guest Name
Email
Company
RSVP Status
Companions
Check-in Status
Check-in Time
Check-in Counter
```

---

## 7. Database Model

Keep the schema small.

### events

```text
id
name
start_at
venue
pg_access_code_hash
welcome_screen_token
created_at
updated_at
```

---

### guests

```text
id
event_id
invite_token
name
email
phone
company
rsvp_status
companions
created_at
updated_at
```

`invite_token` must be:

- Unique.
- Random.
- Non-sequential.
- Difficult to guess.
- Not derived from guest name/email/phone.

Recommended token entropy: at least 128 bits.

---

### checkins

```text
id
event_id
guest_id
counter
checked_in_at
created_at
```

Database constraint:

```text
UNIQUE(event_id, guest_id)
```

This is the authoritative duplicate check-in protection.

---

### admin_users

```text
id
email
password_hash
created_at
updated_at
```

Only one or a few admin accounts are required.

---

## 8. QR Design

Each QR contains the guest-facing URL:

```text
https://thienlong-event.vercel.app/i/<invite_token>
```

Example:

```text
https://thienlong-event.vercel.app/i/Vq8DzJ...
```

The same QR is used for:

```text
RSVP
  |
  v
EVENT CHECK-IN
```

PG scanner behavior:

1. Scan QR.
2. Parse URL.
3. Extract `/i/<invite_token>`.
4. Send token to backend.
5. Backend resolves guest.
6. PG confirms check-in.

Do not encode guest name, email, company, database ID, or other PII directly in the QR.

---

## 9. Access Control

### Guest

Authorization:

```text
Invite token
```

Can only:

- Read their invitation.
- Update their own RSVP.

---

### PG

Authorization:

```text
Shared Event Access Code
-> temporary PG session token
```

Can:

- Search guests.
- Read minimal guest check-in information.
- Perform check-in.

Cannot:

- Import/export data.
- Edit full guest records.
- Access admin dashboard.
- Delete check-ins.

---

### Admin

Authorization:

```text
Admin login
-> admin JWT session
```

Can access all administrative functions.

---

### Welcome Screen

Authorization:

```text
Long random screen token
```

Read-only.

No admin or guest personal contact data is exposed.

---

## 10. Security Requirements

Minimum production requirements:

- HTTPS only.
- CORS whitelist only the production Vercel domain and approved preview/development origins.
- Password/access-code hashing.
- Random high-entropy invitation tokens.
- Random high-entropy Welcome Screen token.
- Validate all API payloads.
- Never trust guest IDs sent from frontend without backend validation.
- Rate-limit public invitation lookup/RSVP endpoints.
- Do not log passwords, access codes, JWTs, or full guest tokens.
- Return minimal data for Guest and PG endpoints.
- Database unique constraint prevents duplicate check-in race conditions.

Recommended response for duplicate check-in:

```http
409 Conflict
```

with the original check-in information.

---

## 11. UI / UX Design Specification

### Design Direction

The product must look like a real production SaaS / enterprise application.

Avoid the visual language commonly associated with AI-generated landing pages.

### Style

- Clean.
- Minimal.
- Enterprise-grade.
- Neutral light background.
- Clear hierarchy.
- Strong readability.
- Thin borders.
- Very light or no shadows.
- Border radius: approximately 6–10px.
- Inter, Geist, or system sans-serif.
- 4px / 8px spacing system.
- Lucide icons.
- One primary accent color.
- Status colors used only when meaningful.
- No emoji in application UI.
- No decorative gradients.
- No neon purple/blue.
- No excessive glow.
- No excessive glassmorphism.
- No unnecessary animation.

---

## 12. Admin Dashboard Layout

Desktop:

```text
+----------------------+-----------------------------------------+
| Sidebar              | Topbar                                  |
|                      +-----------------------------------------+
| Dashboard            | KPI KPI KPI KPI                         |
| Guests               +-----------------------------------------+
| Import               | Check-in trend / operational summary    |
| Export               +-----------------------------------------+
|                      | Guest table                              |
+----------------------+-----------------------------------------+
```

### Sidebar

- Fixed on desktop.
- Width: 220–260px.
- Collapsible/drawer on tablet/mobile.

### Topbar

Keep minimal:

- Page title.
- Search when useful.
- User menu.

Do not add decorative content.

### KPI row

Show only decision-useful metrics.

Recommended:

```text
Invited
RSVP Accepted
Expected Attendance
Checked In
```

Secondary RSVP values can appear inside a compact breakdown rather than creating many KPI cards.

### Guest table

Must support:

- Search.
- RSVP filter.
- Check-in filter.
- Sorting.
- Pagination.
- Status badges.
- Row action menu.

The table is more important than decorative charts.

---

## 13. PG UI

The PG interface must be optimized for phone usage.

Priority:

```text
SCAN -> IDENTIFY -> CONFIRM
```

Recommended layout:

```text
[Counter 01]

[ QR CAMERA AREA ]

Guest Name
Company

[ CONFIRM CHECK-IN ]

Search guest manually
```

Requirements:

- Large scan target.
- Large confirmation button.
- Clear success state.
- Clear duplicate warning.
- Minimal text.
- No dashboard navigation.
- No small desktop-style controls.
- Camera permission/error state.
- Manual search fallback.

---

## 14. Guest RSVP UI

Mobile-first.

Recommended information order:

```text
Event
Guest Name
Company

Will you attend?
[ Yes ] [ No ]

Number of companions
[ - ] 0 [ + ]

[ Confirm ]
```

After successful submission:

```text
RSVP CONFIRMED
```

Do not expose system terminology such as token, record ID, or database status.

---

## 15. Welcome Screen UI

Designed for LED/TV, not as a dashboard.

Idle state:

```text
WELCOME
THIÊN LONG EVENT
```

Check-in state:

```text
WELCOME

NGUYỄN VĂN A

CÔNG TY ABC
```

Requirements:

- Very large typography.
- High contrast.
- Minimal information.
- No buttons.
- No navigation.
- Automatically reset after approximately 5–8 seconds.
- Poll backend every 1 second.
- Ignore repeated rendering of the same latest check-in.

---

## 16. Responsive Requirements

### Guest

Primary target:

```text
Mobile
```

Must still work on tablet/desktop.

### PG

Primary target:

```text
Mobile / Tablet
```

Camera scanning must be tested on both Android Chrome and iOS Safari.

### Admin

Primary target:

```text
Laptop / Desktop
```

Tablet supported.

On mobile:

- Sidebar becomes drawer.
- Tables may use horizontal scroll or compact columns.
- KPI cards stack.
- Filters remain usable.

### Welcome

Primary target:

```text
16:9 display / laptop connected to LED or TV
```

---

## 17. Frontend Component Structure

Recommended reusable components:

```text
components/
├── ui/
├── layout/
│   ├── admin-sidebar
│   ├── admin-topbar
│   └── page-container
├── dashboard/
│   ├── kpi-card
│   ├── checkin-chart
│   └── status-summary
├── guests/
│   ├── guest-table
│   ├── guest-filters
│   └── guest-form
├── pg/
│   ├── qr-scanner
│   ├── guest-checkin-card
│   └── guest-search
├── invite/
│   └── rsvp-form
└── welcome/
    └── welcome-display
```

Keep business logic outside presentational components.

---

## 18. Frontend States

Every important screen must include:

- Loading.
- Empty.
- Error.
- Success.
- Disabled/submitting.
- Permission/camera error where relevant.

Use skeleton loading only where it improves perceived responsiveness.

Avoid excessive spinners.

---

## 19. Repository Structure

Recommended monorepo:

```text
thienlong-event/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── public/
│   │
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   └── main.py
│       ├── alembic/
│       ├── tests/
│       └── Dockerfile
│
├── deploy/
│   └── docker-compose.yml
│
├── .env.example
├── README.md
└── docs/
    └── TECHNICAL_BLUEPRINT.md
```

Caddy configuration is intentionally excluded because it already exists on VNPT Cloud.

---

## 20. Backend Internal Structure

Keep backend layered but simple:

```text
api route
   |
   v
service
   |
   v
database model/repository
```

Recommended modules:

```text
api/
├── public.py
├── pg.py
└── admin.py

services/
├── invitation_service.py
├── checkin_service.py
├── guest_service.py
├── import_service.py
└── export_service.py
```

Do not introduce domain-event buses, CQRS, message brokers, or microservice abstractions.

---

## 21. Environment Variables

### Frontend — Vercel

```env
NEXT_PUBLIC_API_BASE_URL=https://<backend-domain>/api/v1
NEXT_PUBLIC_APP_URL=https://thienlong-event.vercel.app
```

### Backend — VNPT Cloud

```env
APP_ENV=production
DATABASE_URL=postgresql+psycopg://...
JWT_SECRET=...
JWT_EXPIRE_MINUTES=480
CORS_ORIGINS=https://thienlong-event.vercel.app
PUBLIC_FRONTEND_URL=https://thienlong-event.vercel.app
```

Do not commit production secrets into Git.

---

## 22. Docker Deployment

Backend deployment target:

```text
VNPT Cloud
```

Minimal Docker services:

```text
backend
postgres
```

If PostgreSQL is already provided separately on VNPT Cloud, run only:

```text
backend
```

Caddy remains external to this repository.

Expected traffic path:

```text
Vercel Browser Request
        |
        v
https://<backend-domain>
        |
        v
Existing Caddy
        |
        v
Backend Docker Container
        |
        v
PostgreSQL
```

---

## 23. Import Workflow

Admin uploads `.xlsx` or `.csv`.

Required minimum columns:

```text
name
company
email
phone
```

Only `name` must be mandatory if the source list does not always contain contact information.

Import process:

```text
Upload file
-> Validate columns
-> Preview validation result
-> Import guests
-> Generate unique invitation token per guest
-> Generate guest invitation URL
-> Generate QR
-> Export QR mapping
```

Output mapping example:

```text
Guest Name | Company | Invitation URL | QR File
```

---

## 24. Check-in Transaction Rules

A check-in must be atomic.

Backend flow:

```text
Receive guest token
-> Resolve guest
-> Verify event
-> Check database constraint
-> Create check-in
-> Commit transaction
-> Return success
```

If two PGs scan the same QR almost simultaneously:

```text
Only one INSERT succeeds.
```

The other request receives duplicate check-in status.

This prevents race conditions without distributed locking.

---

## 25. Operational Data Refresh

### PG

Immediate API request after scan/check-in.

### Welcome Screen

Poll:

```text
1 second
```

### Admin Dashboard

Poll:

```text
3–5 seconds
```

This provides sufficiently live event operations without adding realtime infrastructure.

---

## 26. Logging

Backend should log:

```text
timestamp
request path
HTTP status
request duration
event ID where applicable
```

For check-in operations also log:

```text
guest internal ID
counter
result
```

Never log:

```text
admin password
PG access code
JWT
full invite token
```

---

## 27. Minimum Testing

### Backend

Must test:

- Guest token lookup.
- RSVP update.
- Invalid guest token.
- PG access code.
- Successful check-in.
- Duplicate check-in.
- Manual search/check-in.
- Admin authentication.
- Guest import.
- Export.
- Database uniqueness under simultaneous check-in.

### Frontend

Must test:

- Guest RSVP on mobile.
- PG QR scan on Android Chrome.
- PG QR scan on iOS Safari.
- Camera denied state.
- Duplicate QR UI.
- Manual guest search.
- Admin table/filter.
- Welcome Screen auto reset.
- Responsive behavior.

---

## 28. Production Acceptance Checklist

Before event day:

```text
[ ] Production frontend deployed on Vercel
[ ] Production API reachable through Caddy
[ ] HTTPS working
[ ] PostgreSQL backup configured
[ ] 350 guests imported
[ ] 350 unique invitation tokens generated
[ ] QR-to-guest mapping verified
[ ] RSVP tested
[ ] PG camera scanning tested on real phones
[ ] Duplicate check-in tested
[ ] Multiple PG devices tested simultaneously
[ ] Admin dashboard tested
[ ] Welcome Screen tested on actual LED/TV setup
[ ] Export file verified
[ ] Event Wi-Fi / 4G fallback tested
```

---

## 29. Explicit Non-Goals for v1

Do not build unless requirements change:

- Individual PG accounts.
- Multi-tenant SaaS.
- Complex RBAC.
- Redis.
- Kafka.
- Kubernetes.
- Separate microservices.
- Native Android/iOS app.
- Complex analytics platform.
- AI features.
- Facial recognition.
- Payment.
- Ticket marketplace.
- Offline-first synchronization engine.

---

## 30. Final Implementation Definition

The final system should consist of:

```text
ONE FRONTEND — Vercel
|
|-- /i/[token]             Guest RSVP
|-- /pg                    PG Check-in
|-- /admin                 Admin Dashboard
|-- /welcome/[screenToken] Welcome Screen
|
v
ONE BACKEND API — Docker on VNPT Cloud
|
v
ONE PostgreSQL Database
```

Communication:

```text
Browser
-> HTTPS
-> Existing Caddy Proxy
-> Backend API
-> PostgreSQL
```

The implementation priority is:

```text
Reliability
> Check-in speed
> Usability
> Data correctness
> Visual polish
> Extra features
```

The finished product must feel like a real internal enterprise event system: clean, compact, responsive, operationally clear, and simple enough to deploy and support reliably on event day.
