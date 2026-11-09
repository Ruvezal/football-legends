/** Football Legends — 4×4 window, 20 symbol types, 20 lines. Grid cells are [reel][row]. */

export const REEL_COUNT = 4;
export const ROW_COUNT = 4;
export const LINE_COUNT = 20;

export const BETS = [20, 40, 100, 200, 400, 1000];

export const STARTING_CREDIT = 2000;

/** Row on each of the 4 reels, top to bottom. A line pays from the left reel only. */
export const PAYLINES = [
  [1, 1, 1, 1],
  [2, 2, 2, 2],
  [0, 0, 0, 0],
  [3, 3, 3, 3],
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [1, 2, 2, 1],
  [2, 1, 1, 2],
  [0, 0, 1, 2],
  [3, 3, 2, 1],
  [1, 0, 0, 1],
  [2, 3, 3, 2],
  [0, 1, 1, 0],
  [3, 2, 2, 3],
  [1, 2, 3, 2],
  [2, 1, 0, 1],
  [0, 1, 0, 1],
  [3, 2, 3, 2],
  [1, 0, 1, 2],
  [2, 3, 2, 1],
];

const TOP = { 3: 54, 4: 210 };
const HIGH = { 3: 42, 4: 160 };
const MID = { 3: 28, 4: 100 };
const MID_LOW = { 3: 22, 4: 70 };
const LOW_END = { 3: 11, 4: 40 };

export const SYMBOLS = {
  Messi: { name: "Lionel Messi", tier: "high", pay: TOP },
  Ronaldo: { name: "Ronaldo", tier: "high", pay: TOP },
  Mbappe: { name: "Kylian Mbappé", tier: "high", pay: TOP },
  Zidane: { name: "Zinédine Zidane", tier: "wild", pay: {} },
  Maradona: { name: "Diego Maradona", tier: "high", pay: HIGH },
  Pele: { name: "Pelé", tier: "high", pay: HIGH },
  Ibrahimovic: { name: "Zlatan Ibrahimović", tier: "high", pay: HIGH },
  Lewandowski: { name: "Robert Lewandowski", tier: "high", pay: HIGH },
  Ronaldino: { name: "Ronaldinho", tier: "mid", pay: MID },
  Neymar: { name: "Neymar", tier: "mid", pay: MID },
  Osimhen: { name: "Victor Osimhen", tier: "mid", pay: MID },
  Sane: { name: "Leroy Sané", tier: "mid", pay: MID },
  Pogba: { name: "Paul Pogba", tier: "mid", pay: MID },
  Pirlo: { name: "Andrea Pirlo", tier: "mid", pay: MID },
  Raul: { name: "Raúl", tier: "mid", pay: MID_LOW },
  Vieira: { name: "Patrick Vieira", tier: "mid", pay: MID_LOW },
  Buffon: { name: "Gianluigi Buffon", tier: "mid", pay: MID_LOW },
  Cech: { name: "Petr Čech", tier: "scatter", pay: {} },
  Okocha: { name: "Jay-Jay Okocha", tier: "low", pay: LOW_END },
  Schevchenko: { name: "Andriy Shevchenko", tier: "low", pay: LOW_END },
};

const WEIGHT = { high: 2, mid: 3, low: 5, wild: 3, scatter: 2 };

/** Scatter pays anywhere. Multipliers are on the total bet, not the line bet. */
export const SCATTER_PAY = { 3: 2, 4: 8, 5: 40 };

export const WILD = "Zidane";
export const SCATTER = "Cech";

export const TIER_LABELS = {
  high: "Legends",
  mid: "Captains",
  low: "Icons",
};

function shuffle(list, random) {
  const items = list.slice();
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function breakTriples(strip) {
  const next = strip.slice();
  const count = next.length;
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      const prev = next[(i - 1 + count) % count];
      const before = next[(i - 2 + count) % count];
      if (next[i] !== prev || next[i] !== before) continue;
      for (let step = 1; step < count; step += 1) {
        const j = (i + step) % count;
        if (next[j] !== next[i]) {
          [next[i], next[j]] = [next[j], next[i]];
          break;
        }
      }
    }
  }
  return next;
}

export function createStrips(random = Math.random) {
  const bag = [];
  for (const [id, symbol] of Object.entries(SYMBOLS)) {
    const copies = WEIGHT[symbol.tier];
    for (let i = 0; i < copies; i += 1) bag.push(id);
  }
  return Array.from({ length: REEL_COUNT }, () => breakTriples(shuffle(bag, random)));
}

export function spinGrid(strips, random = Math.random) {
  return strips.map((strip) => {
    const stop = Math.floor(random() * strip.length);
    return Array.from({ length: ROW_COUNT }, (_, row) => strip[(stop + row) % strip.length]);
  });
}

function resolveRun(symbols) {
  let symbol = null;
  let count = 0;
  for (const current of symbols) {
    if (current === SCATTER) break;
    const wild = current === WILD;
    if (wild || symbol === null || current === symbol) {
      if (!wild) symbol = current;
      count += 1;
    } else {
      break;
    }
  }
  if (symbol === null && count >= 3) symbol = "Messi";
  if (!symbol || !SYMBOLS[symbol].pay[count]) return null;
  return { symbol, count };
}

function scatterResult(grid, totalBet) {
  const cells = [];
  grid.forEach((column, reel) => {
    column.forEach((symbol, row) => {
      if (symbol === SCATTER) cells.push([reel, row]);
    });
  });
  const tier = [5, 4, 3].find((count) => cells.length >= count);
  const multiplier = tier ? SCATTER_PAY[tier] : 0;
  if (!multiplier) return null;
  return {
    index: -1,
    symbol: SCATTER,
    count: cells.length,
    amount: Math.round(totalBet * multiplier),
    cells,
    scatter: true,
  };
}

export function evaluate(grid, totalBet) {
  const stake = totalBet / PAYLINES.length;
  const lines = [];
  PAYLINES.forEach((rows, index) => {
    const symbols = rows.map((row, reel) => grid[reel][row]);
    const run = resolveRun(symbols);
    if (!run) return;
    const cells = [];
    for (let reel = 0; reel < run.count; reel += 1) cells.push([reel, rows[reel]]);
    lines.push({
      index,
      symbol: run.symbol,
      count: run.count,
      amount: Math.round(stake * SYMBOLS[run.symbol].pay[run.count]),
      cells,
    });
  });
  const scatter = scatterResult(grid, totalBet);
  if (scatter) lines.push(scatter);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { total, lines };
}
