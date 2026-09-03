// Server-authoritative game math for the Edge Functions (spin, gamble).
//
// This is a byte-for-byte port of the math embedded in nova-casino.html
// (window.__gameMath / __fruitMath / __fancyMath / __bookMath / localCard /
// resolveLocalGamble), not a reimplementation. The non-negotiable product rule
// is that RTP must never silently drift between guest mode and server mode —
// keeping the exact same formulas, weights, and calibration constants here is
// how that is guaranteed rather than merely claimed. If the client-side math
// ever changes, this file must change identically in the same commit.
//
// Plain ESM, no Deno-specific APIs (only the standard `crypto.getRandomValues`
// global, present in both Deno and Node 19+), so it can be imported unmodified
// by the Deno Edge Functions and also executed directly under Node for testing
// (see supabase/functions/_shared/math.test.js).

export function cryptoFloat() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

export function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Shark Abyss (js/game-math.js)
// ---------------------------------------------------------------------------
export const STAKES_CENTS = [10, 20, 30, 40, 50, 80, 100];
export const GAME_KEY = 'shark-abyss';
export const PAYLINES = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
  [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [0, 0, 1, 0, 0], [3, 3, 2, 3, 3],
  [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [1, 2, 3, 2, 1], [2, 1, 0, 1, 2],
  [0, 1, 1, 1, 0], [3, 2, 2, 2, 3], [1, 1, 0, 1, 1], [2, 2, 3, 2, 2],
  [0, 1, 2, 3, 3], [3, 2, 1, 0, 0], [0, 1, 0, 1, 0], [3, 2, 3, 2, 3],
];
export const SYMBOLS = {
  SHARK: { glyph: '🦈', weight: 5, pays: [0, 0, 58.8, 147, 490] },
  DIVER: { glyph: '🤿', weight: 8, pays: [0, 0, 39.2, 88.2, 254.8] },
  TURTLE: { glyph: '🐢', weight: 11, pays: [0, 0, 24.5, 58.8, 147] },
  FISH: { glyph: '🐠', weight: 15, pays: [0, 0, 19.6, 39.2, 88.2] },
  SHELL: { glyph: '🐚', weight: 18, pays: [0, 0, 12.74, 25.48, 58.8] },
  PEARL: { glyph: '⚪', weight: 20, pays: [0, 0, 9.8, 18.62, 37.24] },
  OCTO: { glyph: '🐙', weight: 0, pays: [0, 0, 0, 0, 0], scatter: true },
};
const BASE_SYMBOL_KEYS = ['SHARK', 'DIVER', 'TURTLE', 'FISH', 'SHELL', 'PEARL'];
const BASE_WEIGHTS = BASE_SYMBOL_KEYS.map((k) => SYMBOLS[k].weight);
const REVEAL_SYMBOLS = ['SHARK', 'DIVER', 'TURTLE', 'FISH'];
const LINE_CALIBRATION = 0.997;

function pickWeighted(rng = cryptoFloat) {
  const total = BASE_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < BASE_SYMBOL_KEYS.length; i++) { r -= BASE_WEIGHTS[i]; if (r <= 0) return BASE_SYMBOL_KEYS[i]; }
  return 'PEARL';
}
function randint(max, rng = cryptoFloat) { return Math.min(max - 1, Math.floor(rng() * max)); }

export function createGrid({ rng = cryptoFloat, scatterReelChance = 0.09, mysteryChance = 0.18 } = {}) {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 4 }, () => pickWeighted(rng)));
  for (let c = 0; c < 5; c++) if (rng() < scatterReelChance) grid[c][randint(4, rng)] = 'OCTO';
  const mystery = [];
  if (rng() < mysteryChance) {
    const col = 1 + randint(4, rng);
    const len = 2 + randint(3, rng);
    const start = randint(5 - len, rng);
    const reveal = REVEAL_SYMBOLS[randint(REVEAL_SYMBOLS.length, rng)];
    for (let r = start; r < Math.min(4, start + len); r++) if (grid[col][r] !== 'OCTO') { grid[col][r] = reveal; mystery.push([col, r]); }
  }
  return { grid, mystery };
}

