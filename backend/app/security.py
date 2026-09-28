import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Response, WebSocket
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import SessionLocal, get_db
from .models import Session, User

password_hasher = PasswordHasher()
COOKIE_NAME = "snakes_session"


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_session(db: AsyncSession, user_id: str, response: Response) -> None:
    settings = get_settings()
    token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.session_ttl_hours)
    db.add(Session(token_hash=hash_token(token), user_id=user_id, expires_at=expires))
    await db.flush()
    response.set_cookie(
        COOKIE_NAME, token, max_age=settings.session_ttl_hours * 3600,
        httponly=True, secure=settings.session_cookie_secure, samesite="lax", path="/",
    )


async def current_user(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(401, "يجب تسجيل الدخول")
    result = await db.execute(
        select(User).join(Session, Session.user_id == User.id).where(
            Session.token_hash == hash_token(token), Session.expires_at > datetime.now(timezone.utc)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "انتهت الجلسة")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "صلاحية الإدارة مطلوبة")
    return user


async def websocket_user(websocket: WebSocket) -> User | None:
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        return None
    async with SessionLocal() as db:
        result = await db.execute(
            select(User).join(Session, Session.user_id == User.id).where(
                Session.token_hash == hash_token(token), Session.expires_at > datetime.now(timezone.utc)
            )
        )
        return result.scalar_one_or_none()


async def clear_session(db: AsyncSession, response: Response, token: str | None) -> None:
    if token:
        await db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    response.delete_cookie(COOKIE_NAME, path="/")
