import asyncio
import logging
import time
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import admin, pg, public
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.services.realtime import dispatch_forever, make_redis

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('thienlong')


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = make_redis()
    dispatcher = asyncio.create_task(dispatch_forever(app.state.redis))
    yield
    dispatcher.cancel()
    with suppress(asyncio.CancelledError):
        await dispatcher
    await app.state.redis.aclose()


settings = get_settings()
app = FastAPI(title='Thiên Long Event API', version='1.0.0', lifespan=lifespan, docs_url='/docs' if settings.app_env != 'production' else None, redoc_url=None, openapi_url='/openapi.json' if settings.app_env != 'production' else None)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=False, allow_methods=['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'Last-Event-ID'], expose_headers=['Content-Disposition', 'Retry-After'])


@app.middleware('http')
async def safe_request_log(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    route = request.scope.get('route')
    logger.info('request method=%s route=%s status=%s duration_ms=%.1f', request.method, getattr(route, 'path', '<unmatched>'), response.status_code, (time.perf_counter() - started) * 1000)
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception(request: Request, exc: RequestValidationError):
    # Pydantic input/context can contain credentials; never echo them.
    errors = [{'loc': error['loc'], 'msg': error['msg'], 'type': error['type']} for error in exc.errors()]
    return JSONResponse(status_code=422, content={'detail': errors})


@app.get('/health', tags=['Health'])
def health():
    return {'status': 'ok'}


@app.get('/health/ready', tags=['Health'])
async def ready(request: Request):
    try:
        def check_db():
            with SessionLocal() as db:
                db.execute(text('SELECT 1'))
                if db.execute(text('SELECT id FROM events LIMIT 1')).scalar() is None:
                    raise RuntimeError('Event has not been provisioned')
        await asyncio.to_thread(check_db)
        await request.app.state.redis.ping()
    except Exception:
        return JSONResponse(status_code=503, content={'status': 'unavailable'})
    return {'status': 'ready'}


app.include_router(public.router, prefix='/api/v1')
app.include_router(pg.router, prefix='/api/v1')
app.include_router(admin.router, prefix='/api/v1')