export function evaluateGrid(grid, stakeCents, { multiplier = 1 } = {}) {
  let rawLineWinCents = 0; const wins = []; const lineBetCents = stakeCents / PAYLINES.length;
  PAYLINES.forEach((line, lineIndex) => {
    const first = grid[0][line[0]]; if (SYMBOLS[first]?.scatter) return;
    let count = 1; for (let c = 1; c < 5; c++) { if (grid[c][line[c]] === first) count++; else break; }
    const multiple = SYMBOLS[first]?.pays[count - 1] || 0;
    if (count >= 3 && multiple > 0) {
      const raw = multiple * lineBetCents * multiplier * LINE_CALIBRATION; rawLineWinCents += raw;
      wins.push({ lineIndex, symbol: first, count, rawAmountCents: raw, cells: Array.from({ length: count }, (_, c) => [c, line[c]]) });
    }
  });
  const scatters = []; grid.forEach((col, c) => col.forEach((s, r) => { if (s === 'OCTO') scatters.push([c, r]); }));
  const scatterCount = scatters.length;
  const freeSpins = scatterCount === 3 ? 8 : scatterCount === 4 ? 10 : scatterCount >= 5 ? 12 : 0;
  const scatterWinCents = scatterCount === 3 ? stakeCents * 2 : scatterCount === 4 ? stakeCents * 10 : scatterCount >= 5 ? stakeCents * 50 : 0;
  if (scatterWinCents) wins.push({ lineIndex: -1, symbol: 'OCTO', count: scatterCount, rawAmountCents: scatterWinCents, cells: scatters });
  const totalCents = Math.max(0, Math.round(rawLineWinCents + scatterWinCents));
  const lineWinCents = Math.max(0, Math.round(rawLineWinCents));
  wins.forEach((w) => (w.amountCents = Math.max(0, Math.round(w.rawAmountCents))));
  return { totalCents, lineWinCents, scatterWinCents, wins, freeSpins, scatterCount };
}

export function generateSpin({ stakeCents, isFreeSpin = false, multiplier = 1, rng = cryptoFloat } = {}) {
  const { grid, mystery } = createGrid({ rng, mysteryChance: isFreeSpin ? 0.45 : 0.18 });
  const result = evaluateGrid(grid, stakeCents, { multiplier });
  return {
    id: randomId(), createdAt: Date.now(), gameKey: GAME_KEY, stakeCents, isFreeSpin, multiplier, grid, mystery,
    ...result,
    nextMultiplier: isFreeSpin && mystery.length ? Math.min(10, multiplier + 1) : multiplier,
  };
}

export function nextFeatureState(previous, spin) {
  const current = previous && previous.remaining > 0
    ? { remaining: previous.remaining, multiplier: previous.multiplier || 2, stakeCents: previous.stakeCents || spin.stakeCents }
    : { remaining: 0, multiplier: 2, stakeCents: spin.stakeCents };
  if (!spin.isFreeSpin && spin.freeSpins > 0) return { remaining: spin.freeSpins, multiplier: 2, stakeCents: spin.stakeCents };
  if (spin.isFreeSpin) {
    let remaining = Math.max(0, current.remaining - 1);
    if (spin.freeSpins > 0) remaining = Math.min(30, remaining + Math.min(5, spin.freeSpins));
    return { remaining, multiplier: spin.nextMultiplier || current.multiplier, stakeCents: current.stakeCents };
  }
  return { remaining: 0, multiplier: 2, stakeCents: spin.stakeCents };
}

