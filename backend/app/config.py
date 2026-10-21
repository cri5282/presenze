from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Registro"
    database_url: str = "sqlite:///./data/presenze.db"

    # Genera con: python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: str = "dev-secret-change-me-0123456789abcdefghilmnopqrstuvwxyz"
    session_days: int = 30
    cookie_name: str = "presenze_session"
    cookie_secure: bool = False

    # Google Cloud / OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:5173"

    # Facoltativo: limita l'accesso a questi indirizzi email (separati da virgola).
    # Vuoto = chiunque abbia accesso al client OAuth può creare un account.
    allowed_emails: str = ""
    # Facoltativo: consenti tutti gli account di questi domini (separati da virgola).
    # Esempio: "itsolivetti.it" oppure "itsolivetti.it, itsolivetti-edu.it".
    allowed_email_domains: str = ""

    def is_email_allowed(self, email: str) -> bool:
        normalized = email.strip().lower()
        allowed = {item.strip().lower() for item in self.allowed_emails.split(",") if item.strip()}
        domains = {
            item.strip().lower().lstrip("@")
            for item in self.allowed_email_domains.split(",")
            if item.strip()
        }
        if not allowed and not domains:
            return True
        if normalized in allowed:
            return True
        domain = normalized.rsplit("@", 1)[-1] if "@" in normalized else ""
        return bool(domain and domain in domains)

    # Calendari selezionati automaticamente per i nuovi utenti. Utile quando tutta
    # la classe deve importare lo stesso calendario condiviso.
    default_calendar_ids: str = "primary"

    def default_calendars(self) -> list[str]:
        ids = [item.strip() for item in self.default_calendar_ids.split(",") if item.strip()]
        return list(dict.fromkeys(ids)) or ["primary"]

    # Dati mostrati nella pagina pubblica /privacy. Se vuoti, la pagina usa
    # un'intestazione generica e invita a contattare il gestore dell'istanza.
    data_controller: str = ""
    privacy_contact_email: str = ""

    # Sincronizzazione
    sync_interval_minutes: int = 15
    initial_sync_days_back: int = 180
    initial_sync_days_forward: int = 90

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
