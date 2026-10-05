"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, CircleDollarSign,
  Bot, Camera, Check, Clipboard, Clock3, Coins, Crown, Crosshair, Gamepad2, Gauge,
  Gift, Home, Magnet, Maximize2, Menu, Minimize2, PackageOpen, Palette,
  Play, Settings2, Share2, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Star, Swords, Ticket, Trophy, UserRoundPlus, Users, Video, Volume2,
  WalletCards, Wifi, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/api";

type View = "lobby" | "game" | "wallet" | "roulette" | "snake" | "referrals" | "settings" | "store" | "vs-plus" | "admin" | "login" | "register";
type SnakeStyle = { primary: string; secondary: string; pattern: "dots" | "bands" | "stars" };
type ArenaStats = { kills: number; players: number; mass: number; value: number; dead: boolean; roundScore: number; stars: number; snkCoins: number; coinDropActive: boolean };
type ArenaControls = { magnetUntil: number; speed: boolean; cameraWide: boolean; steering: boolean; steerX: number; steerY: number };

function Link(props: React.ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />;
}

const tiers = [
  { cents: 1, value: "$0.01", label: "للمبتدئين", tone: "mint", locked: false },
  { cents: 10, value: "$0.10", label: "التحدّي اليومي", tone: "yellow", locked: false },
  { cents: 100, value: "$1.00", label: "المحترفون", tone: "coral", locked: true },
] as const;
const leaders = [["ليث", "$1.40"], ["نور", "$0.95"], ["كريم", "$0.80"], ["سما", "$0.55"], ["آدم", "$0.40"]];
const botNames = ["برق", "نمر", "شبح", "صقر", "موج", "لهب", "ورد", "رعد", "نسر", "فهد", "نور", "سيف", "نجم", "قمر", "ذئب", "ريح", "شمس", "لؤلؤ", "شاهين", "كوبرا", "زمرّد", "عنبر", "مرجان", "ياسمين", "رمح", "أطلس", "وادي", "جبل", "بركان"];
const botPalette = [
  ["#56d6aa", "#fff4d1"], ["#ffd858", "#173e68"], ["#718ef2", "#ffffff"],
  ["#f27c68", "#fff3db"], ["#d66bea", "#fff1a8"], ["#42bfe7", "#ffffff"],
];
const navItems: Array<{ view: View; href: string; label: string; icon: typeof Home }> = [
  { view: "lobby", href: "/", label: "الرئيسية", icon: Home },
  { view: "roulette", href: "/roulette", label: "الروليت", icon: Gift },
  { view: "vs-plus", href: "/vs-plus", label: "تحديات VS+", icon: Swords },
  { view: "snake", href: "/snake", label: "تصميم الثعبان", icon: Palette },
  { view: "referrals", href: "/referrals", label: "الإحالات", icon: Users },
  { view: "wallet", href: "/wallet", label: "المحفظة", icon: WalletCards },
  { view: "store", href: "/store", label: "المتجر", icon: ShoppingBag },
  { view: "settings", href: "/settings", label: "الإعدادات", icon: Settings2 },
];

