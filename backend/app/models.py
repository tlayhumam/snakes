from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def uid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(60))
    role: Mapped[str] = mapped_column(String(20), default="player")
    referral_code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    referred_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    referral_activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    has_funded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    wallet: Mapped["Wallet"] = relationship(back_populates="user", uselist=False)


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Wallet(Base):
    __tablename__ = "wallets"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    locked_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    tickets_1: Mapped[int] = mapped_column(Integer, default=3)
    tickets_10: Mapped[int] = mapped_column(Integer, default=0)
    tickets_100: Mapped[int] = mapped_column(Integer, default=0)
    spins: Mapped[int] = mapped_column(Integer, default=3)
    store_vouchers: Mapped[int] = mapped_column(Integer, default=0)
    permanent_score_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    snk_coin_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    magnets: Mapped[int] = mapped_column(Integer, default=0)
    speed_boosts: Mapped[int] = mapped_column(Integer, default=0)
    cameras: Mapped[int] = mapped_column(Integer, default=0)
    premium_spins: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    user: Mapped[User] = relationship(back_populates="wallet")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    amount_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(96), unique=True)
    round_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class SnakeProfile(Base):
    __tablename__ = "snake_profiles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    primary_color: Mapped[str] = mapped_column(String(12), default="#ef4f4f")
    secondary_color: Mapped[str] = mapped_column(String(12), default="#fff4d1")
    pattern: Mapped[str] = mapped_column(String(20), default="dots")
    sensitivity: Mapped[int] = mapped_column(Integer, default=62)
    sound: Mapped[bool] = mapped_column(Boolean, default=True)
    music: Mapped[bool] = mapped_column(Boolean, default=False)
    vibration: Mapped[bool] = mapped_column(Boolean, default=True)


class Tier(Base):
    __tablename__ = "tiers"
    cents: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    label_ar: Mapped[str] = mapped_column(String(80))


class Round(Base):
    __tablename__ = "rounds"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    tier_cents: Mapped[int] = mapped_column(Integer, index=True)
    state: Mapped[str] = mapped_column(String(20), default="waiting", index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=300)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Participant(Base):
    __tablename__ = "participants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    round_id: Mapped[str] = mapped_column(ForeignKey("rounds.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(60))
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    entry_source: Mapped[str] = mapped_column(String(20), default="cash")
    bounty_micros: Mapped[int] = mapped_column(BigInteger)
    platform_micros: Mapped[int] = mapped_column(BigInteger)
    state: Mapped[str] = mapped_column(String(20), default="alive")
    kills: Mapped[int] = mapped_column(Integer, default=0)
    earnings_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    round_score_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    collected_stars: Mapped[int] = mapped_column(Integer, default=0)
    collected_snk_coins: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (UniqueConstraint("round_id", "user_id", name="uq_round_user"),)


class Kill(Base):
    __tablename__ = "kills"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    round_id: Mapped[str] = mapped_column(ForeignKey("rounds.id"), index=True)
    killer_participant_id: Mapped[str | None] = mapped_column(ForeignKey("participants.id"), nullable=True)
    victim_participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id"), unique=True)
    bounty_micros: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Deposit(Base):
    __tablename__ = "deposits"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount_micros: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Withdrawal(Base):
    __tablename__ = "withdrawals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount_micros: Mapped[int] = mapped_column(BigInteger)
    fee_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    method: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReferralReward(Base):
    __tablename__ = "referral_rewards"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    referrer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    referred_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    milestone_key: Mapped[str | None] = mapped_column(String(96), nullable=True, unique=True)
    amount_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    source_kill_id: Mapped[str | None] = mapped_column(ForeignKey("kills.id"), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RouletteReward(Base):
    __tablename__ = "roulette_rewards"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    reward_type: Mapped[str] = mapped_column(String(30))
    reward_value: Mapped[int] = mapped_column(BigInteger)
    cost_micros: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ShopPurchase(Base):
    __tablename__ = "shop_purchases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    item_code: Mapped[str] = mapped_column(String(30), index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    cost_micros: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class VsChallenge(Base):
    __tablename__ = "vs_challenges"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    creator_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    creator_platform_id: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(120))
    reward_micros: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    invite_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    participants_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class VsChallengeEntry(Base):
    __tablename__ = "vs_challenge_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    challenge_id: Mapped[str] = mapped_column(ForeignKey("vs_challenges.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    platform_id: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(20), default="accepted")
    score_micros: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_vs_challenge_user"),)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


Index("idx_participants_round_state", Participant.round_id, Participant.state)
Index("idx_withdrawals_user_status", Withdrawal.user_id, Withdrawal.status)
