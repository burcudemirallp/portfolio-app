"""
Kullanıcı kimlik doğrulama: JWT token, şifre hash, get_current_user.
JWT için stdlib kullanılıyor (harici paket gerekmez).
"""
import base64
import os
import hmac
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app import models

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    SECRET_KEY = hashlib.sha256(os.urandom(32)).hexdigest()
    import warnings
    warnings.warn(
        "SECRET_KEY is not set! A random key was generated. "
        "Set SECRET_KEY in .env for stable sessions across restarts.",
        stacklevel=2,
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 gün

# Şifre: passlib varsa bcrypt, yoksa stdlib ile basit hash (kurulum paketsiz çalışsın)
try:
    from passlib.context import CryptContext
    _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    def get_password_hash(password: str) -> str:
        return _pwd_context.hash(password)
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        return _pwd_context.verify(plain_password, hashed_password)
except ImportError:
    def get_password_hash(password: str) -> str:
        return "dev:" + hashlib.sha256(password.encode()).hexdigest()
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        if hashed_password.startswith("dev:"):
            return get_password_hash(plain_password) == hashed_password
        return False

security = HTTPBearer(auto_error=False)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def _jwt_sign(msg: bytes, key: str) -> bytes:
    return hmac.new(key.encode(), msg, hashlib.sha256).digest()


def _jwt_encode(payload: dict, key: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    msg = f"{header_b}.{payload_b}".encode()
    sig = _b64url_encode(_jwt_sign(msg, key))
    return f"{header_b}.{payload_b}.{sig}"


def _jwt_decode(token: str, key: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        msg = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = _jwt_sign(msg, key)
        got_sig = _b64url_decode(parts[2])
        if not hmac.compare_digest(expected_sig, got_sig):
            return None
        payload = json.loads(_b64url_decode(parts[1]).decode())
        if "exp" in payload and datetime.utcnow().timestamp() > payload["exp"]:
            return None
        return payload
    except Exception:
        return None


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire.timestamp()})
    return _jwt_encode(to_encode, SECRET_KEY)


def decode_token(token: str) -> Optional[dict]:
    return _jwt_decode(token, SECRET_KEY)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Giriş yapmanız gerekiyor",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
        )
    user_id = int(payload["sub"])
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı bulunamadı",
        )
    return user


def get_current_admin_user(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """Sadece admin kullanıcılar geçer."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yetkiniz yok",
        )
    return current_user
