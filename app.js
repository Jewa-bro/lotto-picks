const S = window.Strategy;
const LABELS = "ABCDE";

const $ = (sel) => document.querySelector(sel);
let draws = [];
let model = null;
let pastCombos = new Set();
let reroll = 0;
let mode = "ev";

function recommend(idx, seed) {
  return mode === "ev"
    ? S.recommendEV(draws, idx, seed, model.coef, pastCombos)
    : S.recommendMaster(draws, idx, seed);
}

/* ───────── 공통 ───────── */

function ball(n, cls = "") {
  const tone = n <= 10 ? "y" : n <= 20 ? "b" : n <= 30 ? "r" : n <= 40 ? "g" : "e";
  return `<span class="ball ${tone} ${cls}">${n}</span>`;
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
}

function fmtWon(won) {
  if (won >= 1e8) return `${(won / 1e8).toFixed(1).replace(/\.0$/, "")}억 원`;
  if (won >= 1e4) return `${Math.round(won / 1e4).toLocaleString()}만 원`;
  return `${won.toLocaleString()}원`;
}

const won = (n) => `${n.toLocaleString()}원`;

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ───────── 이번 주 추천 ───────── */

function renderPick() {
  const latest = draws[draws.length - 1];
  const nextNo = latest.no + 1;
  const nextDate = addDays(latest.date, 7);
  const rec = recommend(draws.length, nextNo * 1000 + reroll);

  $("#next-no").textContent = `${nextNo}회`;
  $("#next-date").textContent = `${fmtDate(nextDate)} 오후 8:35 추첨`;

  const drawTime = new Date(nextDate); drawTime.setHours(20, 35);
  $("#stale").hidden = Date.now() < drawTime.getTime() + 60 * 60 * 1000;

  $("#games").innerHTML = rec.games.map((g, i) => `
    <li class="game">
      <span class="label">${LABELS[i]}</span>
      <span class="balls">${g.nums.map((n) => ball(n, n === g.anchor ? "anchor" : "")).join("")}</span>
    </li>`).join("");

  $("#legend").innerHTML = mode === "ev"
    ? `<span class="tag">인기 하위 3%</span>다른 사람이 가장 덜 사는 조합이에요`
    : `<span class="dot"></span>테두리 번호는 지난주 1등 번호예요`;
}

function renderLatest() {
  const d = draws[draws.length - 1];
  $("#latest-title").textContent = `${d.no}회 당첨번호`;
  $("#latest-date").textContent = fmtDate(new Date(d.date + "T00:00:00"));
  $("#latest-balls").innerHTML =
    d.nums.map((n) => ball(n)).join("") + `<span class="plus">+</span>` + ball(d.bonus);
  $("#latest-prize").textContent = d.winners1
    ? `1등 ${d.winners1}명 · 1인당 ${fmtWon(d.prizes[0])}`
    : "1등 당첨자가 없어요";
}

function setMode(next) {
  mode = next;
  reroll = 0;
  store.set("mode", mode);
  document.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on);
  });
  renderPick();
}

/* ───────── 내 번호 역대 당첨금 ───────── */

let myNums = [];

function renderPicker() {
  $("#picker").innerHTML = Array.from({ length: 45 }, (_, i) => {
    const n = i + 1;
    const on = myNums.includes(n);
    const tone = n <= 10 ? "y" : n <= 20 ? "b" : n <= 30 ? "r" : n <= 40 ? "g" : "e";
    return `<button type="button" class="pick ${on ? `on ${tone}` : ""}" data-n="${n}" aria-pressed="${on}">${n}</button>`;
  }).join("");
  const left = 6 - myNums.length;
  $("#calc-help").textContent = left ? `번호 ${left}개를 더 골라주세요` : "6개를 모두 골랐어요";
  $("#calc-run").disabled = left !== 0;
}