// ---------------------------------------------------------------------------
// Fruit Reactor (js/fruit-math.js)
// ---------------------------------------------------------------------------
export const FRUIT_GAME_KEY = 'fruit-reactor';
export const FRUIT_PAYLINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2]];
export const FRUIT_SYMBOLS = {
  SEVEN: { glyph: '7', weight: 3, pays: [0, 0, 100, 1000, 5000], className: 'seven' },
  BELL: { glyph: '🔔', weight: 5, pays: [0, 0, 50, 500, 2500] },
  WATERMELON: { glyph: '🍉', weight: 8, pays: [0, 0, 40, 200, 750] },
  PLUM: { glyph: '🍇', weight: 9, pays: [0, 0, 40, 200, 750] },
  ORANGE: { glyph: '🍊', weight: 11, pays: [0, 0, 20, 100, 250] },
  LEMON: { glyph: '🍋', weight: 12, pays: [0, 0, 20, 100, 250] },
  CHERRY: { glyph: '🍒', weight: 15, pays: [0, 5, 20, 50, 200] },
};
const FRUIT_KEYS = Object.keys(FRUIT_SYMBOLS); const FRUIT_WEIGHTS = FRUIT_KEYS.map((k) => FRUIT_SYMBOLS[k].weight);
const FRUIT_CALIBRATION = 0.54928;
const fruitWeighted = (rng = cryptoFloat) => { let r = rng() * FRUIT_WEIGHTS.reduce((a, b) => a + b, 0); for (let i = 0; i < FRUIT_KEYS.length; i++) { r -= FRUIT_WEIGHTS[i]; if (r <= 0) return FRUIT_KEYS[i]; } return 'CHERRY'; };
export function createFruitGrid({ rng = cryptoFloat } = {}) { return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => fruitWeighted(rng))); }
export function evaluateFruitGrid(grid, stakeCents) {
  const lineBet = stakeCents / FRUIT_PAYLINES.length; let raw = 0; const wins = [];
  FRUIT_PAYLINES.forEach((line, lineIndex) => {
    const first = grid[0][line[0]]; let count = 1;
    for (let c = 1; c < 5; c++) { if (grid[c][line[c]] === first) count++; else break; }
    const multiple = FRUIT_SYMBOLS[first]?.pays[count - 1] || 0;
    if (multiple > 0) { const amount = multiple * lineBet * FRUIT_CALIBRATION; raw += amount; wins.push({ lineIndex, symbol: first, count, amountCents: Math.max(0, Math.round(amount)), cells: Array.from({ length: count }, (_, c) => [c, line[c]]) }); }
  });
  return { totalCents: Math.max(0, Math.round(raw)), wins };
}
export function generateFruitSpin({ stakeCents, rng = cryptoFloat } = {}) {
  const grid = createFruitGrid({ rng }); const result = evaluateFruitGrid(grid, stakeCents);
  return { id: randomId(), createdAt: Date.now(), gameKey: FRUIT_GAME_KEY, stakeCents, isFreeSpin: false, multiplier: 1, grid, mystery: [], freeSpins: 0, scatterCount: 0, nextMultiplier: 1, ...result };
}

// ---------------------------------------------------------------------------
// Fancy Harvest (js/fancy-math.js)
// ---------------------------------------------------------------------------
export const FANCY_GAME_KEY = 'fancy-harvest';
export const FANCY_PAYLINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2]];
export const FANCY_SYMBOLS = {
  SEVEN: { glyph: '7', weight: 2, pays: [0, 0, 100, 500, 5500], className: 'seven' },
  GRAPE: { glyph: '🍇', weight: 5, pays: [0, 0, 39, 150, 800] },
  WATERMELON: { glyph: '🍉', weight: 7, pays: [0, 0, 30, 100, 500] },
  PLUM: { glyph: '🟣', weight: 9, pays: [0, 0, 20, 60, 250] },
  ORANGE: { glyph: '🍊', weight: 10, pays: [0, 0, 15, 40, 150] },
  LEMON: { glyph: '🍋', weight: 11, pays: [0, 0, 10, 30, 120] },
  CHERRY: { glyph: '🍒', weight: 12, pays: [0, 4.987, 10, 30, 100] },
};
const FANCY_KEYS = Object.keys(FANCY_SYMBOLS), FANCY_WEIGHTS = FANCY_KEYS.map((k) => FANCY_SYMBOLS[k].weight), FANCY_TOTAL = FANCY_WEIGHTS.reduce((a, b) => a + b, 0);
const fancyWeighted = (rng = cryptoFloat) => { let r = rng() * FANCY_TOTAL; for (let i = 0; i < FANCY_KEYS.length; i++) { r -= FANCY_WEIGHTS[i]; if (r <= 0) return FANCY_KEYS[i]; } return 'CHERRY'; };
export function createFancyGrid({ rng = cryptoFloat } = {}) { return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => fancyWeighted(rng))); }
export function evaluateFancyGrid(grid, stakeCents) {
  const lineBet = stakeCents / FANCY_PAYLINES.length; let raw = 0; const wins = [];
  FANCY_PAYLINES.forEach((line, lineIndex) => {
    const first = grid[0][line[0]]; let count = 1;
    for (let c = 1; c < 5; c++) { if (grid[c][line[c]] === first) count++; else break; }
    const multiple = FANCY_SYMBOLS[first]?.pays[count - 1] || 0;
    if (multiple > 0) { const amount = multiple * lineBet; raw += amount; wins.push({ lineIndex, symbol: first, count, amountCents: Math.max(0, Math.round(amount)), cells: Array.from({ length: count }, (_, c) => [c, line[c]]) }); }
  });
  return { totalCents: Math.max(0, Math.round(raw)), wins };
}
export function generateFancySpin({ stakeCents, rng = cryptoFloat } = {}) {
  const grid = createFancyGrid({ rng }), result = evaluateFancyGrid(grid, stakeCents);
  return { id: randomId(), createdAt: Date.now(), gameKey: FANCY_GAME_KEY, stakeCents, isFreeSpin: false, multiplier: 1, grid, mystery: [], freeSpins: 0, scatterCount: 0, nextMultiplier: 1, ...result };
}

