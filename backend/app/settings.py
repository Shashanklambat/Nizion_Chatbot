"""Server-controlled feature flags. Defaults to secure, verified registration."""
import os
from dotenv import load_dotenv

load_dotenv()


def whatsapp_otp_enabled() -> bool:
    """Read the server flag; refuse typos rather than silently disabling security."""
    raw = os.getenv("WHATSAPP_OTP_ENABLED", "true").strip().lower()
    if raw in {"true", "1", "yes", "on"}:
        return True
    if raw in {"false", "0", "no", "off"}:
        return False
    raise RuntimeError("WHATSAPP_OTP_ENABLED must be true or false")
