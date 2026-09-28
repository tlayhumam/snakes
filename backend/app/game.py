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
from .economy import award_bot_kill, refund_survivor, settle_kill
from .models import Participant, Round

ARENA_WIDTH = 1400
ARENA_HEIGHT = 900
CELL = 48


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
    last_sequence: int = 0


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
        self._lock = asyncio.Lock()

    async def add_human(self, websocket: WebSocket, participant: Participant) -> None:
        async with self._lock:
            state = self._new_snake(participant.id, participant.display_name, participant.user_id, False)
            self.snakes[state.id] = state; self.websockets[state.id] = websocket
            await websocket.send_json({"type": "queue.status", "round_id": self.round_id, "players": len(self.snakes), "starts_in": get_settings().matchmaking_seconds})
            if not self.queue_task:
                self.queue_task = asyncio.create_task(self._countdown())

    def _new_snake(self, pid: str, name: str, user_id: str | None, bot: bool) -> SnakeState:
        colors = ["#ef4f4f", "#4fc798", "#ffd858", "#5d83e6", "#9b5ac3", "#f38c4d"]
        x = random.uniform(120, ARENA_WIDTH - 120); y = random.uniform(120, ARENA_HEIGHT - 120)
        return SnakeState(pid, name, user_id, bot, x, y, random.random() * math.tau, random.choice(colors), [(x, y)] * 28)

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
        for snake in self.snakes.values():
            if not snake.alive: continue
            if snake.is_bot: snake.angle += random.uniform(-0.11, 0.11)
            snake.x += math.cos(snake.angle) * 112 * dt; snake.y += math.sin(snake.angle) * 112 * dt
            snake.body.append((snake.x, snake.y));
            if len(snake.body) > 42: snake.body.pop(0)
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

    async def _eliminate(self, victim: SnakeState, killer: SnakeState | None) -> None:
        if not victim.alive: return
        victim.alive = False
        event_id = str(uuid.uuid4())
        if killer: killer.kills += 1
        async with SessionLocal() as db:
            if victim.is_bot:
                if killer and killer.user_id:
                    killer.earnings_micros += await award_bot_kill(db, killer.user_id, self.round_id, self.tier_cents, event_id)
            else:
                row = await settle_kill(db, self.round_id, killer.id if killer and not killer.is_bot else None, victim.id)
                if killer and row: killer.earnings_micros += row.bounty_micros
            await db.commit()
        await self.broadcast({"type": "elimination", "victim_id": victim.id, "killer_id": killer.id if killer else None})

    def snapshot(self, elapsed: float) -> dict:
        return {"type": "snapshot", "server_time": time.time(), "remaining": max(0, get_settings().round_duration_seconds - int(elapsed)), "snakes": [{"id": s.id, "name": s.name, "x": round(s.x, 2), "y": round(s.y, 2), "angle": round(s.angle, 4), "body": [[round(x, 1), round(y, 1)] for x, y in s.body[::2]], "color": s.color, "alive": s.alive, "is_bot": s.is_bot, "kills": s.kills, "earnings_micros": s.earnings_micros} for s in self.snakes.values()]}

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
                if snake.alive and not snake.is_bot: await refund_survivor(db, snake.id)
            row = await db.get(Round, self.round_id); row.state = "complete"; row.ended_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
            await db.commit()
        await self.broadcast({"type": "round.end", "leaderboard": sorted([{"name": s.name, "kills": s.kills, "earnings_micros": s.earnings_micros} for s in self.snakes.values()], key=lambda x: (x["earnings_micros"], x["kills"]), reverse=True)[:5]})


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
