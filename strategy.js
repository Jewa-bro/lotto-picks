// 추천 로직. 브라우저(app.js)와 Node(record_picks.js)가 함께 쓴다.
(function (root) {
  const GAMES = 5;

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomCombo(rand) {
    const a = Array.from({ length: 45 }, (_, i) => i + 1);
    for (let i = 0; i < 6; i++) {
      const j = i + Math.floor(rand() * (45 - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, 6).sort((x, y) => x - y);
  }

  function overlap(a, b) {
    return a.filter((n) => b.includes(n)).length;
  }

  /* ───────── 기대수익 전략 ─────────
   * 당첨 확률은 모든 조합이 같지만 1~3등 당첨금은 당첨자끼리 나눈다.
   * 과거 당첨자 수로 학습한 인기도 모델(analysis/train.py → data/model.json)로
   * 다른 사람이 덜 사는 조합을 고른다. 특징은 analysis/features.py와 같아야 한다. */
  const EV_SAMPLES = 20000;
  const EV_TOP = 0.03;

  function maxCount(arr) {
    let best = 0;
    for (const v of arr) {
      let c = 0;
      for (const w of arr) if (w === v) c++;
      if (c > best) best = c;
    }
    return best;
  }

  // features.py의 NAMES 순서: n1..n45, 그 뒤 13개
  function features(s, prev) {
    const x = new Array(58).fill(0);
    s.forEach((n) => { x[n - 1] = 1; });
    const set = new Set(s);
    const rows = s.map((n) => Math.floor((n - 1) / 7));
    let consec = 0, ap3 = 0;
    for (let i = 0; i < 5; i++) if (s[i + 1] - s[i] === 1) consec++;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (set.has(2 * s[j] - s[i])) ap3++;
    x[45] = s.filter((n) => n <= 31).length;
    x[46] = s.filter((n) => n <= 12).length;
    x[47] = consec;
    x[48] = (s.reduce((a, b) => a + b, 0) - 138) / 32;
    x[49] = maxCount(s.map((n) => (n - 1) % 7));
    x[50] = maxCount(rows);
    x[51] = new Set(rows).size;
    x[52] = ap3;
    x[53] = prev.filter((n) => set.has(n)).length;
    x[54] = maxCount(s.map((n) => Math.floor(n / 10)));
    x[55] = maxCount(s.map((n) => n % 10));
    x[56] = Math.abs(s.filter((n) => n % 2 === 0).length - 3);
    x[57] = s.filter((n) => n >= 40).length;
    return x;
  }

  function score(x, coef) {
    let v = 0;
    for (let i = 0; i < x.length; i++) v += x[i] * coef[i];
    return v;
  }

  // 모델이 과소평가하는 '누구나 떠올리는 패턴'은 따로 제외
  function isCommonPattern(s, x, pastCombos) {
    if (pastCombos.has(s.join())) return true;
    let run = 1;
    for (let i = 1; i < 6; i++) { run = s[i] - s[i - 1] === 1 ? run + 1 : 1; if (run >= 3) return true; }
    return x[52] >= 2 || x[49] >= 3 || x[50] >= 4 || x[53] >= 3 || x[54] >= 4 || x[56] === 3;
  }

  // draws[idx] 회차를 위한 추천 (그 이전 데이터만 사용)
  function recommendEV(draws, idx, seed, coef, pastCombos) {
    const prev = draws[idx - 1].nums;
    const rand = mulberry32(seed);
    const pool = [];
    for (let i = 0; i < EV_SAMPLES; i++) {
      const nums = randomCombo(rand);
      const x = features(nums, prev);
      pool.push({ nums, x, v: score(x, coef) });
    }
    pool.sort((a, b) => a.v - b.v);
    const cand = shuffle(pool.slice(0, Math.ceil(EV_SAMPLES * EV_TOP)), rand);
    // 게임끼리 고르게 퍼지도록: 두 게임이 3개 이상 겹치지 않고, 한 번호는 최대 2게임까지
    const games = [];
    const used = new Array(46).fill(0);
    for (const c of cand) {
      if (games.length === GAMES) break;
      if (isCommonPattern(c.nums, c.x, pastCombos)) continue;
      if (c.nums.some((n) => used[n] >= 2)) continue;
      if (games.some((g) => overlap(g.nums, c.nums) > 2)) continue;
      games.push({ nums: c.nums });
      c.nums.forEach((n) => used[n]++);
    }
    return { games };
  }

  /* ───────── 명인 전략 (영상) ─────────
   *  1) 지난주 1등 번호를 게임마다 하나씩 차례로 넣는다
   *  2) 나머지는 최근 6개월(26회) 동안 3~4번 나온 번호에서 고른다 */
  const WINDOW = 26;

  function recommendMaster(draws, idx, seed) {
    const hist = draws.slice(Math.max(0, idx - WINDOW), idx);
    const counts = new Array(46).fill(0);
    hist.forEach((d) => d.nums.forEach((n) => counts[n]++));
    let pool = [];
    for (let lo = 3, hi = 4; pool.length < 11 && lo >= 0; lo--, hi++) {
      pool = [];
      for (let n = 1; n <= 45; n++) if (counts[n] >= lo && counts[n] <= hi) pool.push(n);
    }
    const last = draws[idx - 1].nums;
    const rand = mulberry32(seed);
    const seen = new Set();
    const games = [];
    for (let g = 0; g < GAMES; g++) {
      const anchor = last[g % 6];
      const cand = pool.filter((n) => n !== anchor);
      let nums;
      for (let tries = 0; tries < 30; tries++) {
        nums = [anchor, ...shuffle(cand, rand).slice(0, 5)].sort((a, b) => a - b);
        if (!seen.has(nums.join())) break;
      }
      seen.add(nums.join());
      games.push({ nums, anchor });
    }
    return { games, pool, last };
  }

  /* ───────── 당첨 판정 ───────── */

  // 87회까지 1게임 2,000원, 88회(2004-08-07)부터 1,000원
  function priceOf(drawNo) {
    return drawNo < 88 ? 2000 : 1000;
  }

  function rankOf(nums, draw) {
    const hit = nums.filter((n) => draw.nums.includes(n)).length;
    if (hit === 6) return { rank: 1, hit };
    if (hit === 5) return { rank: nums.includes(draw.bonus) ? 2 : 3, hit };
    if (hit === 4) return { rank: 4, hit };
    if (hit === 3) return { rank: 5, hit };
    return { rank: 0, hit };
  }

  // 한 조합을 1회부터 매주 한 게임씩 샀을 때
  function lifetime(nums, draws) {
    let cost = 0, won = 0;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const wins = [];
    for (const d of draws) {
      cost += priceOf(d.no);
      const r = rankOf(nums, d);
      if (!r.rank) continue;
      const amount = d.prizes[r.rank - 1];
      counts[r.rank]++;
      won += amount;
      wins.push({ draw: d, rank: r.rank, amount });
    }
    return { cost, won, counts, wins, draws: draws.length };
  }

  const api = {
    GAMES, mulberry32, recommendEV, recommendMaster, rankOf, priceOf, lifetime,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Strategy = api;
})(this);