// ---------------------------------------------------------------------------
// Tomb of Kings (js/book-math.js)
// ---------------------------------------------------------------------------
export const BOOK_GAME_KEY = 'tomb-of-kings';
export const BOOK_PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 1, 2, 1],
];
export const BOOK_SYMBOLS = {
  KING: { glyph: '👑', weight: 3, pays: [0, 0, 100, 750, 5000] },
  QUEEN: { glyph: '🏺', weight: 5, pays: [0, 0, 60, 300, 1500] },
  GUARD: { glyph: '🗿', weight: 7, pays: [0, 0, 40, 200, 800] },
  SCARAB: { glyph: '🪲', weight: 9, pays: [0, 0, 30, 120, 500] },
  A: { glyph: 'A', weight: 12, pays: [0, 0, 15, 50, 150] },
  K: { glyph: 'K', weight: 14, pays: [0, 0, 12, 40, 120] },
  Q: { glyph: 'Q', weight: 16, pays: [0, 0, 10, 30, 100] },
  J: { glyph: 'J', weight: 18, pays: [0, 0, 8, 25, 80] },
  TEN: { glyph: '10', weight: 20, pays: [0, 0, 8, 20, 60] },
  BOOK: { glyph: '📕', weight: 3, pays: [0, 0, 0, 0, 0] },
};
const BOOK_REGULAR = Object.keys(BOOK_SYMBOLS).filter((k) => k !== 'BOOK'), BOOK_KEYS = Object.keys(BOOK_SYMBOLS), BOOK_TOTAL = BOOK_KEYS.reduce((a, k) => a + BOOK_SYMBOLS[k].weight, 0), BOOK_CAL = 0.696;
const bookWeighted = (rng = cryptoFloat) => { let r = rng() * BOOK_TOTAL; for (const k of BOOK_KEYS) { r -= BOOK_SYMBOLS[k].weight; if (r <= 0) return k; } return 'TEN'; };
export function createBookGrid({ rng = cryptoFloat } = {}) { return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => bookWeighted(rng))); }
function bookLineWins(grid, stakeCents) {
  const lineBet = stakeCents / BOOK_PAYLINES.length; let raw = 0; const wins = [];
  BOOK_PAYLINES.forEach((line, lineIndex) => {
    let best = null;
    for (const candidate of BOOK_REGULAR) {
      let count = 0;
      for (let c = 0; c < 5; c++) { const sym = grid[c][line[c]]; if (sym === candidate || sym === 'BOOK') count++; else break; }
      if (count >= 3) { const amount = (BOOK_SYMBOLS[candidate].pays[count - 1] || 0) * lineBet * BOOK_CAL; if (amount > 0 && (!best || amount > best.amount)) best = { lineIndex, symbol: candidate, count, amount, cells: Array.from({ length: count }, (_, c) => [c, line[c]]) }; }
    }
    if (best) { raw += best.amount; wins.push({ ...best, amountCents: Math.round(best.amount) }); }
  });
  return { raw, wins };
}
function bookScatterResult(grid, stakeCents) {
  const cells = []; grid.forEach((col, c) => col.forEach((sym, r) => { if (sym === 'BOOK') cells.push([c, r]); }));
  const n = cells.length, multiple = n === 2 ? 2 : n === 3 ? 5 : n === 4 ? 20 : n >= 5 ? 100 : 0;
  return { count: n, cells, amountCents: Math.round(stakeCents * multiple) };
}
function bookExpansionResult(grid, symbol, stakeCents) {
  if (!symbol) return null;
  const reels = []; for (let c = 0; c < 5; c++) if (grid[c].includes(symbol)) reels.push(c);
  if (reels.length < 3) return null;
  const multiple = BOOK_SYMBOLS[symbol].pays[reels.length - 1] || 0; if (!multiple) return null;
  const amountCents = Math.round(multiple * (stakeCents / 10) * 10 * BOOK_CAL);
  const cells = reels.flatMap((c) => [[c, 0], [c, 1], [c, 2]]);
  return { symbol, reels, cells, amountCents };
}
export function generateBookSpin({ stakeCents, isFreeSpin = false, expandingSymbol = null, rng = cryptoFloat } = {}) {
  const grid = createBookGrid({ rng }), base = bookLineWins(grid, stakeCents), scatter = bookScatterResult(grid, stakeCents),
    expanding = isFreeSpin ? bookExpansionResult(grid, expandingSymbol, stakeCents) : null;
  const freeSpins = scatter.count >= 3 ? 10 : 0,
    chosenExpandingSymbol = !isFreeSpin && freeSpins ? BOOK_REGULAR[Math.floor(rng() * BOOK_REGULAR.length)] : null;
  const wins = [...base.wins];
  if (scatter.amountCents) wins.push({ lineIndex: -1, symbol: 'BOOK', count: scatter.count, amountCents: scatter.amountCents, cells: scatter.cells });
  if (expanding?.amountCents) wins.push({ lineIndex: -2, symbol: expanding.symbol, count: expanding.reels.length, amountCents: expanding.amountCents, cells: expanding.cells });
  return {
    id: randomId(), createdAt: Date.now(), gameKey: BOOK_GAME_KEY, stakeCents, isFreeSpin, multiplier: 1, grid, mystery: [], wins,
    totalCents: Math.max(0, Math.round(base.raw + scatter.amountCents + (expanding?.amountCents || 0))),
    freeSpins, scatterCount: scatter.count, nextMultiplier: 1, expanding, chosenExpandingSymbol,
  };
}
export function nextBookFeatureState(before, spin) {
  if (!spin.isFreeSpin && spin.freeSpins > 0) return { remaining: 10, multiplier: 1, stakeCents: spin.stakeCents, expandingSymbol: spin.chosenExpandingSymbol };
  if (spin.isFreeSpin) {
    let remaining = Math.max(0, Number(before.remaining || 0) - 1);
    if (spin.freeSpins > 0) remaining = Math.min(100, remaining + 10);
    return { remaining, multiplier: 1, stakeCents: before.stakeCents || spin.stakeCents, expandingSymbol: before.expandingSymbol || spin.chosenExpandingSymbol || null };
  }
  return { remaining: 0, multiplier: 1, stakeCents: spin.stakeCents, expandingSymbol: null };
}

