import {
  BETS,
  STARTING_CREDIT,
  SYMBOLS,
  SCATTER,
  SCATTER_PAY,
  TIER_LABELS,
  WILD,
  createStrips,
  evaluate,
  spinGrid,
} from "./slot.js?v=8";

const SAVE_KEY = "football-legends-slot";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const statusEl = document.querySelector("#status");
const creditEl = document.querySelector("#credit");
const winEl = document.querySelector("#win");
const winMeter = document.querySelector("#win-meter");
const betEl = document.querySelector("#bet");
const reelsEl = document.querySelector("#reels");
const frameEl = document.querySelector("#frame");
const linesEl = document.querySelector("#paylines");
const spinBtn = document.querySelector("#spin");
const autoBtn = document.querySelector("#autoplay");
const betDownBtn = document.querySelector("#bet-down");
const betUpBtn = document.querySelector("#bet-up");
const paytableBtn = document.querySelector("#paytable");
const closePayBtn = document.querySelector("#close-pay");
const muteBtn = document.querySelector("#mute");
const modalEl = document.querySelector("#modal");
const payBody = document.querySelector("#pay-body");
const bannerEl = document.querySelector("#banner");
const bannerAmount = document.querySelector("#banner-amount");
const showerEl = document.querySelector("#shower");

const strips = createStrips();
let grid = spinGrid(strips);
let balance = STARTING_CREDIT;
let betIndex = 0;
let spinning = false;
let autoplay = false;
let autoplayTimer = 0;
let muted = false;
let lastWin = 0;
let activeCells = null;
let cycleTimer = 0;
let bannerTimer = 0;
let audioCtx = null;
let paytableReady = false;

function format(value) {
  return Math.round(value).toLocaleString("en-US");
}

