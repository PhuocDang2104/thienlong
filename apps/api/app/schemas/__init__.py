from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class EventPublic(BaseModel):
    name: str
    start_at: datetime
    venue: str
    counters: list[str]
    max_companions: int


class EventResponse(EventPublic):
    id: int
    welcome_screen_url: str


class InvitationResponse(BaseModel):
    guest_name: str
    company: str
    event_name: str
    start_at: datetime
    venue: str
    rsvp_status: Literal['pending', 'accepted', 'declined']
    companions: int
    notes: str
    max_companions: int


class RsvpRequest(StrictModel):
    status: Literal['accepted', 'declined']
    companions: int = Field(ge=0, le=100, strict=True)
    notes: str | None = Field(default=None, max_length=1000)


class LoginRequest(StrictModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)


class PgSessionRequest(StrictModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    access_code: str = Field(min_length=1, max_length=512)
    counter: str = Field(min_length=1, max_length=80)


class SessionResponse(BaseModel):
    access_token: str
    token_type: Literal['bearer'] = 'bearer'
    expires_in: int


class PgSessionResponse(SessionResponse):
    counter: str


class AdminResponse(BaseModel):
    id: int
    email: str


class PgGuestResponse(BaseModel):
    guest_token: str
    name: str
    company: str
    rsvp_status: Literal['pending', 'accepted', 'declined']
    companions: int
    checked_in_at: datetime | None
    counter: str | None


class CheckinRequest(StrictModel):
    guest_token: str = Field(min_length=16, max_length=128)
    counter: str = Field(min_length=1, max_length=80)


class CheckinResponse(BaseModel):
    status: Literal['checked_in', 'already_checked_in']
    guest_name: str
    company: str
    checked_in_at: datetime
    counter: str


class GuestResponse(BaseModel):
    id: int
    name: str
    company: str
    email: str | None
    phone: str
    notes: str
    invite_token: str
    invitation_url: str
    rsvp_status: Literal['pending', 'accepted', 'declined']
    companions: int
    checked_in_at: datetime | None
    counter: str | None
    created_at: datetime


class GuestPage(BaseModel):
    items: list[GuestResponse]
    total: int
    page: int
    page_size: int


class DeleteGuestsResponse(BaseModel):
    deleted: int


class GuestCreate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(default='', max_length=250)
    email: EmailStr | None = None
    phone: str = Field(default='', max_length=40)
    rsvp_status: Literal['pending', 'accepted', 'declined'] = 'pending'
    companions: int = Field(default=0, ge=0, le=100, strict=True)

    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() or None if isinstance(value, str) else value


class GuestPatch(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company: str | None = Field(default=None, max_length=250)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    rsvp_status: Literal['pending', 'accepted', 'declined'] | None = None
    companions: int | None = Field(default=None, ge=0, le=100, strict=True)

    @field_validator('email', mode='before')
    @classmethod
    def blank_email(cls, value):
        return value.strip().lower() or None if isinstance(value, str) else value


class ImportRow(StrictModel):
    row_number: int
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(default='', max_length=250)
    email: EmailStr | None = None
    phone: str = Field(default='', max_length=40)
    notes: str = Field(default='', max_length=1000)


class ImportErrorRow(BaseModel):
    row_number: int
    message: str


class ImportPreview(BaseModel):
    rows: list[ImportRow]
    errors: list[ImportErrorRow]
    total: int
    valid_count: int


class ImportResult(BaseModel):
    imported: int
    skipped: int


class WelcomeGuest(BaseModel):
    id: int
    name: str
    company: str
    checked_in_at: datetime


class WelcomeResponse(BaseModel):
    event_name: str
    latest_guest: WelcomeGuest | None


class RecentCheckin(BaseModel):
    id: int
    guest_name: str
    company: str
    checked_in_at: datetime
    counter: str


class CounterCount(BaseModel):
    counter: str
    count: int


class DashboardResponse(BaseModel):
    total_guests: int
    accepted: int
    declined: int
    pending: int
    expected_attendance: int
    checked_in: int
    not_arrived: int
    no_show: int
    checkin_rate: float
    registered_arrived: int
    recent_checkins: list[RecentCheckin]
    checkins_by_counter: list[CounterCount]


class TrendPoint(BaseModel):
    time: datetime
    count: int