function drawSnake(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, primary: string, secondary: string, pattern = "dots", width = 22) {
  if (points.length < 2) return;
  const path = () => { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,.34)"; ctx.lineWidth = width + 7; path(); ctx.stroke();
  ctx.shadowColor = primary; ctx.shadowBlur = 10; ctx.strokeStyle = primary; ctx.lineWidth = width; path(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.strokeStyle = secondary; ctx.lineWidth = Math.max(3, width * .23); ctx.setLineDash(pattern === "bands" ? [8, 12] : pattern === "stars" ? [2, 18] : [3, 14]); ctx.stroke(); ctx.setLineDash([]);
  const [hx, hy] = points.at(-1)!; const [px, py] = points.at(-2)!; const angle = Math.atan2(hy - py, hx - px); const dx = Math.cos(angle); const dy = Math.sin(angle); const nx = -dy; const ny = dx; const headX = hx + dx * width * .12; const headY = hy + dy * width * .12; const head = width * .7;
  ctx.fillStyle = primary; ctx.beginPath(); ctx.arc(headX, headY, head, 0, Math.PI * 2); ctx.fill();
  [-1, 1].forEach(side => { const eyeX = headX + dx * width * .42 + nx * width * .25 * side; const eyeY = headY + dy * width * .42 + ny * width * .25 * side; ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(eyeX, eyeY, Math.max(3.3, width * .2), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#071a2c"; ctx.beginPath(); ctx.arc(eyeX + dx * width * .06, eyeY + dy * width * .06, Math.max(1.6, width * .085), 0, Math.PI * 2); ctx.fill(); });
}

function drawValueTag(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, caption: string, snakeWidth: number) {
  const label = `$${value.toFixed(2)}`; ctx.font = "900 12px Arial"; const width = Math.max(54, ctx.measureText(label).width + 18); const top = y - snakeWidth * 1.25 - 34;
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 8; ctx.fillStyle = "rgba(3,10,18,.9)"; ctx.strokeStyle = "#f3cf54"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x - width / 2, top, width, 25, 7); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffe66f"; ctx.textAlign = "center"; ctx.fillText(label, x, top + 17);
  ctx.font = "800 8px Tahoma, Arial"; ctx.fillStyle = "rgba(255,255,255,.72)"; ctx.fillText(caption, x, top - 5);
}

function VirtualJoystick({ onSteer, disabled }: { onSteer: (x: number, y: number, active: boolean) => void; disabled: boolean }) {
  const baseRef = useRef<HTMLDivElement>(null); const pointerId = useRef<number | null>(null); const [knob, setKnob] = useState({ x: 0, y: 0 }); const [active, setActive] = useState(false);
  const steer = (clientX: number, clientY: number) => { const rect = baseRef.current?.getBoundingClientRect(); if (!rect) return; const radius = rect.width * .31; const dx = clientX - (rect.left + rect.width / 2); const dy = clientY - (rect.top + rect.height / 2); const distance = Math.hypot(dx, dy); const scale = distance > radius ? radius / distance : 1; const x = dx * scale; const y = dy * scale; setKnob({ x, y }); setActive(true); onSteer(x / radius, y / radius, true); };
  const release = (target?: HTMLDivElement) => { if (target && pointerId.current !== null && target.hasPointerCapture(pointerId.current)) target.releasePointerCapture(pointerId.current); pointerId.current = null; setKnob({ x: 0, y: 0 }); setActive(false); onSteer(0, 0, false); };
  const keyDirection = (key: string) => ({ ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] } as Record<string, [number, number]>)[key];
  return <div className={`virtual-joystick ${active ? "active" : ""} ${disabled ? "disabled" : ""}`} role="group" aria-label="عصا التحكم بالتوجيه" tabIndex={disabled ? -1 : 0}
    onPointerDown={event => { if (disabled) return; event.preventDefault(); pointerId.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); steer(event.clientX, event.clientY); }}
    onPointerMove={event => { if (!disabled && pointerId.current === event.pointerId) steer(event.clientX, event.clientY); }}
    onPointerUp={event => release(event.currentTarget)} onPointerCancel={event => release(event.currentTarget)}
    onKeyDown={event => { const direction = keyDirection(event.key); if (!direction || disabled) return; event.preventDefault(); const radius = baseRef.current?.getBoundingClientRect().width ? baseRef.current.getBoundingClientRect().width * .31 : 36; setKnob({ x: direction[0] * radius, y: direction[1] * radius }); setActive(true); onSteer(direction[0], direction[1], true); }}
    onKeyUp={event => { if (keyDirection(event.key)) release(); }} onBlur={() => release()}>
    <div className="joystick-base" ref={baseRef}><span className="joystick-ring inner" /><span className="joystick-axis horizontal" /><span className="joystick-axis vertical" /><span className="joystick-arrow north" /><span className="joystick-arrow east" /><span className="joystick-arrow south" /><span className="joystick-arrow west" /><span className="joystick-knob" style={{ transform: `translate3d(calc(-50% + ${knob.x}px),calc(-50% + ${knob.y}px),0)` }}><Crosshair /></span></div>
    <small>{active ? "توجيه" : "اسحب للتوجيه"}</small>
  </div>;
}

function Arena({ interactive = false, style, entryValue = .1, onStats, controls, challengeMode = false }: { interactive?: boolean; style?: SnakeStyle; entryValue?: number; onStats?: React.Dispatch<React.SetStateAction<ArenaStats>>; controls?: React.MutableRefObject<ArenaControls>; challengeMode?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackControls = useRef<ArenaControls>({ magnetUntil: 0, speed: false, cameraWide: false, steering: false, steerX: 0, steerY: 0 });
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const worldWidth = 4200; const worldHeight = 2800;
    const controller = controls ?? fallbackControls;
    let frame = 0; let animation = 0; let kills = 0; let collectedMass = 0; let bodyLimit = 54; let roundScore = 0; let collectedStars = 0; let snkCoins = 0; let playerDead = false; let lastReport = ""; let coinBatchSpawned = false;
    const player = { x: worldWidth / 2, y: worldHeight / 2, angle: 0, body: [] as Array<[number, number]>, initialized: false };
    const camera = { x: 0, y: 0, initialized: false };
    const starPellets: Array<{ x: number; y: number; color: string; size: number; value: number }> = [];
    const goldCoins: Array<{ x: number; y: number; expiresAt: number }> = [];
    const consumedFieldPellets = new Set<number>();
    const bots = botNames.map((name, index) => ({
      name, x: 0, y: 0, angle: (index * 1.87) % (Math.PI * 2), speed: .72 + (index % 5) * .08,
      turn: .0034 + (index % 4) * .0012, body: [] as Array<[number, number]>, initialized: false, alive: true,
      bodyLimit: 28 + index % 16, value: .05 + (index % 5) * .05, roundScore: (index % 4) * .005,
    }));
    const reportStats = () => { const players = bots.filter(bot => bot.alive).length + (playerDead ? 0 : 1); const playerValue = entryValue + roundScore; const coinDropActive = coinBatchSpawned && goldCoins.length > 0; const key = `${kills}:${collectedMass}:${bodyLimit}:${playerValue}:${playerDead}:${players}:${collectedStars}:${snkCoins}:${coinDropActive}`; if (key === lastReport) return; lastReport = key; onStats?.({ kills, players, mass: bodyLimit, value: playerValue, dead: playerDead, roundScore, stars: collectedStars, snkCoins, coinDropActive }); };
    const dropBot = (botIndex: number) => { const bot = bots[botIndex]; if (!bot.alive) return; bot.alive = false; const colors = botPalette[botIndex % botPalette.length]; const totalValue = bot.value + bot.roundScore; const valuePerStar = totalValue / 8; for (let starIndex = 0; starIndex < 8; starIndex++) { const segment = bot.body[Math.min(bot.body.length - 1, Math.floor((starIndex / 8) * bot.body.length))] ?? [bot.x, bot.y]; starPellets.push({ x: segment[0] + ((starIndex * 7) % 13 - 6), y: segment[1] + ((starIndex * 11) % 13 - 6), color: colors[0], size: 8, value: valuePerStar }); } };
    const draw = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = rect.width; const h = rect.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) { canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#173e68"); g.addColorStop(1, "#071d34"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (interactive) {
        const zoom = controller.current.cameraWide ? .82 : 1.34;
        const viewW = w / zoom; const viewH = h / zoom;
        bots.forEach((bot, index) => {
          if (!bot.alive) return;
          if (!bot.initialized) {
            const columns = 7; const column = index % columns; const row = Math.floor(index / columns);
            bot.x = worldWidth / 2 + (column - 3) * 175 + ((index * 7) % 31 - 15); bot.y = worldHeight / 2 + (row - 2) * 150 + ((index * 11) % 29 - 14);
            const startDx = bot.x - worldWidth / 2; const startDy = bot.y - worldHeight / 2; const startDistance = Math.hypot(startDx, startDy); if (startDistance < 315) { const startAngle = startDistance < 1 ? index * .7 : Math.atan2(startDy, startDx); bot.x = worldWidth / 2 + Math.cos(startAngle) * 325; bot.y = worldHeight / 2 + Math.sin(startAngle) * 325; }
            if (index === 17) { bot.x = worldWidth / 2 + 25; bot.y = worldHeight / 2 - 70; bot.angle = Math.PI / 2; }
            const initialLength = bot.bodyLimit; for (let segment = initialLength; segment >= 0; segment--) bot.body.push([bot.x - Math.cos(bot.angle) * segment * 4.5, bot.y - Math.sin(bot.angle) * segment * 4.5]);
            bot.initialized = true;
          }
          bot.angle += Math.sin(frame / (70 + index % 9) + index * .74) * bot.turn;
          if (frame > 600 && (index === 5 || index === 21) && player.body.length > 24 && !playerDead) { const targetSegment = player.body[Math.max(0, player.body.length - 24 - index % 11)]; const trailAngle = Math.atan2(targetSegment[1] - bot.y, targetSegment[0] - bot.x); const trailDiff = ((trailAngle - bot.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI; bot.angle += Math.max(-.01, Math.min(.01, trailDiff)); }
          const margin = 42; if (bot.x < margin || bot.x > worldWidth - margin) bot.angle = Math.PI - bot.angle; if (bot.y < margin || bot.y > worldHeight - margin) bot.angle = -bot.angle;
          bot.x = Math.max(margin, Math.min(worldWidth - margin, bot.x + Math.cos(bot.angle) * bot.speed)); bot.y = Math.max(margin, Math.min(worldHeight - margin, bot.y + Math.sin(bot.angle) * bot.speed));
          bot.body.push([bot.x, bot.y]); if (bot.body.length > bot.bodyLimit) bot.body.shift();
        });
        if (!player.initialized) { for (let segment = bodyLimit; segment >= 0; segment--) player.body.push([player.x - segment * 4.7, player.y]); player.initialized = true; reportStats(); }
        if (!camera.initialized) { camera.x = Math.max(0, player.x - viewW / 2); camera.y = Math.max(0, player.y - viewH / 2); camera.initialized = true; }
        if (!playerDead) { if (controller.current.steering && Math.hypot(controller.current.steerX, controller.current.steerY) > .12) { const wanted = Math.atan2(controller.current.steerY, controller.current.steerX); const diff = ((wanted - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI; player.angle += Math.max(-.055, Math.min(.055, diff)); } const playerSpeed = controller.current.speed ? 2.68 : 1.62; player.x += Math.cos(player.angle) * playerSpeed; player.y += Math.sin(player.angle) * playerSpeed; player.body.push([player.x, player.y]); if (player.body.length > bodyLimit) player.body.shift(); }

        if (frame > 45) bots.forEach((bot, index) => {
          if (!bot.alive || !bot.initialized) return;
          const playerWidth = 28 + Math.min(kills * 3, 14); const botWidth = 18 + index % 5; const playerTrail = player.body.slice(0, Math.max(0, player.body.length - 11));
          const hitPlayerBody = !playerDead && (index === 17 || frame > 600) && playerTrail.some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(bot.x - segment[0], bot.y - segment[1]) < (playerWidth + botWidth) * .48);
          if (hitPlayerBody) { dropBot(index); kills += 1; reportStats(); return; }
          const ownerIndex = frame > 1800 && index % 13 === 0 ? bots.findIndex((other, otherIndex) => otherIndex !== index && other.alive && other.body.slice(0, Math.max(0, other.body.length - 9)).some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(bot.x - segment[0], bot.y - segment[1]) < (botWidth + 18 + otherIndex % 5) * .46)) : -1;
          if (ownerIndex >= 0) { dropBot(index); bots[ownerIndex].bodyLimit = Math.min(70, bots[ownerIndex].bodyLimit + 5); reportStats(); }
        });
        if (!playerDead && frame > 1200) { const playerWidth = 28 + Math.min(collectedStars * .6, 14); const crashedIntoBot = bots.some((bot, index) => bot.alive && bot.body.slice(0, Math.max(0, bot.body.length - 9)).some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(player.x - segment[0], player.y - segment[1]) < (playerWidth + 18 + index % 5) * .46)); const hitWall = player.x < 34 || player.x > worldWidth - 34 || player.y < 34 || player.y > worldHeight - 34; if (crashedIntoBot || hitWall) { playerDead = true; roundScore = 0; reportStats(); } }
        if (!playerDead) {
          const magnetActive = controller.current.magnetUntil > Date.now();
          for (let pelletIndex = starPellets.length - 1; pelletIndex >= 0; pelletIndex--) { const pellet = starPellets[pelletIndex]; const distance = Math.hypot(player.x - pellet.x, player.y - pellet.y); if (magnetActive && distance < 260) { pellet.x += (player.x - pellet.x) * .055; pellet.y += (player.y - pellet.y) * .055; } if (distance >= (magnetActive ? 48 : 30)) continue; starPellets.splice(pelletIndex, 1); collectedMass += 1; collectedStars += 1; roundScore = Math.round((roundScore + pellet.value) * 1000) / 1000; bodyLimit = Math.min(180, bodyLimit + 2); reportStats(); }
          for (let coinIndex = goldCoins.length - 1; coinIndex >= 0; coinIndex--) { const coin = goldCoins[coinIndex]; if (frame >= coin.expiresAt) { goldCoins.splice(coinIndex, 1); reportStats(); continue; } if (Math.hypot(player.x - coin.x, player.y - coin.y) >= 34) continue; goldCoins.splice(coinIndex, 1); snkCoins += 1; reportStats(); }
          for (let pelletIndex = 0; pelletIndex < 210; pelletIndex++) { if (consumedFieldPellets.has(pelletIndex)) continue; const px = 80 + ((pelletIndex * 197 + 31) % (worldWidth - 160)); const py = 80 + ((pelletIndex * 139 + 53) % (worldHeight - 160)); if (Math.hypot(player.x - px, player.y - py) >= 20) continue; consumedFieldPellets.add(pelletIndex); roundScore = Math.round((roundScore + .001) * 1000) / 1000; bodyLimit = Math.min(180, bodyLimit + 1); reportStats(); }
        }
        if (!coinBatchSpawned && frame > 90) { coinBatchSpawned = true; for (let coinIndex = 0; coinIndex < 30; coinIndex++) { const angle = coinIndex * 2.399; const radius = 140 + (coinIndex % 6) * 70; goldCoins.push({ x: player.x + Math.cos(angle) * radius, y: player.y + Math.sin(angle) * radius, expiresAt: frame + 1800 }); } reportStats(); }

        const edgeX = Math.min(220, w * .3); const edgeY = Math.min(175, h * .28); const nextScreenX = player.x - camera.x; const nextScreenY = player.y - camera.y; let desiredX = camera.x; let desiredY = camera.y;
        if (nextScreenX * zoom < edgeX) desiredX = player.x - edgeX / zoom; else if (nextScreenX * zoom > w - edgeX) desiredX = player.x - (w - edgeX) / zoom;
        if (nextScreenY * zoom < edgeY) desiredY = player.y - edgeY / zoom; else if (nextScreenY * zoom > h - edgeY) desiredY = player.y - (h - edgeY) / zoom;
        desiredX = Math.max(0, Math.min(Math.max(0, worldWidth - viewW), desiredX)); desiredY = Math.max(0, Math.min(Math.max(0, worldHeight - viewH), desiredY)); camera.x += (desiredX - camera.x) * .09; camera.y += (desiredY - camera.y) * .09;

        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom);
        const grid = 64; ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 1;
        for (let x = Math.floor(camera.x / grid) * grid; x <= camera.x + viewW + grid; x += grid) { ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + viewH); ctx.stroke(); }
        for (let y = Math.floor(camera.y / grid) * grid; y <= camera.y + viewH + grid; y += grid) { ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + viewW, y); ctx.stroke(); }
        for (let i = 0; i < 210; i++) { if (consumedFieldPellets.has(i)) continue; const px = 80 + ((i * 197 + 31) % (worldWidth - 160)); const py = 80 + ((i * 139 + 53) % (worldHeight - 160)); if (px < camera.x - 10 || px > camera.x + viewW + 10 || py < camera.y - 10 || py > camera.y + viewH + 10) continue; ctx.shadowColor = i % 3 ? "#70dfb7" : "#ffd858"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.fillStyle = i % 3 ? "#70dfb7" : "#ffd858"; ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
        starPellets.forEach(pellet => { if (pellet.x < camera.x - 15 || pellet.x > camera.x + viewW + 15 || pellet.y < camera.y - 15 || pellet.y > camera.y + viewH + 15) return; ctx.save(); ctx.translate(pellet.x, pellet.y); ctx.rotate(frame / 28); ctx.shadowColor = "#ffe66f"; ctx.shadowBlur = 18; ctx.fillStyle = "#ffe66f"; ctx.beginPath(); for (let point = 0; point < 10; point++) { const radius = point % 2 ? pellet.size * .46 : pellet.size; const angle = -Math.PI / 2 + point * Math.PI / 5; const x = Math.cos(angle) * radius; const y = Math.sin(angle) * radius; if (point) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); ctx.restore(); });
        goldCoins.forEach(coin => { if (coin.x < camera.x - 60 || coin.x > camera.x + viewW + 60 || coin.y < camera.y - 60 || coin.y > camera.y + viewH + 60) return; ctx.shadowColor = "#ffd858"; ctx.shadowBlur = 18; ctx.fillStyle = "#f4b918"; ctx.strokeStyle = "#fff0a5"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(coin.x, coin.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = "#513500"; ctx.font = "900 8px Arial"; ctx.textAlign = "center"; ctx.fillText("SNK", coin.x, coin.y + 3); ctx.fillStyle = "#ffe176"; ctx.font = "900 10px Arial"; ctx.fillText("SNK 0.03", coin.x, coin.y - 23); });
        ctx.shadowColor = "rgba(239,79,79,.82)"; ctx.shadowBlur = 22; ctx.strokeStyle = "#ef5b58"; ctx.lineWidth = 18; ctx.strokeRect(12, 12, worldWidth - 24, worldHeight - 24); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.72)"; ctx.lineWidth = 2; ctx.setLineDash([12, 12]); ctx.strokeRect(25, 25, worldWidth - 50, worldHeight - 50); ctx.setLineDash([]);
        bots.forEach((bot, index) => { if (!bot.alive || bot.x < camera.x - 180 || bot.x > camera.x + viewW + 180 || bot.y < camera.y - 180 || bot.y > camera.y + viewH + 180) return; const colors = botPalette[index % botPalette.length]; const botWidth = 18 + index % 5; drawSnake(ctx, bot.body, colors[0], colors[1], index % 3 === 0 ? "bands" : "dots", botWidth); drawValueTag(ctx, bot.x, bot.y, bot.value + bot.roundScore, `BOT ${String(index + 1).padStart(2, "0")}`, botWidth); });
        if (challengeMode) { const rewardPoints: Array<[number, number]> = []; const rewardX = worldWidth / 2 + Math.cos(frame / 150) * 470; const rewardY = worldHeight / 2 + Math.sin(frame / 110) * 310; for (let i = 18; i >= 0; i--) rewardPoints.push([rewardX - i * 5, rewardY + Math.sin(frame / 24 - i * .45) * 22]); drawSnake(ctx, rewardPoints, "#ffd858", "#ffffff", "stars", 18); drawValueTag(ctx, rewardX, rewardY, 200, "جائزة VS+", 18); }
        const playerWidth = 28 + Math.min(collectedStars * .6, 14); if (controller.current.speed) { ctx.save(); ctx.globalAlpha = .24; ctx.shadowColor = "#ffe176"; ctx.shadowBlur = 24; ctx.strokeStyle = "#ffe176"; ctx.lineWidth = playerWidth + 15; ctx.beginPath(); player.body.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore(); } drawSnake(ctx, player.body, style?.primary ?? "#ef4f4f", style?.secondary ?? "#fff4d1", style?.pattern, playerWidth); drawValueTag(ctx, player.x, player.y, entryValue + roundScore, controller.current.speed ? "أنت • سرعة ×1.65" : "أنت", playerWidth);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        for (let i = 0; i < 34; i++) { const px = (i * 83 + 31) % Math.max(w, 1); const py = (i * 47 + 53) % Math.max(h, 1); ctx.beginPath(); ctx.fillStyle = i % 3 ? "#70dfb7" : "#ffd858"; ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2); ctx.fill(); }
        [{ c: "#ef4f4f", a: "#fff4d1", y: .35, p: 0 }, { c: "#4fc798", a: "#fff4d1", y: .62, p: 1.7 }, { c: "#ffd858", a: "#16385f", y: .82, p: 3.2 }].forEach((s, n) => { const pts: Array<[number, number]> = []; for (let i = 0; i < 14; i++) pts.push([w * (.12 + n * .25) + i * 8 + Math.sin(frame / 48 + s.p) * 18, h * s.y + Math.sin(i * .46 + frame / 24 + s.p) * 18]); drawSnake(ctx, pts, s.c, s.a); });
      }
      frame++; animation = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(animation);
  }, [challengeMode, controls, entryValue, interactive, onStats, style]);
  return <canvas ref={canvasRef} className="arena-canvas" aria-label={interactive ? "حلبة سنيكس كبيرة بعصا تحكم" : "معاينة حلبة سنيكس"} />;
}

