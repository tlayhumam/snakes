"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, ChevronLeft, CircleDollarSign,
  Bot, Clipboard, Coins, Crown, Crosshair, Gamepad2, Gift, Home, LockKeyhole,
  Maximize2, Menu, Minimize2, Palette,
  Play, Settings2, Share2, ShieldCheck, ShoppingBag, SlidersHorizontal,
  Sparkles, Trophy, UserRoundPlus, Users, Volume2, WalletCards, Wifi, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/api";

type View = "lobby" | "game" | "wallet" | "roulette" | "snake" | "referrals" | "settings" | "store" | "admin" | "login" | "register";
type SnakeStyle = { primary: string; secondary: string; pattern: "dots" | "bands" | "stars" };
type ArenaStats = { kills: number; players: number; mass: number; value: number; dead: boolean };

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

function Arena({ interactive = false, style, entryValue = .1, onStats }: { interactive?: boolean; style?: SnakeStyle; entryValue?: number; onStats?: React.Dispatch<React.SetStateAction<ArenaStats>> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: 1000, y: 260, active: false });
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const worldWidth = 4200; const worldHeight = 2800;
    const zoom = 1.34;
    let frame = 0; let animation = 0; let kills = 0; let collectedMass = 0; let bodyLimit = 54; let playerValue = entryValue; let playerDead = false; let lastReport = "";
    const player = { x: worldWidth / 2, y: worldHeight / 2, angle: 0, body: [] as Array<[number, number]>, initialized: false };
    const camera = { x: 0, y: 0, initialized: false };
    const massPellets: Array<{ x: number; y: number; color: string; size: number }> = [];
    const bots = botNames.map((name, index) => ({
      name, x: 0, y: 0, angle: (index * 1.87) % (Math.PI * 2), speed: .72 + (index % 5) * .08,
      turn: .0034 + (index % 4) * .0012, body: [] as Array<[number, number]>, initialized: false, alive: true,
      bodyLimit: 28 + index % 16, value: .05 + (index % 5) * .05,
    }));
    const reportStats = () => { const players = bots.filter(bot => bot.alive).length + (playerDead ? 0 : 1); const key = `${kills}:${collectedMass}:${bodyLimit}:${playerValue}:${playerDead}:${players}`; if (key === lastReport) return; lastReport = key; onStats?.({ kills, players, mass: bodyLimit, value: playerValue, dead: playerDead }); };
    const dropBot = (botIndex: number) => { const bot = bots[botIndex]; if (!bot.alive) return; bot.alive = false; const colors = botPalette[botIndex % botPalette.length]; bot.body.forEach((segment, segmentIndex) => { if (segmentIndex % 2 !== 0) return; massPellets.push({ x: segment[0] + ((segmentIndex * 7) % 9 - 4), y: segment[1] + ((segmentIndex * 11) % 9 - 4), color: colors[0], size: 5 + segmentIndex % 4 }); }); };
    const draw = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = rect.width; const h = rect.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) { canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); }
      if (!target.current.active) target.current = { x: w * 1.3, y: h * .5, active: false };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#173e68"); g.addColorStop(1, "#071d34"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (interactive) {
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
        if (!playerDead) { const screenX = (player.x - camera.x) * zoom; const screenY = (player.y - camera.y) * zoom; const wanted = Math.atan2(target.current.y - screenY, target.current.x - screenX); const diff = ((wanted - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI; player.angle += Math.max(-.045, Math.min(.045, diff)); player.x += Math.cos(player.angle) * 1.78; player.y += Math.sin(player.angle) * 1.78; player.body.push([player.x, player.y]); if (player.body.length > bodyLimit) player.body.shift(); }

        if (frame > 45) bots.forEach((bot, index) => {
          if (!bot.alive || !bot.initialized) return;
          const playerWidth = 28 + Math.min(kills * 3, 14); const botWidth = 18 + index % 5; const playerTrail = player.body.slice(0, Math.max(0, player.body.length - 11));
          const hitPlayerBody = !playerDead && (index === 17 || frame > 600) && playerTrail.some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(bot.x - segment[0], bot.y - segment[1]) < (playerWidth + botWidth) * .48);
          if (hitPlayerBody) { dropBot(index); kills += 1; playerValue = Math.round((playerValue + .05) * 100) / 100; bodyLimit = Math.min(180, bodyLimit + 12); reportStats(); return; }
          const ownerIndex = frame > 1800 && index % 13 === 0 ? bots.findIndex((other, otherIndex) => otherIndex !== index && other.alive && other.body.slice(0, Math.max(0, other.body.length - 9)).some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(bot.x - segment[0], bot.y - segment[1]) < (botWidth + 18 + otherIndex % 5) * .46)) : -1;
          if (ownerIndex >= 0) { dropBot(index); bots[ownerIndex].value = Math.round((bots[ownerIndex].value + .05) * 100) / 100; bots[ownerIndex].bodyLimit = Math.min(70, bots[ownerIndex].bodyLimit + 5); reportStats(); }
        });
        if (!playerDead && frame > 1200) { const playerWidth = 28 + Math.min(kills * 3, 14); const crashedIntoBot = bots.some((bot, index) => bot.alive && bot.body.slice(0, Math.max(0, bot.body.length - 9)).some((segment, segmentIndex) => segmentIndex % 2 === 0 && Math.hypot(player.x - segment[0], player.y - segment[1]) < (playerWidth + 18 + index % 5) * .46)); const hitWall = player.x < 34 || player.x > worldWidth - 34 || player.y < 34 || player.y > worldHeight - 34; if (crashedIntoBot || hitWall) { playerDead = true; reportStats(); } }
        if (!playerDead) for (let pelletIndex = massPellets.length - 1; pelletIndex >= 0; pelletIndex--) { const pellet = massPellets[pelletIndex]; if (Math.hypot(player.x - pellet.x, player.y - pellet.y) >= 30) continue; massPellets.splice(pelletIndex, 1); collectedMass += 1; bodyLimit = Math.min(180, bodyLimit + 1); reportStats(); }

        const edgeX = Math.min(220, w * .3); const edgeY = Math.min(175, h * .28); const nextScreenX = player.x - camera.x; const nextScreenY = player.y - camera.y; let desiredX = camera.x; let desiredY = camera.y;
        if (nextScreenX * zoom < edgeX) desiredX = player.x - edgeX / zoom; else if (nextScreenX * zoom > w - edgeX) desiredX = player.x - (w - edgeX) / zoom;
        if (nextScreenY * zoom < edgeY) desiredY = player.y - edgeY / zoom; else if (nextScreenY * zoom > h - edgeY) desiredY = player.y - (h - edgeY) / zoom;
        desiredX = Math.max(0, Math.min(Math.max(0, worldWidth - viewW), desiredX)); desiredY = Math.max(0, Math.min(Math.max(0, worldHeight - viewH), desiredY)); camera.x += (desiredX - camera.x) * .09; camera.y += (desiredY - camera.y) * .09;

        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom);
        const grid = 64; ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 1;
        for (let x = Math.floor(camera.x / grid) * grid; x <= camera.x + viewW + grid; x += grid) { ctx.beginPath(); ctx.moveTo(x, camera.y); ctx.lineTo(x, camera.y + viewH); ctx.stroke(); }
        for (let y = Math.floor(camera.y / grid) * grid; y <= camera.y + viewH + grid; y += grid) { ctx.beginPath(); ctx.moveTo(camera.x, y); ctx.lineTo(camera.x + viewW, y); ctx.stroke(); }
        for (let i = 0; i < 210; i++) { const px = 80 + ((i * 197 + 31) % (worldWidth - 160)); const py = 80 + ((i * 139 + 53) % (worldHeight - 160)); if (px < camera.x - 10 || px > camera.x + viewW + 10 || py < camera.y - 10 || py > camera.y + viewH + 10) continue; ctx.shadowColor = i % 3 ? "#70dfb7" : "#ffd858"; ctx.shadowBlur = 8; ctx.beginPath(); ctx.fillStyle = i % 3 ? "#70dfb7" : "#ffd858"; ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
        massPellets.forEach(pellet => { if (pellet.x < camera.x - 15 || pellet.x > camera.x + viewW + 15 || pellet.y < camera.y - 15 || pellet.y > camera.y + viewH + 15) return; ctx.shadowColor = pellet.color; ctx.shadowBlur = 14; ctx.fillStyle = pellet.color; ctx.beginPath(); ctx.arc(pellet.x, pellet.y, pellet.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.beginPath(); ctx.arc(pellet.x - 1.5, pellet.y - 1.5, Math.max(1.3, pellet.size * .27), 0, Math.PI * 2); ctx.fill(); });
        ctx.shadowColor = "rgba(239,79,79,.82)"; ctx.shadowBlur = 22; ctx.strokeStyle = "#ef5b58"; ctx.lineWidth = 18; ctx.strokeRect(12, 12, worldWidth - 24, worldHeight - 24); ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.72)"; ctx.lineWidth = 2; ctx.setLineDash([12, 12]); ctx.strokeRect(25, 25, worldWidth - 50, worldHeight - 50); ctx.setLineDash([]);
        bots.forEach((bot, index) => { if (!bot.alive || bot.x < camera.x - 180 || bot.x > camera.x + viewW + 180 || bot.y < camera.y - 180 || bot.y > camera.y + viewH + 180) return; const colors = botPalette[index % botPalette.length]; const botWidth = 18 + index % 5; drawSnake(ctx, bot.body, colors[0], colors[1], index % 3 === 0 ? "bands" : "dots", botWidth); drawValueTag(ctx, bot.x, bot.y, bot.value, `BOT ${String(index + 1).padStart(2, "0")}`, botWidth); });
        const playerWidth = 28 + Math.min(kills * 3, 14); drawSnake(ctx, player.body, style?.primary ?? "#ef4f4f", style?.secondary ?? "#fff4d1", style?.pattern, playerWidth); drawValueTag(ctx, player.x, player.y, playerValue, "أنت", playerWidth);
      } else {
        ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        for (let i = 0; i < 34; i++) { const px = (i * 83 + 31) % Math.max(w, 1); const py = (i * 47 + 53) % Math.max(h, 1); ctx.beginPath(); ctx.fillStyle = i % 3 ? "#70dfb7" : "#ffd858"; ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2); ctx.fill(); }
        [{ c: "#ef4f4f", a: "#fff4d1", y: .35, p: 0 }, { c: "#4fc798", a: "#fff4d1", y: .62, p: 1.7 }, { c: "#ffd858", a: "#16385f", y: .82, p: 3.2 }].forEach((s, n) => { const pts: Array<[number, number]> = []; for (let i = 0; i < 14; i++) pts.push([w * (.12 + n * .25) + i * 8 + Math.sin(frame / 48 + s.p) * 18, h * s.y + Math.sin(i * .46 + frame / 24 + s.p) * 18]); drawSnake(ctx, pts, s.c, s.a); });
      }
      frame++; animation = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(animation);
  }, [entryValue, interactive, onStats, style]);
  const aim = (event: React.PointerEvent<HTMLCanvasElement>) => { const r = event.currentTarget.getBoundingClientRect(); target.current = { x: event.clientX - r.left, y: event.clientY - r.top, active: true }; };
  return <canvas ref={canvasRef} onPointerMove={aim} onPointerDown={aim} onPointerLeave={() => { target.current.active = false; }} className="arena-canvas" aria-label={interactive ? "حلبة سنيكس كبيرة بكاميرا تتبع" : "معاينة حلبة سنيكس"} />;
}

