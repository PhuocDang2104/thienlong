from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_session, limiter, pg_required, verify_password
from app.models import Guest
from app.schemas import CheckinRequest, CheckinResponse, PgGuestResponse, PgSessionRequest, PgSessionResponse
from app.services.checkins import perform_checkin
from app.services.guests import get_by_token, get_event, search_clause, serialize_pg_guest

router = APIRouter(prefix='/pg', tags=['PG check-in'])


@router.post('/session', response_model=PgSessionResponse)
def pg_session(body: PgSessionRequest, request: Request, db: Session = Depends(get_db)):
    limiter.check(request, 'pg_login', 10)
    event = get_event(db)
    if not verify_password(body.access_code, event.pg_access_code_hash):
        raise HTTPException(401, 'Mã truy cập không đúng.')
    if body.counter not in event.counters:
        raise HTTPException(422, 'Quầy check-in không hợp lệ.')
    return create_session('pg', event.id, event.session_version, body.counter)


@router.get('/guests/search', response_model=list[PgGuestResponse])
def search(q: str = Query(min_length=2, max_length=200), db: Session = Depends(get_db), session: dict = Depends(pg_required)):
    if len(q.strip()) < 2:
        raise HTTPException(422, 'Nhập ít nhất 2 ký tự để tìm kiếm.')
    guests = db.scalars(select(Guest).where(Guest.event_id == 1, search_clause(q.strip())).order_by(Guest.name, Guest.id).limit(30)).all()
    return [serialize_pg_guest(guest) for guest in guests]


@router.get('/guests/by-token/{token}', response_model=PgGuestResponse)
def by_token(token: str, db: Session = Depends(get_db), session: dict = Depends(pg_required)):
    return serialize_pg_guest(get_by_token(db, token))


@router.post('/checkins', response_model=CheckinResponse, responses={409: {'model': CheckinResponse, 'description': 'Invitation already checked in; original check-in returned'}})
def checkin(body: CheckinRequest, db: Session = Depends(get_db), session: dict = Depends(pg_required)):
    if body.counter != session['counter']:
        raise HTTPException(403, 'Quầy check-in không khớp phiên đăng nhập.')
    result, duplicate = perform_checkin(db, body.guest_token, body.counter)
    return JSONResponse(status_code=409, content=CheckinResponse.model_validate(result).model_dump(mode='json')) if duplicate else result
