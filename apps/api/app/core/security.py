import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import AdminUser, Event, utcnow

password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash(secrets.token_urlsafe(32))
bearer = HTTPBearer(auto_error=False)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return password_hash.verify(raw, hashed)
    except Exception:
        return False


def create_session(role: str, subject: int, version: int, counter: str | None = None) -> dict:
    settings = get_settings()
    now = utcnow()
    payload = {'sub': str(subject), 'role': role, 'version': version, 'iat': now, 'exp': now + timedelta(minutes=settings.jwt_expire_minutes), 'iss': 'thienlong-api', 'aud': 'thienlong-web'}
    if counter:
        payload['counter'] = counter
    return {'access_token': jwt.encode(payload, settings.jwt_secret, algorithm='HS256'), 'token_type': 'bearer', 'expires_in': settings.jwt_expire_minutes * 60, **({'counter': counter} if counter else {})}


def claims(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if credentials is None:
        raise HTTPException(401, 'Vui lòng đăng nhập.', headers={'WWW-Authenticate': 'Bearer'})
    try:
        return jwt.decode(credentials.credentials, get_settings().jwt_secret, algorithms=['HS256'], issuer='thienlong-api', audience='thienlong-web', options={'require': ['sub', 'exp', 'iat', 'role', 'version']})
    except jwt.PyJWTError:
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', headers={'WWW-Authenticate': 'Bearer'}) from None


def admin_required(payload: dict = Depends(claims), db: Session = Depends(get_db, scope='function')) -> AdminUser:
    if payload.get('role') != 'admin':
        raise HTTPException(403, 'Không có quyền truy cập.')
    try:
        user = db.get(AdminUser, int(payload['sub']))
    except (ValueError, TypeError):
        user = None
    if user is None or payload.get('version') != user.session_version:
        raise HTTPException(401, 'Phiên đăng nhập đã hết hiệu lực.')
    return user


def pg_required(payload: dict = Depends(claims), db: Session = Depends(get_db)) -> dict:
    if payload.get('role') != 'pg':
        raise HTTPException(403, 'Không có quyền truy cập.')
    event = db.get(Event, 1)
    if event is None or payload.get('sub') != str(event.id) or payload.get('version') != event.session_version or payload.get('counter') not in event.counters:
        raise HTTPException(401, 'Phiên check-in đã hết hiệu lực.')
    return payload


class RateLimiter:
    """Bounded process-local limiter; deployment must use one Uvicorn worker."""
    def __init__(self):
        self.entries = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, request: Request, group: str, limit: int, window: int = 60):
        key = (request.client.host if request.client else 'unknown', group)
        now = time.monotonic()
        with self.lock:
            if len(self.entries) >= 10000:
                self.entries = defaultdict(deque, {k: v for k, v in self.entries.items() if v and v[-1] > now - 60})
                if key not in self.entries and len(self.entries) >= 10000:
                    raise HTTPException(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', headers={'Retry-After': '60'})
            entries = self.entries[key]
            while entries and entries[0] <= now - window:
                entries.popleft()
            if len(entries) >= limit:
                raise HTTPException(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', headers={'Retry-After': str(max(1, int(entries[0] + window - now)))})
            entries.append(now)


limiter = RateLimiter()
