import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from .config import settings
from .db import init_db
from .routers import account, auth, events, stats
from .sync import sync_due_users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("presenze")


async def _periodic_sync() -> None:
    # Primo giro dopo 20 secondi, poi ogni minuto: sync_due_users filtra per intervallo.
    await asyncio.sleep(20)
    while True:
        try:
            await asyncio.to_thread(sync_due_users)
        except Exception:  # noqa: BLE001
            logger.exception("Errore nel ciclo di sincronizzazione")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    task = asyncio.create_task(_periodic_sync())
    logger.info("Presenze API avviata")
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Presenze API",
    description="Registro personale delle presenze collegato a Google Calendar",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    from . import google

    return {
        "status": "ok",
        "app": settings.app_name,
        "google_configured": google.is_configured(),
        "sync_interval_minutes": settings.sync_interval_minutes,
        "privacy": {
            "data_controller": settings.data_controller,
            "contact_email": settings.privacy_contact_email,
        },
    }
