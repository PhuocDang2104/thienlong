import secrets
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def generate_invite_token() -> str:
    """Generate a 256-bit, URL-safe credential for one invitation."""
    return secrets.token_urlsafe(32)


class UTCDateTime(TypeDecorator):
    impl = DateTime(timezone=True)
    cache_ok = True

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


class Event(Base):
    __tablename__ = 'events'
    __table_args__ = (CheckConstraint('id = 1', name='single_event'), CheckConstraint('max_companions >= 0', name='event_companions_nonnegative'))
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(200))
    start_at: Mapped[datetime] = mapped_column(UTCDateTime())
    venue: Mapped[str] = mapped_column(String(500))
    counters: Mapped[list[str]] = mapped_column(JSON)
    max_companions: Mapped[int] = mapped_column(Integer, default=3)
    pg_access_code_hash: Mapped[str] = mapped_column(String(255))
    welcome_screen_token: Mapped[str] = mapped_column(String(128), unique=True)
    session_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class Guest(Base):
    __tablename__ = 'guests'
    __table_args__ = (UniqueConstraint('event_id', 'email', name='uq_guest_event_email'), UniqueConstraint('id', 'event_id', name='uq_guest_id_event'), CheckConstraint("rsvp_status IN ('pending', 'accepted', 'declined')", name='valid_rsvp'), CheckConstraint('companions >= 0', name='companions_nonnegative'), CheckConstraint("rsvp_status = 'accepted' OR companions = 0", name='companions_require_accepted'))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id'), index=True)
    invite_token: Mapped[str] = mapped_column(String(128), unique=True, index=True, default=generate_invite_token)
    name: Mapped[str] = mapped_column(String(200), index=True)
    company: Mapped[str] = mapped_column(String(250), default='')
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str] = mapped_column(String(40), default='')
    notes: Mapped[str] = mapped_column(String(1000), default='')
    rsvp_status: Mapped[str] = mapped_column(String(20), default='pending', index=True)
    companions: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    checkin: Mapped['Checkin | None'] = relationship(back_populates='guest', uselist=False, lazy='selectin')


class Checkin(Base):
    __tablename__ = 'checkins'
    __table_args__ = (UniqueConstraint('event_id', 'guest_id', name='uq_checkin_event_guest'), ForeignKeyConstraint(['guest_id', 'event_id'], ['guests.id', 'guests.event_id']))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey('events.id'), index=True)
    guest_id: Mapped[int] = mapped_column(Integer, index=True)
    counter: Mapped[str] = mapped_column(String(80))
    checked_in_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    guest: Mapped[Guest] = relationship(back_populates='checkin')


class AdminUser(Base):
    __tablename__ = 'admin_users'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    session_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class Outbox(Base):
    __tablename__ = 'outbox'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True, index=True)
