"""Hash OTPs in the database and issue short-lived, one-time registration tickets."""
import hashlib
import hmac
import secrets
from datetime import timedelta
import jwt
from fastapi import HTTPException
from .models import utcnow
from .security import JWT_SECRET

def new_code() -> str:
    return f'{secrets.randbelow(1_000_000):06d}'

def code_digest(phone: str, code: str) -> str:
    return hmac.new(JWT_SECRET.encode(), f'{phone}:{code}'.encode(), hashlib.sha256).hexdigest()

def matches_code(phone: str, code: str, digest: str) -> bool:
    return hmac.compare_digest(code_digest(phone, code), digest)

def create_ticket(challenge_id: int, phone: str) -> str:
    now = utcnow()
    return jwt.encode({'purpose': 'register', 'phone': phone, 'challenge_id': challenge_id,
                       'iat': now, 'exp': now + timedelta(minutes=15)}, JWT_SECRET, algorithm='HS256')

def decode_ticket(token: str, phone: str) -> int:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        if payload.get('purpose') != 'register' or payload.get('phone') != phone:
            raise ValueError('Ticket and phone do not match')
        return int(payload['challenge_id'])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise HTTPException(status_code=403, detail='Phone verification expired or invalid. Verify your WhatsApp number again.') from None