function Header({ active, balance }: { active: View; balance: number }) {
  const [open, setOpen] = useState(false);
  return <>
    <header className="topbar">
      <a href="/wallet" className="balance-card"><span className="eyebrow">رصيدك التجريبي</span><strong><bdi>${(balance / 100).toFixed(2)}</bdi></strong><Coins /></a>
      <a href="/" className="brand"><span className="brand-mark">S</span><div><strong>SNAKES</strong><small>سنيكس</small></div></a>
      <Button variant="outline" size="icon" className="menu-button" onClick={() => setOpen(!open)} aria-label="فتح القائمة"><Menu /></Button>
    </header>
    <div className="demo-banner">رصيد تجريبي — بلا قيمة نقدية</div>
    <nav className={`quick-nav ${open ? "expanded" : ""}`} aria-label="التنقل الرئيسي">
      {navItems.map(item => <a key={item.view} href={item.href} className={active === item.view ? "active" : ""}><item.icon />{item.label}</a>)}
    </nav>
  </>;
}

function Leaderboard() { return <aside className="leaderboard paper-card"><div className="section-heading"><span>أفضل الأرباح</span><Trophy /></div><ol>{leaders.map(([n, a], i) => <li key={n}><span className="rank">{i + 1}</span><b>{n}</b><bdi>{a}</bdi></li>)}</ol></aside>; }

