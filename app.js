'use strict';
/* =====================================================================
   Quantrade — family crypto dashboard (vanilla JS, no build step)

   Market data: CoinGecko (prices, sparklines, OHLC) and Binance public
   market-data endpoints (live ticks, candles) where reachable. If the
   network is unavailable the app falls back to clearly-labelled simulated data.

   Each family member's own Bitcoin address comes from /api/wallet (the list
   lives server-side, never in this file). Buy BTC shows that address (with a
   QR code) so they can send Bitcoin bought in Cash App to their own wallet. Quantrade never holds anyone's funds.
   Sign-in accounts (name, email, watchlist) live in this browser's localStorage.
   ===================================================================== */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = p => 1 - Math.pow(1 - p, 3);
// fetch with a timeout so a stalled connection falls back instead of hanging
function fetchT(url, ms = 6000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t)); }

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const nf = (a, b) => new Intl.NumberFormat('en-US', { minimumFractionDigits: a, maximumFractionDigits: b });
const NF0 = nf(0, 0), NF2 = nf(2, 2), NF4 = nf(4, 4);
function usd(n) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = a >= 1 ? NF2.format(a) : a >= 0.01 ? NF4.format(a) : a === 0 ? '0.00' : a.toPrecision(4);
  return (n < 0 ? '-$' : '$') + s;
}
function compact(n) {
  if (n == null || !isFinite(n)) return '—';
  for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (Math.abs(n) >= v) return '$' + (n / v).toFixed(2) + u;
  return usd(n);
}
const pct = n => (n == null || !isFinite(n)) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const axisFmt = v => { const a = Math.abs(v); return a >= 1000 ? NF0.format(v) : a >= 1 ? NF2.format(v) : v.toPrecision(3); };
const dir = n => (n == null || !isFinite(n)) ? '' : n >= 0 ? 'up' : 'down';
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hue = s => hashStr(s) % 360;
const fHM = t => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
const fWk = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
const fMD = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fMY = t => new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
const fFull = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- icons ---------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  candle: '<path d="M7 3v4M7 17v4M17 3v2M17 15v6"/><rect x="5" y="7" width="4" height="10" rx="1"/><rect x="15" y="5" width="4" height="10" rx="1"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 9h-5a3 3 0 0 0 0 6h5Z"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17-5-5 5-5"/><path d="M5 12h12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"/>',
  device: '<rect x="2" y="4" width="14" height="11" rx="2"/><rect x="17" y="8" width="5" height="12" rx="1.5"/><path d="M6 19h6"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  up: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
};
const icon = (n, c = '') => `<svg class="ico ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const LOGO = `<svg class="logo" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="12" fill="url(#qlg)"/><path d="M13 1h14a12 12 0 0 1 12 12v6H1v-6A12 12 0 0 1 13 1Z" fill="#fff" opacity=".16"/><circle cx="19" cy="19" r="8.5" stroke="#fff" stroke-width="3"/><path d="m24.5 24.5 6 6" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="m14.5 21 3-3 2.4 2 3.6-4.6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* =====================================================================
   MARKET DATA
   ===================================================================== */
const STABLE = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'TUSD', 'PYUSD', 'USD1', 'BUSD', 'USDD', 'FRAX', 'USDTB', 'BSC-USD']);
const M = { coins: [], byId: new Map(), bySym: new Map(), mode: 'loading', lastWs: 0, dirty: false, binanceDownUntil: 0 };
// Binance is blocked on some networks; after a failure, skip it for a while instead of waiting on timeouts
const binanceOk = () => Date.now() > M.binanceDownUntil;
const binanceDown = () => { M.binanceDownUntil = Date.now() + 5 * 60000; };
const markDirty = () => { M.dirty = true; };

// Offline fallback list (approximate prices; only used when every API is unreachable).
const SEED = [
  ['bitcoin', 'BTC', 'Bitcoin', 98000, 1.94e12], ['ethereum', 'ETH', 'Ethereum', 3600, 4.3e11], ['ripple', 'XRP', 'XRP', 2.4, 1.4e11],
  ['binancecoin', 'BNB', 'BNB', 650, 9.4e10], ['solana', 'SOL', 'Solana', 190, 9.1e10], ['dogecoin', 'DOGE', 'Dogecoin', 0.22, 3.2e10],
  ['cardano', 'ADA', 'Cardano', 0.8, 2.8e10], ['tron', 'TRX', 'TRON', 0.27, 2.3e10], ['chainlink', 'LINK', 'Chainlink', 18, 1.1e10],
  ['avalanche-2', 'AVAX', 'Avalanche', 32, 1.3e10], ['toncoin', 'TON', 'Toncoin', 4.5, 1.1e10], ['sui', 'SUI', 'Sui', 3.6, 1.1e10],
  ['polkadot', 'DOT', 'Polkadot', 6.5, 9.8e9], ['litecoin', 'LTC', 'Litecoin', 95, 7.1e9], ['shiba-inu', 'SHIB', 'Shiba Inu', 0.000018, 1.06e10],
  ['near', 'NEAR', 'NEAR Protocol', 4.8, 5.8e9], ['uniswap', 'UNI', 'Uniswap', 10, 6e9], ['aptos', 'APT', 'Aptos', 9, 4.5e9],
];

function synthSeries(end, n, vol, seed) {
  const r = rng(hashStr(seed)); const out = []; let v = 1;
  for (let i = 0; i < n; i++) { v *= 1 + (r() - 0.5) * vol + Math.sin(i / 9) * vol * 0.08; out.push(v); }
  const k = end / out[n - 1]; return out.map(x => x * k);
}
function synthCandles(end, n, ms, seed) {
  const r = rng(hashStr(seed + 'c')); const cl = synthSeries(end, n + 1, 0.018, seed); const now = Date.now(); const out = [];
  for (let i = 0; i < n; i++) {
    const o = cl[i], c = cl[i + 1];
    out.push({ t: now - (n - 1 - i) * ms, o, c, h: Math.max(o, c) * (1 + r() * 0.006), l: Math.min(o, c) * (1 - r() * 0.006) });
  }
  return out;
}

function seedCoin([id, symbol, name, price, mcap], i) {
  const spark = synthSeries(price, 168, 0.012, id);
  const chg24 = (price / spark[144] - 1) * 100;
  return { id, symbol, name, image: '', price, mcap, vol: mcap * 0.04, rank: i + 1, chg1h: (price / spark[166] - 1) * 100, chg24, chg7d: (price / spark[0] - 1) * 100, high: price * 1.03, low: price * 0.97, spark };
}
function normalize(d) {
  return {
    id: d.id, symbol: String(d.symbol || '').toUpperCase(), name: d.name, image: d.image || '', price: d.current_price,
    mcap: d.market_cap, vol: d.total_volume, rank: d.market_cap_rank, high: d.high_24h, low: d.low_24h,
    chg1h: d.price_change_percentage_1h_in_currency, chg24: d.price_change_percentage_24h_in_currency ?? d.price_change_percentage_24h,
    chg7d: d.price_change_percentage_7d_in_currency, spark: d.sparkline_in_7d?.price || [],
  };
}
function indexCoins() {
  M.byId.clear(); M.bySym.clear();
  for (const c of M.coins) { M.byId.set(c.id, c); if (!M.bySym.has(c.symbol + 'USDT')) M.bySym.set(c.symbol + 'USDT', c); }
}
function useSeed() { M.coins = SEED.map(seedCoin); indexCoins(); M.mode = 'simulated'; M.seeded = true; markDirty(); }

async function loadMarkets() {
  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=80&page=1&sparkline=true&price_change_percentage=1h,24h,7d';
    const res = await fetchT(url, 9000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty');
    const fresh = Date.now() - M.lastWs < 10000;
    M.coins = data
      .filter(d => d.current_price > 0 && !/wrapped|staked|bridged|restaked/i.test(d.name))
      .slice(0, 60)
      .map(d => {
        const c = normalize(d); const prev = M.byId.get(c.id);
        if (prev && fresh) { c.price = prev.price; c.chg24 = prev.chg24; } // keep the fresher streamed tick
        return c;
      });
    const wasSeed = M.seeded; M.seeded = false; M.lastSnap = Date.now();
    indexCoins();
    if (M.mode !== 'live') M.mode = 'delayed';
    // first real snapshot after an offline start: redraw so charts and tables use real data
    if (wasSeed && booted) { candleCache.clear(); route(); }
  } catch (e) {
    console.warn('[quantrade] market snapshot unavailable:', e.message || e);
    if (!M.coins.length) useSeed();
  }
  markDirty();
}