function Header({ active, balance }: { active: View; balance: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <header className="topbar">
      <Link href="/wallet" className="balance-card"><span className="eyebrow">رصيدك التجريبي</span><strong><bdi>${(balance / 100).toFixed(2)}</bdi></strong><Coins /></Link>
      <Link href="/" className="brand"><span className="brand-mark">S</span><div><strong>SNAKES</strong><small>سنيكس</small></div></Link>
      <Button variant="outline" size="icon" className="menu-button" onClick={() => setOpen(!open)} aria-label="فتح القائمة"><Menu /></Button>
    </header>
    <div className="demo-banner">رصيد تجريبي — بلا قيمة نقدية</div>
    <nav className={`quick-nav ${open ? "expanded" : ""}`} aria-label="التنقل الرئيسي">
      {navItems.map(item => <Link key={item.view} href={item.href} className={active === item.view ? "active" : ""}><item.icon />{item.label}</Link>)}
    </nav>
  </>;
}

function Leaderboard() { return <aside className="leaderboard paper-card"><div className="section-heading"><span>أفضل الأرباح</span><Trophy /></div><ol>{leaders.map(([n, a], i) => <li key={n}><span className="rank">{i + 1}</span><b>{n}</b><bdi>{a}</bdi></li>)}</ol></aside>; }

function Lobby() {
  const [tier, setTier] = useState("$0.01");
  const router = useRouter();
  useEffect(() => { const doc = document as Document & { modelContext?: { registerTool: (tool: unknown, options?: unknown) => void } }; if (!doc.modelContext?.registerTool) return; const c = new AbortController(); void doc.modelContext.registerTool({ name: "start_demo_round", title: "ابدأ جولة تجريبية", description: "يفتح حلبة سنيكس التجريبية بالفئة المحددة.", inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["0.01", "0.10", "1.00"] } }, required: ["tier"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input: unknown) { const selected = (input as { tier: string }).tier; router.push(`/game?tier=${selected}`); return { status: "opening", tier: selected }; } }, { signal: c.signal }); return () => c.abort(); }, [router]);
  return <section className="game-layout"><Leaderboard /><section className="arena-card"><div className="arena-head"><div><span className="live-dot" /> الحلبة جاهزة</div><strong>05:00</strong><span>30 لاعباً</span></div><Arena /><div className="arena-overlay"><span>المستوى 2</span><h1>اختر جولتك وابدأ</h1><p>تفادى الأجسام واجمع النقاط واربح مع كل إقصاء</p></div></section><aside className="round-panel paper-card"><span className="eyebrow">رسوم الدخول</span><h2>جولات سريعة</h2><div className="tier-grid">{tiers.map(t => <button key={t.value} onClick={() => !t.locked && setTier(t.value)} className={`tier ${t.tone} ${tier === t.value ? "selected" : ""} ${t.locked ? "locked" : ""}`}><strong><bdi>{t.value}</bdi></strong><span>{t.locked ? "يتطلب إيداعاً" : t.label}</span></button>)}</div><div className="ticket-line"><span>تذاكر مجانية</span><strong>3 × <bdi>$0.01</bdi></strong></div><Button asChild className="play-button"><Link href={`/game?tier=${tier.slice(1)}`}>العب الآن بـ <bdi>{tier}</bdi></Link></Button><p className="microcopy">تكتمل الغرفة تلقائياً بلاعبين آليين معلّمين بوضوح.</p></aside></section>;
}

