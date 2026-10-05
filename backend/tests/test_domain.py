from app.domain import EntrySplit, cents_to_micros, display_money, referral_commission, split_star_value


def test_one_cent_entry_splits_exactly_into_half_cents():
    split = EntrySplit.for_tier(1)
    assert split.platform_micros == 5_000
    assert split.bounty_micros == 5_000
    assert split.platform_micros + split.bounty_micros == cents_to_micros(1)


def test_referral_is_twenty_percent_of_platform_share():
    split = EntrySplit.for_tier(100)
    assert split.platform_micros == 500_000
    assert referral_commission(split.platform_micros) == 100_000


def test_display_money_preserves_half_cent():
    assert display_money(5_000) == "$0.005"
    assert display_money(1_000_000) == "$1"


def test_star_split_preserves_every_micro():
    stars = split_star_value(50_003, 8)
    assert len(stars) == 8
    assert sum(stars) == 50_003
    assert max(stars) - min(stars) <= 1
