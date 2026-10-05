from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, min_length=2, max_length=60)
    referral_code: str | None = Field(default=None, max_length=24)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class DepositInput(BaseModel):
    amount_cents: int = Field(ge=1000, le=1_000_000)
    method: Literal["shamcash", "coinpayments", "agent"]


class WithdrawalInput(BaseModel):
    amount_cents: int = Field(ge=500, le=1_000_000)
    method: Literal["shamcash", "coinpayments", "agent"]


class SnakeInput(BaseModel):
    primary: str = "#ef4f4f"
    secondary: str = "#fff4d1"
    pattern: Literal["dots", "bands", "stars"] = "dots"

    @field_validator("primary", "secondary")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if len(value) != 7 or not value.startswith("#"):
            raise ValueError("invalid color")
        int(value[1:], 16)
        return value.lower()


class SettingsInput(BaseModel):
    sound: bool = True
    music: bool = False
    vibration: bool = True
    sensitivity: int = Field(default=62, ge=1, le=100)


class AdminConfigInput(BaseModel):
    round_duration_seconds: int = Field(ge=60, le=1800)
    min_deposit_cents: int = Field(ge=100)
    min_withdrawal_cents: int = Field(ge=100)
    withdrawal_fee_bps: int = Field(ge=0, le=3000)
    shamcash_enabled: bool
    coinpayments_enabled: bool
    agent_enabled: bool


class WithdrawalDecision(BaseModel):
    decision: Literal["approved", "rejected"]


class ShopPurchaseInput(BaseModel):
    item_code: Literal["magnet", "speed", "camera", "premium_spin"]
    quantity: int = Field(default=1, ge=1, le=10)


class VsChallengeInput(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    creator_platform_id: str = Field(min_length=2, max_length=80)
    reward_cents: int = Field(ge=100, le=1_000_000)
    invite_enabled: bool = True


class VsChallengeJoinInput(BaseModel):
    platform_id: str = Field(min_length=2, max_length=80)