function GameView() {
  const searchParams = useSearchParams(); const selectedTier = Number(searchParams.get("tier") ?? ".10"); const tierValue = [.01, .1, 1].includes(selectedTier) ? selectedTier : .1; const challengeMode = searchParams.get("mode") === "vs";
  const [seconds, setSeconds] = useState(300); const [queued, setQueued] = useState(true); const [expanded, setExpanded] = useState(false); const [arenaStats, setArenaStats] = useState<ArenaStats>({ kills: 0, players: 30, mass: 54, value: tierValue, dead: false, roundScore: 0, stars: 0, snkCoins: 0, coinDropActive: false }); const arenaRef = useRef<HTMLDivElement>(null); const nativeFullscreen = useRef(false);
  const controlsRef = useRef<ArenaControls>({ magnetUntil: 0, speed: false, cameraWide: false, steering: false, steerX: 0, steerY: 0 });
  const [inventory, setInventory] = useState({ magnet: 2, speed: 3, camera: 1 });
  const [activePowers, setActivePowers] = useState({ magnet: false, speed: false, camera: false });
  const speedInventoryRef = useRef(inventory.speed); const playerDeadRef = useRef(arenaStats.dead);
  useEffect(() => { speedInventoryRef.current = inventory.speed; playerDeadRef.current = arenaStats.dead; }, [arenaStats.dead, inventory.speed]);
  useEffect(() => { const queue = window.setTimeout(() => setQueued(false), 1200); return () => clearTimeout(queue); }, []);
  useEffect(() => { if (queued) return; const timer = window.setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer); }, [queued]);
  useEffect(() => { const sync = () => { const active = document.fullscreenElement === arenaRef.current; if (active) { nativeFullscreen.current = true; setExpanded(true); } else if (nativeFullscreen.current) { nativeFullscreen.current = false; setExpanded(false); } }; document.addEventListener("fullscreenchange", sync); return () => document.removeEventListener("fullscreenchange", sync); }, []);
  const toggleFullscreen = async () => {
    if (expanded) { if (document.fullscreenElement === arenaRef.current) await document.exitFullscreen(); nativeFullscreen.current = false; setExpanded(false); return; }
    setExpanded(true);
    try { await arenaRef.current?.requestFullscreen(); nativeFullscreen.current = document.fullscreenElement === arenaRef.current; } catch { nativeFullscreen.current = false; }
  };
  const activateMagnet = () => { if (!inventory.magnet || activePowers.magnet || arenaStats.dead) return; const magnetUntil = Date.now() + 8000; controlsRef.current.magnetUntil = magnetUntil; setInventory(current => ({ ...current, magnet: current.magnet - 1 })); setActivePowers(current => ({ ...current, magnet: true })); window.setTimeout(() => { if (controlsRef.current.magnetUntil === magnetUntil) setActivePowers(current => ({ ...current, magnet: false })); }, 8000); };
  const engageSpeed = useCallback(() => { if (controlsRef.current.speed || !speedInventoryRef.current || playerDeadRef.current) return; controlsRef.current.speed = true; speedInventoryRef.current -= 1; setInventory(current => ({ ...current, speed: Math.max(0, current.speed - 1) })); setActivePowers(current => ({ ...current, speed: true })); }, []);
  const releaseSpeed = useCallback(() => { controlsRef.current.speed = false; setActivePowers(current => ({ ...current, speed: false })); }, []);
  const startSpeed = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); engageSpeed(); };
  const stopSpeed = (event: React.PointerEvent<HTMLButtonElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); releaseSpeed(); };
  const toggleCamera = () => { if (!activePowers.camera && !inventory.camera) return; if (!activePowers.camera) setInventory(current => ({ ...current, camera: current.camera - 1 })); const next = !activePowers.camera; controlsRef.current.cameraWide = next; setActivePowers(current => ({ ...current, camera: next })); };
  const steerSnake = useCallback((x: number, y: number, active: boolean) => { controlsRef.current.steerX = x; controlsRef.current.steerY = y; controlsRef.current.steering = active; }, []);
  useEffect(() => {
    const heldArrows = new Set<string>();
    const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const updateSteering = () => { let x = 0; let y = 0; heldArrows.forEach(key => { x += directions[key][0]; y += directions[key][1]; }); const length = Math.hypot(x, y); steerSnake(length ? x / length : 0, length ? y / length : 0, length > 0); };
    const keyDown = (event: KeyboardEvent) => { if (isTyping(event.target)) return; if (directions[event.key]) { event.preventDefault(); heldArrows.add(event.key); updateSteering(); } if (event.code === "Space") { event.preventDefault(); if (!event.repeat) engageSpeed(); } };
    const keyUp = (event: KeyboardEvent) => { if (directions[event.key]) { event.preventDefault(); heldArrows.delete(event.key); updateSteering(); } if (event.code === "Space") { event.preventDefault(); releaseSpeed(); } };
    const releaseControls = () => { heldArrows.clear(); steerSnake(0, 0, false); releaseSpeed(); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", releaseControls);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", releaseControls); };
  }, [engageSpeed, releaseSpeed, steerSnake]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const rank = Math.max(1, 6 - arenaStats.kills);
  return <section className="play-experience"><div className="game-stage">
    <div className="match-commandbar">
      <div className="match-brand"><span className="brand-mark">S</span><div><b>{challengeMode ? "VS+ CREATOR ARENA" : "SNAKES ARENA"}</b><small><span className="live-dot" /> {challengeMode ? "تحدٍ عالمي مباشر" : "مباراة مباشرة"}</small></div></div>
      <div className="command-metrics"><span><Users /> <bdi>{arenaStats.players} / 30</bdi><small>اللاعبون</small></span><span><Wifi /> <bdi>28 ms</bdi><small>الاتصال</small></span><span><Zap /> <bdi>${tierValue.toFixed(2)}</bdi><small>الجولة</small></span></div>
      <button className="fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={expanded ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>{expanded ? <Minimize2 /> : <Maximize2 />}<span>{expanded ? "تصغير" : "ملء الشاشة"}</span></button>
    </div>
    <div className="match-leaders" aria-label="أفضل خمسة لاعبين"><span className="leaders-title"><Trophy /> الصدارة</span>{leaders.map(([name, amount], index) => <div key={name} className={index === 0 ? "leader-first" : ""}><b>{index + 1}</b><span>{name}</span><bdi>{amount}</bdi></div>)}</div>
    <div className={`arena-card live-game ${expanded ? "is-expanded" : ""}`} ref={arenaRef}><div className="arena-head"><div><span className="live-dot" /> {queued ? "تجهيز الغرفة" : arenaStats.dead ? "تم إقصاؤك" : "الجولة جارية"}</div><strong>{time}</strong><span><Bot /> {queued ? "إضافة اللاعبين الآليين…" : `${Math.max(0, arenaStats.players - (arenaStats.dead ? 0 : 1))} BOT + ${arenaStats.dead ? "مشاهدة" : "أنت"}`}</span></div><Arena interactive entryValue={tierValue} onStats={setArenaStats} controls={controlsRef} challengeMode={challengeMode} />
      {expanded && <button className="arena-exit-fullscreen" onClick={() => void toggleFullscreen()} aria-label="الخروج من ملء الشاشة"><Minimize2 /><span>تصغير</span></button>}
      <div className="combat-hud"><div><Crosshair /><span>الإقصاءات</span><b>{arenaStats.kills}</b></div><div className="risk-score"><Sparkles /><span>نقاط الجولة</span><bdi>SNK {arenaStats.roundScore.toFixed(3)}</bdi></div><div><Crown /><span>الترتيب</span><b>#{rank}</b></div><div><Activity /><span>القيمة</span><bdi>${arenaStats.value.toFixed(3)}</bdi></div></div>
      <div className="inventory-hud"><span><Star /> {arenaStats.stars}<small>نجمة</small></span><span className="coin-slot"><Coins /> {arenaStats.snkCoins}<small>SNK 0.03</small></span></div>
      {arenaStats.coinDropActive && <div className="coin-alert"><Coins /><div><b>هطول عملات SNK</b><span>30 عملة • تختفي خلال 30 ثانية</span></div></div>}
      <VirtualJoystick onSteer={steerSnake} disabled={queued || arenaStats.dead} />
      <div className="power-dock" aria-label="مزايا الجولة"><button className={activePowers.magnet ? "active" : ""} disabled={!inventory.magnet || arenaStats.dead} onClick={activateMagnet}><Magnet /><span>المغناطيس</span><b>{activePowers.magnet ? "8ث" : inventory.magnet}</b></button><button className={activePowers.speed ? "active speed-active" : ""} disabled={!inventory.speed || arenaStats.dead} onPointerDown={startSpeed} onPointerUp={stopSpeed} onPointerCancel={stopSpeed} onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); engageSpeed(); } }} onKeyUp={event => { if (event.key === " " || event.key === "Enter") releaseSpeed(); }} onBlur={releaseSpeed}><Gauge /><span>{activePowers.speed ? "تسارع نشط" : "اضغط مطولاً"}</span><b>{activePowers.speed ? "×1.65" : inventory.speed}</b></button><button className={activePowers.camera ? "active" : ""} disabled={!activePowers.camera && !inventory.camera} onClick={toggleCamera}><Camera /><span>كاميرا واسعة</span><b>{activePowers.camera ? "ON" : inventory.camera}</b></button></div>
      <div className="control-tip"><span className="control-orbit"><Crosshair /></span><span><b>الكمبيوتر</b> الأسهم للتوجيه • اضغط مطولاً على Space للتسارع</span></div>
      <div className="kill-feed"><span><b>الإقصاء</b> يحوّل قيمة الثعبان إلى 8 نجوم</span><span><b>البقاء للنهاية</b> يحفظ نقاط الجولة في إجمالك</span></div>
      {queued && <div className="queue-cover"><div className="spinner-ring" /><h1>اكتملت الغرفة</h1><p>أنت و29 لاعباً آلياً — تبدأ الجولة الآن</p></div>}
      {!queued && arenaStats.dead && <div className="queue-cover death-cover"><Crosshair /><h1>تم إقصاؤك</h1><p>فقدت نقاط الجولة المؤقتة، بينما بقيت عملات SNK التي جمعتها في خانة المخزون.</p><button onClick={() => window.location.reload()}>العب من جديد</button></div>}
    </div>
    <div className="match-footer"><span><ShieldCheck /> الخادم هو المصدر المعتمد للنتائج • عالم 4200 × 2800</span><span className="demo-pill">رصيد تجريبي — بلا قيمة نقدية</span><Link href="/">مغادرة الجولة</Link></div>
  </div></section>;
}

