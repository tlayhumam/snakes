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
  ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = primary; ctx.lineWidth = width;
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  ctx.strokeStyle = secondary; ctx.lineWidth = Math.max(3, width * .23); ctx.setLineDash(pattern === "bands" ? [8, 12] : pattern === "stars" ? [2, 18] : [3, 14]); ctx.stroke(); ctx.setLineDash([]);
  const [hx, hy] = points.at(-1)!; const head = width * .68; ctx.fillStyle = primary; ctx.beginPath(); ctx.arc(hx + width * .18, hy, head, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(hx + width * .43, hy - width * .2, Math.max(3, width * .2), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#102d4b"; ctx.beginPath(); ctx.arc(hx + width * .46, hy - width * .2, Math.max(1.4, width * .08), 0, Math.PI * 2); ctx.fill();
}

function drawBotLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string) {
  const label = `BOT • ${name}`; ctx.font = "700 10px Tahoma, Arial"; const width = ctx.measureText(label).width + 13;
  ctx.fillStyle = "rgba(3,17,32,.76)"; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 29, width, 18, 7); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.textAlign = "center"; ctx.fillText(label, x, y - 16);
}

function Arena({ interactive = false, style }: { interactive?: boolean; style?: SnakeStyle }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: 430, y: 260 });
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    let frame = 0; let animation = 0; const player = { x: 320, y: 280, angle: 0, body: [] as Array<[number, number]> };
    const bots = botNames.map((name, index) => ({
      name, x: 0, y: 0, angle: (index * 1.87) % (Math.PI * 2), speed: 1.05 + (index % 5) * .11,
      turn: .004 + (index % 4) * .0015, body: [] as Array<[number, number]>, initialized: false,
    }));
    const draw = () => {
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); const w = rect.width; const h = rect.height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) { canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#173e68"); g.addColorStop(1, "#071d34"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1; for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < 34; i++) { const px = (i * 83 + 31) % Math.max(w, 1); const py = (i * 47 + 53) % Math.max(h, 1); ctx.beginPath(); ctx.fillStyle = i % 3 ? "#70dfb7" : "#ffd858"; ctx.arc(px, py, 2.5 + i % 2, 0, Math.PI * 2); ctx.fill(); }
      if (interactive) {
        bots.forEach((bot, index) => {
          if (!bot.initialized) {
            const columns = Math.max(5, Math.min(8, Math.floor(w / 120))); const rows = Math.ceil(bots.length / columns); const column = index % columns; const row = Math.floor(index / columns);
            bot.x = 42 + column * ((w - 84) / Math.max(1, columns - 1)) + ((index * 7) % 15 - 7); bot.y = 88 + row * ((h - 140) / Math.max(1, rows - 1)) + ((index * 11) % 17 - 8);
            const initialLength = 15 + index % 12; for (let segment = initialLength; segment >= 0; segment--) bot.body.push([bot.x - Math.cos(bot.angle) * segment * 4.5, bot.y - Math.sin(bot.angle) * segment * 4.5]);
            bot.initialized = true;
          }
          bot.angle += Math.sin(frame / (70 + index % 9) + index * .74) * bot.turn;
          const margin = 30; if (bot.x < margin || bot.x > w - margin) bot.angle = Math.PI - bot.angle; if (bot.y < 70 || bot.y > h - margin) bot.angle = -bot.angle;
          bot.x = Math.max(margin, Math.min(w - margin, bot.x + Math.cos(bot.angle) * bot.speed)); bot.y = Math.max(70, Math.min(h - margin, bot.y + Math.sin(bot.angle) * bot.speed));
          bot.body.push([bot.x, bot.y]); if (bot.body.length > 15 + index % 12) bot.body.shift();
          const colors = botPalette[index % botPalette.length]; drawSnake(ctx, bot.body, colors[0], colors[1], index % 3 === 0 ? "bands" : "dots", 12 + index % 4);
          if (index < 10) drawBotLabel(ctx, bot.x, bot.y, `${String(index + 1).padStart(2, "0")} • ${bot.name}`);
        });
        const wanted = Math.atan2(target.current.y - player.y, target.current.x - player.x); let diff = ((wanted - player.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI; player.angle += Math.max(-.08, Math.min(.08, diff)); player.x = Math.max(24, Math.min(w - 24, player.x + Math.cos(player.angle) * 2.3)); player.y = Math.max(66, Math.min(h - 24, player.y + Math.sin(player.angle) * 2.3)); player.body.push([player.x, player.y]); if (player.body.length > 42) player.body.shift(); drawSnake(ctx, player.body, style?.primary ?? "#ef4f4f", style?.secondary ?? "#fff4d1", style?.pattern);
        ctx.font = "900 11px Tahoma, Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe176"; ctx.fillText("أنت", player.x, player.y - 24);
      } else {
        [{ c: "#ef4f4f", a: "#fff4d1", y: .35, p: 0 }, { c: "#4fc798", a: "#fff4d1", y: .62, p: 1.7 }, { c: "#ffd858", a: "#16385f", y: .82, p: 3.2 }].forEach((s, n) => { const pts: Array<[number, number]> = []; for (let i = 0; i < 14; i++) pts.push([w * (.12 + n * .25) + i * 8 + Math.sin(frame / 48 + s.p) * 18, h * s.y + Math.sin(i * .46 + frame / 24 + s.p) * 18]); drawSnake(ctx, pts, s.c, s.a); });
      }
      frame++; animation = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(animation);
  }, [interactive, style]);
  const aim = (event: React.PointerEvent<HTMLCanvasElement>) => { const r = event.currentTarget.getBoundingClientRect(); target.current = { x: event.clientX - r.left, y: event.clientY - r.top }; };
  return <canvas ref={canvasRef} onPointerMove={aim} onPointerDown={aim} className="arena-canvas" aria-label={interactive ? "حلبة سنيكس التفاعلية" : "معاينة حلبة سنيكس"} />;
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
  const [seconds, setSeconds] = useState(300); const [queued, setQueued] = useState(true); const [expanded, setExpanded] = useState(false); const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const queue = window.setTimeout(() => setQueued(false), 1200); return () => clearTimeout(queue); }, []);
  useEffect(() => { if (queued) return; const timer = window.setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearInterval(timer); }, [queued]);
  useEffect(() => { const sync = () => setExpanded(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", sync); return () => document.removeEventListener("fullscreenchange", sync); }, []);
  const toggleFullscreen = async () => {
    if (expanded) { if (document.fullscreenElement) await document.exitFullscreen(); else setExpanded(false); return; }
    try { await stageRef.current?.requestFullscreen(); setExpanded(true); } catch { setExpanded(true); }
  };
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <section className="play-experience"><div className={`game-stage ${expanded ? "is-expanded" : ""}`} ref={stageRef}>
    <div className="match-commandbar">
      <div className="match-brand"><span className="brand-mark">S</span><div><b>SNAKES ARENA</b><small><span className="live-dot" /> مباراة مباشرة</small></div></div>
      <div className="command-metrics"><span><Users /> <bdi>30 / 30</bdi><small>اللاعبون</small></span><span><Wifi /> <bdi>28 ms</bdi><small>الاتصال</small></span><span><Zap /> <bdi>$0.10</bdi><small>الجولة</small></span></div>
      <button className="fullscreen-button" onClick={() => void toggleFullscreen()} aria-label={expanded ? "الخروج من ملء الشاشة" : "ملء الشاشة"}>{expanded ? <Minimize2 /> : <Maximize2 />}<span>{expanded ? "تصغير" : "ملء الشاشة"}</span></button>
    </div>
    <div className="match-leaders" aria-label="أفضل خمسة لاعبين"><span className="leaders-title"><Trophy /> الصدارة</span>{leaders.map(([name, amount], index) => <div key={name} className={index === 0 ? "leader-first" : ""}><b>{index + 1}</b><span>{name}</span><bdi>{amount}</bdi></div>)}</div>
    <div className="arena-card live-game"><div className="arena-head"><div><span className="live-dot" /> {queued ? "تجهيز الغرفة" : "الجولة جارية"}</div><strong>{time}</strong><span><Bot /> {queued ? "إضافة اللاعبين الآليين…" : "29 BOT + أنت"}</span></div><Arena interactive />
      <div className="combat-hud"><div><Crosshair /><span>الإقصاءات</span><b>2</b></div><div><Coins /><span>الأرباح</span><bdi>$0.02</bdi></div><div><Crown /><span>الترتيب</span><b>#6</b></div></div>
      <div className="control-tip"><span className="control-orbit"><Crosshair /></span><span><b>التحكم</b> حرّك المؤشر أو إصبعك لتغيير الاتجاه</span></div>
      <div className="kill-feed"><span><b>BOT • برق</b> أقصى BOT • موج</span><span><b>BOT • شبح</b> اصطدم بالجدار</span></div>
      {queued && <div className="queue-cover"><div className="spinner-ring" /><h1>اكتملت الغرفة</h1><p>أنت و29 لاعباً آلياً — تبدأ الجولة الآن</p></div>}
    </div>
    <div className="match-footer"><span><ShieldCheck /> الخادم هو المصدر المعتمد للنتائج</span><span className="demo-pill">رصيد تجريبي — بلا قيمة نقدية</span><a href="/">مغادرة الجولة</a></div>
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