let wsTries = 0;
function connectWS() {
  let ws, got = false;
  try { ws = new WebSocket('wss://data-stream.binance.vision/ws/!miniTicker@arr'); } catch { return; }
  const guard = setTimeout(() => { if (!got) try { ws.close(); } catch { /* ignore */ } }, 9000);
  ws.onmessage = e => {
    got = true; wsTries = 0; M.lastWs = Date.now(); M.mode = 'live';
    let arr; try { arr = JSON.parse(e.data); } catch { return; }
    for (const t of arr) {
      const c = M.bySym.get(t.s); if (!c) continue;
      const p = +t.c, o = +t.o; if (!(p > 0)) continue;
      c.price = p; if (o > 0) c.chg24 = (p / o - 1) * 100;
      if (c.high != null && p > c.high) c.high = p;
      if (c.low != null && p < c.low) c.low = p;
    }
    markDirty();
  };
  ws.onclose = () => {
    clearTimeout(guard);
    if (M.mode === 'live') M.mode = 'delayed';
    if (!got) binanceDown();
    markDirty();
    if (wsTries++ < 6) setTimeout(connectWS, got ? 3000 : 15000);
  };
  ws.onerror = () => { /* onclose handles retry */ };
}

// Gentle random walk — only while fully offline (status pill says "Simulated").
function simTick() {
  if (M.mode !== 'simulated') return;
  for (const c of M.coins) {
    if (STABLE.has(c.symbol)) continue;
    const open = c.price / (1 + (c.chg24 || 0) / 100);
    c.price *= 1 + (Math.random() - 0.5) * 0.0016;
    c.chg24 = (c.price / open - 1) * 100;
  }
  markDirty();
}

const TF = {
  '1H': { b: '1m', n: 60, cg: 0, ms: 6e4, ax: fHM },
  '1D': { b: '15m', n: 96, cg: 1, ms: 9e5, ax: fHM },
  '1W': { b: '2h', n: 84, cg: 7, ms: 72e5, ax: fWk },
  '1M': { b: '8h', n: 90, cg: 30, ms: 288e5, ax: fMD },
  '1Y': { b: '3d', n: 122, cg: 365, ms: 2592e5, ax: fMY },
};
const candleCache = new Map();
async function getCandles(coin, tf) {
  const key = coin.id + ':' + tf; const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit;
  const T = TF[tf]; let data = null, src = '';
  if (!STABLE.has(coin.symbol) && binanceOk()) {
    try {
      const r = await fetchT(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(coin.symbol)}USDT&interval=${T.b}&limit=${T.n}`, 4000);
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length > 5) { data = j.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })); src = 'Binance'; } }
    } catch { binanceDown(); }
  }
  if (!data && T.cg) {
    try {
      const r = await fetchT(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coin.id)}/ohlc?vs_currency=usd&days=${T.cg}`);
      if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length > 5) { data = j.map(k => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4] })); src = 'CoinGecko'; } }
    } catch { /* fall back to illustration */ }
  }
  if (!data && !T.cg) { // 1H: CoinGecko has no hourly OHLC, so use the last hour of its 5-minute price points
    try {
      const r = await fetchT(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coin.id)}/market_chart?vs_currency=usd&days=1`);
      if (r.ok) {
        const j = await r.json(), pts = (j.prices || []).filter(p => p[0] >= Date.now() - 36e5);
        if (pts.length > 5) { data = pts.map(([t, v]) => ({ t, o: v, h: v, l: v, c: v })); src = 'CoinGecko'; }
      }
    } catch { /* fall back to illustration */ }
  }
  if (!data) { data = synthCandles(coin.price, T.n, T.ms, coin.id + tf); src = 'Simulated'; }
  // illustrative fallbacks expire after ~10s so the next view retries the real feeds
  const out = { data, src, at: src === 'Simulated' ? Date.now() - 50000 : Date.now() }; candleCache.set(key, out); return out;
}

/* =====================================================================
   CHART (canvas: area + candlestick, crosshair, draw-in animation)
   ===================================================================== */
class Chart {
  constructor(el, o = {}) {
    this.el = el; this.mini = !!o.mini; this.type = o.type || 'area'; this.fmtT = o.fmtT || fFull; this.fmtAxis = o.fmtAxis || fHM;
    this.data = []; this.hover = -1; this.p = 1; this.w = 0; this.h = 0;
    this.cv = document.createElement('canvas'); el.appendChild(this.cv); this.ctx = this.cv.getContext('2d');
    if (!this.mini) {
      this.tip = document.createElement('div'); this.tip.className = 'chart-tip'; el.appendChild(this.tip);
      el.addEventListener('pointermove', e => this.move(e));
      el.addEventListener('pointerleave', () => { this.hover = -1; this.tip.style.opacity = 0; this.draw(); });
    }
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(el);
  }
  resize() {
    const r = this.el.getBoundingClientRect(); if (!r.width) return;
    const d = window.devicePixelRatio || 1; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(this.w * d); this.cv.height = Math.round(this.h * d);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.ctx.setTransform(d, 0, 0, d, 0, 0); this.draw();
  }
  set(data, type) {
    this.data = data; if (type) this.type = type; this.hover = -1; if (this.tip) this.tip.style.opacity = 0;
    cancelAnimationFrame(this.raf); this.p = 0; const t0 = performance.now();
    const step = now => { this.p = Math.min(1, (now - t0) / 1000); this.draw(); if (this.p < 1) this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  }
  live(price) {
    const l = this.data[this.data.length - 1]; if (!l || !(price > 0)) return;
    l.c = price; l.h = Math.max(l.h, price); l.l = Math.min(l.l, price);
    if (this.p >= 1) this.draw();
  }
  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); }
  geom() {
    const pad = this.mini ? { l: 2, r: 2, t: 8, b: 4 } : { l: 6, r: 74, t: 14, b: 28 };
    let lo = Infinity, hi = -Infinity;
    for (const k of this.data) {
      const a = this.type === 'candle' ? k.l : k.c, b = this.type === 'candle' ? k.h : k.c;
      if (a < lo) lo = a; if (b > hi) hi = b;
    }
    const span = (hi - lo) || hi * 0.01 || 1; lo -= span * 0.1; hi += span * 0.1;
    const W = Math.max(10, this.w - pad.l - pad.r), H = Math.max(10, this.h - pad.t - pad.b), n = this.data.length;
    return { pad, lo, hi, W, H, x: i => pad.l + (n <= 1 ? W / 2 : (i / (n - 1)) * W), y: v => pad.t + (1 - (v - lo) / (hi - lo)) * H };
  }
  draw() {
    const { ctx, data: d } = this; if (!this.w) return;
    ctx.clearRect(0, 0, this.w, this.h); if (d.length < 2) return;
    const g = this.geom(), { pad, x, y, W, H } = g;
    const up = d[d.length - 1].c >= d[0].c, col = up ? '#22e3a3' : '#ff5d7d';
    ctx.font = '11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';

    if (!this.mini) {
      for (let i = 0; i <= 4; i++) {
        const v = g.lo + (g.hi - g.lo) * (i / 4), yy = Math.round(y(v)) + .5;
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + W, yy); ctx.stroke();
        ctx.fillStyle = '#5d6589'; ctx.textAlign = 'left'; ctx.fillText(axisFmt(v), pad.l + W + 10, yy);
      }
      ctx.textAlign = 'center';
      const ticks = this.w < 480 ? 3 : 5;
      for (let i = 0; i < ticks; i++) {
        const idx = Math.round(i * (d.length - 1) / (ticks - 1));
        ctx.fillText(this.fmtAxis(d[idx].t), clamp(x(idx), pad.l + 26, pad.l + W - 26), this.h - 12);
      }
      ctx.textAlign = 'left';
    }

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pad.l + W * ease(this.p) + 2, this.h); ctx.clip();
    if (this.type === 'candle') {
      const cw = Math.max(1.5, (W / d.length) * 0.62);
      d.forEach((k, i) => {
        const c = k.c >= k.o ? '#22e3a3' : '#ff5d7d', xx = x(i);
        ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xx, y(k.h)); ctx.lineTo(xx, y(k.l)); ctx.stroke();
        const top = y(Math.max(k.o, k.c)), bot = y(Math.min(k.o, k.c));
        ctx.fillRect(xx - cw / 2, top, cw, Math.max(1, bot - top));
      });
    } else {
      const line = () => { ctx.beginPath(); d.forEach((k, i) => i ? ctx.lineTo(x(i), y(k.c)) : ctx.moveTo(x(i), y(k.c))); };
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + H);
      grad.addColorStop(0, hexA(col, this.mini ? .32 : .28)); grad.addColorStop(1, hexA(col, 0));
      line(); ctx.lineTo(x(d.length - 1), pad.t + H); ctx.lineTo(x(0), pad.t + H); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      line(); ctx.strokeStyle = col; ctx.lineWidth = this.mini ? 2 : 2.2; ctx.lineJoin = 'round'; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();

    if (this.p < 1) return;
    const last = d[d.length - 1].c, ly = y(last), lx = x(d.length - 1);
    if (this.type !== 'candle') {
      const pulse = (Math.sin(performance.now() / 300) + 1) / 2;
      ctx.beginPath(); ctx.arc(lx, ly, 8 + pulse * 3, 0, 7); ctx.fillStyle = hexA(col, .18); ctx.fill();
      ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, 7); ctx.fillStyle = col; ctx.fill();
    }
    if (this.mini) return;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = hexA(col, .55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, ly); ctx.lineTo(pad.l + W, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.roundRect(pad.l + W + 4, ly - 11, pad.r - 6, 22, 6); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = '#04110b'; ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.fillText(axisFmt(last), pad.l + W + 10, ly + .5);

    if (this.hover >= 0 && d[this.hover]) {
      const k = d[this.hover], hx = x(this.hover), hy = y(k.c);
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, pad.t + H); ctx.moveTo(pad.l, hy); ctx.lineTo(pad.l + W, hy); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
    }
  }
  move(e) {
    if (this.data.length < 2 || this.p < 1) return;
    const r = this.el.getBoundingClientRect(), g = this.geom();
    const i = clamp(Math.round(((e.clientX - r.left - g.pad.l) / g.W) * (this.data.length - 1)), 0, this.data.length - 1);
    if (i === this.hover) return;
    this.hover = i; const k = this.data[i];
    this.tip.innerHTML = `<div class="t">${esc(this.fmtT(k.t))}</div>` + (this.type === 'candle'
      ? `<div class="ohlc"><span>O</span>${usd(k.o)}<span>H</span>${usd(k.h)}<span>L</span>${usd(k.l)}<span>C</span>${usd(k.c)}</div>`
      : `<div class="v">${usd(k.c)}</div>`);
    const tx = g.x(i); const left = tx + 170 > this.w - 70 ? tx - 170 : tx + 14;
    this.tip.style.opacity = 1; this.tip.style.transform = `translate(${Math.max(0, left)}px, ${g.pad.t + 4}px)`;
    this.draw();
  }
}
// keep pulsing end-dots alive without redrawing every chart every frame
const liveCharts = new Set();
(function pulseLoop() { for (const c of liveCharts) if (c.p >= 1 && c.type !== 'candle') c.draw(); setTimeout(() => requestAnimationFrame(pulseLoop), 60); })();
function makeChart(el, o) { const c = new Chart(el, o); liveCharts.add(c); const d = c.destroy.bind(c); c.destroy = () => { liveCharts.delete(c); d(); }; return c; }

let sparkId = 0;
function sparkSVG(arr, w = 120, h = 40) {
  if (!arr || arr.length < 2) return '';
  const step = Math.max(1, Math.floor(arr.length / 48)); const pts = arr.filter((_, i) => i % step === 0); pts.push(arr[arr.length - 1]);
  let lo = Infinity, hi = -Infinity; for (const v of pts) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const sp = hi - lo || 1, up = pts[pts.length - 1] >= pts[0], col = up ? '#22e3a3' : '#ff5d7d', id = 'sg' + (++sparkId);
  const line = pts.map((v, i) => (i ? 'L' : 'M') + ((i / (pts.length - 1)) * w).toFixed(1) + ' ' + (h - 3 - ((v - lo) / sp) * (h - 6)).toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".32"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${line}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

/* =====================================================================
   AUTH & ACCOUNTS  (browser-local sign-in; account holds the watchlist)
   ===================================================================== */
const DEFAULT_WATCH = ['bitcoin', 'ethereum', 'solana', 'ripple', 'dogecoin'];
async function hashPw(pw, email) {
  const s = 'quantrade::' + email + '::' + pw;
  if (window.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'f' + h;
}
const acctKey = email => 'qt_acct_' + email;
const newAcct = (watch = DEFAULT_WATCH) => ({ watch: [...watch] });

const Auth = {
  user() {
    const e = store.get('qt_session', null); if (!e) return null;
    const u = store.get('qt_users', {})[e]; return u ? { name: u.name, email: e } : null;
  },
  async signup(name, email, pw) {
    email = email.trim().toLowerCase();
    const users = store.get('qt_users', {});
    if (users[email]) throw new Error('An account with this email already exists. Try signing in.');
    users[email] = { name: name.trim(), pw: await hashPw(pw, email), created: Date.now() };
    store.set('qt_users', users); store.set('qt_session', email);
  },
  async signin(email, pw) {
    email = email.trim().toLowerCase();
    const u = store.get('qt_users', {})[email];
    if (!u || !u.pw || u.pw !== await hashPw(pw, email)) throw new Error('That email and password don’t match an account.');
    store.set('qt_session', email);
  },
  demo() {
    const email = 'demo@quantrade.app', users = store.get('qt_users', {});
    if (!users[email]) { users[email] = { name: 'Demo Trader', pw: '', created: Date.now() }; store.set('qt_users', users); }
    store.set('qt_session', email);
    // older builds stored practice-trading balances here; keep only the watchlist
    const old = store.get(acctKey(email), null);
    store.set(acctKey(email), newAcct(old?.watch || ['bitcoin', 'ethereum', 'solana', 'chainlink', 'dogecoin', 'ripple']));
  },
  signout() { store.del('qt_session'); },
};
function acct() { const u = Auth.user(); return (u && store.get(acctKey(u.email), null)) || newAcct(); }
function saveAcct(a) { const u = Auth.user(); if (u) store.set(acctKey(u.email), a); }

function toggleWatch(id, btn) {
  const a = acct(); const i = a.watch.indexOf(id); const c = M.byId.get(id);
  if (i >= 0) a.watch.splice(i, 1); else a.watch.push(id);
  saveAcct(a);
  btn?.classList.toggle('on', i < 0);
  toast(i >= 0 ? `Removed ${c?.symbol || ''} from your watchlist` : `Added ${c?.symbol || ''} to your watchlist`, 'ok', 'star');
  current?.onWatch?.();
}

/* =====================================================================
   UI BITS
   ===================================================================== */
const app = $('#app');
let current = null;

function toast(msg, type = 'ok', ic) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ti">${icon(ic || (type === 'ok' ? 'check' : 'x'))}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3400);
}
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function go(h) { if (location.hash === h) route(); else location.hash = h; }

function coinIcon(c, s = 32) {
  return `<span class="ci" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .42)}px;--h:${hue(c.symbol)}"><i>${esc(c.symbol.slice(0, 1))}</i>${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}