function WalletView({ balance, setBalance }: { balance: number; setBalance: React.Dispatch<React.SetStateAction<number>> }) {
  const [notice, setNotice] = useState(""); const deposit = async (method: string) => { setNotice("جارٍ تسجيل الإيداع التجريبي…"); try { await apiRequest("/api/deposits/demo", { method: "POST", body: JSON.stringify({ amount_cents: 1000, method }) }); } catch {} setBalance(current => current + 1000); setNotice("تمت إضافة $10.00 وفتح جميع الفئات."); };
  return <Page title="المحفظة" subtitle="إدارة الرصيد التجريبي وطلبات السحب"><div className="wallet-hero"><div><span>الرصيد المتاح</span><strong><bdi>${(balance / 100).toFixed(2)}</bdi></strong><small>بلا قيمة نقدية</small></div><CircleDollarSign /></div><div className="stats-grid wallet-inventory"><Stat icon={Sparkles} value="SNK 1.275" label="إجمالي النقاط المحفوظة" /><Stat icon={Coins} value="SNK 0.09" label="خانة العملات الذهبية" /><Stat icon={PackageOpen} value="6" label="مزايا في المخزون" /></div>{notice && <div className="success-note">{notice}</div>}<div className="two-columns"><section className="paper-card content-card"><div className="section-heading"><span>إيداع تجريبي</span><ArrowDownToLine /></div><p>الحد الأدنى <bdi>$10.00</bdi>. اختر وسيلة لمحاكاة عملية ناجحة.</p><div className="payment-grid"><button onClick={() => deposit("shamcash")}><b>ShamCash</b><span>فوري — تجريبي</span></button><button onClick={() => deposit("coinpayments")}><b>CoinPayments</b><span>عملات رقمية — تجريبي</span></button><button onClick={() => deposit("agent")}><b>تحويل عبر وكيل</b><span>مراجعة الإدارة</span></button></div></section><section className="paper-card content-card"><div className="section-heading"><span>طلب سحب</span><ArrowUpFromLine /></div><Label htmlFor="withdraw">المبلغ بالدولار</Label><Input id="withdraw" type="number" min="5" placeholder="5.00" className="ltr-input" /><Button className="wide-button" onClick={() => setNotice("تم إرسال طلب السحب التجريبي للمراجعة.")}>إرسال الطلب</Button><p className="microcopy">الحد الأدنى $5.00 — لا يتم إرسال أموال حقيقية.</p></section></div><Ledger /></Page>;
}
function Ledger() { return <section className="paper-card content-card ledger"><div className="section-heading"><span>آخر الحركات</span><Activity /></div>{[["مكافأة تسجيل", "+ 3 تذاكر", "اليوم"], ["ربح إقصاء", "+ $0.01", "قبل 12 دقيقة"], ["دخول جولة", "− تذكرة", "قبل 14 دقيقة"]].map(row => <div className="ledger-row" key={row[0]}><div><b>{row[0]}</b><span>{row[2]}</span></div><strong>{row[1]}</strong></div>)}</section>; }

