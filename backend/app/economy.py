import random
import string
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .domain import EntrySplit, MICROS_PER_CENT, referral_commission
from .models import (
    AuditEvent, Deposit, Kill, LedgerEntry, Participant, ReferralReward,
    RouletteReward, ShopPurchase, User, Wallet, Withdrawal,
)


def make_referral_code() -> str:
    return "SNK-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


async def locked_wallet(db: AsyncSession, user_id: str) -> Wallet:
    wallet = (await db.execute(select(Wallet).where(Wallet.user_id == user_id).with_for_update())).scalar_one_or_none()
    if not wallet:
        raise HTTPException(404, "المحفظة غير موجودة")
    return wallet


def add_ledger(db: AsyncSession, *, user_id: str | None, kind: str, amount_micros: int, key: str, round_id: str | None = None, details: dict | None = None) -> None:
    db.add(LedgerEntry(user_id=user_id, kind=kind, amount_micros=amount_micros, idempotency_key=key, round_id=round_id, details=details))


async def demo_deposit(db: AsyncSession, user: User, amount_cents: int, method: str) -> Deposit:
    if amount_cents < 1000:
        raise HTTPException(422, "الحد الأدنى للإيداع $10")
    wallet = await locked_wallet(db, user.id); micros = amount_cents * MICROS_PER_CENT
    deposit = Deposit(user_id=user.id, amount_micros=micros, method=method, status="completed")
    db.add(deposit); await db.flush(); wallet.balance_micros += micros
    add_ledger(db, user_id=user.id, kind="demo_deposit", amount_micros=micros, key=f"deposit:{deposit.id}", details={"method": method})
    if not user.has_funded:
        user.has_funded = True
        if user.referred_by_id and not user.referral_activated_at:
            ref_wallet = await locked_wallet(db, user.referred_by_id)
            ref_wallet.tickets_10 += 5; ref_wallet.spins += 5; user.referral_activated_at = datetime.now(timezone.utc)
            db.add(ReferralReward(referrer_id=user.referred_by_id, referred_id=user.id, kind="activation", milestone_key=f"activation:{user.id}"))
    return deposit


async def create_withdrawal(db: AsyncSession, user: User, amount_cents: int, method: str) -> Withdrawal:
    if amount_cents < 500:
        raise HTTPException(422, "الحد الأدنى للسحب $5")
    wallet = await locked_wallet(db, user.id); micros = amount_cents * MICROS_PER_CENT
    if wallet.balance_micros < micros:
        raise HTTPException(409, "الرصيد غير كافٍ")
    wallet.balance_micros -= micros; wallet.locked_micros += micros
    row = Withdrawal(user_id=user.id, amount_micros=micros, method=method, status="pending")
    db.add(row); await db.flush()
    add_ledger(db, user_id=user.id, kind="withdrawal_hold", amount_micros=-micros, key=f"withdrawal:{row.id}")
    return row


async def reserve_entry(db: AsyncSession, user: User, round_id: str, tier_cents: int) -> Participant:
    if tier_cents not in {1, 10, 100}:
        raise HTTPException(404, "الفئة غير موجودة")
    if tier_cents > 1 and not user.has_funded:
        raise HTTPException(403, "أودع $10 أولاً لفتح هذه الفئة")
    wallet = await locked_wallet(db, user.id); split = EntrySplit.for_tier(tier_cents); source = "cash"; ticket_field = f"tickets_{tier_cents}"
    if getattr(wallet, ticket_field) > 0:
        setattr(wallet, ticket_field, getattr(wallet, ticket_field) - 1); source = "ticket"
    else:
        total = split.platform_micros + split.bounty_micros
        if wallet.balance_micros < total:
            raise HTTPException(409, "الرصيد غير كافٍ")
        wallet.balance_micros -= total
    participant = Participant(round_id=round_id, user_id=user.id, display_name=user.display_name, is_bot=False, entry_source=source, bounty_micros=split.bounty_micros, platform_micros=split.platform_micros)
    db.add(participant); await db.flush()
    add_ledger(db, user_id=user.id, kind="round_entry", amount_micros=-(split.platform_micros + split.bounty_micros), key=f"entry:{participant.id}", round_id=round_id, details={"source": source, "tier_cents": tier_cents})
    add_ledger(db, user_id=None, kind="platform_entry_share", amount_micros=split.platform_micros, key=f"platform-entry:{participant.id}", round_id=round_id)
    return participant


