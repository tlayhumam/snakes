from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import SessionLocal, get_db
from .domain import MICROS_PER_CENT, display_money
from .economy import create_withdrawal, demo_deposit, locked_wallet, make_referral_code, reserve_entry, spin_roulette
from .game import hub
from .models import (
    AppSetting, AuditEvent, Deposit, LedgerEntry, Participant, ReferralReward,
    Round, RouletteReward, Session, SnakeProfile, Tier, User, Wallet, Withdrawal,
)
from .schemas import (
    AdminConfigInput, DepositInput, LoginInput, RegisterInput, SettingsInput,
    SnakeInput, WithdrawalDecision, WithdrawalInput,
)
from .security import (
    COOKIE_NAME, admin_user, clear_session, create_session, current_user,
    hash_password, verify_password, websocket_user,
)
from .transactions import run_transaction

settings = get_settings()
app = FastAPI(title="Snakes API", version="0.1.0", docs_url="/api/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin], allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"],
)
auth_attempts: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def browser_security(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin != settings.frontend_origin:
            return JSONResponse({"detail": "origin not allowed"}, status_code=403)
    if request.url.path in {"/api/auth/register", "/api/auth/login"}:
        key = request.client.host if request.client else "unknown"; now = time.monotonic(); bucket = auth_attempts[key]
        while bucket and now - bucket[0] > 60: bucket.popleft()
        if len(bucket) >= 10: return JSONResponse({"detail": "محاولات كثيرة، حاول بعد دقيقة"}, status_code=429)
        bucket.append(now)
    return await call_next(request)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "mode": "demo", "worker_model": "single"}


