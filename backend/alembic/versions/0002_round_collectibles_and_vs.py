"""Round collectibles, shop inventory, and VS+ challenges.

Revision ID: 0002
"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add_column(table: str, column: sa.Column) -> None:
    if column.name not in _columns(table):
        op.add_column(table, column)


def upgrade() -> None:
    for column in (
        sa.Column("permanent_score_micros", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("snk_coin_micros", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("magnets", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("speed_boosts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cameras", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("premium_spins", sa.Integer(), nullable=False, server_default="0"),
    ):
        _add_column("wallets", column)
    for column in (
        sa.Column("round_score_micros", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("collected_stars", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("collected_snk_coins", sa.Integer(), nullable=False, server_default="0"),
    ):
        _add_column("participants", column)

    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("shop_purchases"):
        op.create_table(
            "shop_purchases",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("item_code", sa.String(30), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("cost_micros", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_shop_purchases_user_id", "shop_purchases", ["user_id"])
        op.create_index("ix_shop_purchases_item_code", "shop_purchases", ["item_code"])
    if not inspector.has_table("vs_challenges"):
        op.create_table(
            "vs_challenges",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("creator_user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("creator_platform_id", sa.String(80), nullable=False),
            sa.Column("title", sa.String(120), nullable=False),
            sa.Column("reward_micros", sa.BigInteger(), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="open"),
            sa.Column("invite_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("participants_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_vs_challenges_creator_user_id", "vs_challenges", ["creator_user_id"])
        op.create_index("ix_vs_challenges_creator_platform_id", "vs_challenges", ["creator_platform_id"])
        op.create_index("ix_vs_challenges_status", "vs_challenges", ["status"])
        op.create_index("ix_vs_challenges_created_at", "vs_challenges", ["created_at"])
    if not inspector.has_table("vs_challenge_entries"):
        op.create_table(
            "vs_challenge_entries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("challenge_id", sa.String(36), sa.ForeignKey("vs_challenges.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("platform_id", sa.String(80), nullable=False),
            sa.Column("state", sa.String(20), nullable=False, server_default="accepted"),
            sa.Column("score_micros", sa.BigInteger(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("challenge_id", "user_id", name="uq_vs_challenge_user"),
        )
        op.create_index("ix_vs_challenge_entries_challenge_id", "vs_challenge_entries", ["challenge_id"])
        op.create_index("ix_vs_challenge_entries_user_id", "vs_challenge_entries", ["user_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    for table in ("vs_challenge_entries", "vs_challenges", "shop_purchases"):
        if inspector.has_table(table):
            op.drop_table(table)
    for column in ("collected_snk_coins", "collected_stars", "round_score_micros"):
        if column in _columns("participants"):
            op.drop_column("participants", column)
    for column in ("premium_spins", "cameras", "speed_boosts", "magnets", "snk_coin_micros", "permanent_score_micros"):
        if column in _columns("wallets"):
            op.drop_column("wallets", column)