async def settle_kill(db: AsyncSession, round_id: str, killer_id: str | None, victim_id: str) -> Kill | None:
    victim = (await db.execute(select(Participant).where(Participant.id == victim_id).with_for_update())).scalar_one()
    if victim.state != "alive":
        return None
    killer = None
    if killer_id:
        killer = (await db.execute(select(Participant).where(Participant.id == killer_id).with_for_update())).scalar_one()
    victim.state = "eliminated"
    row = Kill(round_id=round_id, killer_participant_id=killer_id, victim_participant_id=victim_id, bounty_micros=victim.bounty_micros)
    db.add(row); await db.flush()
    if killer and killer.user_id:
        wallet = await locked_wallet(db, killer.user_id); wallet.balance_micros += victim.bounty_micros; killer.kills += 1; killer.earnings_micros += victim.bounty_micros
        add_ledger(db, user_id=killer.user_id, kind="kill_reward", amount_micros=victim.bounty_micros, key=f"kill:{row.id}", round_id=round_id)
        killer_user = (await db.execute(select(User).where(User.id == killer.user_id))).scalar_one()
        if killer_user.referred_by_id and killer_user.referral_activated_at:
            commission = referral_commission(victim.platform_micros); ref_wallet = await locked_wallet(db, killer_user.referred_by_id); ref_wallet.balance_micros += commission
            db.add(ReferralReward(referrer_id=killer_user.referred_by_id, referred_id=killer_user.id, kind="commission", amount_micros=commission, source_kill_id=row.id))
            add_ledger(db, user_id=killer_user.referred_by_id, kind="referral_commission", amount_micros=commission, key=f"referral-kill:{row.id}", round_id=round_id)
            add_ledger(db, user_id=None, kind="referral_commission_cost", amount_micros=-commission, key=f"platform-referral:{row.id}", round_id=round_id)
    else:
        add_ledger(db, user_id=None, kind="unclaimed_bounty", amount_micros=victim.bounty_micros, key=f"unclaimed:{row.id}", round_id=round_id)
    return row


async def record_star_drop(db: AsyncSession, round_id: str, killer_id: str | None, victim_id: str, dropped_micros: int) -> Kill | None:
    """Record an elimination without paying it immediately.

    The value remains at risk in arena stars and is only banked by a surviving
    collector at round end.
    """
    victim = (await db.execute(select(Participant).where(Participant.id == victim_id).with_for_update())).scalar_one()
    if victim.state != "alive":
        return None
    killer = None
    if killer_id:
        killer = (await db.execute(select(Participant).where(Participant.id == killer_id).with_for_update())).scalar_one()
    victim.state = "eliminated"
    victim.round_score_micros = 0
    row = Kill(
        round_id=round_id,
        killer_participant_id=killer_id,
        victim_participant_id=victim_id,
        bounty_micros=dropped_micros,
    )
    db.add(row)
    if killer:
        killer.kills += 1
    return row


async def refund_survivor(db: AsyncSession, participant_id: str) -> None:
    p = (await db.execute(select(Participant).where(Participant.id == participant_id).with_for_update())).scalar_one()
    if p.state != "alive": return
    p.state = "survived"
    if p.user_id:
        wallet = await locked_wallet(db, p.user_id); wallet.balance_micros += p.bounty_micros
        add_ledger(db, user_id=p.user_id, kind="survivor_refund", amount_micros=p.bounty_micros, key=f"survivor:{p.id}", round_id=p.round_id)


async def bank_round_progress(db: AsyncSession, participant_id: str, round_score_micros: int, stars: int, snk_coins: int) -> None:
    participant = (await db.execute(select(Participant).where(Participant.id == participant_id).with_for_update())).scalar_one()
    participant.round_score_micros = round_score_micros
    participant.collected_stars = stars
    participant.collected_snk_coins = snk_coins
    if not participant.user_id:
        return
    wallet = await locked_wallet(db, participant.user_id)
    wallet.permanent_score_micros += round_score_micros
    wallet.snk_coin_micros += snk_coins * 30_000
    add_ledger(
        db,
        user_id=participant.user_id,
        kind="round_score_banked",
        amount_micros=0,
        key=f"round-score:{participant.id}",
        round_id=participant.round_id,
        details={"score_micros": round_score_micros, "stars": stars, "snk_coins": snk_coins},
    )