const chgTag = (c, k = 'chg24', cls = '') => `<span class="chg ${cls} ${dir(c[k])}" data-c="${esc(c.id)}" data-k="${k}">${pct(c[k])}</span>`;
const priceTag = (c, cls = '') => `<span class="num ${cls}" data-p="${esc(c.id)}">${usd(c.price)}</span>`;
const empty = (ic, title, sub) => `<div class="empty"><div class="ei">${icon(ic)}</div><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;

function marketTable(list, o = {}) {
  const { full = false, watch = new Set(), sort = null, href = () => '#/signup' } = o;
  const th = (k, label, cls = '') => `<th class="${cls} ${sort && sort.k === k ? 'sorted ' + (sort.d > 0 ? 'asc' : 'desc') : ''}" ${full ? `data-sort="${k}"` : ''}>${label}</th>`;
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>
    ${full ? '<th class="l w0"></th>' : ''}${th('rank', '#', 'l w0 col-rank')}${th('name', 'Asset', 'l')}${th('price', 'Price')}
    ${full ? th('chg1h', '1h', 'hide-md') : ''}${th('chg24', '24h', 'hide-xs')}${full ? th('chg7d', '7d', 'hide-md') : ''}
    ${th('mcap', 'Market cap', 'hide-sm')}${full ? th('vol', 'Volume (24h)', 'hide-md') : ''}<th class="hide-sm">Last 7 days</th><th class="w0 hide-xs"></th>
  </tr></thead><tbody>${list.map(c => `<tr data-go="${href(c)}">
    ${full ? `<td class="l w0"><button class="star ${watch.has(c.id) ? 'on' : ''}" data-star="${esc(c.id)}" aria-label="Toggle ${esc(c.symbol)} on watchlist">${icon('star')}</button></td>` : ''}
    <td class="l w0 muted col-rank">${c.rank ?? ''}</td>
    <td class="l"><div class="asset">${coinIcon(c, 34)}<div><b>${esc(c.name)}</b><small>${esc(c.symbol)}</small></div></div></td>
    <td>${priceTag(c, 'strong')}<span class="xs-only"><br>${chgTag(c)}</span></td>
    ${full ? `<td class="hide-md">${chgTag(c, 'chg1h')}</td>` : ''}
    <td class="hide-xs">${chgTag(c, 'chg24', 'pillc')}</td>
    ${full ? `<td class="hide-md">${chgTag(c, 'chg7d')}</td>` : ''}
    <td class="hide-sm num">${compact(c.mcap)}</td>
    ${full ? `<td class="hide-md num muted">${compact(c.vol)}</td>` : ''}
    <td class="hide-sm spark-cell">${sparkSVG(c.spark)}</td>
    <td class="w0 hide-xs"><a class="btn btn-sm btn-soft" href="${href(c)}">Chart</a></td>
  </tr>`).join('')}</tbody></table></div>`;
}

