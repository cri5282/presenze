from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_dir() -> None:
    if settings.database_url.startswith("sqlite:///"):
        raw = settings.database_url.removeprefix("sqlite:///")
        if raw and raw != ":memory:":
            Path(raw).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_dir()

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_attendance_time_columns() -> None:
    """Aggiunge le colonne degli orari ai database creati prima di questa funzione.

    Non usiamo Alembic per un progetto personale: questa migrazione è idempotente e
    mantiene intatte le presenze già registrate.
    """
    inspector = inspect(engine)
    if "attendance" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("attendance")}
    with engine.begin() as connection:
        if "entry_time" not in existing:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN entry_time VARCHAR(5)"))
        if "exit_time" not in existing:
            connection.execute(text("ALTER TABLE attendance ADD COLUMN exit_time VARCHAR(5)"))


def init_db() -> None:
    from . import models  # noqa: F401  (registra i modelli)

    Base.metadata.create_all(bind=engine)
    _ensure_attendance_time_columns()