STORE_ITEMS = {
    "magnet": {"price_micros": 250_000, "field": "magnets", "units": 1},
    "speed": {"price_micros": 150_000, "field": "speed_boosts", "units": 3},
    "camera": {"price_micros": 500_000, "field": "cameras", "units": 1},
    "premium_spin": {"price_micros": 100_000, "field": "premium_spins", "units": 1},
}


async def purchase_store_item(db: AsyncSession, user: User, item_code: str, quantity: int) -> ShopPurchase:
    item = STORE_ITEMS.get(item_code)
    if not item:
        raise HTTPException(404, "العنصر غير موجود")
    wallet = await locked_wallet(db, user.id)
    cost = int(item["price_micros"]) * quantity
    if wallet.balance_micros < cost:
        raise HTTPException(409, "الرصيد غير كافٍ")
    wallet.balance_micros -= cost
    field = str(item["field"])
    setattr(wallet, field, getattr(wallet, field) + int(item["units"]) * quantity)
    purchase = ShopPurchase(user_id=user.id, item_code=item_code, quantity=quantity, cost_micros=cost)
    db.add(purchase)
    await db.flush()
    add_ledger(db, user_id=user.id, kind="store_purchase", amount_micros=-cost, key=f"store:{purchase.id}", details={"item_code": item_code, "quantity": quantity})
    return purchase


async def consume_powerup(db: AsyncSession, user_id: str, item_code: str) -> None:
    fields = {"magnet": "magnets", "speed": "speed_boosts", "camera": "cameras"}
    field = fields.get(item_code)
    if not field:
        raise HTTPException(404, "الميزة غير موجودة")
    wallet = await locked_wallet(db, user_id)
    if getattr(wallet, field) < 1:
        raise HTTPException(409, "اشترِ الميزة من المتجر أولاً")
    setattr(wallet, field, getattr(wallet, field) - 1)


async def award_bot_kill(db: AsyncSession, user_id: str, round_id: str, tier_cents: int, event_id: str) -> int:
    bounty = EntrySplit.for_tier(tier_cents).bounty_micros
    wallet = await locked_wallet(db, user_id); wallet.balance_micros += bounty
    add_ledger(db, user_id=user_id, kind="bot_kill_reward", amount_micros=bounty, key=f"bot-kill:{event_id}", round_id=round_id)
    add_ledger(db, user_id=None, kind="demo_treasury_bot_bounty", amount_micros=-bounty, key=f"bot-treasury:{event_id}", round_id=round_id)
    return bounty


async def spin_roulette(db: AsyncSession, user: User) -> RouletteReward:
    wallet = await locked_wallet(db, user.id)
    if wallet.spins < 1: raise HTTPException(409, "لا توجد لفات متاحة")
    rewards = [("cash", 1, 1), ("ticket_1", 1, 1), ("cash", 5, 5), ("ticket_10", 1, 10), ("voucher", 1, 25), ("ticket_100", 1, 100)]
    weights = [1 / cost for _, _, cost in rewards]; kind, value, cost = random.choices(rewards, weights=weights, k=1)[0]; wallet.spins -= 1
    row = RouletteReward(user_id=user.id, reward_type=kind, reward_value=value, cost_micros=cost * MICROS_PER_CENT); db.add(row); await db.flush()
    if kind == "cash": wallet.balance_micros += value * MICROS_PER_CENT
    elif kind == "ticket_1": wallet.tickets_1 += value
    elif kind == "ticket_10": wallet.tickets_10 += value
    elif kind == "ticket_100": wallet.tickets_100 += value
    else: wallet.store_vouchers += value
    add_ledger(db, user_id=user.id, kind="roulette_reward", amount_micros=value * MICROS_PER_CENT if kind == "cash" else 0, key=f"roulette:{row.id}", details={"reward_type": kind, "value": value})
    return row