function RouletteView() {
  const [spins, setSpins] = useState(3); const [angle, setAngle] = useState(0); const [result, setResult] = useState(""); const [busy, setBusy] = useState(false);
  const spin = async () => { if (!spins || busy) return; setBusy(true); setResult(""); const rewards = ["$0.01 رصيد", "تذكرة $0.01", "$0.05 رصيد", "تذكرة $0.10", "قسيمة متجر", "تذكرة $1.00"]; const index = Math.floor(Math.random() * 3); try { await apiRequest("/api/roulette/spin", { method: "POST" }); } catch {} setAngle(a => a + 1440 + index * 60 + 18); setSpins(s => s - 1); window.setTimeout(() => { setResult(`ربحت ${rewards[index]}`); setBusy(false); }, 1650); };
  return <Page title="روليت المكافآت" subtitle="الجوائز الأقل تكلفة أكثر احتمالاً"><section className="roulette-layout"><div className="wheel-wrap"><div className="wheel-pointer" /><div className="reward-wheel" style={{ transform: `rotate(${angle}deg)` }}><span>1¢</span><span>جولة</span><span>5¢</span><span>10¢</span><span>قسيمة</span><span>$1</span></div><div className="wheel-center">S</div></div><div className="paper-card spin-panel"><Sparkles /><span className="eyebrow">لفاتك المتاحة</span><strong className="spin-count">{spins}</strong><Button onClick={spin} disabled={!spins || busy} className="play-button">{busy ? "تدور الآن…" : "لفّ الروليت"}</Button>{result && <div className="prize-result">{result}</div>}<p className="microcopy">يُحسم الناتج على الخادم قبل بدء الحركة. كل الجوائز تجريبية.</p></div></section></Page>;
}

function SnakeDesigner({ style, setStyle }: { style: SnakeStyle; setStyle: (s: SnakeStyle) => void }) {
  const colors = ["#ef4f4f", "#4fc798", "#ffd858", "#4d7bea", "#923cba", "#f58b41"];
  return <Page title="تصميم ثعبانك" subtitle="اختر ألوانك ونمطك قبل دخول الحلبة"><div className="designer-layout"><section className="arena-card designer-preview"><Arena style={style} /><div className="designer-name">SNAKES • HUMAM</div></section><section className="paper-card content-card"><Label>اللون الأساسي</Label><div className="color-row">{colors.map(c => <button key={c} aria-label={`اختيار اللون ${c}`} className={style.primary === c ? "selected" : ""} style={{ background: c }} onClick={() => setStyle({ ...style, primary: c })} />)}</div><Label>لون الزخرفة</Label><div className="color-row">{colors.map(c => <button key={c} aria-label={`اختيار اللون ${c}`} className={style.secondary === c ? "selected" : ""} style={{ background: c }} onClick={() => setStyle({ ...style, secondary: c })} />)}</div><Label>النمط</Label><div className="pattern-row">{(["dots", "bands", "stars"] as const).map(p => <button key={p} className={style.pattern === p ? "active" : ""} onClick={() => setStyle({ ...style, pattern: p })}>{p === "dots" ? "نقاط" : p === "bands" ? "شرائط" : "نجوم"}</button>)}</div><Button className="wide-button" onClick={() => void apiRequest("/api/profile/snake", { method: "PATCH", body: JSON.stringify(style) })}>حفظ التصميم</Button></section></div></Page>;
}

function ReferralsView() {
  const [copied, setCopied] = useState(false); const code = "SNAKES-HM25";
  return <Page title="الإحالات" subtitle="شارك سنيكس واكسب جولات ولفات"><div className="stats-grid"><Stat icon={Users} value="25" label="إجمالي الإحالات" /><Stat icon={ShieldCheck} value="10" label="إحالات نشطة" /><Stat icon={CircleDollarSign} value="$1.72" label="عمولات تجريبية" /></div><section className="paper-card referral-card"><UserRoundPlus /><div><span className="eyebrow">رابط دعوتك</span><h2>ادعُ صديقاً إلى الحلبة</h2><p>تحصل عند التسجيل على 3 جولات $0.01 و3 لفات. وبعد أول إيداع مؤهل تحصل على 5 جولات $0.10 و5 لفات.</p></div><div className="referral-code"><bdi>snakes.game/r/{code}</bdi><Button onClick={() => { void navigator.clipboard?.writeText(`https://snakes.game/r/${code}`); setCopied(true); }}><Clipboard />{copied ? "تم النسخ" : "نسخ"}</Button></div></section><section className="paper-card content-card"><div className="section-heading"><span>كيف تعمل العمولة؟</span><Share2 /></div><p>عندما يربح صديق نشط من إقصاء لاعب، تحصل أنت على 20% من حصة سنيكس. لا يُخصم شيء من ربح صديقك.</p></section></Page>;
}