function money(value) {
  return `ETB ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentBet() {
  return BETS[betIndex];
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    if (Number.isFinite(saved.balance) && saved.balance >= 0) balance = Math.round(saved.balance);
    if (Number.isInteger(saved.betIndex) && BETS[saved.betIndex] != null) betIndex = saved.betIndex;
    muted = Boolean(saved.muted);
  } catch {
    balance = STARTING_CREDIT;
  }
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ balance, betIndex, muted }));
}

function setStatus(text) {
  statusEl.hidden = false;
  statusEl.textContent = text;
}

function renderMeters() {
  creditEl.textContent = money(balance);
  winEl.textContent = money(lastWin);
  betEl.textContent = format(currentBet());
  winMeter.classList.toggle("is-hot", lastWin > 0);
  spinBtn.textContent = "Play";
  spinBtn.classList.remove("is-credit");
  spinBtn.disabled = spinning || autoplay;
  autoBtn.textContent = autoplay ? "Stop" : "Autoplay";
  autoBtn.classList.toggle("is-on", autoplay);
  autoBtn.setAttribute("aria-pressed", String(autoplay));
  betDownBtn.disabled = spinning || autoplay || betIndex === 0;
  betUpBtn.disabled = spinning || autoplay || betIndex === BETS.length - 1;
  muteBtn.textContent = muted ? "Sound off" : "Sound on";
  muteBtn.setAttribute("aria-pressed", String(muted));
}

const HIT_FACE = { [WILD]: ["Wild", "Wild"], [SCATTER]: ["Scatter", "Scatter"] };

function faceInner(id, hit = false) {
  const [file, name] = hit ? HIT_FACE[id] : [id, SYMBOLS[id].name];
  return `<img src="assets/symbols/${file}.webp?v=24" alt="${name}" draggable="false">`;
}

function cellMarkup(id) {
  return `<div class="cell" data-symbol="${id}"><div class="face">${faceInner(id)}</div></div>`;
}

function paintCell(cell, id, hit = false) {
  cell.dataset.symbol = id;
  cell.dataset.hit = hit ? "1" : "0";
  cell.querySelector(".face").innerHTML = faceInner(id, hit);
}

function mountBoard(nextGrid) {
  grid = nextGrid.map((column) => column.slice());
  reelsEl.innerHTML = grid
    .map((column) => `<div class="reel"><div class="strip">${column.map(cellMarkup).join("")}</div></div>`)
    .join("");
}

function preload() {
  for (const id of Object.keys(SYMBOLS)) {
    const image = new Image();
    image.src = `assets/symbols/${id}.webp?v=24`;
  }
  for (const file of ["Wild", "Scatter"]) {
    const image = new Image();
    image.src = `assets/symbols/${file}.webp?v=24`;
  }
}

function clearPresentation() {
  clearInterval(cycleTimer);
  cycleTimer = 0;
  activeCells = null;
  linesEl.innerHTML = "";
  reelsEl.querySelectorAll(".cell.win").forEach((cell) => cell.classList.remove("win"));
  reelsEl.querySelectorAll(".cell").forEach((cell) => {
    if (cell.dataset.hit === "1") paintCell(cell, cell.dataset.symbol);
  });
  bannerEl.hidden = true;
  clearTimeout(bannerTimer);
  stopGrassShower();
}

function drawLine(cells) {
  const bounds = frameEl.getBoundingClientRect();
  const width = Math.max(1, frameEl.clientWidth);
  const height = Math.max(1, frameEl.clientHeight);
  linesEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const points = cells
    .map(([reel, row]) => {
      const cell = reelsEl.querySelectorAll(".reel")[reel].querySelectorAll(".cell")[row];
      const rect = cell.getBoundingClientRect();
      const x = rect.left - bounds.left + rect.width / 2;
      const y = rect.top - bounds.top + rect.height / 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  linesEl.innerHTML = `<polyline points="${points}" class="line-shadow"></polyline><polyline points="${points}" class="line-gold"></polyline>`;
}

function markCells(cells) {
  reelsEl.querySelectorAll(".cell.win").forEach((cell) => cell.classList.remove("win"));
  for (const [reel, row] of cells) {
    reelsEl.querySelectorAll(".reel")[reel].querySelectorAll(".cell")[row].classList.add("win");
  }
}

function showSpecialHits(wildCells, scatterCells) {
  const wildHot = new Set(wildCells.map(([reel, row]) => `${reel},${row}`));
  const scatterHot = new Set(scatterCells.map(([reel, row]) => `${reel},${row}`));
  reelsEl.querySelectorAll(".reel").forEach((reel, reelIndex) => {
    [...reel.querySelectorAll(".cell")].forEach((cell, row) => {
      const symbol = cell.dataset.symbol;
      if (symbol !== WILD && symbol !== SCATTER) return;
      const hit = (symbol === WILD ? wildHot : scatterHot).has(`${reelIndex},${row}`);
      if ((cell.dataset.hit === "1") === hit) return;
      flipTo(cell, symbol, reducedMotion ? 1 : 120, reducedMotion ? 1 : 160, hit);
    });
  });
}

function presentWins(result) {
  clearInterval(cycleTimer);
  if (!result.lines.length) {
    setStatus("Good luck");
    return;
  }
  let cursor = 0;
  const apply = () => {
    const line = result.lines[cursor];
    markCells(line.cells);
    showSpecialHits(line.scatter ? [] : line.cells, line.scatter ? line.cells : []);
    if (line.scatter) {
      activeCells = null;
      linesEl.innerHTML = "";
      setStatus(`${SYMBOLS[SCATTER].name} ×${line.count} · ${money(line.amount)}`);
    } else {
      activeCells = line.cells;
      drawLine(line.cells);
      setStatus(`Line ${line.index + 1} · ${SYMBOLS[line.symbol].name} ×${line.count} · ${money(line.amount)}`);
    }
  };
  apply();
  if (result.lines.length > 1) {
    cycleTimer = setInterval(() => {
      cursor = (cursor + 1) % result.lines.length;
      apply();
    }, 1500);
  }
  if (result.total >= currentBet() * 10) {
    bannerAmount.textContent = money(result.total);
    bannerEl.hidden = false;
    startGrassShower();
    bannerTimer = setTimeout(() => {
      bannerEl.hidden = true;
    }, 2400);
  }
}

const GRASS = ["#b6e36a", "#7dce4a", "#3f9d46", "#c6ef78", "#2f8a42"];

function startGrassShower() {
  stopGrassShower();
  if (reducedMotion) return;
  showerEl.hidden = false;
  for (let i = 0; i < 42; i += 1) {
    const blade = document.createElement("span");
    blade.className = "blade";
    blade.style.left = `${4 + Math.random() * 92}%`;
    blade.style.width = `${6 + Math.random() * 4}px`;
    blade.style.height = `${108 + Math.random() * 72}px`;
    blade.style.background = `linear-gradient(${GRASS[i % GRASS.length]}, #1d6a32)`;
    blade.style.animationDelay = `${Math.random() * 0.55}s`;
    blade.style.animationDuration = `${0.75 + Math.random() * 0.45}s`;
    blade.style.setProperty("--drift", `${Math.round(Math.random() * 36 - 18)}px`);
    blade.style.setProperty("--spin", `${Math.round(Math.random() * 40 - 20)}deg`);
    blade.style.setProperty("--lean", `${Math.round(Math.random() * 14 - 7)}deg`);
    showerEl.appendChild(blade);
  }
}