/* ---------- live value updates (no re-render) ---------- */
function setFlash(el, num, text) {
  if (el.textContent === text) return;
  const last = parseFloat(el.dataset.last); el.textContent = text; el.dataset.last = num;
  if (!isNaN(last) && num !== last) { el.classList.remove('flash-up', 'flash-down'); void el.offsetWidth; el.classList.add(num > last ? 'flash-up' : 'flash-down'); }
}
function updateLive(root = document) {
  for (const el of root.querySelectorAll('[data-p]')) { const c = M.byId.get(el.dataset.p); if (c) setFlash(el, c.price, usd(c.price)); }
  for (const el of root.querySelectorAll('[data-c]')) {
    const c = M.byId.get(el.dataset.c); if (!c) continue;
    const v = c[el.dataset.k || 'chg24']; el.textContent = pct(v); el.classList.toggle('up', v >= 0); el.classList.toggle('down', v < 0);
  }
  for (const el of root.querySelectorAll('[data-needs-wallet]')) el.hidden = !MyWallet.addr;
  // BTC wallet value in USD follows the live BTC price
  const btcP = M.byId.get('bitcoin')?.price;
  for (const el of root.querySelectorAll('[data-btcusd]')) { const v = +el.dataset.btcusd; if (btcP && isFinite(v)) setFlash(el, v * btcP, '≈ ' + usd(v * btcP)); }
  const st = $('#status');
  if (st) {
    const L = { live: 'Live', delayed: 'Updated ~1 min', simulated: 'Offline · simulated', loading: 'Connecting…' };
    st.className = 'status ' + M.mode; st.querySelector('.status-txt').textContent = L[M.mode];
    st.title = { live: 'Streaming prices from Binance', delayed: 'Prices from CoinGecko, refreshed about every minute', simulated: 'Market APIs unreachable — prices are simulated', loading: '' }[M.mode];
  }
}

/* =====================================================================
   LANDING
   ===================================================================== */
function renderLanding() {
  document.body.classList.remove('in-app');
  const u = Auth.user(), cta = u ? '#/app' : '#/signup';
  const tradable = M.coins.filter(c => !STABLE.has(c.symbol));
  const btc = M.byId.get('bitcoin') || tradable[0], eth = M.byId.get('ethereum') || tradable[1], sol = M.byId.get('solana') || tradable[2];
  const tk = tradable.slice(0, 24).map(c => `<a class="tk" href="${cta}">${coinIcon(c, 22)}<b>${esc(c.symbol)}</b>${priceTag(c)}${chgTag(c)}</a>`).join('');
  const words = ['Watch', 'the', 'market.'].map((w, i) => `<span class="hw" style="--i:${i}">${w}</span>`).join(' ')
    + ` <span class="hw grad-text" style="--i:3">Own</span> <span class="hw grad-text" style="--i:4">your</span> <span class="hw grad-text" style="--i:5">Bitcoin.</span>`;

  app.innerHTML = `<div class="page-in">
  <header class="nav" id="nav"><div class="container nav-in">
    <a href="#/" class="brand">${LOGO}<span>Quantrade</span></a>
    <nav class="nav-links"><a data-scroll="markets">Markets</a><a data-scroll="features">Features</a><a data-scroll="how">How it works</a></nav>
    <div class="nav-cta">${u
      ? `<a class="btn btn-primary" href="#/app">Open dashboard ${icon('arrow')}</a>`
      : `<a class="btn btn-ghost" href="#/signin">Sign in</a><a class="btn btn-primary" href="#/signup">Get started</a>`}</div>
  </div></header>

  <section class="hero container">
    <div class="hero-copy">
      <span class="pill reveal"><span class="dot"></span>Markets open 24/7 · BTC <b>${priceTag(btc)}</b></span>
      <h1>${words}</h1>
      <p class="lead reveal" style="--d:.45s">Quantrade brings live prices and pro-grade charts for the top crypto assets into one simple dashboard — and lets you buy Bitcoin straight into your own wallet.</p>
      <div class="hero-cta reveal" style="--d:.55s">
        <a class="btn btn-primary btn-lg" href="${cta}">${u ? 'Open dashboard' : 'Get started'} ${icon('arrow')}</a>
        <button class="btn btn-ghost btn-lg" data-action="demo">${icon('bolt')} Try the live demo</button>
      </div>
      <div class="hero-stats reveal" style="--d:.65s">
        <div><b class="count" data-to="${tradable.length}" data-suf="+">0</b><span>Assets tracked live</span></div>
        <div><b>24/7</b><span>Always-on markets</span></div>
        <div><b>5</b><span>Chart timeframes</span></div>
        <div><b>0</b><span>Funds held by us</span></div>
      </div>
    </div>
    <div class="hero-visual reveal" style="--d:.3s">
      <div class="ring"></div>
      <div class="hv-card glass">
        <div class="hv-head">
          <div class="hv-coin">${coinIcon(btc, 42)}<div><b>${esc(btc.name)}</b><small>${esc(btc.symbol)} / USD · 7 days</small></div></div>
          <div class="hv-price"><b class="num" data-p="${btc.id}">${usd(btc.price)}</b>${chgTag(btc, 'chg24', 'pillc')}</div>
        </div>
        <div class="hv-chart chart" id="heroChart"></div>
        <div class="hv-tabs"><span>1H</span><span>1D</span><span class="on">1W</span><span>1M</span><span>1Y</span></div>
        <div class="hv-actions"><a class="btn btn-buy" href="${u ? '#/app/wallet' : cta}">Buy ${esc(btc.symbol)}</a><a class="btn btn-ghost" href="${u ? '#/app/coin/' + btc.id : cta}">View chart</a></div>
      </div>
      <div class="float glass f1"><span class="ok">${icon('shield')}</span><div><b>Your wallet, your keys</b><small>BTC goes straight to you</small></div></div>
      <div class="float glass f2">${coinIcon(sol, 30)}<div><b>${esc(sol.symbol)}</b>${chgTag(sol)}</div></div>
    </div>
  </section>

  <div class="ticker"><div class="ticker-track">${tk}<span aria-hidden="true" style="display:contents">${tk}</span></div></div>

  <section class="sec container" id="markets">
    <div class="sec-h reveal"><span class="eyebrow">Live markets</span><h2>The market, <span class="grad-text">in real time.</span></h2><p>Prices on this page update automatically as the market moves. Sign in for full charts and your watchlist.</p></div>
    <div class="card reveal">${marketTable(M.coins.slice(0, 8), { href: c => u ? '#/app/coin/' + c.id : '#/signup' })}
      <div style="text-align:center;margin-top:18px"><a class="link" href="${u ? '#/app/markets' : '#/signup'}">View all ${M.coins.length} markets →</a></div></div>
  </section>

  <section class="sec container" id="features">
    <div class="sec-h reveal"><span class="eyebrow">Why Quantrade</span><h2>Everything you need.<br><span class="grad-text">Nothing you don’t.</span></h2></div>
    <div class="bento">
      <div class="card feat span2 reveal"><div class="fi">${icon('candle')}</div><h3>Pro-grade charting</h3><p>Area and candlestick views across five timeframes, a live last-price marker and crosshair readouts on every candle.</p><div class="feat-art"><div class="chart feat-chart" id="featChart"></div></div></div>
      <div class="card feat reveal" style="--d:.08s"><div class="fi">${icon('bolt')}</div><h3>Real-time prices</h3><p>Streaming ticks update every number on screen the moment the market moves.</p>
        <div class="feat-art mini-list">${tradable.slice(0, 3).map(c => `<div class="mini-row">${coinIcon(c, 24)}<b>${esc(c.symbol)}</b>${priceTag(c)}</div>`).join('')}</div></div>
      <div class="card feat reveal"><div class="fi">${icon('plus')}</div><h3>Send straight to your wallet</h3><p>Buy in Cash App, scan your wallet’s QR code, and your Bitcoin lands in your own wallet. Quantrade never holds it.</p></div>
      <div class="card feat span2 reveal" style="--d:.08s"><div class="feat-split"><div><div class="fi">${icon('wallet')}</div><h3>Your wallet at a glance</h3><p>See your real Bitcoin balance and recent transactions, read live from the blockchain.</p></div>
        <div class="feat-wallet"><span class="mw-btc">₿</span><div><small>Your wallet</small><b class="num">Live balance</b></div>${icon('check')}</div></div></div>
      <div class="card feat reveal"><div class="fi">${icon('star')}</div><h3>Smart watchlists</h3><p>Star the assets you care about and keep them pinned to your dashboard.</p></div>
      <div class="card feat span2 reveal" style="--d:.08s"><div class="feat-split"><div><div class="fi">${icon('device')}</div><h3>Designed for every screen</h3><p>Desktop, tablet or phone — the layout adapts so your markets are always one tap away.</p></div>
        <div class="devices"><div class="dev d1"></div><div class="dev d2"></div><div class="dev d3"></div></div></div></div>
    </div>
  </section>

  <section class="sec container" id="how">
    <div class="sec-h reveal"><span class="eyebrow">How it works</span><h2>From sign-up to your wallet<br><span class="grad-text">in three steps.</span></h2></div>
    <div class="steps">
      <div class="card step reveal"><div class="n grad-text">01</div><h3>Create your account</h3><p>Sign up with the email your family linked to your Bitcoin wallet. Your wallet shows up automatically.</p></div>
      <div class="card step reveal" style="--d:.1s"><div class="n grad-text">02</div><h3>Watch the markets</h3><p>Follow live prices, charts and the day’s top movers across the leading assets.</p></div>
      <div class="card step reveal" style="--d:.2s"><div class="n grad-text">03</div><h3>Buy Bitcoin</h3><p>Buy in Cash App and send it to the wallet address Quantrade shows you. It lands in your own wallet.</p></div>
    </div>
  </section>

  <section class="container"><div class="cta glass reveal">
    <h2>Your Bitcoin,<br><span class="grad-text">in your wallet.</span></h2>
    <p>Open your Quantrade dashboard to follow the market and see your wallet.</p>
    <div class="hero-cta"><a class="btn btn-primary btn-lg" href="${cta}">${u ? 'Open dashboard' : 'Create free account'} ${icon('arrow')}</a><button class="btn btn-ghost btn-lg" data-action="demo">Explore the demo</button></div>
  </div></section>

  <footer class="foot"><div class="container foot-in">
    <div><a href="#/" class="brand">${LOGO}<span>Quantrade</span></a>
      <p>Quantrade never holds anyone’s funds: Bitcoin goes directly to your own wallet. Nothing here is financial advice. Market data from CoinGecko and Binance public APIs.</p></div>
    <div class="foot-links"><a data-scroll="markets">Markets</a><a data-scroll="features">Features</a><a href="#/signin">Sign in</a></div>
  </div></footer></div>`;

  // hero chart (BTC 7-day)
  const hc = makeChart($('#heroChart'), { mini: true });
  hc.set((btc.spark.length ? btc.spark : [btc.price, btc.price]).map((v, i, a) => ({ t: Date.now() - (a.length - 1 - i) * 36e5, o: v, h: v, l: v, c: v })));
  const fc = makeChart($('#featChart'), { mini: true, type: 'candle' });
  fc.set(synthCandles(eth.price, 48, 36e5, 'feat'));

  // reveal-on-scroll + counters
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; e.target.classList.add('in'); io.unobserve(e.target);
    $$('.count', e.target).forEach(countUp);
  }), { threshold: .12 });
  $$('.reveal', app).forEach(el => io.observe(el));

  // tilt + glare on hero card
  const hv = $('.hero-visual'), card = $('.hv-card');
  hv.addEventListener('pointermove', e => {
    const r = hv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.transform = `rotateY(${(x - .5) * 16}deg) rotateX(${(.5 - y) * 12}deg)`;
    card.style.setProperty('--gx', x * 100 + '%'); card.style.setProperty('--gy', y * 100 + '%');
  });
  hv.addEventListener('pointerleave', () => { card.style.transform = ''; });

  // spotlight on feature cards
  $('.bento').addEventListener('pointermove', e => {
    const f = e.target.closest('.feat'); if (!f) return; const r = f.getBoundingClientRect();
    f.style.setProperty('--mx', e.clientX - r.left + 'px'); f.style.setProperty('--my', e.clientY - r.top + 'px');
  });

  const nav = $('#nav'); const onScroll = () => nav.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  return {
    tick() { const b = M.byId.get(btc.id); if (b) hc.live(b.price); },
    destroy() { hc.destroy(); fc.destroy(); io.disconnect(); removeEventListener('scroll', onScroll); },
  };
}
function countUp(el) {
  const to = +el.dataset.to, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '', t0 = performance.now();
  const f = now => { const p = Math.min(1, (now - t0) / 1600); el.textContent = pre + (to * ease(p)).toFixed(dec) + suf; if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}

/* =====================================================================
   AUTH SCREEN
   ===================================================================== */
function renderAuth(mode) {
  document.body.classList.remove('in-app');
  const up = mode === 'signup';
  const tiles = ['bitcoin', 'ethereum', 'solana'].map(id => M.byId.get(id)).filter(Boolean);
  const fld = (id, label, type, ph, ac) => `<label class="fld"><span>${label}</span><div class="inp"><input id="${id}" name="${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" required>${type === 'password' ? `<button type="button" class="eye" data-eye aria-label="Show password">${icon('eye')}</button>` : ''}</div></label>`;
  app.innerHTML = `<div class="auth page-in">
    <div class="auth-art">
      <a href="#/" class="brand">${LOGO}<span>Quantrade</span></a>
      <div class="auth-copy"><h2>Your edge in<br><span class="grad-text">every market.</span></h2><p class="muted">Live prices, pro charts and your own Bitcoin wallet — all in one dashboard.</p></div>
      <div class="auth-tiles">${tiles.map(c => `<div class="glass tile"><div class="tile-h">${coinIcon(c, 26)}${esc(c.symbol)}</div>${priceTag(c)}${chgTag(c)}${sparkSVG(c.spark, 140, 40)}</div>`).join('')}</div>
    </div>
    <div class="auth-panel">
      <form class="auth-card glass" id="af" novalidate>
        <a href="#/" class="brand auth-mbrand">${LOGO}<span>Quantrade</span></a>
        <div class="seg wide"><a href="#/signin" class="${up ? '' : 'on'}">Sign in</a><a href="#/signup" class="${up ? 'on' : ''}">Create account</a></div>
        <h1>${up ? 'Create your account' : 'Welcome back'}</h1>
        <p class="muted">${up ? 'Use the email your family linked to your Bitcoin wallet.' : 'Sign in to open your dashboard.'}</p>
        ${up ? fld('name', 'Full name', 'text', 'Alex Morgan', 'name') : ''}
        ${fld('email', 'Email', 'email', 'you@example.com', 'email')}
        ${fld('pw', 'Password', 'password', up ? 'At least 8 characters' : 'Your password', up ? 'new-password' : 'current-password')}
        <div class="err" id="aerr" role="alert"></div>
        <button class="btn btn-primary btn-lg wide" type="submit" id="asub">${up ? 'Create account' : 'Sign in'} ${icon('arrow')}</button>
        <div class="or">or</div>
        <button type="button" class="btn btn-ghost btn-lg wide" data-action="demo">${icon('bolt')} Explore with a demo account</button>
        <p class="fine">Your account is saved in this browser only, so sign up once on each device you use.</p>
      </form>
    </div>
  </div>`;
  const form = $('#af'), err = $('#aerr');
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-eye]'); if (!b) return;
    const inp = b.previousElementSibling; inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const name = $('#name')?.value.trim() ?? '', email = $('#email').value.trim(), pw = $('#pw').value;
    const fail = m => { err.textContent = m; shake(form); };
    if (up && name.length < 2) return fail('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
    if (up && pw.length < 8) return fail('Use at least 8 characters for your password.');
    if (!pw) return fail('Please enter your password.');
    const btn = $('#asub'); btn.disabled = true;
    try {
      if (up) await Auth.signup(name, email, pw); else await Auth.signin(email, pw);
      const u = Auth.user();
      toast(up ? `Welcome to Quantrade, ${u.name.split(' ')[0]}!` : `Welcome back, ${u.name.split(' ')[0]}.`, 'ok');
      go('#/app/overview');
    } catch (x) { fail(x.message); btn.disabled = false; }
  });
  setTimeout(() => (up ? $('#name') : $('#email'))?.focus(), 350);
  return {};
}