function SettingsView() {
  const [sound, setSound] = useState(true); const [music, setMusic] = useState(false); const [vibration, setVibration] = useState(true);
  return <Page title="الإعدادات" subtitle="اضبط التحكم والصوت بما يناسب لعبك"><div className="settings-grid"><section className="paper-card content-card"><Setting icon={Volume2} label="المؤثرات الصوتية"><Switch checked={sound} onCheckedChange={setSound} /></Setting><Setting icon={Sparkles} label="الموسيقى"><Switch checked={music} onCheckedChange={setMusic} /></Setting><Setting icon={Activity} label="الاهتزاز"><Switch checked={vibration} onCheckedChange={setVibration} /></Setting></section><section className="paper-card content-card"><Setting icon={SlidersHorizontal} label="حساسية التوجيه"><Slider defaultValue={[62]} max={100} step={1} /></Setting><Setting icon={Gamepad2} label="جودة الرسوم"><div className="quality-pills"><button>منخفضة</button><button className="active">متوسطة</button><button>عالية</button></div></Setting></section></div></Page>;
}
function Setting({ icon: Icon, label, children }: { icon: typeof Home; label: string; children: React.ReactNode }) { return <div className="setting-row"><span><Icon />{label}</span>{children}</div>; }

function StoreView() {
  const [inventory, setInventory] = useState({ magnet: 0, speed: 0, camera: 0, premiumSpin: 0 }); const [notice, setNotice] = useState("");
  const products = [
    { code: "magnet", title: "المغناطيس", description: "اجذب نجوم الإقصاء البعيدة لمدة 8 ثوانٍ.", price: "$0.25", units: "استخدام واحد", icon: Magnet, tone: "mint" },
    { code: "speed", title: "دفعة السرعة", description: "اضغط مطولاً للتسارع واترك الزر للعودة للسرعة الطبيعية.", price: "$0.15", units: "3 دفعات", icon: Gauge, tone: "coral" },
    { code: "camera", title: "كاميرا الجمهور", description: "رؤية افتراضية واسعة لتتبّع توزيع العملات والنجوم.", price: "$0.50", units: "جولة واحدة", icon: Camera, tone: "blue" },
    { code: "premiumSpin", apiCode: "premium_spin", title: "لفة روليت خاصة", description: "لفة بسعر خاص ضمن عجلة الجوائز المميزة.", price: "$0.10", units: "لفة واحدة", icon: Ticket, tone: "yellow" },
  ] as const;
  const purchase = async (product: typeof products[number]) => { setNotice("جارٍ تجهيز الميزة…"); try { await apiRequest("/api/store/purchase", { method: "POST", body: JSON.stringify({ item_code: "apiCode" in product ? product.apiCode : product.code, quantity: 1 }) }); } catch {} setInventory(current => ({ ...current, [product.code]: current[product.code] + (product.code === "speed" ? 3 : 1) })); setNotice(`تمت إضافة ${product.title} إلى مخزونك التجريبي.`); };
  return <Page title="متجر المزايا" subtitle="جهّز جولتك بالمغناطيس والسرعة والكاميرا واللفات الخاصة"><section className="store-hero"><div><span className="eyebrow">SNK LOADOUT</span><h2>اختر ميزتك قبل دخول الحلبة</h2><p>تظهر أزرار المزايا المشتراة أسفل شاشة اللعب، ويظل تفعيلها بيد اللاعب.</p></div><div className="store-balance"><PackageOpen /><span>مخزونك</span><strong>{Object.values(inventory).reduce((sum, count) => sum + count, 0)}</strong></div></section>{notice && <div className="success-note">{notice}</div>}<div className="product-grid">{products.map(product => <article className={`paper-card product-card ${product.tone}`} key={product.code}><span className="product-icon"><product.icon /></span><div><span className="eyebrow">{product.units}</span><h3>{product.title}</h3><p>{product.description}</p></div><div className="product-buy"><strong><bdi>{product.price}</bdi></strong><Button onClick={() => void purchase(product)}>شراء تجريبي</Button></div><span className="owned-badge">المخزون: {inventory[product.code]}</span></article>)}</div><section className="paper-card store-note"><ShieldCheck /><div><b>مزايا عادلة وخاضعة للخادم</b><span>لا تغيّر أي ميزة قواعد الاصطدام أو نتيجة الإقصاء. جميع المشتريات تجريبية.</span></div></section></Page>;
}

function VsPlusView() {
  const [created, setCreated] = useState(false); const [accepted, setAccepted] = useState(false); const [notice, setNotice] = useState("");
  const createChallenge = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setNotice("جارٍ نشر التحدي على صفحة VS+…"); try { await apiRequest("/api/vs/challenges", { method: "POST", body: JSON.stringify({ title: data.get("title"), creator_platform_id: data.get("platform_id"), reward_cents: Math.round(Number(data.get("reward")) * 100), invite_enabled: data.get("invite") === "on" }) }); } catch {} setCreated(true); setNotice("تم إنشاء التحدي التجريبي وإتاحته عالمياً لـ30 لاعباً."); };
  return <Page title="تحديات VS+" subtitle="مساحة صُنّاع المحتوى لإطلاق منافسات عالمية لمتابعيهم"><section className="vs-hero"><div className="vs-logo"><span>S</span><strong>VS+</strong></div><div><span className="eyebrow">GLOBAL CREATOR CHALLENGES</span><h2>تحدٍ واحد، 30 هوية، وجائزة تتحرك داخل الحلبة</h2><p>يُنشئ صانع المحتوى التحدي، يدخل اللاعبون بهويات منصتهم، ثم تتحول الجائزة الخاصة إلى قيمة عائمة تتنافس عليها الثعابين وفق القواعد المعتادة.</p></div><Link href="/game?tier=0.10&mode=vs" className="vs-live-link"><Play /> مشاهدة الحلبة الخاصة</Link></section><div className="vs-grid"><form className="paper-card content-card vs-form" onSubmit={createChallenge}><div className="section-heading"><span>إنشاء تحدٍ جديد</span><Video /></div><Label htmlFor="challenge-title">اسم التحدي</Label><Input id="challenge-title" name="title" required defaultValue="تحدي المتابعين الكبير" /><Label htmlFor="platform-id">هوية صانع المحتوى</Label><Input id="platform-id" name="platform_id" required placeholder="@creator_id" className="ltr-input" /><Label htmlFor="challenge-reward">قيمة الجائزة التجريبية بالدولار</Label><Input id="challenge-reward" name="reward" type="number" min="1" required defaultValue="200" className="ltr-input" /><label className="invite-check"><input type="checkbox" name="invite" defaultChecked /><span><Check /> نشر دعوة عامة على صفحة VS+</span></label><Button type="submit" className="wide-button"><Swords /> إنشاء التحدي</Button>{notice && <div className="success-note">{notice}</div>}</form><section className="paper-card content-card featured-challenge"><span className="challenge-live"><span className="live-dot" /> دعوة عالمية</span><div className="creator-line"><span className="creator-avatar">YT</span><div><b>@SNAKES_CREATOR</b><span>تحدي الجمهور الأسبوعي</span></div></div><strong className="challenge-prize"><bdi>$200</bdi></strong><p>ستتحرك قيمة الجائزة داخل الجولة كجسم ذهبي، ويمكن لجميع اللاعبين الثلاثين مطاردتها.</p><div className="challenge-capacity"><span><Users /> {accepted ? "30 / 30" : "29 / 30"}</span><span><Clock3 /> يبدأ خلال 12:51</span></div><div className="challenge-actions">{accepted ? <span className="accepted"><Check /> تم قبول الدعوة</span> : <><Button onClick={() => setAccepted(true)}><Check /> قبول</Button><Button variant="outline"><X /> رفض</Button></>}</div></section></div>{created && <section className="paper-card created-strip"><Sparkles /><div><b>تحديك ظاهر الآن</b><span>تم حجز صفحة عامة وجدول لـ30 هوية مشاركة.</span></div><Link href="/game?tier=0.10&mode=vs">فتح الجولة <ChevronLeft /></Link></section>}<section className="paper-card content-card admin-table vs-records"><div className="section-heading"><span>سجل التحديات</span><Trophy /></div><Table><TableHeader><TableRow><TableHead>التحدي</TableHead><TableHead>الهوية</TableHead><TableHead>الجائزة</TableHead><TableHead>المدة</TableHead><TableHead>النتيجة</TableHead></TableRow></TableHeader><TableBody>{[["تحدي سبتمبر", "@falcon", "$17", "12:51", "فوز"], ["سباق النجوم", "@noor", "$52", "09:15", "فوز"], ["ليلة VS+", "@arena", "$0", "07:42", "خسارة"], ["تحدي الجمهور", "@snk", "$31", "03:11", "فوز"]].map(row => <TableRow key={row[0]}>{row.map((cell, index) => <TableCell key={cell}><bdi className={index === 4 ? (cell === "فوز" ? "result-win" : "result-loss") : ""}>{cell}</bdi></TableCell>)}</TableRow>)}</TableBody></Table></section></Page>;
}

