from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

MICROS_PER_DOLLAR = 1_000_000
MICROS_PER_CENT = 10_000


def cents_to_micros(cents: int) -> int:
    if cents < 0:
        raise ValueError("amount must not be negative")
    return cents * MICROS_PER_CENT


def split_entry_cents(cents: int) -> tuple[int, int]:
    total = cents_to_micros(cents)
    return total // 2, total - (total // 2)


def referral_commission(platform_share_micros: int) -> int:
    return platform_share_micros * 20 // 100


def split_star_value(total_micros: int, star_count: int) -> list[int]:
    """Split a dropped value exactly, without losing remainder micros."""
    if total_micros < 0 or star_count < 1:
        raise ValueError("star value and count must be positive")
    base, remainder = divmod(total_micros, star_count)
    return [base + (1 if index < remainder else 0) for index in range(star_count)]


def display_money(micros: int) -> str:
    value = (Decimal(micros) / MICROS_PER_DOLLAR).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    rendered = format(value, "f").rstrip("0").rstrip(".")
    return f"${rendered or '0'}"


@dataclass(frozen=True)
class EntrySplit:
    platform_micros: int
    bounty_micros: int

    @classmethod
    def for_tier(cls, cents: int) -> "EntrySplit":
        platform, bounty = split_entry_cents(cents)
        return cls(platform, bounty)
