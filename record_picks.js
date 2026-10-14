// 다음 회차 추천 번호를 data/picks.json에 기록한다 (update_data.py가 실행).
// 앱의 '지난 10주'는 기록이 있으면 다시 계산하지 않고 이 기록을 쓴다.
//   node record_picks.js
const fs = require("fs");
const path = require("path");
const S = require("./strategy.js");

const dir = path.join(__dirname, "data");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

const draws = read("lotto.json").map(([no, date, a, b, c, d, e, f, bonus]) =>
  ({ no, date, nums: [a, b, c, d, e, f], bonus }));
const model = read("model.json");
const pastCombos = new Set(draws.map((d) => d.nums.slice().sort((x, y) => x - y).join()));
const picksPath = path.join(dir, "picks.json");
const picks = fs.existsSync(picksPath) ? read("picks.json") : {};

const nextNo = draws[draws.length - 1].no + 1;
if (picks[nextNo]) {
  console.log(`${nextNo}회 추천은 이미 기록돼 있어요`);
} else {
  const seed = nextNo * 1000;
  picks[nextNo] = {
    recorded_at: new Date().toISOString().slice(0, 10),
    model_through: model.trained_through,
    ev: S.recommendEV(draws, draws.length, seed, model.coef, pastCombos).games.map((g) => g.nums),
    master: S.recommendMaster(draws, draws.length, seed).games.map((g) => g.nums),
  };
  fs.writeFileSync(picksPath, JSON.stringify(picks));
  console.log(`${nextNo}회 추천을 기록했어요`);
}
