from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import limiter
from app.models import Checkin
from app.schemas import EventPublic, InvitationResponse, RsvpRequest, WelcomeResponse
from app.services.guests import add_outbox, get_by_token, get_event, require_welcome, serialize_invitation
from app.services.realtime import prepare_stream, stream_events

router = APIRouter(prefix='/public', tags=['Public invitations and welcome'])


@router.get('/event', response_model=EventPublic)
def event_info(db: Session = Depends(get_db)):
    event = get_event(db)
    return {'name': event.name, 'start_at': event.start_at, 'venue': event.venue, 'counters': event.counters, 'max_companions': event.max_companions}


@router.get('/invitations/{token}', response_model=InvitationResponse)
def invitation(token: str, request: Request, db: Session = Depends(get_db)):
    limiter.check(request, 'invitation', 120)
    return serialize_invitation(get_by_token(db, token), get_event(db))


@router.put('/invitations/{token}/rsvp', response_model=InvitationResponse)
def rsvp(token: str, body: RsvpRequest, request: Request, db: Session = Depends(get_db)):
    limiter.check(request, 'rsvp', 30)
    event = get_event(db)
    guest = get_by_token(db, token, lock=True)
    if db.scalar(select(Checkin.id).where(Checkin.guest_id == guest.id, Checkin.event_id == 1)) is not None:
        raise HTTPException(409, 'Khách đã check-in; không thể thay đổi đăng ký.')
    if body.companions > event.max_companions:
        raise HTTPException(422, f'Tối đa {event.max_companions} người đi cùng.')
    if body.status == 'declined' and body.companions != 0:
        raise HTTPException(422, 'Số người đi cùng phải bằng 0 khi không tham dự.')
    guest.rsvp_status, guest.companions = body.status, body.companions
    if body.notes is not None:
        guest.notes = body.notes
    add_outbox(db, 'rsvp')
    db.commit()
    return serialize_invitation(guest, event)


@router.get('/welcome/{screen_token}', response_model=WelcomeResponse)
def welcome(screen_token: str, request: Request, db: Session = Depends(get_db)):
    limiter.check(request, 'welcome_snapshot', 120)
    event = require_welcome(db, screen_token)
    latest = db.scalar(select(Checkin).where(Checkin.event_id == 1).order_by(Checkin.checked_in_at.desc(), Checkin.id.desc()).limit(1))
    return {'event_name': event.name, 'latest_guest': {'id': latest.id, 'name': latest.guest.name, 'company': latest.guest.company, 'checked_in_at': latest.checked_in_at} if latest else None}


@router.get('/welcome/{screen_token}/stream', response_class=StreamingResponse, responses={200: {'content': {'text/event-stream': {}}}})
async def welcome_stream(screen_token: str, request: Request, db: Session = Depends(get_db, scope='function')):
    limiter.check(request, 'welcome_stream', 30)
    require_welcome(db, screen_token)
    cursor = await prepare_stream(request.app.state.redis, request.headers.get('last-event-id'))
    return StreamingResponse(stream_events(request, request.app.state.redis, cursor, welcome=True), media_type='text/event-stream', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
