import asyncio
import json
import time

import pytest
from fakeredis.aioredis import FakeRedis
from fastapi import HTTPException
from redis.exceptions import ConnectionError
from sqlalchemy import select

from app.core.config import get_settings
from app.models import Outbox
from app.services import realtime


class RequestStub:
    async def is_disconnected(self):
        return False


def test_outbox_retries_redis_failure_without_losing_transaction(system):
    with system.factory() as db:
        db.add(Outbox(event_type='rsvp', payload={}))
        db.commit()

    class UnavailableRedis:
        async def xadd(self, *args, **kwargs):
            raise ConnectionError('redis unavailable')

    async def run():
        with pytest.raises(ConnectionError):
            await realtime.dispatch_once(UnavailableRedis())
        with system.factory() as db:
            assert db.scalar(select(Outbox)).published_at is None
        redis = FakeRedis(decode_responses=True)
        assert await realtime.dispatch_once(redis) == 1
        assert await realtime.dispatch_once(redis) == 0
        assert await redis.xlen(get_settings().redis_stream_key) == 1
        with system.factory() as db:
            assert db.scalar(select(Outbox)).published_at is not None
        await redis.aclose()

    asyncio.run(run())


def test_crash_after_publish_can_replay_same_business_id(system, monkeypatch):
    with system.factory() as db:
        db.add(Outbox(event_type='checkin', payload={'id': 42, 'name': 'Guest'}))
        db.commit()

    async def run():
        redis = FakeRedis(decode_responses=True)
        original = realtime.mark_published

        def failed_mark(row_id):
            raise RuntimeError('process interrupted before publication acknowledgement')

        monkeypatch.setattr(realtime, 'mark_published', failed_mark)
        with pytest.raises(RuntimeError):
            await realtime.dispatch_once(redis)
        monkeypatch.setattr(realtime, 'mark_published', original)
        assert await realtime.dispatch_once(redis) == 1
        messages = await redis.xrange(get_settings().redis_stream_key)
        assert len(messages) == 2
        assert [json.loads(fields['data'])['id'] for _, fields in messages] == [42, 42]
        await redis.aclose()

    asyncio.run(run())


def test_stream_cursor_resume_reset_and_invalid_input():
    async def run():
        redis = FakeRedis(decode_responses=True)
        key = get_settings().redis_stream_key
        assert await realtime.prepare_stream(redis, None) == '0-0'
        first = await redis.xadd(key, {'type': 'rsvp', 'data': '{}'}, id='100-0')
        last = await redis.xadd(key, {'type': 'rsvp', 'data': '{}'}, id='200-0')
        assert await realtime.prepare_stream(redis, first) == first
        assert await realtime.prepare_stream(redis, None) == last
        assert await realtime.prepare_stream(redis, '999-0') == last
        await redis.xdel(key, first)
        assert await realtime.prepare_stream(redis, first) == last
        with pytest.raises(HTTPException) as error:
            await realtime.prepare_stream(redis, 'invalid\nid: injection')
        assert error.value.status_code == 400
        await redis.aclose()

    asyncio.run(run())


def test_welcome_stream_delivers_since_cursor_without_contact_or_counter():
    async def run():
        redis = FakeRedis(decode_responses=True)
        key = get_settings().redis_stream_key
        cursor = await realtime.prepare_stream(redis, None)
        await redis.xadd(key, {'type': 'rsvp', 'data': '{}'})
        guest = {'id': 42, 'name': 'Nguyễn An', 'company': 'Thiên Long', 'checked_in_at': '2026-09-11T11:00:00Z', 'counter': 'COUNTER_01'}
        await redis.xadd(key, {'type': 'checkin', 'data': json.dumps(guest)})
        stream = realtime.stream_events(RequestStub(), redis, cursor, welcome=True)
        assert 'event: ready' in await anext(stream)
        assert 'data:' not in await anext(stream)  # RSVP advances cursor as heartbeat only.
        frame = await anext(stream)
        assert 'event: checkin' in frame and 'counter' not in frame
        data = json.loads(next(line[6:] for line in frame.splitlines() if line.startswith('data: ')))
        assert data['id'] == 42 and data['name'] == guest['name']
        await stream.aclose()
        await redis.aclose()

    asyncio.run(run())


def test_admin_stream_closes_after_jwt_expiration():
    async def run():
        redis = FakeRedis(decode_responses=True)
        stream = realtime.stream_events(RequestStub(), redis, '0-0', welcome=False, expires_at=int(time.time()) - 1)
        await anext(stream)
        assert 'event: session_expired' in await anext(stream)
        with pytest.raises(StopAsyncIteration):
            await anext(stream)
        await redis.aclose()

    asyncio.run(run())
