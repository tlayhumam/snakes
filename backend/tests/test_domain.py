from app.domain import EntrySplit, cents_to_micros, display_money, referral_commission


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
