"""Exercise PostgreSQL locking/constraints in an isolated temporary test schema."""
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateSchema, DropSchema

from app.core.database import Base
from app.models import Checkin, Outbox
from app.services.checkins import perform_checkin
from conftest import populate


@pytest.fixture
def postgres_system(password_hashes):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set TEST_DATABASE_URL for real PostgreSQL concurrency tests')
    parsed = make_url(url)
    if not parsed.drivername.startswith('postgresql') or parsed.database != 'thienlong_test':
        pytest.fail('TEST_DATABASE_URL must point to the dedicated thienlong_test database')
    schema = 'test_' + uuid.uuid4().hex
    admin_engine = create_engine(url)
    with admin_engine.begin() as connection:
        connection.execute(CreateSchema(schema))
    engine = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    try:
        Base.metadata.create_all(engine)
        factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        guests = populate(factory, password_hashes)
        yield SimpleNamespace(factory=factory, guests=guests)
    finally:
        engine.dispose()
        with admin_engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))
        admin_engine.dispose()


def test_postgres_constraint_allows_one_simultaneous_insert(postgres_system):
    barrier = threading.Barrier(2)

    def insert():
        with postgres_system.factory() as db:
            db.add(Checkin(event_id=1, guest_id=postgres_system.guests[0]['id'], counter='COUNTER_01'))
            barrier.wait(timeout=10)
            try:
                db.commit()
                return 'inserted'
            except IntegrityError:
                db.rollback()
                return 'duplicate'

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: insert(), range(2)))
    assert sorted(results) == ['duplicate', 'inserted']
    with postgres_system.factory() as db:
        assert db.scalar(select(func.count()).select_from(Checkin)) == 1


def test_postgres_service_double_checkin_has_one_outbox(postgres_system):
    barrier = threading.Barrier(2)

    def checkin():
        with postgres_system.factory() as db:
            barrier.wait(timeout=10)
            return perform_checkin(db, postgres_system.guests[0]['token'], 'COUNTER_01')

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: checkin(), range(2)))
    assert sorted(duplicate for _, duplicate in results) == [False, True]
    assert results[0][0]['checked_in_at'] == results[1][0]['checked_in_at']
    with postgres_system.factory() as db:
        assert db.scalar(select(func.count()).select_from(Checkin)) == 1
        assert db.scalar(select(func.count()).select_from(Outbox)) == 1
