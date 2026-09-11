import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Checkin
from app.services.guests import add_outbox, get_by_token

logger = logging.getLogger('thienlong')


def perform_checkin(db: Session, token: str, counter: str) -> tuple[dict, bool]:
    guest = get_by_token(db, token, lock=True)
    # Lock the guest row to serialize RSVP edits with check-in. The unique
    # constraint remains the authoritative duplicate guard, including other writers.
    existing = db.scalar(select(Checkin).where(Checkin.event_id == 1, Checkin.guest_id == guest.id))
    duplicate = existing is not None
    if existing is None:
        existing = Checkin(event_id=1, guest_id=guest.id, counter=counter)
        db.add(existing)
        try:
            db.flush()
            add_outbox(db, 'checkin', {'id': existing.id, 'name': guest.name, 'company': guest.company, 'checked_in_at': existing.checked_in_at.isoformat(), 'counter': counter})
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(Checkin).where(Checkin.event_id == 1, Checkin.guest_id == guest.id))
            if existing is None:
                raise
            duplicate = True
    result = {'status': 'already_checked_in' if duplicate else 'checked_in', 'guest_name': guest.name, 'company': guest.company, 'checked_in_at': existing.checked_in_at, 'counter': existing.counter}
    logger.info('checkin event_id=1 guest_id=%s counter=%s result=%s', guest.id, existing.counter, result['status'])
    return result, duplicate