function stopGrassShower() {
  showerEl.hidden = true;
  showerEl.replaceChildren();
}

function audio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, duration, type, gain) {
  if (muted) return;
  const context = audio();
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, context.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  osc.connect(amp);
  amp.connect(context.destination);
  osc.start();
  osc.stop(context.currentTime + duration);
}

function clunk() {
  tone(150, 0.06, "square", 0.03);
  tone(90, 0.08, "triangle", 0.04);
}

function chime() {
  [523, 659, 784].forEach((freq, index) => {
    setTimeout(() => tone(freq, 0.16, "triangle", 0.045), index * 90);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flipTo(cell, id, outMs, inMs, hit = false) {
  const face = cell.querySelector(".face");
  return new Promise((resolve) => {
    let stage = "out";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      face.removeEventListener("transitionend", onEnd);
      if (cell.dataset.symbol !== id || (cell.dataset.hit === "1") !== hit) paintCell(cell, id, hit);
      face.style.transition = "none";
      face.style.transform = "rotateY(0deg)";
      resolve();
    };
    const timer = setTimeout(finish, outMs + inMs + 90);
    const onEnd = (event) => {
      if (event.propertyName !== "transform" || done) return;
      if (stage === "out") {
        stage = "in";
        paintCell(cell, id, hit);
        face.style.transition = "none";
        face.style.transform = "rotateY(90deg)";
        face.getBoundingClientRect();
        face.style.transition = `transform ${inMs}ms ease-out`;
        face.style.transform = "rotateY(0deg)";
        return;
      }
      finish();
    };
    face.addEventListener("transitionend", onEnd);
    face.style.transition = `transform ${outMs}ms ease-in`;
    face.style.transform = "rotateY(-90deg)";
  });
}

function animateReel(reelIndex, resultColumn) {
  const reelEl = reelsEl.querySelectorAll(".reel")[reelIndex];
  const cells = [...reelEl.querySelectorAll(".cell")];
  const source = strips[reelIndex];
  const turns = reducedMotion ? 1 : 3 + reelIndex;
  return Promise.all(
    cells.map(async (cell, row) => {
      await wait(reducedMotion ? 0 : reelIndex * 80 + row * 50);
      let cursor = Math.floor(Math.random() * source.length);
      for (let turn = 0; turn < turns; turn += 1) {
        const last = turn === turns - 1;
        const id = last ? resultColumn[row] : source[cursor];
        cursor = (cursor + 1) % source.length;
        await flipTo(cell, id, last ? 150 : 85, last ? 210 : 100);
      }
    }),
  );
}

function setAutoplay(on) {
  autoplay = on;
  clearTimeout(autoplayTimer);
  renderMeters();
}

function queueAutoplay(result) {
  if (!autoplay) return;
  const wait = result.total >= currentBet() * 10 ? 2600 : result.total > 0 ? 1100 : 450;
  autoplayTimer = setTimeout(() => {
    if (!autoplay || spinning || !modalEl.hidden) return;
    spin();
  }, reducedMotion ? 200 : wait);
}

async function spin() {
  if (spinning || !modalEl.hidden) return;
  clearTimeout(autoplayTimer);
  if (balance < currentBet()) {
    if (autoplay) {
      setAutoplay(false);
      setStatus("Autoplay stopped");
      return;
    }
    balance += STARTING_CREDIT;
    setStatus("Credit added");
    save();
    renderMeters();
    return;
  }

  spinning = true;
  clearPresentation();
  lastWin = 0;
  balance -= currentBet();
  setStatus("Flipping");
  renderMeters();

  const next = spinGrid(strips);
  await Promise.all(
    next.map((column, reel) =>
      animateReel(reel, column).then(() => {
        clunk();
      }),
    ),
  );

  grid = next.map((column) => column.slice());
  const result = evaluate(grid, currentBet());
  balance += result.total;
  lastWin = result.total;
  spinning = false;
  renderMeters();
  if (result.total > 0) chime();
  presentWins(result);
  save();
  queueAutoplay(result);
}

function changeBet(direction) {
  if (spinning) return;
  const next = betIndex + direction;
  if (next < 0 || next >= BETS.length) return;
  betIndex = next;
  setStatus(`Bet ${format(currentBet())}`);
  save();
  renderMeters();
}

function payLabel(pay) {
  return [3, 4, 5]
    .filter((count) => pay[count])
    .map((count) => `${count} · ${pay[count]}`)
    .join("   ");
}

function buildPaytable() {
  const note = document.createElement("div");
  note.className = "tier";
  const scatterPays = [3, 4, 5].map((count) => `${count} · ${SCATTER_PAY[count]}× bet`).join("   ");
  note.innerHTML = `<div class="pay-row"><img src="assets/symbols/Wild.webp?v=24" alt=""><div class="pay-name">${SYMBOLS[WILD].name}</div><div class="pay-mult">Wild · any legend</div></div>
    <div class="pay-row"><img src="assets/symbols/Scatter.webp?v=24" alt=""><div class="pay-name">${SYMBOLS[SCATTER].name}</div><div class="pay-mult">Scatter · ${scatterPays}</div></div>`;
  payBody.appendChild(note);

  for (const tier of ["high", "mid", "low"]) {
    const section = document.createElement("section");
    section.className = "tier";
    section.innerHTML = `<h3>${TIER_LABELS[tier]}</h3>`;
    for (const [id, symbol] of Object.entries(SYMBOLS)) {
      if (symbol.tier !== tier) continue;
      const row = document.createElement("div");
      row.className = "pay-row";
      row.innerHTML = `<img src="assets/symbols/${id}.webp?v=24" alt="">
        <div class="pay-name">${symbol.name}</div>
        <div class="pay-mult">${payLabel(symbol.pay)}</div>`;
      section.appendChild(row);
    }
    payBody.appendChild(section);
  }
  paytableReady = true;
}

function openPaytable() {
  setAutoplay(false);
  if (!paytableReady) buildPaytable();
  modalEl.hidden = false;
}

function closePaytable() {
  modalEl.hidden = true;
}

spinBtn.addEventListener("click", spin);
autoBtn.addEventListener("click", () => {
  if (autoplay) {
    setAutoplay(false);
    return;
  }
  setAutoplay(true);
  if (!spinning) spin();
});
betDownBtn.addEventListener("click", () => changeBet(-1));
betUpBtn.addEventListener("click", () => changeBet(1));
paytableBtn.addEventListener("click", openPaytable);
closePayBtn.addEventListener("click", closePaytable);
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) closePaytable();
});
muteBtn.addEventListener("click", () => {
  muted = !muted;
  if (!muted) audio();
  save();
  renderMeters();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "Escape") closePaytable();
  if (event.code === "Space") {
    event.preventDefault();
    if (autoplay) setAutoplay(false);
    else spin();
  }
  if (event.code === "ArrowUp") {
    event.preventDefault();
    changeBet(1);
  }
  if (event.code === "ArrowDown") {
    event.preventDefault();
    changeBet(-1);
  }
});

window.addEventListener("resize", () => {
  if (activeCells) drawLine(activeCells);
});

load();
preload();
mountBoard(grid);
setStatus("Good luck");
renderMeters();
