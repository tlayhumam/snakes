import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from .database import SessionLocal

T = TypeVar("T")
DEADLOCK_CODES = {1205, 1213}


def is_retryable_deadlock(error: OperationalError) -> bool:
    original = getattr(error, "orig", None)
    args = getattr(original, "args", ())
    return bool(args and args[0] in DEADLOCK_CODES)


async def run_transaction(work: Callable[[AsyncSession], Awaitable[T]], attempts: int = 3) -> T:
    for attempt in range(attempts):
        async with SessionLocal() as db:
            try:
                result = await work(db)
                await db.commit()
                return result
            except OperationalError as error:
                await db.rollback()
                if not is_retryable_deadlock(error) or attempt == attempts - 1:
                    raise
        await asyncio.sleep(0.05 * (2 ** attempt))
    raise RuntimeError("transaction retry exhausted")