/* =====================================================================
   DASHBOARD SHELL
   ===================================================================== */
const NAV = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'markets', label: 'Markets', icon: 'chart' },
];
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const VIEWS = {
  overview: { title: u => `${greet()}, ${u.name.split(' ')[0]}`, sub: 'Here’s what the market is doing right now.', render: viewOverview },
  wallet: { title: () => 'Wallet', sub: 'Your own Bitcoin wallet, read live from the blockchain.', render: viewWallet },
  markets: { title: () => 'Markets', sub: 'Live prices for the top crypto assets by market cap.', render: viewMarkets },
  coin: { title: (u, id) => (M.byId.get(id) || M.byId.get('bitcoin'))?.name || 'Chart', sub: 'Live price, chart and 24h stats.', render: viewCoin, nav: 'markets' },
};

function renderApp(name, arg) {
  document.body.classList.add('in-app');
  const u = Auth.user();
  if (!$('#shell')) {
    const initials = u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    app.innerHTML = `<div class="shell page-in" id="shell">
      <aside class="side">
        <a class="brand" href="#/">${LOGO}<span>Quantrade</span></a>
        <nav class="side-nav">${NAV.map(n => `<a href="#/app/${n.id}" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}</nav>
        <div class="side-card glass"><span class="muted">Bitcoin</span><b class="num" data-p="bitcoin">—</b><span class="muted">24h ${chgTag(M.byId.get('bitcoin') || { id: 'bitcoin' })}</span><button class="btn btn-buy btn-sm" data-action="buybtc" data-needs-wallet hidden>${icon('plus')} Buy BTC</button></div>
        <button class="side-out" data-action="logout">${icon('logout')}<span>Sign out</span></button>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><h1 id="vtitle"></h1><p class="muted" id="vsub"></p></div>
          <div class="tb-right">
            <div class="search">${icon('search')}<input id="q" placeholder="Search assets…" autocomplete="off" aria-label="Search assets"><kbd>/</kbd><div class="search-pop" id="qpop"></div></div>
            <span class="status loading" id="status"><span class="dot"></span><span class="status-txt">Connecting…</span></span>
            <div class="avatar-wrap"><button class="avatar" data-action="menu" aria-label="Account menu">${esc(initials)}</button>
              <div class="menu-pop" id="menu"><div class="mp-h"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div>
                <a href="#/app/wallet">${icon('wallet')} Wallet</a><a href="#/">${icon('home')} Home page</a>
                <button class="danger" data-action="logout">${icon('logout')} Sign out</button></div></div>
          </div>
        </header>
        <div id="view"></div>
      </main>
      <nav class="bottom-nav glass">${NAV.map(n => `<a href="#/app/${n.id}" data-nav="${n.id}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}</nav>
    </div>`;
    bindSearch();
  }
  const v = VIEWS[name] ? name : 'overview';
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (VIEWS[v].nav || v)));
  $('#menu')?.classList.remove('open');
  $('#vtitle').textContent = VIEWS[v].title(u, arg);
  $('#vsub').textContent = VIEWS[v].sub;
  const host = document.createElement('div'); host.className = 'vhost';
  $('#view').replaceChildren(host);
  scrollTo({ top: 0 });
  const ctrl = VIEWS[v].render(host, arg) || {};
  updateLive();
  return ctrl;
}

