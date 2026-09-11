from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Guest
from app.services.guests import get_event


def all_guests(db: Session) -> list[Guest]:
    return list(db.scalars(select(Guest).where(Guest.event_id == 1).order_by(Guest.id)).all())


def dashboard_summary(db: Session, guests: list[Guest] | None = None) -> dict:
    event = get_event(db)
    guests = all_guests(db) if guests is None else guests
    statuses = Counter(guest.rsvp_status for guest in guests)
    arrived = [guest for guest in guests if guest.checkin]
    counters = Counter(guest.checkin.counter for guest in arrived)
    recent = sorted(arrived, key=lambda guest: (guest.checkin.checked_in_at, guest.checkin.id), reverse=True)[:10]
    total = len(guests)
    return {'total_guests': total, 'accepted': statuses['accepted'], 'declined': statuses['declined'], 'pending': statuses['pending'], 'expected_attendance': sum(1 + guest.companions for guest in guests if guest.rsvp_status == 'accepted'), 'checked_in': len(arrived), 'not_arrived': total - len(arrived), 'no_show': sum(1 for guest in guests if guest.rsvp_status == 'accepted' and not guest.checkin), 'checkin_rate': round(len(arrived) / total * 100, 2) if total else 0, 'registered_arrived': sum(1 + guest.companions for guest in arrived), 'recent_checkins': [{'id': guest.checkin.id, 'guest_name': guest.name, 'company': guest.company, 'checked_in_at': guest.checkin.checked_in_at, 'counter': guest.checkin.counter} for guest in recent], 'checkins_by_counter': [{'counter': counter, 'count': counters[counter]} for counter in dict.fromkeys([*event.counters, *counters.keys()])]}


def trend(db: Session, start: datetime | None, end: datetime | None) -> list[dict]:
    buckets = Counter()
    for guest in all_guests(db):
        if guest.checkin:
            timestamp = guest.checkin.checked_in_at
            if (start is None or timestamp >= start) and (end is None or timestamp <= end):
                bucket = timestamp.replace(minute=timestamp.minute // 15 * 15, second=0, microsecond=0)
                buckets[bucket] += 1
    return [{'time': timestamp, 'count': buckets[timestamp]} for timestamp in sorted(buckets)]
