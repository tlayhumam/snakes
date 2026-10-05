from __future__ import annotations

import asyncio
import math
import random
import time
import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket

from .config import get_settings
from .database import SessionLocal
from .domain import EntrySplit, split_star_value
from .economy import bank_round_progress, record_star_drop, refund_survivor
from .models import Participant, Round

ARENA_WIDTH = 1400
ARENA_HEIGHT = 900
CELL = 48
SNK_COIN_MICROS = 30_000
STAR_COUNT = 8


@dataclass
class SnakeState:
    id: str
    name: str
    user_id: str | None
    is_bot: bool
    x: float
    y: float
    angle: float
    color: str
    body: list[tuple[float, float]] = field(default_factory=list)
    alive: bool = True
    kills: int = 0
    earnings_micros: int = 0
    bounty_micros: int = 0
    round_score_micros: int = 0
    collected_stars: int = 0
    collected_snk_coins: int = 0
    speed_active: bool = False
    magnet_active_until: float = 0.0
    camera_active: bool = False
    last_sequence: int = 0


@dataclass
class Pickup:
    id: str
    kind: str
    x: float
    y: float
    value_micros: int
    expires_at: float | None = None


class GameRoom:
    def __init__(self, round_id: str, tier_cents: int):
        self.round_id = round_id
        self.tier_cents = tier_cents
        self.state = "waiting"
        self.snakes: dict[str, SnakeState] = {}
        self.websockets: dict[str, WebSocket] = {}
        self.queue_task: asyncio.Task | None = None
        self.game_task: asyncio.Task | None = None
        self.started_at = 0.0
        self.pickups: dict[str, Pickup] = {}
        self.last_coin_hour: int | None = None
        self._lock = asyncio.Lock()

    async def add_human(self, websocket: WebSocket, participant: Participant) -> None:
        async with self._lock:
            state = self._new_snake(participant.id, participant.display_name, participant.user_id, False)
            state.bounty_micros = participant.bounty_micros
            self.snakes[state.id] = state; self.websockets[state.id] = websocket
            await websocket.send_json({"type": "queue.status", "round_id": self.round_id, "players": len(self.snakes), "starts_in": get_settings().matchmaking_seconds})
            if not self.queue_task:
                self.queue_task = asyncio.create_task(self._countdown())

    def _new_snake(self, pid: str, name: str, user_id: str | None, bot: bool) -> SnakeState:
        colors = ["#ef4f4f", "#4fc798", "#ffd858", "#5d83e6", "#9b5ac3", "#f38c4d"]
        x = random.uniform(120, ARENA_WIDTH - 120); y = random.uniform(120, ARENA_HEIGHT - 120)
        state = SnakeState(pid, name, user_id, bot, x, y, random.random() * math.tau, random.choice(colors), [(x, y)] * 28)
        state.bounty_micros = EntrySplit.for_tier(self.tier_cents).bounty_micros
        if bot:
            state.round_score_micros = random.randint(0, 4) * 5_000
        return state

    async def _countdown(self) -> None:
        await asyncio.sleep(get_settings().matchmaking_seconds)
        async with self._lock:
            while len(self.snakes) < 30:
                number = len(self.snakes) + 1; bot_id = f"bot-{self.round_id}-{number}"
                self.snakes[bot_id] = self._new_snake(bot_id, f"آلي {number:02d}", None, True)
            self.state = "running"; self.started_at = time.monotonic()
        async with SessionLocal() as db:
            row = await db.get(Round, self.round_id); row.state = "running"; row.started_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            await db.commit()
        await self.broadcast({"type": "match.start", "round_id": self.round_id, "duration": get_settings().round_duration_seconds, "players": 30})
        self.game_task = asyncio.create_task(self._game_loop())

    def input(self, participant_id: str, angle: float, sequence: int) -> None:
        snake = self.snakes.get(participant_id)
        if snake and snake.alive and sequence > snake.last_sequence:
            snake.angle = angle % math.tau; snake.last_sequence = sequence

    def power(self, participant_id: str, code: str, active: bool = True) -> None:
        snake = self.snakes.get(participant_id)
        if not snake or not snake.alive:
            return
        if code == "speed":
            snake.speed_active = active
        elif code == "magnet" and active:
            snake.magnet_active_until = time.monotonic() + 8
        elif code == "camera" and active:
            snake.camera_active = True

    async def _game_loop(self) -> None:
        tick = 0; step = 1 / 20
        while self.state == "running":
            before = time.monotonic(); elapsed = before - self.started_at
            if elapsed >= get_settings().round_duration_seconds: break
            await self._simulate(step); tick += 1
            if tick % 2 == 0: await self.broadcast(self.snapshot(elapsed))
            await asyncio.sleep(max(0, step - (time.monotonic() - before)))
        await self.finish()

    async def _simulate(self, dt: float) -> None:
        self._sync_hourly_coins()
        for snake in self.snakes.values():
            if not snake.alive: continue
            if snake.is_bot: snake.angle += random.uniform(-0.11, 0.11)
            speed = 172 if snake.speed_active else 112
            snake.x += math.cos(snake.angle) * speed * dt; snake.y += math.sin(snake.angle) * speed * dt
            snake.body.append((snake.x, snake.y));
            if len(snake.body) > 42: snake.body.pop(0)
            if random.random() < 0.012:
                snake.round_score_micros += 1_000
            self._collect_pickups(snake)
        grid: dict[tuple[int, int], list[tuple[str, float, float]]] = {}
        for snake in self.snakes.values():
            if not snake.alive: continue
            for x, y in snake.body[:-8]: grid.setdefault((int(x // CELL), int(y // CELL)), []).append((snake.id, x, y))
        deaths: list[tuple[SnakeState, SnakeState | None]] = []
        for snake in self.snakes.values():
            if not snake.alive: continue
            if snake.x < 10 or snake.x > ARENA_WIDTH - 10 or snake.y < 10 or snake.y > ARENA_HEIGHT - 10:
                deaths.append((snake, None)); continue
            cell = (int(snake.x // CELL), int(snake.y // CELL))
            for other_id, x, y in grid.get(cell, []):
                if other_id != snake.id and (snake.x - x) ** 2 + (snake.y - y) ** 2 < 210:
                    deaths.append((snake, self.snakes[other_id])); break
        for victim, killer in deaths: await self._eliminate(victim, killer)

    def _sync_hourly_coins(self) -> None:
        now = time.time()
        hour = int(now // 3600)
        if int(now % 3600) >= 30 or self.last_coin_hour == hour:
            return
        self.last_coin_hour = hour
        for index in range(30):
            pickup_id = f"coin-{hour}-{index}"
            self.pickups[pickup_id] = Pickup(
                id=pickup_id,
                kind="snk_coin",
                x=random.uniform(70, ARENA_WIDTH - 70),
                y=random.uniform(70, ARENA_HEIGHT - 70),
                value_micros=SNK_COIN_MICROS,
                expires_at=time.monotonic() + 30,
            )

    def _collect_pickups(self, snake: SnakeState) -> None:
        now = time.monotonic()
        for pickup_id, pickup in list(self.pickups.items()):
            if pickup.expires_at and pickup.expires_at <= now:
                self.pickups.pop(pickup_id, None)
                continue
            distance = math.hypot(snake.x - pickup.x, snake.y - pickup.y)
            radius = 155 if pickup.kind == "star" and snake.magnet_active_until > now else 24
            if distance > radius:
                continue
            if pickup.kind == "star":
                snake.round_score_micros += pickup.value_micros
                snake.collected_stars += 1
            else:
                snake.collected_snk_coins += 1
            self.pickups.pop(pickup_id, None)

    async def _eliminate(self, victim: SnakeState, killer: SnakeState | None) -> None:
        if not victim.alive: return
        victim.alive = False
        dropped_micros = victim.bounty_micros + victim.round_score_micros
        values = split_star_value(dropped_micros, STAR_COUNT)
        trail = victim.body[::max(1, len(victim.body) // STAR_COUNT)] or [(victim.x, victim.y)]
        for index, value in enumerate(values):
            x, y = trail[min(index, len(trail) - 1)]
            pickup_id = str(uuid.uuid4())
            self.pickups[pickup_id] = Pickup(pickup_id, "star", x + random.uniform(-12, 12), y + random.uniform(-12, 12), value)
        victim.round_score_micros = 0
        if killer:
            killer.kills += 1
        async with SessionLocal() as db:
            if not victim.is_bot:
                await record_star_drop(db, self.round_id, killer.id if killer and not killer.is_bot else None, victim.id, dropped_micros)
            await db.commit()
        await self.broadcast({"type": "elimination", "victim_id": victim.id, "killer_id": killer.id if killer else None, "dropped_stars": STAR_COUNT, "dropped_micros": dropped_micros})

    def snapshot(self, elapsed: float) -> dict:
        return {
            "type": "snapshot",
            "server_time": time.time(),
            "remaining": max(0, get_settings().round_duration_seconds - int(elapsed)),
            "snakes": [{"id": s.id, "name": s.name, "x": round(s.x, 2), "y": round(s.y, 2), "angle": round(s.angle, 4), "body": [[round(x, 1), round(y, 1)] for x, y in s.body[::2]], "color": s.color, "alive": s.alive, "is_bot": s.is_bot, "kills": s.kills, "round_score_micros": s.round_score_micros, "collected_stars": s.collected_stars, "collected_snk_coins": s.collected_snk_coins, "powers": {"magnet": s.magnet_active_until > time.monotonic(), "speed": s.speed_active, "camera": s.camera_active}} for s in self.snakes.values()],
            "pickups": [{"id": p.id, "kind": p.kind, "x": round(p.x, 2), "y": round(p.y, 2), "value_micros": p.value_micros, "label": "SNK 0.03" if p.kind == "snk_coin" else None} for p in self.pickups.values()],
        }

    async def broadcast(self, event: dict) -> None:
        stale = []
        for pid, ws in list(self.websockets.items()):
            try: await ws.send_json(event)
            except Exception: stale.append(pid)
        for pid in stale: self.websockets.pop(pid, None)

    async def disconnect(self, participant_id: str) -> None:
        self.websockets.pop(participant_id, None)
        if self.state != "running": return
        await asyncio.sleep(5)
        if participant_id not in self.websockets and (snake := self.snakes.get(participant_id)) and snake.alive:
            await self._eliminate(snake, None)

    async def finish(self) -> None:
        self.state = "complete"
        async with SessionLocal() as db:
            for snake in self.snakes.values():
                if snake.is_bot:
                    continue
                await bank_round_progress(db, snake.id, snake.round_score_micros if snake.alive else 0, snake.collected_stars, snake.collected_snk_coins)
                if snake.alive:
                    await refund_survivor(db, snake.id)
            row = await db.get(Round, self.round_id); row.state = "complete"; row.ended_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            await db.commit()
        await self.broadcast({"type": "round.end", "leaderboard": sorted([{"name": s.name, "kills": s.kills, "round_score_micros": s.round_score_micros if s.alive else 0} for s in self.snakes.values()], key=lambda x: (x["round_score_micros"], x["kills"]), reverse=True)[:5]})


class GameHub:
    def __init__(self): self.waiting: dict[int, GameRoom] = {}; self._lock = asyncio.Lock()

    async def room_for(self, tier_cents: int) -> GameRoom:
        async with self._lock:
            room = self.waiting.get(tier_cents)
            if room and room.state == "waiting": return room
            round_id = str(uuid.uuid4())
            async with SessionLocal() as db:
                db.add(Round(id=round_id, tier_cents=tier_cents, duration_seconds=get_settings().round_duration_seconds)); await db.commit()
            room = GameRoom(round_id, tier_cents); self.waiting[tier_cents] = room; return room


hub = GameHub()