function bindSearch() {
  const inp = $('#q'), pop = $('#qpop'); let res = [], idx = 0;
  const draw = () => {
    const v = inp.value.trim().toLowerCase(); if (!v) { pop.classList.remove('open'); return; }
    res = M.coins.filter(c => c.name.toLowerCase().includes(v) || c.symbol.toLowerCase().startsWith(v)).slice(0, 6);
    idx = clamp(idx, 0, Math.max(0, res.length - 1));
    pop.innerHTML = res.length ? res.map((c, i) => `<div class="sp-item ${i === idx ? 'act' : ''}" data-go="#/app/coin/${esc(c.id)}">${coinIcon(c, 28)}<div><b>${esc(c.symbol)}</b> <span class="muted">${esc(c.name)}</span></div>${priceTag(c)}</div>`).join('') : '<div class="sp-empty muted">No assets match that search.</div>';
    pop.classList.add('open');
  };
  inp.addEventListener('input', () => { idx = 0; draw(); });
  inp.addEventListener('focus', draw);
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = clamp(idx + (e.key === 'ArrowDown' ? 1 : -1), 0, res.length - 1); draw(); }
    else if (e.key === 'Enter' && res[idx]) { go('#/app/coin/' + res[idx].id); closeSearch(); }
    else if (e.key === 'Escape') closeSearch();
  });
}
function closeSearch() { const q = $('#q'); if (!q) return; q.value = ''; q.blur(); $('#qpop').classList.remove('open'); }

/* ---------- shared dashboard pieces ---------- */
const ccHead = c => `<div class="cc-coin">${coinIcon(c, 46)}<div><div class="cc-name">${esc(c.name)} <span class="muted">${esc(c.symbol)} / USD</span></div><div class="cc-price"><b class="num" data-p="${esc(c.id)}">${usd(c.price)}</b>${chgTag(c, 'chg24', 'pillc')}</div></div></div>`;
const ccStats = c => [['24h high', usd(c.high)], ['24h low', usd(c.low)], ['24h volume', compact(c.vol)], ['Market cap', compact(c.mcap)]].map(([k, v]) => `<div><small>${k}</small><b class="num">${v}</b></div>`).join('');
function chartCard(c, o = {}) {
  return `<div class="card chart-card">
    <div class="cc-head"><div data-cch>${ccHead(c)}</div>
      <div class="cc-ctrl">
        ${o.select ? `<select class="select" data-coinsel aria-label="Choose asset">${M.coins.map(x => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.symbol)} · ${esc(x.name)}</option>`).join('')}</select>` : ''}
        <div class="seg">${Object.keys(TF).map(k => `<button data-tf="${k}" class="${k === '1D' ? 'on' : ''}">${k}</button>`).join('')}</div>
        <div class="seg"><button data-type="area" class="on" aria-label="Area chart" title="Area">${icon('chart')}</button><button data-type="candle" aria-label="Candlestick chart" title="Candles">${icon('candle')}</button></div>
      </div>
    </div>
    ${o.picker ? `<div class="cc-picker">${o.picker.map(p => `<button class="chip ${p.id === c.id ? 'on' : ''}" data-pick="${esc(p.id)}">${coinIcon(p, 24)}${esc(p.symbol)}</button>`).join('')}</div>` : ''}
    ${o.stats ? `<div class="cc-stats" data-ccs>${ccStats(c)}</div>` : ''}
    <div class="chart big loading" data-chart><div class="chart-load"><span class="spinner"></span></div></div>
    <div class="cc-foot muted"><span data-src>Loading chart…</span><span>Hover the chart for details</span></div>
  </div>`;
}
function mountChart(root, coinId) {
  let coin = M.byId.get(coinId), tf = '1D', type = 'area', alive = true, req = 0;
  const box = $('[data-chart]', root), src = $('[data-src]', root);
  const ch = makeChart(box, { fmtT: fFull });
  async function load() {
    const my = ++req; box.classList.add('loading');
    const r = await getCandles(coin, tf);
    if (!alive || my !== req) return;
    ch.fmtAxis = TF[tf].ax; ch.set(r.data, type); box.classList.remove('loading');
    src.textContent = r.src === 'Simulated' ? 'Illustrative chart — live candles unavailable for this asset' : `Source: ${r.src} · ${tf}`;
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-tf]');
    if (b) { tf = b.dataset.tf; $$('[data-tf]', root).forEach(x => x.classList.toggle('on', x === b)); load(); return; }
    const t = e.target.closest('[data-type]');
    if (t) { type = t.dataset.type; $$('[data-type]', root).forEach(x => x.classList.toggle('on', x === t)); ch.set(ch.data, type); return; }
    const p = e.target.closest('[data-pick]');
    if (p) { coin = M.byId.get(p.dataset.pick) || coin; $$('[data-pick]', root).forEach(x => x.classList.toggle('on', x === p)); $('[data-cch]', root).innerHTML = ccHead(coin); load(); }
  });
  const sel = $('[data-coinsel]', root); if (sel) sel.addEventListener('change', () => go('#/app/coin/' + sel.value));
  load();
  return { tick() { const c = M.byId.get(coin.id); if (c) ch.live(c.price); }, destroy() { alive = false; ch.destroy(); } };
}
function coinRows(list) {
  return list.map(c => `<div class="row" data-go="#/app/coin/${esc(c.id)}">${coinIcon(c, 38)}<div class="row-n"><b>${esc(c.symbol)}</b><small>${esc(c.name)}</small></div>${sparkSVG(c.spark, 72, 30)}<div class="r">${priceTag(c, 'strong')}${chgTag(c)}</div></div>`).join('');
}

/* ---------- Overview ---------- */
function viewOverview(el) {
  const tradable = M.coins.filter(c => !STABLE.has(c.symbol));
  const picker = tradable.slice(0, 8), first = picker[0];
  const movers = k => { const l = tradable.slice(0, 50).filter(c => c.chg24 != null).sort((x, y) => k === 'g' ? y.chg24 - x.chg24 : x.chg24 - y.chg24).slice(0, 5); return coinRows(l); };
  const watchHTML = () => { const l = acct().watch.map(id => M.byId.get(id)).filter(Boolean); return l.length ? coinRows(l) : empty('star', 'Your watchlist is empty', 'Star any asset in Markets to pin it here.'); };

  el.innerHTML = `
  <section class="card mw ov-wallet" id="ovw"></section>
  <section class="ov-grid">
    ${chartCard(first, { picker })}
    <div class="card"><div class="card-h"><h3>Watchlist</h3><a class="link" href="#/app/markets">Manage →</a></div><div id="wl">${watchHTML()}</div></div>
  </section>
  <section class="ov-grid">
    <div class="card"><div class="card-h"><h3>Top markets</h3><a href="#/app/markets" class="link">View all →</a></div>${marketTable(M.coins.slice(0, 8), { href: c => '#/app/coin/' + c.id })}</div>
    <div class="card"><div class="card-h"><h3>Top movers · 24h</h3><div class="seg" id="mv"><button class="on" data-m="g">Gainers</button><button data-m="l">Losers</button></div></div><div id="mvl">${movers('g')}</div></div>
  </section>`;

  const w = walletCard($('#ovw', el), false);
  const cc = mountChart(el, first.id);
  $('#mv', el).addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    $$('[data-m]', el).forEach(x => x.classList.toggle('on', x === b)); $('#mvl', el).innerHTML = movers(b.dataset.m);
  });
  return {
    tick() { cc.tick(); w.tick(); },
    destroy() { cc.destroy(); w.destroy(); },
    onWatch() { $('#wl', el).innerHTML = watchHTML(); },
    onWallet: w.draw,
  };
}

/* ---------- Markets ---------- */
function viewMarkets(el) {
  let q = '', filter = 'all', sort = { k: 'rank', d: 1 };
  el.innerHTML = `<div class="card">
    <div class="card-h">
      <div class="seg" id="mf">${[['all', 'All assets'], ['watch', 'Watchlist'], ['gain', 'Gainers'], ['lose', 'Losers']].map(([k, l], i) => `<button data-f="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
      <div class="search inline">${icon('search')}<input id="mq" placeholder="Filter by name or symbol" autocomplete="off" aria-label="Filter markets"></div>
    </div><div id="mt"></div></div>`;
  const draw = () => {
    const w = new Set(acct().watch);
    let list = M.coins.filter(c => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    if (filter === 'watch') list = list.filter(c => w.has(c.id));
    if (filter === 'gain') list = list.filter(c => c.chg24 > 0);
    if (filter === 'lose') list = list.filter(c => c.chg24 < 0);
    const { k, d } = sort;
    list = list.slice().sort((x, y) => k === 'name' ? d * x.name.localeCompare(y.name) : d * ((x[k] ?? -Infinity) - (y[k] ?? -Infinity)));
    $('#mt', el).innerHTML = list.length
      ? marketTable(list, { full: true, watch: w, sort, href: c => '#/app/coin/' + c.id })
      : empty(filter === 'watch' ? 'star' : 'search', filter === 'watch' ? 'No assets on your watchlist yet' : 'No assets match your filter', filter === 'watch' ? 'Tap the star next to any asset to add it.' : 'Try a different name or symbol.');
  };
  el.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; sort = { k, d: sort.k === k ? -sort.d : (k === 'name' || k === 'rank' ? 1 : -1) }; draw(); return; }
    const f = e.target.closest('[data-f]');
    if (f) {
      filter = f.dataset.f; $('[data-f]', el).forEach(x => x.classList.toggle('on', x === f));
      sort = filter === 'gain' ? { k: 'chg24', d: -1 } : filter === 'lose' ? { k: 'chg24', d: 1 } : { k: 'rank', d: 1 };
      draw();
    }
  });
  $('#mq', el).addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
  draw();
  return { onWatch() { if (filter === 'watch') draw(); } };
}