// ---------------------------------------------------------------------------
// Dispatch + gamble (mirrors generateLocalSpin/normalizeLocalSpin/resolveLocalGamble
// and localCard in nova-casino.html)
// ---------------------------------------------------------------------------
export const RISK_GAMES = new Set(['fruit-reactor', 'fancy-harvest']);

export function generateServerSpin({ gameKey, stakeCents, isFreeSpin, featureBefore, rng = cryptoFloat }) {
  if (gameKey === 'shark-abyss') return generateSpin({ stakeCents, isFreeSpin, multiplier: isFreeSpin ? (featureBefore.multiplier || 2) : 1, rng });
  if (gameKey === 'fruit-reactor') return generateFruitSpin({ stakeCents, rng });
  if (gameKey === 'fancy-harvest') return generateFancySpin({ stakeCents, rng });
  if (gameKey === 'tomb-of-kings') return generateBookSpin({ stakeCents, isFreeSpin, expandingSymbol: featureBefore.expandingSymbol || null, rng });
  throw new Error(`Unbekanntes Spiel: ${gameKey}`);
}

export function nextServerFeatureState(gameKey, before, spin) {
  if (gameKey === 'shark-abyss') return nextFeatureState(before, spin);
  if (gameKey === 'tomb-of-kings') return nextBookFeatureState(before, spin);
  return { remaining: 0, multiplier: 1, stakeCents: spin.stakeCents };
}

export const localCard = (rng = cryptoFloat) => {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suits = [['♥', 'red'], ['♦', 'red'], ['♠', 'black'], ['♣', 'black']];
  const n = Math.floor(rng() * 52); const [suit, color] = suits[Math.floor(n / 13)]; const rank = ranks[n % 13];
  return { rank, suit, color };
};

// Pure decision step: given the round-before state, action, and choice, returns the
// same shape resolveLocalGamble() returns client-side ({status,currentCents,level,
// card,won}), minus balanceCents (the ledger update is the caller's job, done
// atomically in the DB function so it can be combined with idempotency checks).
export function resolveGambleStep({ level, maxLevel, currentCents }, action, choice, rng = cryptoFloat) {
  if (action === 'collect') return { status: 'collected', currentCents, level, card: null, won: null };
  const isLadder = choice === 'ladder';
  const card = isLadder ? { type: 'ladder', direction: rng() < 0.5 ? 'up' : 'down' } : localCard(rng);
  const won = isLadder ? card.direction === 'up' : card.color === choice;
  if (!won) return { status: 'busted', currentCents: 0, level, card, won };
  const nextLevel = level + 1, nextCents = currentCents * 2;
  if (nextLevel >= maxLevel) return { status: 'capped', currentCents: nextCents, level: nextLevel, card, won };
  return { status: 'active', currentCents: nextCents, level: nextLevel, card, won };
}
