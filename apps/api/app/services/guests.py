import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Event, Guest, Outbox


def get_event(db: Session) -> Event:
    event = db.get(Event, 1)
    if not event:
        raise HTTPException(503, 'Sự kiện chưa được cấu hình.')
    return event


def get_by_token(db: Session, token: str, lock: bool = False) -> Guest:
    if not 16 <= len(token) <= 128:
        raise HTTPException(404, 'Không tìm thấy thư mời.')
    query = select(Guest).where(Guest.event_id == 1, Guest.invite_token == token)
    guest = db.scalar(query.with_for_update() if lock else query)
    if guest is None:
        raise HTTPException(404, 'Không tìm thấy thư mời.')
    return guest


def get_guest(db: Session, guest_id: int, lock: bool = False) -> Guest:
    query = select(Guest).where(Guest.event_id == 1, Guest.id == guest_id)
    guest = db.scalar(query.with_for_update() if lock else query)
    if guest is None:
        raise HTTPException(404, 'Không tìm thấy khách mời.')
    return guest


def invitation_url(guest: Guest) -> str:
    return f'{get_settings().public_frontend_url.rstrip("/")}/i/{guest.invite_token}'


def serialize_guest(guest: Guest) -> dict:
    return {'id': guest.id, 'name': guest.name, 'company': guest.company, 'email': guest.email, 'phone': guest.phone, 'notes': guest.notes, 'invite_token': guest.invite_token, 'invitation_url': invitation_url(guest), 'rsvp_status': guest.rsvp_status, 'companions': guest.companions, 'checked_in_at': guest.checkin.checked_in_at if guest.checkin else None, 'counter': guest.checkin.counter if guest.checkin else None, 'created_at': guest.created_at}


def serialize_pg_guest(guest: Guest) -> dict:
    return {'guest_token': guest.invite_token, 'name': guest.name, 'company': guest.company, 'rsvp_status': guest.rsvp_status, 'companions': guest.companions, 'checked_in_at': guest.checkin.checked_in_at if guest.checkin else None, 'counter': guest.checkin.counter if guest.checkin else None}


def serialize_invitation(guest: Guest, event: Event) -> dict:
    return {'guest_name': guest.name, 'company': guest.company, 'event_name': event.name, 'start_at': event.start_at, 'venue': event.venue, 'rsvp_status': guest.rsvp_status, 'companions': guest.companions, 'notes': guest.notes, 'max_companions': event.max_companions}


def require_welcome(db: Session, token: str) -> Event:
    event = get_event(db)
    if not token.isascii() or not secrets.compare_digest(token, event.welcome_screen_token):
        raise HTTPException(404, 'Không tìm thấy màn hình chào mừng.')
    return event


def add_outbox(db: Session, event_type: str, payload: dict | None = None):
    db.add(Outbox(event_type=event_type, payload=payload or {}))


def search_clause(value: str):
    escaped = value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    pattern = f'%{escaped}%'
    return Guest.name.ilike(pattern, escape='\\') | Guest.company.ilike(pattern, escape='\\')


def name_search_clause(value: str):
    escaped = value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return Guest.name.ilike(f'%{escaped}%', escape='\\')
