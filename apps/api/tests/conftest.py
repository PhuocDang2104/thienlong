"""Isolated tests: ordinary cases use SQLite, concurrency requires dedicated Postgres."""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['APP_ENV'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite://'
os.environ['REDIS_URL'] = 'redis://localhost:6379/15'
os.environ['JWT_SECRET'] = 'test-only-secret-with-more-than-thirty-two-characters'
os.environ['CORS_ORIGINS'] = 'http://localhost:3000'
os.environ['PUBLIC_FRONTEND_URL'] = 'http://localhost:3000'

from fastapi.testclient import TestClient
from fakeredis.aioredis import FakeRedis

from app.core.database import Base, get_db
from app.core.security import limiter, password_hash
from app.models import AdminUser, Event, Guest
from app import main
from app.services import realtime

ADMIN_PASSWORD = 'TestAdmin-Password-2026!'
PG_CODE = 'Test-PG-2026'
SCREEN_TOKEN = 'screen-token-with-32-characters-minimum'


@pytest.fixture(scope='session')
def password_hashes():
    return password_hash.hash(ADMIN_PASSWORD), password_hash.hash(PG_CODE)


def populate(factory, hashes):
    with factory() as db:
        db.add(Event(id=1, name='Thiên Long — Hội nghị', start_at=datetime(2026, 9, 25, 11, tzinfo=timezone.utc), venue='Hội trường A', counters=['COUNTER_01', 'COUNTER_02'], max_companions=3, pg_access_code_hash=hashes[1], welcome_screen_token=SCREEN_TOKEN))
        db.add(AdminUser(email='admin@example.com', password_hash=hashes[0]))
        db.flush()
        guests = [Guest(event_id=1, invite_token=f'invitation-token-{index:032d}', name=name, company=company, email=email, phone=f'090000000{index}', rsvp_status=status, companions=companions) for index, (name, company, email, status, companions) in enumerate([
            ('Nguyễn Văn An', 'Công ty An', 'an@example.com', 'accepted', 2),
            ('Trần Bình', 'Công ty Bình', 'binh@example.com', 'accepted', 0),
            ('Lê Chi', 'Công ty Chi', None, 'declined', 0),
            ('Phạm Dũng', 'Công ty An', None, 'pending', 0),
        ], start=1)]
        db.add_all(guests)
        db.commit()
        return [{'id': guest.id, 'token': guest.invite_token, 'name': guest.name} for guest in guests]


@pytest.fixture
def system(tmp_path, monkeypatch, password_hashes):
    engine = create_engine(f'sqlite:///{(tmp_path / "unit-test.db").as_posix()}', connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, record):
        connection.execute('PRAGMA foreign_keys=ON')

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    guests = populate(factory, password_hashes)

    def override_db():
        with factory() as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, 'SessionLocal', factory)
    monkeypatch.setattr(realtime, 'SessionLocal', factory)
    main.app.state.redis = FakeRedis(decode_responses=True)
    limiter.entries.clear()
    client = TestClient(main.app)
    yield SimpleNamespace(client=client, factory=factory, guests=guests, redis=main.app.state.redis)
    client.close()
    main.app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def admin_headers(system):
    response = system.client.post('/api/v1/admin/login', json={'email': 'admin@example.com', 'password': ADMIN_PASSWORD})
    assert response.status_code == 200
    return {'Authorization': f'Bearer {response.json()["access_token"]}'}


@pytest.fixture
def pg_headers(system):
    response = system.client.post('/api/v1/pg/session', json={'access_code': PG_CODE, 'counter': 'COUNTER_01'})
    assert response.status_code == 200
    return {'Authorization': f'Bearer {response.json()["access_token"]}'}