@app.post("/api/auth/register", status_code=201)
async def register(payload: RegisterInput, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    email = payload.email.lower()
    if (await db.execute(select(User.id).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "البريد مستخدم بالفعل")
    referrer = None
    if payload.referral_code:
        referrer = (await db.execute(select(User).where(User.referral_code == payload.referral_code.upper()))).scalar_one_or_none()
        if not referrer: raise HTTPException(404, "رمز الإحالة غير صحيح")
    user = User(email=email, password_hash=hash_password(payload.password), display_name=payload.display_name or email.split("@", 1)[0][:60], referral_code=make_referral_code(), referred_by_id=referrer.id if referrer else None)
    db.add(user); await db.flush(); db.add_all([Wallet(user_id=user.id), SnakeProfile(user_id=user.id)])
    if referrer:
        wallet = await locked_wallet(db, referrer.id); wallet.tickets_1 += 3; wallet.spins += 3
        db.add(ReferralReward(referrer_id=referrer.id, referred_id=user.id, kind="registration", milestone_key=f"registration:{user.id}"))
    db.add(LedgerEntry(user_id=user.id, kind="registration_bonus", amount_micros=0, idempotency_key=f"registration:{user.id}", details={"tickets_1": 3, "spins": 3}))
    await create_session(db, user.id, response)
    try: await db.commit()
    except IntegrityError as exc: await db.rollback(); raise HTTPException(409, "تعذر إنشاء الحساب") from exc
    return {"id": user.id, "email": user.email, "display_name": user.display_name, "referral_code": user.referral_code, "bonus": {"tickets_1": 3, "spins": 3}}


@app.post("/api/auth/login")
async def login(payload: LoginInput, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    user = (await db.execute(select(User).where(User.email == payload.email.lower()))).scalar_one_or_none()
    if not user or not verify_password(user.password_hash, payload.password): raise HTTPException(401, "بيانات الدخول غير صحيحة")
    await create_session(db, user.id, response); await db.commit()
    return {"id": user.id, "display_name": user.display_name, "role": user.role}


@app.post("/api/auth/logout", status_code=204)
async def logout(response: Response, token: str | None = Cookie(default=None, alias=COOKIE_NAME), db: AsyncSession = Depends(get_db)) -> Response:
    await clear_session(db, response, token); await db.commit(); return response


@app.get("/api/me")
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    wallet = await db.get(Wallet, user.id)
    return user_payload(user, wallet)


def user_payload(user: User, wallet: Wallet) -> dict:
    return {"id": user.id, "email": user.email, "display_name": user.display_name, "role": user.role, "has_funded": user.has_funded, "referral_code": user.referral_code, "wallet": wallet_payload(wallet)}


def wallet_payload(wallet: Wallet) -> dict:
    return {"balance_micros": wallet.balance_micros, "balance": display_money(wallet.balance_micros), "locked_micros": wallet.locked_micros, "tickets": {"1": wallet.tickets_1, "10": wallet.tickets_10, "100": wallet.tickets_100}, "spins": wallet.spins, "store_vouchers": wallet.store_vouchers}


@app.get("/api/lobby")
async def lobby(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    wallet = await db.get(Wallet, user.id)
    tier_rows = (await db.execute(select(Tier).order_by(Tier.cents))).scalars().all()
    if not tier_rows: tier_rows = [Tier(cents=1, label_ar="للمبتدئين"), Tier(cents=10, label_ar="التحدّي اليومي"), Tier(cents=100, label_ar="المحترفون")]
    return {"wallet": wallet_payload(wallet), "tiers": [{"cents": t.cents, "label": t.label_ar, "enabled": t.enabled, "eligible": t.cents == 1 or user.has_funded} for t in tier_rows], "demo_notice": "رصيد تجريبي — بلا قيمة نقدية"}


@app.get("/api/wallet")
async def wallet_history(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    wallet = await db.get(Wallet, user.id)
    entries = (await db.execute(select(LedgerEntry).where(LedgerEntry.user_id == user.id).order_by(LedgerEntry.created_at.desc()).limit(50))).scalars().all()
    return {"wallet": wallet_payload(wallet), "entries": [{"id": row.id, "kind": row.kind, "amount_micros": row.amount_micros, "amount": display_money(row.amount_micros), "created_at": row.created_at} for row in entries]}


@app.post("/api/deposits/demo", status_code=201)
async def deposit(payload: DepositInput, user: User = Depends(current_user)) -> dict:
    async def work(db: AsyncSession):
        fresh = await db.get(User, user.id)
        return await demo_deposit(db, fresh, payload.amount_cents, payload.method)
    row = await run_transaction(work)
    return {"id": row.id, "status": row.status, "amount": display_money(row.amount_micros), "has_funded": True}


@app.post("/api/withdrawals", status_code=201)
async def withdraw(payload: WithdrawalInput, user: User = Depends(current_user)) -> dict:
    async def work(db: AsyncSession):
        fresh = await db.get(User, user.id)
        return await create_withdrawal(db, fresh, payload.amount_cents, payload.method)
    row = await run_transaction(work)
    return {"id": row.id, "status": row.status, "amount": display_money(row.amount_micros)}


@app.post("/api/roulette/spin")
async def roulette(user: User = Depends(current_user)) -> dict:
    async def work(db: AsyncSession):
        fresh = await db.get(User, user.id)
        row = await spin_roulette(db, fresh)
        wallet = await db.get(Wallet, user.id)
        return row, wallet.spins
    row, spins_remaining = await run_transaction(work)
    return {"id": row.id, "reward_type": row.reward_type, "reward_value": row.reward_value, "spins_remaining": spins_remaining}


@app.get("/api/referrals")
async def referrals(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    referred = (await db.execute(select(User).where(User.referred_by_id == user.id))).scalars().all()
    commission = (await db.execute(select(func.coalesce(func.sum(ReferralReward.amount_micros), 0)).where(ReferralReward.referrer_id == user.id, ReferralReward.kind == "commission"))).scalar_one()
    return {"code": user.referral_code, "total": len(referred), "active": sum(1 for item in referred if item.referral_activated_at), "commission_micros": commission, "commission": display_money(commission)}


@app.patch("/api/profile/snake")
async def save_snake(payload: SnakeInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    profile = await db.get(SnakeProfile, user.id) or SnakeProfile(user_id=user.id)
    profile.primary_color = payload.primary; profile.secondary_color = payload.secondary; profile.pattern = payload.pattern; db.add(profile); await db.commit()
    return {"saved": True, **payload.model_dump()}


@app.patch("/api/settings")
async def save_settings(payload: SettingsInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    profile = await db.get(SnakeProfile, user.id) or SnakeProfile(user_id=user.id)
    for key, value in payload.model_dump().items(): setattr(profile, key, value)
    db.add(profile); await db.commit(); return {"saved": True}


@app.get("/api/admin/metrics")
async def admin_metrics(_: User = Depends(admin_user), db: AsyncSession = Depends(get_db)) -> dict:
    rounds_by_tier = (await db.execute(select(Round.tier_cents, func.count(Round.id)).group_by(Round.tier_cents))).all()
    platform = (await db.execute(select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0)).where(LedgerEntry.user_id.is_(None)))).scalar_one()
    payouts = (await db.execute(select(func.coalesce(func.sum(LedgerEntry.amount_micros), 0)).where(LedgerEntry.kind.in_(["kill_reward", "bot_kill_reward"])))).scalar_one()
    active = (await db.execute(select(func.count(Round.id)).where(Round.state == "running"))).scalar_one()
    return {"active_rounds": active, "rounds_by_tier": {str(tier): count for tier, count in rounds_by_tier}, "platform_micros": platform, "platform": display_money(platform), "player_payouts_micros": payouts, "player_payouts": display_money(payouts)}


@app.put("/api/admin/config")
async def admin_config(payload: AdminConfigInput, admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)) -> dict:
    row = await db.get(AppSetting, "core") or AppSetting(key="core", value={}); row.value = payload.model_dump(); db.add(row)
    db.add(AuditEvent(actor_user_id=admin.id, action="config.update", target_type="settings", target_id="core", details=payload.model_dump())); await db.commit(); return {"saved": True, **payload.model_dump()}


@app.patch("/api/admin/withdrawals/{withdrawal_id}")
async def decide_withdrawal(withdrawal_id: str, payload: WithdrawalDecision, admin: User = Depends(admin_user), db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(Withdrawal).where(Withdrawal.id == withdrawal_id).with_for_update())).scalar_one_or_none()
    if not row: raise HTTPException(404, "الطلب غير موجود")
    if row.status != "pending": raise HTTPException(409, "تمت معالجة الطلب")
    wallet = await locked_wallet(db, row.user_id); wallet.locked_micros -= row.amount_micros
    if payload.decision == "rejected": wallet.balance_micros += row.amount_micros
    row.status = payload.decision; db.add(AuditEvent(actor_user_id=admin.id, action=f"withdrawal.{payload.decision}", target_type="withdrawal", target_id=row.id, details={"amount_micros": row.amount_micros})); await db.commit()
    return {"id": row.id, "status": row.status}


@app.websocket("/ws/game/{tier_cents}")
async def game_socket(websocket: WebSocket, tier_cents: int) -> None:
    await websocket.accept(); user = await websocket_user(websocket)
    if not user: await websocket.send_json({"type": "error", "code": "unauthorized", "message": "يجب تسجيل الدخول"}); await websocket.close(code=4401); return
    if tier_cents not in {1, 10, 100}: await websocket.close(code=4404); return
    room = await hub.room_for(tier_cents)
    try:
        async def work(db: AsyncSession):
            fresh_user = await db.get(User, user.id)
            return await reserve_entry(db, fresh_user, room.round_id, tier_cents)
        participant = await run_transaction(work)
        await room.add_human(websocket, participant)
        while True:
            event = await websocket.receive_json()
            if event.get("type") == "input": room.input(participant.id, float(event.get("angle", 0)), int(event.get("sequence", 0)))
            elif event.get("type") == "ping": await websocket.send_json({"type": "pong", "at": event.get("at")})
    except WebSocketDisconnect:
        await room.disconnect(participant.id)
    except HTTPException as exc:
        await websocket.send_json({"type": "error", "code": "entry_rejected", "message": exc.detail}); await websocket.close(code=4409)
