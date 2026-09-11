import asyncio
import json
import logging
import re
import time

from fastapi import HTTPException, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import Outbox, utcnow

logger = logging.getLogger('thienlong')


def make_redis() -> Redis:
    return Redis.from_url(get_settings().redis_url, decode_responses=True, socket_connect_timeout=3, socket_timeout=15, health_check_interval=30)


def pending_batch() -> list[tuple[int, str, dict]]:
    with SessionLocal() as db:
        return [(row.id, row.event_type, row.payload) for row in db.scalars(select(Outbox).where(Outbox.published_at.is_(None)).order_by(Outbox.id).limit(100)).all()]


def mark_published(row_id: int):
    with SessionLocal() as db:
        db.execute(update(Outbox).where(Outbox.id == row_id).values(published_at=utcnow()))
        db.commit()


async def dispatch_once(redis: Redis) -> int:
    # Exactly one dispatcher per deployment. Publication is at-least-once: a
    # crash after XADD but before DB commit can replay, clients dedup check-in id.
    count = 0
    pending = await asyncio.to_thread(pending_batch)
    for row_id, event_type, payload in pending:
        await redis.xadd(get_settings().redis_stream_key, {'type': event_type, 'data': json.dumps(payload, ensure_ascii=False)}, maxlen=5000, approximate=True)
        await asyncio.to_thread(mark_published, row_id)
        count += 1
    return count


async def dispatch_forever(redis: Redis):
    while True:
        try:
            count = await dispatch_once(redis)
            await asyncio.sleep(0.1 if count else 0.3)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning('realtime dispatcher unavailable; pending outbox will retry')
            await asyncio.sleep(2)


async def prepare_stream(redis: Redis, last_id: str | None) -> str:
    if last_id and not re.fullmatch(r'\d{1,20}-\d{1,20}', last_id):
        raise HTTPException(400, 'Last-Event-ID không hợp lệ.')
    try:
        await redis.ping()
        tail = await redis.xrevrange(get_settings().redis_stream_key, count=1)
        newest = tail[0][0] if tail else '0-0'
        if last_id and tail:
            oldest = (await redis.xrange(get_settings().redis_stream_key, count=1))[0][0]
            order = lambda value: tuple(map(int, value.split('-')))
            if order(oldest) <= order(last_id) <= order(newest):
                return last_id
        # A cursor outside the retained log means reset/trim. ready requests a snapshot.
        return newest
    except RedisError:
        raise HTTPException(503, 'Kết nối trực tiếp đang khôi phục.', headers={'Retry-After': '3'}) from None


async def stream_events(request: Request, redis: Redis, cursor: str, welcome: bool, expires_at: int | None = None):
    yield f'id: {cursor}\nretry: 3000\nevent: ready\ndata: {{}}\n\n'
    try:
        while not await request.is_disconnected():
            if expires_at is not None and time.time() >= expires_at:
                yield 'event: session_expired\ndata: {}\n\n'
                return
            block = min(10000, max(1, int((expires_at - time.time()) * 1000))) if expires_at else 10000
            messages = await redis.xread({get_settings().redis_stream_key: cursor}, count=100, block=block)
            if not messages:
                yield ': heartbeat\n\n'
            for _, entries in messages:
                for message_id, fields in entries:
                    cursor = message_id
                    event_type = fields.get('type')
                    if event_type not in ('checkin', 'rsvp', 'guests_changed'):
                        continue
                    if welcome and event_type != 'checkin':
                        # Advance the client's resume position without exposing changes.
                        yield f'id: {message_id}\n: heartbeat\n\n'
                        continue
                    payload = json.loads(fields.get('data', '{}'))
                    if welcome:
                        payload = {key: payload[key] for key in ('id', 'name', 'company', 'checked_in_at') if key in payload}
                    yield f'id: {message_id}\nevent: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n'
    except RedisError:
        yield 'event: reconnect\ndata: {}\n\n'