function runCalc() {
  const nums = myNums.slice().sort((a, b) => a - b);
  store.set("myNums", nums.join(","));
  const r = S.lifetime(nums, draws);
  const net = r.won - r.cost;
  const first = draws[0], last = draws[draws.length - 1];
  const bigWins = r.wins.filter((w) => w.rank <= 4).sort((a, b) => a.rank - b.rank || b.draw.no - a.draw.no);
  const fifth = r.wins.filter((w) => w.rank === 5);

  $("#calc-result").innerHTML = `
    <div class="balls result-balls">${nums.map((n) => ball(n, "sm")).join("")}</div>
    <p class="caption">${first.no}회부터 ${last.no}회까지 매주 한 게임씩 샀다면</p>
    <p class="big">${won(r.won)}<br>받았어요</p>
    <p class="net ${net >= 0 ? "plus" : "minus"}">${won(r.cost)} 내고 ${won(Math.abs(net))} ${net >= 0 ? "벌었어요" : "손해예요"}</p>
    <div class="rank-grid">
      ${[1, 2, 3, 4, 5].map((k) => `
        <div class="rank-cell ${r.counts[k] ? "has" : ""}">
          <span class="rank-name">${k}등</span>
          <span class="rank-count">${r.counts[k]}번</span>
        </div>`).join("")}
    </div>
    <ul class="wins">
      ${bigWins.map((w) => `
        <li class="win">
          <span class="win-main">
            <span class="win-title">${w.draw.no}회 · ${w.rank}등</span>
            <span class="win-sub">${w.draw.date.replaceAll("-", ".")}</span>
          </span>
          <span class="win-amt">${won(w.amount)}</span>
        </li>`).join("")}
      ${fifth.length ? `
        <li class="win">
          <span class="win-main">
            <span class="win-title">5등 ${fifth.length}번</span>
            <span class="win-sub">최근 ${fifth.slice(-3).reverse().map((w) => `${w.draw.no}회`).join(", ")}</span>
          </span>
          <span class="win-amt">${won(fifth.reduce((a, w) => a + w.amount, 0))}</span>
        </li>` : ""}
      ${r.wins.length ? "" : `<li class="win empty">한 번도 당첨되지 않았어요</li>`}
    </ul>
    <p class="caption small">87회까지는 1게임 2,000원, 88회부터 1,000원으로 계산했어요. 당첨금은 회차별 실제 금액이에요.${
      r.wins.some((w) => w.rank >= 4 && w.draw.estimated45)
        ? " 단, 4·5등은 아직 회차별 금액을 받지 못해 4등 5만 원, 5등 5천 원으로 추정했어요." : ""}</p>`;
  $("#calc-result").hidden = false;
  requestAnimationFrame(() => $("#calc-result").scrollIntoView({ behavior: "smooth", block: "start" }));
}

function initCalc() {
  const saved = (store.get("myNums") || "").split(",").map(Number).filter((n) => n >= 1 && n <= 45);
  if (saved.length === 6) myNums = saved;
  renderPicker();
  $("#picker").onclick = (e) => {
    const btn = e.target.closest(".pick");
    if (!btn) return;
    const n = Number(btn.dataset.n);
    if (myNums.includes(n)) myNums = myNums.filter((x) => x !== n);
    else if (myNums.length >= 6) return toast("6개까지 고를 수 있어요");
    else myNums.push(n);
    $("#calc-result").hidden = true;
    renderPicker();
  };
  $("#calc-reset").onclick = () => {
    myNums = [];
    $("#calc-result").hidden = true;
    renderPicker();
  };
  $("#calc-run").onclick = runCalc;
}

/* ───────── 바텀시트 ───────── */

let openedSheet = null, opener = null;

function openSheet(id, from) {
  const sheet = $(id);
  const backdrop = $("#sheet-backdrop");
  openedSheet = sheet; opener = from;
  sheet.hidden = backdrop.hidden = false;
  sheet.scrollTop = 0;
  document.body.classList.add("locked");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add("open");
    backdrop.classList.add("open");
  }));
}

function closeSheet() {
  if (!openedSheet) return;
  const sheet = openedSheet, backdrop = $("#sheet-backdrop");
  openedSheet = null;
  sheet.classList.remove("open");
  backdrop.classList.remove("open");
  document.body.classList.remove("locked");
  setTimeout(() => { sheet.hidden = backdrop.hidden = true; }, 300);
  if (opener) opener.focus({ preventScroll: true });
}

/* ───────── 시작 ───────── */

async function init() {
  try {
    const get = (f) => fetch(`data/${f}`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(f);
      return r.json();
    });
    const [lotto, m] = await Promise.all([get("lotto.json"), get("model.json")]);
    // 4·5등 당첨금이 없는 예전 형식 데이터면 현재 고정 금액으로 대신하고 '추정'으로 표시
    draws = lotto.map((r) => ({
      no: r[0], date: r[1], nums: r.slice(2, 8), bonus: r[8],
      winners1: r[10], prizes: [...r.slice(15, 18), r[18] ?? 50000, r[19] ?? 5000],
      estimated45: r.length < 20,
    }));
    model = m;
    pastCombos = new Set(draws.map((d) => d.nums.slice().sort((x, y) => x - y).join()));
  } catch {
    $("#app").innerHTML = `<p class="error">당첨번호 데이터를 불러오지 못했어요.</p>`;
    return;
  }
  if (store.get("mode") === "master") mode = "master";
  renderLatest();
  setMode(mode);
  initCalc();
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.onclick = () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode); };
  });
  // 번호가 바뀐 게 보이도록 공이 차례로 다시 나타나는 애니메이션
  $("#reroll").onclick = () => {
    reroll++;
    renderPick();
    const btn = $("#reroll");
    btn.classList.remove("spin");
    $("#games").classList.remove("fresh");
    void btn.offsetWidth;
    btn.classList.add("spin");
    $("#games").classList.add("fresh");
  };
  $("#calc-open").onclick = (e) => openSheet("#calc", e.currentTarget);
  document.querySelectorAll("[data-close]").forEach((b) => { b.onclick = closeSheet; });
  $("#sheet-backdrop").onclick = closeSheet;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
}

init();
