import csv
from pathlib import Path

from sqlalchemy import func, select

from app.models import Checkin, Guest, Outbox
from app.seed import DEFAULT_DEMO_FILE, sync_guest_file


def test_demo_csv_replaces_guests_and_is_idempotent(system, admin_headers, tmp_path):
    with DEFAULT_DEMO_FILE.open(encoding='utf-8-sig', newline='') as source:
        demo_rows = list(csv.DictReader(source))
    first_row = demo_rows[0]
    with system.factory() as db:
        created, updated = sync_guest_file(db, DEFAULT_DEMO_FILE, replace=True)
        db.commit()
        guests = db.scalars(select(Guest).order_by(Guest.id)).all()
        assert (created, updated) == (len(demo_rows), 0)
        assert {guest.name for guest in guests} == {row['name'] for row in demo_rows}
        assert len({guest.invite_token for guest in guests}) == len(demo_rows)
        assert all(len(guest.invite_token) == 43 and guest.rsvp_status == 'pending' for guest in guests)
        assert db.scalar(select(func.count()).select_from(Checkin)) == 0
        assert db.scalar(select(func.count()).select_from(Outbox)) == 1
        original_tokens = {guest.email: guest.invite_token for guest in guests}

    with system.factory() as db:
        first = db.scalar(select(Guest).where(Guest.email == first_row['email'].lower()))
        first.notes = 'Khách cần hỗ trợ di chuyển'
        db.commit()

    changed = tmp_path / 'demo-guests.csv'
    changed.write_text(DEFAULT_DEMO_FILE.read_text(encoding='utf-8').replace(f'{first_row["phone"]},', '0909999999,Ghi chú từ CSV', 1), encoding='utf-8')
    with system.factory() as db:
        created, updated = sync_guest_file(db, changed)
        db.commit()
        guests = db.scalars(select(Guest).order_by(Guest.id)).all()
        assert (created, updated) == (0, 1)
        assert {guest.email: guest.invite_token for guest in guests} == original_tokens
        first = next(guest for guest in guests if guest.email == first_row['email'].lower())
        assert first.phone == '0909999999'
        assert first.notes == 'Khách cần hỗ trợ di chuyển'

    qr = system.client.get(f'/api/v1/admin/guests/{guests[0].id}/qr.png', headers=admin_headers)
    assert qr.status_code == 200 and qr.content.startswith(b'\x89PNG')
