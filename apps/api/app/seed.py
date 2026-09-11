"""Idempotent event, account and optional CSV guest provisioning."""
import argparse
from datetime import datetime
from pathlib import Path

from pydantic import EmailStr, Field, field_validator
from sqlalchemy import delete, func, select

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.security import password_hash
from app.models import AdminUser, Checkin, Event, Guest, Outbox
from app.services.guests import add_outbox
from app.services.imports import preview_import


DEFAULT_DEMO_FILE = Path(__file__).resolve().parents[1] / 'data' / 'demo-guests.csv'


class SeedSettings(Settings):
    event_name: str = Field(min_length=1, max_length=200)
    event_start_at: datetime
    event_venue: str = Field(min_length=1, max_length=500)
    event_counters: str
    event_max_companions: int = Field(default=3, ge=0, le=100)
    admin_email: EmailStr
    admin_password: str = Field(min_length=12, max_length=512)
    pg_access_code: str = Field(min_length=8, max_length=512)
    welcome_screen_token: str = Field(min_length=32, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')

    @field_validator('event_start_at')
    @classmethod
    def aware_datetime(cls, value):
        if value.tzinfo is None:
            raise ValueError('EVENT_START_AT must include a timezone')
        return value


def sync_guest_file(db, source: Path, replace: bool = False) -> tuple[int, int]:
    if not source.is_file() or source.suffix.lower() not in ('.csv', '.xlsx'):
        raise ValueError(f'Guest seed file does not exist or is unsupported: {source}')
    preview = preview_import(source.read_bytes(), source.suffix.lower().lstrip('.'))
    if preview.errors:
        details = '; '.join(f'row {item.row_number}: {item.message}' for item in preview.errors[:10])
        raise ValueError(f'Guest seed file is invalid: {details}')
    if any(row.email is None for row in preview.rows):
        raise ValueError('Every automatic seed guest needs an email for idempotent updates')
    emails = [str(row.email).lower() for row in preview.rows]
    if len(emails) != len(set(emails)):
        raise ValueError('Guest seed file contains duplicate emails')
    if replace:
        db.execute(delete(Checkin).where(Checkin.event_id == 1))
        db.execute(delete(Guest).where(Guest.event_id == 1))
        db.execute(delete(Outbox))
        db.flush()
    existing = {guest.email: guest for guest in db.scalars(select(Guest).where(Guest.event_id == 1, Guest.email.in_(emails))).all()}
    created = updated = 0
    for row in preview.rows:
        email = str(row.email).lower()
        guest = existing.get(email)
        values = {'name': row.name, 'company': row.company, 'email': email, 'phone': row.phone}
        if guest is None:
            guest = Guest(event_id=1, notes=row.notes, **values)
            db.add(guest)
            existing[email] = guest
            created += 1
        else:
            changed = any(getattr(guest, key) != value for key, value in values.items())
            for key, value in values.items():
                setattr(guest, key, value)
            updated += int(changed)
    if created or updated or replace:
        add_outbox(db, 'guests_changed')
    return created, updated


def provision(config: SeedSettings, demo: bool = False, update_config: bool = False, guests_file: Path | None = None, replace_guests: bool = False):
    if demo and config.app_env != 'development':
        raise ValueError('Demo data is allowed only with APP_ENV=development')
    if replace_guests and config.app_env != 'development':
        raise ValueError('Replacing all guests is allowed only with APP_ENV=development')
    if demo and guests_file:
        raise ValueError('Use either --demo or --guests-file, not both')
    if demo:
        guests_file = DEFAULT_DEMO_FILE
    if replace_guests and not guests_file:
        raise ValueError('--replace-guests requires --demo or --guests-file')
    if config.app_env == 'production' and any('CHANGE_ME' in value or 'LocalDemo' in value or value == 'TL-DEMO-2026' for value in (config.admin_password, config.pg_access_code, config.welcome_screen_token)):
        raise ValueError('Replace demo/placeholder production credentials')
    counters = [value.strip() for value in config.event_counters.split(',') if value.strip()]
    if not counters or len(counters) != len(set(counters)) or any(len(value) > 80 for value in counters):
        raise ValueError('EVENT_COUNTERS must contain unique names, each 1–80 characters')
    with SessionLocal() as db:
        event = db.get(Event, 1)
        if event is None:
            event = Event(id=1, session_version=1)
            db.add(event)
            configure_event = True
        else:
            configure_event = update_config
            if update_config:
                existing_max = db.scalar(select(func.max(Guest.companions))) or 0
                if config.event_max_companions < existing_max:
                    raise ValueError('Companion limit is lower than existing registrations')
                event.session_version += 1
        if configure_event:
            event.name, event.start_at, event.venue = config.event_name, config.event_start_at, config.event_venue
            event.counters, event.max_companions = counters, config.event_max_companions
            event.pg_access_code_hash = password_hash.hash(config.pg_access_code)
            event.welcome_screen_token = config.welcome_screen_token
        db.flush()
        counters = event.counters
        email = str(config.admin_email).lower()
        admin = db.scalar(select(AdminUser).where(AdminUser.email == email))
        if admin is None:
            db.add(AdminUser(email=email, password_hash=password_hash.hash(config.admin_password)))
        elif update_config:
            admin.password_hash = password_hash.hash(config.admin_password)
            admin.session_version += 1
        sync_result = sync_guest_file(db, guests_file, replace_guests) if guests_file else None
        db.commit()
        return sync_result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demo', action='store_true', help='Create or update the three bundled demo guests in development')
    parser.add_argument('--guests-file', type=Path, help='Create or update guests from an idempotent CSV/XLSX file; every row needs email')
    parser.add_argument('--replace-guests', action='store_true', help='Development only: clear check-ins/guests/outbox before loading the file')
    parser.add_argument('--update-config', action='store_true', help='Apply event settings, rotate configured credentials and revoke their prior sessions')
    args = parser.parse_args()
    result = provision(SeedSettings(), demo=args.demo, update_config=args.update_config, guests_file=args.guests_file, replace_guests=args.replace_guests)
    guest_message = f' Guests created: {result[0]}, updated: {result[1]}.' if result else ''
    print(f'Event and administrator provisioned.{guest_message} Open Admin to get invitation and welcome links.')


if __name__ == '__main__':
    main()
