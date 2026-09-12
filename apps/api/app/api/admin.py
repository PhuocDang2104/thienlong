from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import admin_required, claims, create_session, dummy_hash, limiter, verify_password
from app.models import AdminUser, Checkin, Guest
from app.schemas import AdminResponse, DashboardResponse, DeleteGuestsResponse, EventResponse, GuestCreate, GuestPage, GuestPatch, GuestResponse, ImportPreview, ImportResult, LoginRequest, SessionResponse, TrendPoint
from app.services.dashboard import all_guests, dashboard_summary, trend
from app.services.exports import csv_bytes, qr_archive, qr_filename, qr_png, report_rows, xlsx_report
from app.services.guests import add_outbox, get_event, get_guest, search_clause, serialize_guest
from app.services.imports import commit_import, preview_import, read_upload
from app.services.realtime import prepare_stream, stream_events

router = APIRouter(prefix='/admin', tags=['Administration'])


def attachment(data: bytes, filename: str, content_type: str) -> Response:
    return Response(data, media_type=content_type, headers={'Content-Disposition': f'attachment; filename="{filename}"', 'Cache-Control': 'no-store'})


@router.post('/login', response_model=SessionResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    limiter.check(request, 'admin_login', 10)
    user = db.scalar(select(AdminUser).where(AdminUser.email == str(body.email).lower()))
    valid = verify_password(body.password, user.password_hash if user else dummy_hash)
    if user is None or not valid:
        raise HTTPException(401, 'Email hoặc mật khẩu không đúng.')
    return create_session('admin', user.id, user.session_version)


@router.get('/me', response_model=AdminResponse)
def me(user: AdminUser = Depends(admin_required)):
    return {'id': user.id, 'email': user.email}


@router.get('/event', response_model=EventResponse)
def event_info(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    event = get_event(db)
    return {'id': event.id, 'name': event.name, 'start_at': event.start_at, 'venue': event.venue, 'counters': event.counters, 'max_companions': event.max_companions, 'welcome_screen_url': f'{get_settings().public_frontend_url.rstrip("/")}/welcome/{event.welcome_screen_token}'}


@router.get('/stream', response_class=StreamingResponse, responses={200: {'content': {'text/event-stream': {}}}})
async def admin_stream(request: Request, user: AdminUser = Depends(admin_required, scope='function'), payload: dict = Depends(claims)):
    limiter.check(request, 'admin_stream', 30)
    cursor = await prepare_stream(request.app.state.redis, request.headers.get('last-event-id'))
    return StreamingResponse(stream_events(request, request.app.state.redis, cursor, welcome=False, expires_at=payload['exp']), media_type='text/event-stream', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})


@router.get('/guests/template.csv')
def template(user: AdminUser = Depends(admin_required)):
    return attachment(csv_bytes([['name', 'company', 'email', 'phone', 'notes'], ['Nguyễn Văn An', 'Công ty Minh An', 'an@example.com', '0901234567', '']]), 'guest-template.csv', 'text/csv; charset=utf-8')


@router.get('/guests/qr.zip')
def qr_zip(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    return attachment(qr_archive(all_guests(db)), 'invitation-qr.zip', 'application/zip')


@router.post('/guests/import/preview', response_model=ImportPreview)
async def import_preview(file: UploadFile = File(...), user: AdminUser = Depends(admin_required)):
    data, suffix = await read_upload(file)
    return await run_in_threadpool(preview_import, data, suffix)


@router.post('/guests/import', response_model=ImportResult)
async def import_guests(file: UploadFile = File(...), db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    data, suffix = await read_upload(file)
    preview = await run_in_threadpool(preview_import, data, suffix)
    return await run_in_threadpool(commit_import, db, preview)


@router.get('/guests', response_model=GuestPage)
def guests(search: str = Query(default='', max_length=200), rsvp_status: Literal['pending', 'accepted', 'declined'] | None = None, checkin_status: Literal['checked_in', 'not_checked_in'] | None = None, page: int = Query(default=1, ge=1), page_size: int = Query(default=20, ge=1, le=100), sort: Literal['name', '-name', 'created_at', '-created_at', 'checked_in_at', '-checked_in_at'] = '-created_at', db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    query = select(Guest).outerjoin(Checkin, (Checkin.guest_id == Guest.id) & (Checkin.event_id == Guest.event_id)).where(Guest.event_id == 1)
    if search.strip():
        value = search.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
        query = query.where(search_clause(search.strip()) | Guest.email.ilike(f'%{value}%', escape='\\') | Guest.phone.ilike(f'%{value}%', escape='\\'))
    if rsvp_status:
        query = query.where(Guest.rsvp_status == rsvp_status)
    if checkin_status:
        query = query.where(Checkin.id.is_not(None) if checkin_status == 'checked_in' else Checkin.id.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    column = {'name': Guest.name, 'created_at': Guest.created_at, 'checked_in_at': Checkin.checked_in_at}[sort.lstrip('-')]
    order = column.desc().nullslast() if sort.startswith('-') else column.asc().nullslast()
    items = db.scalars(query.order_by(order, Guest.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {'items': [serialize_guest(guest) for guest in items], 'total': total, 'page': page, 'page_size': page_size}


@router.post('/guests', response_model=GuestResponse, status_code=201)
def guest_create(body: GuestCreate, db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    event = get_event(db)
    if body.companions > event.max_companions or (body.rsvp_status != 'accepted' and body.companions != 0):
        raise HTTPException(422, 'Số người đi cùng không hợp lệ với trạng thái hoặc giới hạn sự kiện.')
    guest = Guest(event_id=event.id, **body.model_dump())
    db.add(guest)
    add_outbox(db, 'guests_changed')
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Email đã thuộc về khách mời khác.') from None
    return serialize_guest(guest)


@router.delete('/guests', response_model=DeleteGuestsResponse)
def guests_delete_all(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    guest_ids = list(db.scalars(select(Guest.id).where(Guest.event_id == 1).with_for_update()))
    if guest_ids:
        db.execute(delete(Checkin).where(Checkin.event_id == 1))
        db.execute(delete(Guest).where(Guest.event_id == 1))
        add_outbox(db, 'guests_changed')
        db.commit()
    return {'deleted': len(guest_ids)}


@router.get('/guests/{guest_id}/qr.png')
def guest_qr(guest_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    guest = get_guest(db, guest_id)
    return attachment(qr_png(guest), qr_filename(guest), 'image/png')


@router.get('/guests/{guest_id}', response_model=GuestResponse)
def guest_detail(guest_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    return serialize_guest(get_guest(db, guest_id))


@router.patch('/guests/{guest_id}', response_model=GuestResponse)
def guest_update(guest_id: int, body: GuestPatch, db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    event = get_event(db)
    guest = get_guest(db, guest_id, lock=True)
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key != 'email':
            raise HTTPException(422, f'{key} không được để null.')
    if ('rsvp_status' in changes or 'companions' in changes) and db.scalar(select(Checkin.id).where(Checkin.guest_id == guest.id, Checkin.event_id == 1)) is not None:
        if changes.get('rsvp_status', guest.rsvp_status) != guest.rsvp_status or changes.get('companions', guest.companions) != guest.companions:
            raise HTTPException(409, 'Khách đã check-in; không thể thay đổi đăng ký.')
    status = changes.get('rsvp_status', guest.rsvp_status)
    companions = changes.get('companions', guest.companions)
    if companions > event.max_companions or (status != 'accepted' and companions != 0):
        raise HTTPException(422, 'Số người đi cùng không hợp lệ với trạng thái hoặc giới hạn sự kiện.')
    for key, value in changes.items():
        setattr(guest, key, str(value).lower() if key == 'email' and value else value)
    add_outbox(db, 'guests_changed')
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Email đã thuộc về khách mời khác.') from None
    return serialize_guest(guest)


@router.delete('/guests/{guest_id}', response_model=DeleteGuestsResponse)
def guest_delete(guest_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    guest = get_guest(db, guest_id, lock=True)
    if guest.checkin is not None:
        db.delete(guest.checkin)
    db.delete(guest)
    add_outbox(db, 'guests_changed')
    db.commit()
    return {'deleted': 1}


@router.get('/dashboard/summary', response_model=DashboardResponse)
def summary(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    return dashboard_summary(db)


@router.get('/dashboard/checkins', response_model=list[TrendPoint])
def checkin_trend(from_time: datetime | None = Query(default=None, alias='from'), to_time: datetime | None = Query(default=None, alias='to'), db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    if any(value is not None and value.tzinfo is None for value in (from_time, to_time)):
        raise HTTPException(422, 'Thời gian phải có múi giờ.')
    if from_time and to_time and from_time > to_time:
        raise HTTPException(422, 'Thời gian bắt đầu phải trước thời gian kết thúc.')
    return trend(db, from_time, to_time)


@router.get('/export/checkins.csv')
def export_csv(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    return attachment(csv_bytes(report_rows(all_guests(db))), 'checkins.csv', 'text/csv; charset=utf-8')


@router.get('/export/checkins.xlsx')
def export_xlsx(db: Session = Depends(get_db), user: AdminUser = Depends(admin_required)):
    guests = all_guests(db)
    return attachment(xlsx_report(guests, dashboard_summary(db, guests)), 'checkins.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