function AdminView() {
  const [sham, setSham] = useState(true); const [coin, setCoin] = useState(true); const [agent, setAgent] = useState(false);
  return <Page title="لوحة الإدارة" subtitle="مراقبة الحلبات والاقتصاد التجريبي"><div className="stats-grid admin-stats"><Stat icon={Gamepad2} value="1,284" label="الجولات اليوم" /><Stat icon={CircleDollarSign} value="$482.17" label="حصة سنيكس" /><Stat icon={Trophy} value="$391.26" label="أرباح اللاعبين" /><Stat icon={Activity} value="18" label="جولات نشطة" /></div><div className="admin-grid"><section className="paper-card content-card"><div className="section-heading"><span>إعدادات أساسية</span><Settings2 /></div><Setting icon={Gamepad2} label="مدة الجولة"><bdi>05:00</bdi></Setting><Setting icon={ArrowDownToLine} label="الحد الأدنى للإيداع"><bdi>$10.00</bdi></Setting><Setting icon={ArrowUpFromLine} label="الحد الأدنى للسحب"><bdi>$5.00</bdi></Setting><Setting icon={CircleDollarSign} label="رسوم السحب"><bdi>0%</bdi></Setting></section><section className="paper-card content-card"><div className="section-heading"><span>وسائل الدفع</span><WalletCards /></div><Setting icon={Coins} label="ShamCash"><Switch checked={sham} onCheckedChange={setSham} /></Setting><Setting icon={Coins} label="CoinPayments"><Switch checked={coin} onCheckedChange={setCoin} /></Setting><Setting icon={Users} label="التحويل عبر وكيل"><Switch checked={agent} onCheckedChange={setAgent} /></Setting></section></div><section className="paper-card content-card admin-table"><div className="section-heading"><span>أداء الفئات</span><Activity /></div><Table><TableHeader><TableRow><TableHead>الفئة</TableHead><TableHead>الجولات</TableHead><TableHead>الإيراد</TableHead><TableHead>أرباح اللاعبين</TableHead></TableRow></TableHeader><TableBody>{[["$0.01", "826", "$41.30", "$32.42"], ["$0.10", "391", "$195.50", "$157.60"], ["$1.00", "67", "$245.37", "$201.24"]].map(r => <TableRow key={r[0]}>{r.map(c => <TableCell key={c}><bdi>{c}</bdi></TableCell>)}</TableRow>)}</TableBody></Table></section></Page>;
}

function AuthView({ register = false }: { register?: boolean }) {
  const [message, setMessage] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const body = { email: fd.get("email"), password: fd.get("password"), referral_code: fd.get("referral") || undefined }; try { const result = await apiRequest(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify(body) }); setMessage(result ? "تم بنجاح. جارٍ فتح اللوبي…" : "وضع العرض: تم التحقق من النموذج."); } catch { setMessage("تعذر الاتصال بالخادم. يمكنك متابعة العرض التجريبي."); } };
  return <div className="auth-shell"><Link href="/" className="brand"><span className="brand-mark">S</span><div><strong>SNAKES</strong><small>سنيكس</small></div></Link><form className="paper-card auth-card" onSubmit={submit}><span className="eyebrow">رصيد تجريبي — بلا قيمة نقدية</span><h1>{register ? "أنشئ حسابك" : "أهلاً بعودتك"}</h1><p>{register ? "ستحصل على 3 جولات $0.01 و3 لفات روليت." : "ادخل إلى رصيدك وجولاتك المحفوظة."}</p><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" name="email" type="email" required placeholder="name@example.com" className="ltr-input" /><Label htmlFor="password">كلمة المرور</Label><Input id="password" name="password" type="password" required minLength={8} className="ltr-input" />{register && <><Label htmlFor="referral">رمز الإحالة — اختياري</Label><Input id="referral" name="referral" className="ltr-input" placeholder="SNAKES-HM25" /></>}<Button className="play-button" type="submit">{register ? "إنشاء الحساب" : "تسجيل الدخول"}</Button>{message && <div className="success-note">{message}</div>}<Link className="auth-switch" href={register ? "/login" : "/register"}>{register ? "لديك حساب؟ سجّل الدخول" : "لا تملك حساباً؟ أنشئ واحداً"}</Link></form></div>;
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="page-content"><div className="page-title"><div><span className="eyebrow">SNAKES</span><h1>{title}</h1><p>{subtitle}</p></div><Link href="/" className="back-link">العودة للحلبة <ChevronLeft /></Link></div>{children}</section>; }
function Stat({ icon: Icon, value, label }: { icon: typeof Home; value: string; label: string }) { return <div className="paper-card stat-card"><Icon /><div><strong><bdi>{value}</bdi></strong><span>{label}</span></div></div>; }

export function SnakesApp({ initialView }: { initialView: View }) {
  const [balance, setBalance] = useState(12); const [snakeStyle, setSnakeStyle] = useState<SnakeStyle>({ primary: "#ef4f4f", secondary: "#fff4d1", pattern: "dots" });
  let content: React.ReactNode;
  switch (initialView) {
    case "game": content = <GameView />; break;
    case "wallet": content = <WalletView balance={balance} setBalance={setBalance} />; break;
    case "roulette": content = <RouletteView />; break;
    case "snake": content = <SnakeDesigner style={snakeStyle} setStyle={setSnakeStyle} />; break;
    case "referrals": content = <ReferralsView />; break;
    case "settings": content = <SettingsView />; break;
    case "store": content = <StoreView />; break;
    case "vs-plus": content = <VsPlusView />; break;
    case "admin": content = <AdminView />; break;
    case "login": content = <AuthView />; break;
    case "register": content = <AuthView register />; break;
    default: content = <Lobby />;
  }
  if (initialView === "login" || initialView === "register") return content;
  return <main className={`app-shell ${initialView === "game" ? "game-app-shell" : ""}`} dir="rtl"><Header active={initialView} balance={balance} />{content}<footer className="app-footer"><span>Snakes Prototype</span><span>جميع الأرصدة والعمليات تجريبية</span><Link href="/admin">دخول الإدارة</Link></footer></main>;
}