function Lobby() {
  const [tier, setTier] = useState("$0.01");
  useEffect(() => { const doc = document as Document & { modelContext?: { registerTool: (tool: unknown, options?: unknown) => void } }; if (!doc.modelContext?.registerTool) return; const c = new AbortController(); void doc.modelContext.registerTool({ name: "start_demo_round", title: "ابدأ جولة تجريبية", description: "يفتح حلبة سنيكس التجريبية بالفئة المحددة.", inputSchema: { type: "object", properties: { tier: { type: "string", enum: ["0.01", "0.10", "1.00"] } }, required: ["tier"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input: unknown) { const selected = (input as { tier: string }).tier; window.location.href = `/game?tier=${selected}`; return { status: "opening", tier: selected }; } }, { signal: c.signal }); return () => c.abort(); }, []);
  return <section className="game-layout"><Leaderboard /><section className="arena-card"><div className="arena-head"><div><span className="live-dot" /> الحلبة جاهزة</div><strong>05:00</strong><span>30 لاعباً</span></div><Arena /><div className="arena-overlay"><span>المستوى 2</span><h1>اختر جولتك وابدأ</h1><p>تفادى الأجسام واجمع النقاط واربح مع كل إقصاء</p></div></section><aside className="round-panel paper-card"><span className="eyebrow">رسوم الدخول</span><h2>جولات سريعة</h2><div className="tier-grid">{tiers.map(t => <button key={t.value} onClick={() => !t.locked && setTier(t.value)} className={`tier ${t.tone} ${tier === t.value ? "selected" : ""} ${t.locked ? "locked" : ""}`}><strong><bdi>{t.value}</bdi></strong><span>{t.locked ? "يتطلب إيداعاً" : t.label}</span></button>)}</div><div className="ticket-line"><span>تذاكر مجانية</span><strong>3 × <bdi>$0.01</bdi></strong></div><Button asChild className="play-button"><a href={`/game?tier=${tier.slice(1)}`}>العب الآن بـ <bdi>{tier}</bdi></a></Button><p className="microcopy">تكتمل الغرفة تلقائياً بلاعبين آليين معلّمين بوضوح.</p></aside></section>;
}

function GameView() {
  const [seconds, setSeconds] = useState(300); const [queued, setQueued] = useState(true); const [expanded, setExpanded] = useState(false); const [tierValue, setTierValue] = useState(.1); const [arenaStats, setArenaStats] = useState<ArenaStats>({ kills: 0, players: 30, mass: 54, value: .1, dead: false }); const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const queue = window.setTimeout(() => setQueued(false), 1200); return () => clearTimeout(queue); }, []);
  useEffect(() => { const selected = Number(new URLSearchParams(window.location.search).get("tier") ?? ".10"); if ([.01, .1, 1].includes(selected)) setTierValue(selected); }, []);
  useEffect(() => { if (queued) return; const timer = window.setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer); }, [queued]);
  useEffect(() => { const sync = () => setExpanded(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", sync); return () => document.removeEventListener("fullscreenchange", sync); }, []);
  const toggleFullscreen = async () => {
    if (expanded) { if (document.fullscreenElement) await document.exitFullscreen(); else setExpanded(false); return; }
    try { await stageRef.current?.requestFullscreen(); setExpanded(true); } catch { setExpanded(true); }
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const earnings = arenaStats.kills * tierValue / 2; const earningsText = earnings > 0 && earnings < .01 ? earnings.toFixed(3) : earnings.toFixed(2); const rank = Math.max(1, 6 - arenaStats.kills);
  return <section className="play-experience"><div className={`game-stage ${expanded ? "is-expanded" : ""}`} ref={stageRef}>
    <div className="match-commandbar">
      <div className="match-brand"><span className="brand-mark">S</span><div><b>SNAKES ARENA</b><small><span className="live-dot" /> مباراة مباشرة</small></div></div>
      <div className="command-metrics"><span><Users /> <bdi>{arenaStats.players} / 30</bdi><small>اللاعبون</small></span><span><Wifi /> <bdi>28 ms</bdi><small>الاتصال</small></span><span><Zap /> <bdi>${tierValue.toFixed(2)}</bdi><small>الجولة</small></span></div>
      <button className="fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={expanded ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>{expanded ? <Minimize2 /> : <Maximize2 />}<span>{expanded ? "تصغير" : "ملء الشاشة"}</span></button>
    </div>
    <div className="match-leaders" aria-label="أفضل خمسة لاعبين"><span className="leaders-title"><Trophy /> الصدارة</span>{leaders.map(([name, amount], index) => <div key={name} className={index === 0 ? "leader-first" : ""}><b>{index + 1}</b><span>{name}</span><bdi>{amount}</bdi></div>)}</div>
    <div className="arena-card live-game"><div className="arena-head"><div><span className="live-dot" /> {queued ? "تجهيز الغرفة" : arenaStats.dead ? "تم إقصاؤك" : "الجولة جارية"}</div><strong>{time}</strong><span><Bot /> {queued ? "إضافة اللاعبين الآليين…" : `${Math.max(0, arenaStats.players - (arenaStats.dead ? 0 : 1))} BOT + ${arenaStats.dead ? "مشاهدة" : "أنت"}`}</span></div><Arena interactive entryValue={tierValue} onStats={setArenaStats} />
      <div className="combat-hud"><div><Crosshair /><span>الإقصاءات</span><b>{arenaStats.kills}</b></div><div><Coins /><span>الأرباح</span><bdi>${earningsText}</bdi></div><div><Crown /><span>الترتيب</span><b>#{rank}</b></div><div><Activity /><span>القيمة</span><bdi>${arenaStats.value.toFixed(2)}</bdi></div></div>
      <div className="control-tip"><span className="control-orbit"><Crosshair /></span><span><b>التحكم</b> وجّه رأس الخصم نحو جسمك لإقصائه — وتجنّب أجسام الثعابين</span></div>
      <div className="kill-feed"><span><b>الإقصاء</b> رأس الخصم يصطدم بجسمك</span><span><b>كل إقصاء</b> +$0.05 وحجم أكبر</span></div>
      {queued && <div className="queue-cover"><div className="spinner-ring" /><h1>اكتملت الغرفة</h1><p>أنت و29 لاعباً آلياً — تبدأ الجولة الآن</p></div>}
      {!queued && arenaStats.dead && <div className="queue-cover death-cover"><Crosshair /><h1>تم إقصاؤك</h1><p>اصطدم رأس ثعبانك بجسم خصم. حاول الالتفاف حوله في الجولة القادمة.</p><button onClick={() => window.location.reload()}>العب من جديد</button></div>}
    </div>
    <div className="match-footer"><span><ShieldCheck /> الخادم هو المصدر المعتمد للنتائج • عالم 4200 × 2800</span><span className="demo-pill">رصيد تجريبي — بلا قيمة نقدية</span><a href="/">مغادرة الجولة</a></div>
  </div></section>;
}

function WalletView({ balance, setBalance }: { balance: number; setBalance: React.Dispatch<React.SetStateAction<number>> }) {
  const [notice, setNotice] = useState(""); const deposit = async (method: string) => { setNotice("جارٍ تسجيل الإيداع التجريبي…"); try { await apiRequest("/api/deposits/demo", { method: "POST", body: JSON.stringify({ amount_cents: 1000, method }) }); } catch {} setBalance(current => current + 1000); setNotice("تمت إضافة $10.00 وفتح جميع الفئات."); };
  return <Page title="المحفظة" subtitle="إدارة الرصيد التجريبي وطلبات السحب"><div className="wallet-hero"><div><span>الرصيد المتاح</span><strong><bdi>${(balance / 100).toFixed(2)}</bdi></strong><small>بلا قيمة نقدية</small></div><CircleDollarSign /></div>{notice && <div className="success-note">{notice}</div>}<div className="two-columns"><section className="paper-card content-card"><div className="section-heading"><span>إيداع تجريبي</span><ArrowDownToLine /></div><p>الحد الأدنى <bdi>$10.00</bdi>. اختر وسيلة لمحاكاة عملية ناجحة.</p><div className="payment-grid"><button onClick={() => deposit("shamcash")}><b>ShamCash</b><span>فوري — تجريبي</span></button><button onClick={() => deposit("coinpayments")}><b>CoinPayments</b><span>عملات رقمية — تجريبي</span></button><button onClick={() => deposit("agent")}><b>تحويل عبر وكيل</b><span>مراجعة الإدارة</span></button></div></section><section className="paper-card content-card"><div className="section-heading"><span>طلب سحب</span><ArrowUpFromLine /></div><Label htmlFor="withdraw">المبلغ بالدولار</Label><Input id="withdraw" type="number" min="5" placeholder="5.00" className="ltr-input" /><Button className="wide-button" onClick={() => setNotice("تم إرسال طلب السحب التجريبي للمراجعة.")}>إرسال الطلب</Button><p className="microcopy">الحد الأدنى $5.00 — لا يتم إرسال أموال حقيقية.</p></section></div><Ledger /></Page>;
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

function StoreView() { return <Page title="متجر المزايا" subtitle="تخصيصات جديدة لثعبانك قريباً"><section className="coming-soon paper-card"><div className="store-lock"><ShoppingBag /><LockKeyhole /></div><span className="eyebrow">قريباً</span><h2>نعمل على تجهيز المتجر</h2><p>ستظهر هنا التصاميم والمزايا وقسائم الروليت فور اكتمال تفاصيل المتجر.</p><div className="voucher"><Gift /><div><b>قسيمة متجر مستقبلية</b><span>المخزون: 0</span></div></div></section></Page>; }

function AdminView() {
  const [sham, setSham] = useState(true); const [coin, setCoin] = useState(true); const [agent, setAgent] = useState(false);
  return <Page title="لوحة الإدارة" subtitle="مراقبة الحلبات والاقتصاد التجريبي"><div className="stats-grid admin-stats"><Stat icon={Gamepad2} value="1,284" label="الجولات اليوم" /><Stat icon={CircleDollarSign} value="$482.17" label="حصة سنيكس" /><Stat icon={Trophy} value="$391.26" label="أرباح اللاعبين" /><Stat icon={Activity} value="18" label="جولات نشطة" /></div><div className="admin-grid"><section className="paper-card content-card"><div className="section-heading"><span>إعدادات أساسية</span><Settings2 /></div><Setting icon={Gamepad2} label="مدة الجولة"><bdi>05:00</bdi></Setting><Setting icon={ArrowDownToLine} label="الحد الأدنى للإيداع"><bdi>$10.00</bdi></Setting><Setting icon={ArrowUpFromLine} label="الحد الأدنى للسحب"><bdi>$5.00</bdi></Setting><Setting icon={CircleDollarSign} label="رسوم السحب"><bdi>0%</bdi></Setting></section><section className="paper-card content-card"><div className="section-heading"><span>وسائل الدفع</span><WalletCards /></div><Setting icon={Coins} label="ShamCash"><Switch checked={sham} onCheckedChange={setSham} /></Setting><Setting icon={Coins} label="CoinPayments"><Switch checked={coin} onCheckedChange={setCoin} /></Setting><Setting icon={Users} label="التحويل عبر وكيل"><Switch checked={agent} onCheckedChange={setAgent} /></Setting></section></div><section className="paper-card content-card admin-table"><div className="section-heading"><span>أداء الفئات</span><Activity /></div><Table><TableHeader><TableRow><TableHead>الفئة</TableHead><TableHead>الجولات</TableHead><TableHead>الإيراد</TableHead><TableHead>أرباح اللاعبين</TableHead></TableRow></TableHeader><TableBody>{[["$0.01", "826", "$41.30", "$32.42"], ["$0.10", "391", "$195.50", "$157.60"], ["$1.00", "67", "$245.37", "$201.24"]].map(r => <TableRow key={r[0]}>{r.map(c => <TableCell key={c}><bdi>{c}</bdi></TableCell>)}</TableRow>)}</TableBody></Table></section></Page>;
}

function AuthView({ register = false }: { register?: boolean }) {
  const [message, setMessage] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const body = { email: fd.get("email"), password: fd.get("password"), referral_code: fd.get("referral") || undefined }; try { const result = await apiRequest(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify(body) }); setMessage(result ? "تم بنجاح. جارٍ فتح اللوبي…" : "وضع العرض: تم التحقق من النموذج."); } catch { setMessage("تعذر الاتصال بالخادم. يمكنك متابعة العرض التجريبي."); } };
  return <div className="auth-shell"><a href="/" className="brand"><span className="brand-mark">S</span><div><strong>SNAKES</strong><small>سنيكس</small></div></a><form className="paper-card auth-card" onSubmit={submit}><span className="eyebrow">رصيد تجريبي — بلا قيمة نقدية</span><h1>{register ? "أنشئ حسابك" : "أهلاً بعودتك"}</h1><p>{register ? "ستحصل على 3 جولات $0.01 و3 لفات روليت." : "ادخل إلى رصيدك وجولاتك المحفوظة."}</p><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" name="email" type="email" required placeholder="name@example.com" className="ltr-input" /><Label htmlFor="password">كلمة المرور</Label><Input id="password" name="password" type="password" required minLength={8} className="ltr-input" />{register && <><Label htmlFor="referral">رمز الإحالة — اختياري</Label><Input id="referral" name="referral" className="ltr-input" placeholder="SNAKES-HM25" /></>}<Button className="play-button" type="submit">{register ? "إنشاء الحساب" : "تسجيل الدخول"}</Button>{message && <div className="success-note">{message}</div>}<a className="auth-switch" href={register ? "/login" : "/register"}>{register ? "لديك حساب؟ سجّل الدخول" : "لا تملك حساباً؟ أنشئ واحداً"}</a></form></div>;
}

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="page-content"><div className="page-title"><div><span className="eyebrow">SNAKES</span><h1>{title}</h1><p>{subtitle}</p></div><a href="/" className="back-link">العودة للحلبة <ChevronLeft /></a></div>{children}</section>; }
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
    case "admin": content = <AdminView />; break;
    case "login": content = <AuthView />; break;
    case "register": content = <AuthView register />; break;
    default: content = <Lobby />;
  }
  if (initialView === "login" || initialView === "register") return content;
  return <main className="app-shell" dir="rtl"><Header active={initialView} balance={balance} />{content}<footer className="app-footer"><span>Snakes Prototype</span><span>جميع الأرصدة والعمليات تجريبية</span><a href="/admin">دخول الإدارة</a></footer></main>;
}