/* ---------- Coin detail (chart + 24h stats) ---------- */
function viewCoin(el, id) {
  const coin = M.byId.get(id) || M.byId.get('bitcoin') || M.coins[0];
  el.innerHTML = `<div class="coin-page">${chartCard(coin, { select: true, stats: true })}
    ${coin.id === 'bitcoin' ? `<div class="card coin-buy" data-needs-wallet hidden><span class="mw-btc">₿</span><div><b>Buy Bitcoin</b><small class="muted">Buy in Cash App and send it straight to your own wallet.</small></div><button class="btn btn-buy" data-action="buybtc">${icon('plus')} Buy BTC</button></div>` : ''}
  </div>`;
  const cc = mountChart(el, coin.id);
  return {
    tick() { cc.tick(); const s = $('[data-ccs]', el); if (s) s.innerHTML = ccStats(M.byId.get(coin.id) || coin); },
    destroy: cc.destroy,
  };
}

/* ---------- My Bitcoin wallet ----------
   Each family member's own address comes from /api/wallet, which reads the
   private FAMILY_WALLETS list on the server. This page only reads the public
   on-chain balance; Quantrade can never move funds from these wallets. */
const shortAddr = a => a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a;
const btcAmt = n => (n == null || !isFinite(n)) ? '—' : nf(2, 8).format(n) + ' BTC';
const btcPrice = () => M.byId.get('bitcoin')?.price || 0;

const MyWallet = { email: null, addr: null, status: 'idle', p: null }; // status: idle | loading | ready | error
function resetMyWallet() { Object.assign(MyWallet, { email: null, addr: null, status: 'idle', p: null }); }
function loadMyWallet(force) {
  const u = Auth.user(); if (!u) return Promise.resolve();
  if (!force && MyWallet.email === u.email && MyWallet.status !== 'error') return MyWallet.p;
  Object.assign(MyWallet, { email: u.email, addr: null, status: 'loading' });
  MyWallet.p = (async () => {
    let addr = null, ok = false;
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
      // POST so the email isn't written into URLs and server logs
      const r = await fetch('/api/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email }), signal: c.signal }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      addr = (await r.json()).address || null; ok = true;
    } catch (e) { console.warn('[quantrade] wallet lookup failed:', e.message || e); }
    if (MyWallet.email !== u.email) return; // signed out or switched account meanwhile
    MyWallet.addr = addr; MyWallet.status = ok ? 'ready' : 'error';
    updateLive(); current?.onWallet?.();
  })();
  return MyWallet.p;
}

// Public block explorers (read-only); mempool.space first, Blockstream as backup
const BTC_APIS = [['mempool.space', 'https://mempool.space/api'], ['blockstream.info', 'https://blockstream.info/api']];
const btcCache = new Map();
function fetchBtcWallet(addr, force) {
  const hit = btcCache.get(addr);
  if (hit && (hit.busy || (!force && Date.now() - hit.at < 60000))) return hit.p;
  const entry = { at: Date.now(), busy: true };
  entry.p = (async () => {
    let last;
    for (const [host, base] of BTC_APIS) {
      try {
        const get = async p => { const r = await fetchT(base + p, 8000); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
        const [info, txs] = await Promise.all([get(`/address/${addr}`), get(`/address/${addr}/txs`)]);
        const sat = s => (s.funded_txo_sum - s.spent_txo_sum) / 1e8;
        return {
          at: Date.now(), host,
          conf: sat(info.chain_stats), pending: sat(info.mempool_stats),
          txs: txs.slice(0, 5).map(tx => {
            const inn = tx.vout.reduce((s, o) => s + (o.scriptpubkey_address === addr ? o.value : 0), 0);
            const out = tx.vin.reduce((s, i) => s + (i.prevout?.scriptpubkey_address === addr ? i.prevout.value : 0), 0);
            return { id: tx.txid, net: (inn - out) / 1e8, ok: tx.status.confirmed, t: tx.status.block_time ? tx.status.block_time * 1000 : Date.now() };
          }),
        };
      } catch (e) { last = e; }
    }
    throw last || new Error('Explorer unavailable');
  })();
  entry.p.then(() => { entry.busy = false; entry.at = Date.now(); }, () => btcCache.delete(addr));
  btcCache.set(addr, entry);
  return entry.p;
}

function copyText(s) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
  const t = Object.assign(document.createElement('textarea'), { value: s }); // fallback for plain http
  t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select();
  try { document.execCommand('copy'); } finally { t.remove(); }
  return Promise.resolve();
}

// full: the Wallet page (address, activity, explorer); otherwise the compact Overview card
function walletCard(box, full) {
  let data = null, err = null, loading = false, alive = true, forAddr = null;
  const load = async force => {
    const a = MyWallet.addr; if (!a || loading) return;
    loading = true; forAddr = a; if (force) draw();
    try { data = await fetchBtcWallet(a, force); err = null; } catch { err = 'Couldn’t reach the blockchain explorer. Check your connection and try again.'; }
    loading = false; if (alive) draw();
  };
  const head = `<div class="card-h"><h3>My Bitcoin wallet</h3>${full ? '<span class="tag">Read-only</span>' : '<a class="link" href="#/app/wallet">View wallet →</a>'}</div>`;
  const draw = () => {
    if (!alive) return;
    const a = MyWallet.addr, p = btcPrice();
    if (MyWallet.status === 'idle' || MyWallet.status === 'loading') {
      box.innerHTML = head + '<div class="mw-bal"><span class="spinner"></span><span class="muted">Loading your wallet…</span></div>'; return;
    }
    if (MyWallet.status === 'error') {
      box.innerHTML = head + `<div class="mw-bal"><span class="muted">Couldn’t load your wallet right now.</span></div><div class="mw-btns"><button class="btn btn-ghost" data-mw="retry">${icon('clock')} Try again</button></div>`; return;
    }
    if (!a) {
      box.innerHTML = head + empty('wallet', 'No wallet linked yet', `Ask the family admin to link ${Auth.user()?.email || 'your email'} to your Bitcoin wallet.`); return;
    }
    if (forAddr !== a) { data = null; err = null; load(); }
    const bal = data ? data.conf + data.pending : null;
    box.innerHTML = head + `
      ${full ? `<div class="mw-addr"><span class="mw-btc">₿</span><div class="mw-a"><small>Your address</small><b title="${esc(a)}">${esc(shortAddr(a))}</b></div>
        <button class="mw-ic" data-mw="copy" title="Copy address" aria-label="Copy address">${icon('doc')}</button></div>` : ''}
      <div class="mw-bal">${err && !data ? `<span class="muted">${esc(err)}</span>`
        : !data ? '<span class="spinner"></span><span class="muted">Checking the blockchain…</span>'
        : `${full ? '' : '<span class="mw-btc">₿</span>'}<b class="num">${btcAmt(bal)}</b><span class="muted num" data-btcusd="${bal}">≈ ${p ? usd(bal * p) : '—'}</span>${data.pending ? `<span class="mw-pend">${icon('clock')} ${btcAmt(data.pending)} unconfirmed</span>` : ''}`}</div>
      <div class="mw-btns"><button class="btn btn-buy" data-action="buybtc">${icon('plus')} Buy BTC</button>
        ${full ? `<button class="btn btn-ghost" data-mw="refresh" ${loading ? 'disabled' : ''}>${icon('clock')} Refresh</button>
        <a class="btn btn-ghost" href="https://mempool.space/address/${esc(a)}" target="_blank" rel="noopener">${icon('arrow')} Explorer</a>` : ''}</div>
      ${full && data ? `<div class="mw-h">Recent activity</div>${data.txs.length ? data.txs.map(tx => `<a class="tx" href="https://mempool.space/tx/${esc(tx.id)}" target="_blank" rel="noopener">
          <span class="tx-ic ${tx.net >= 0 ? 'in' : 'out'}">${icon(tx.net >= 0 ? 'down' : 'up')}</span>
          <div class="tx-m"><b>${tx.net >= 0 ? 'Received' : 'Sent'} BTC</b><small>${esc(fTx(tx.t))}</small></div>
          <div class="tx-r"><b class="num ${tx.net >= 0 ? 'up' : ''}">${tx.net >= 0 ? '+' : ''}${btcAmt(tx.net)}</b><span class="tx-st ${tx.ok ? '' : 'pend'}">${icon(tx.ok ? 'check' : 'clock')} ${tx.ok ? 'Confirmed' : 'Pending'}</span></div></a>`).join('')
        : empty('wallet', 'No transactions yet', 'Bitcoin you buy or receive will show up here.')}` : ''}
      ${full ? `<p class="fine mw-fine">Quantrade can see this public balance but can never move funds from your wallet.${data ? ` Data from ${esc(data.host)}.` : ''}</p>` : ''}`;
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-mw]'); if (!b) return;
    const k = b.dataset.mw;
    if (k === 'refresh') load(true);
    else if (k === 'retry') { loadMyWallet(true); draw(); }
    else if (k === 'copy') copyText(MyWallet.addr || '').then(() => toast('Address copied.', 'ok', 'doc'), () => toast('Couldn’t copy — select the address and copy it manually.', 'err'));
  });
  draw();
  return {
    draw,
    tick() { if (data && !loading && Date.now() - data.at > 60000) load(true); },
    destroy() { alive = false; },
  };
}

const fTx = t => { const d = new Date(t); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', ''); };

// QR code library, loaded only when the Buy window opens; the address and Copy button work without it
let qrLib = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return qrLib ||= new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', async: true });
    s.onload = () => window.qrcode ? res(window.qrcode) : rej(new Error('QR library missing'));
    s.onerror = () => { qrLib = null; rej(new Error('QR library failed to load')); };
    document.head.appendChild(s);
  });
}
function qrSVG(qrcode, text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" role="img" aria-label="QR code of your wallet address"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
// address split into groups of 4 so it's easy to compare character by character
const addrGroups = a => a.match(/.{1,4}/g).map(g => `<span>${esc(g)}</span>`).join('');

// Buy BTC: buy in Cash App, then send it to this person's own wallet address
function openBuyBtc() {
  if ($('.modal-back') || !Auth.user()) return;
  if (MyWallet.status === 'loading') { toast('Still loading your wallet — try again in a moment.', 'err', 'wallet'); return; }
  const addr = MyWallet.addr;
  if (!addr) { toast('No Bitcoin wallet is linked to your account yet.', 'err', 'wallet'); return; }
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal glass buy-modal" role="dialog" aria-modal="true" aria-labelledby="btitle">
    <button class="modal-x" data-close aria-label="Close">${icon('x')}</button>
    <div><h3 id="btitle">Buy Bitcoin with Cash App</h3><p class="muted">Buy in Cash App, then send it to your own wallet below so it shows up here.</p></div>
    <ol class="how">
      <li><b>Buy Bitcoin in Cash App</b><span class="muted">Open Cash App, go to Bitcoin and buy the amount you want.</span></li>
      <li><b>Send it to your wallet</b><span class="muted">In Cash App, choose to send or withdraw Bitcoin, then scan this QR code or paste the address.</span></li>
      <li><b>Check and confirm</b><span class="muted">Make sure the first and last few characters match. It appears on your Wallet page once the network confirms it, usually 10–60 minutes.</span></li>
    </ol>
    <div class="buy-note" role="note">${icon('bolt')}<span><b>Buy Bitcoin on your Cash App before scanning.</b> Scanning only fills in the address — it doesn’t buy anything.</span></div>
    <div class="qr" id="bqr"><span class="spinner"></span></div>
    <div class="addr-full" title="Your Bitcoin address">${addrGroups(addr)}</div>
    <button class="btn btn-buy btn-lg wide" id="bcopy">${icon('doc')} Copy address</button>
    <p class="fine">Only send Bitcoin (BTC) to this address. Always copy and paste it — never type it by hand. Cash App may charge a small network fee.</p>
  </div>`;
  document.body.appendChild(back);
  const qrBox = $('#bqr', back);
  loadQrLib().then(q => { qrBox.innerHTML = qrSVG(q, addr); }, () => { qrBox.remove(); });
  const close = () => { document.removeEventListener('keydown', onKey); back.classList.add('out'); setTimeout(() => back.remove(), 240); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', e => {
    if (e.target === back || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('#bcopy');
    if (b) copyText(addr).then(() => { b.innerHTML = `${icon('check')} Copied`; toast('Address copied — paste it in Cash App.', 'ok', 'doc'); setTimeout(() => { b.innerHTML = `${icon('doc')} Copy address`; }, 2500); },
      () => toast('Couldn’t copy — press and hold the address to copy it.', 'err'));
  });
  document.addEventListener('keydown', onKey);
}

/* ---------- Wallet page ---------- */
function viewWallet(el) {
  el.innerHTML = `<div class="wallet-grid">
    <div class="card mw" id="mwc"></div>
    <div class="card"><div class="card-h"><h3>How buying works</h3></div>
      <ol class="how">
        <li><b>Buy Bitcoin in Cash App</b><span class="muted">Buy the amount you want in Cash App’s Bitcoin tab.</span></li>
        <li><b>Send it to your wallet</b><span class="muted">Tap Buy BTC here to get your address and QR code, then send from Cash App to it.</span></li>
        <li><b>It shows up here</b><span class="muted">Your balance updates once the network confirms it, usually 10–60 minutes.</span></li>
      </ol>
      <p class="fine mw-fine">Quantrade never holds your money or your Bitcoin.</p></div>
  </div>`;
  const w = walletCard($('#mwc', el), true);
  return { tick: w.tick, destroy: w.destroy, onWallet: w.draw };
}

/* =====================================================================
   ROUTER & BOOT
   ===================================================================== */
function route() {
  try { current?.destroy?.(); } catch (e) { console.error(e); }
  current = null;
  const [path] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean), user = Auth.user();
  if (parts[0] === 'app') {
    if (!user) { location.replace('#/signin'); return; }
    loadMyWallet();
    current = renderApp(parts[1] || 'overview', parts[2] && decodeURIComponent(parts[2]));
  } else if (parts[0] === 'signin' || parts[0] === 'signup') {
    if (user) { location.replace('#/app/overview'); return; }
    scrollTo({ top: 0 }); current = renderAuth(parts[0]);
  } else {
    scrollTo({ top: 0 }); current = renderLanding();
  }
  updateLive();
}

document.addEventListener('click', e => {
  const t = e.target;
  if (!t.closest('.avatar-wrap')) $('#menu')?.classList.remove('open');
  const star = t.closest('[data-star]');
  if (star) { e.preventDefault(); e.stopPropagation(); toggleWatch(star.dataset.star, star); return; }
  const act = t.closest('[data-action]');
  if (act) {
    const a = act.dataset.action;
    if (a === 'demo') { Auth.demo(); toast('Welcome to the demo — your portfolio is ready to explore.', 'ok', 'bolt'); go('#/app/overview'); }
    else if (a === 'logout') { Auth.signout(); resetMyWallet(); toast('You’ve been signed out.', 'ok'); go('#/'); }
    else if (a === 'menu') $('#menu')?.classList.toggle('open');
    else if (a === 'buybtc') openBuyBtc();
    return;
  }
  const sc = t.closest('[data-scroll]');
  if (sc) { e.preventDefault(); document.getElementById(sc.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }); return; }
  const g = t.closest('[data-go]');
  if (g && !t.closest('a, button')) { closeSearch(); go(g.dataset.go); }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { const q = $('#q'); if (q) { e.preventDefault(); q.focus(); } }
});
addEventListener('hashchange', route);

let booted = false;
async function boot() {
  app.innerHTML = `<div class="splash">${LOGO}</div>`;
  await Promise.race([loadMarkets(), sleep(7000)]);
  if (!M.coins.length) useSeed();
  booted = true;
  route();
  connectWS();
  // refresh the CoinGecko snapshot often while the live stream is unavailable
  setInterval(() => { if (M.mode !== 'live' || Date.now() - M.lastSnap > 18e4) loadMarkets(); }, 45000);
  setInterval(simTick, 1500);
  setInterval(() => {
    if (document.hidden) return;
    if (M.dirty) { M.dirty = false; updateLive(); }
    try { current?.tick?.(); } catch (e) { console.error(e); }
  }, 1000);
}
boot();
