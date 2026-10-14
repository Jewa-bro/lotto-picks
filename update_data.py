"""동행복권에서 새 회차 당첨번호와 당첨 통계를 받아 data/lotto.json에 추가합니다.

매주 토요일 추첨 이후 실행하세요:  python update_data.py
새 회차가 있으면 ../analysis/train.py로 인기도 모델(data/model.json)도 다시 학습하고,
다음 회차 추천 번호를 data/picks.json에 기록합니다.

행 형식: [회차, 추첨일, 번호1..6, 보너스, 총판매액,
          1~5등 당첨자수(5개), 1~5등 1인당 당첨금(5개)]
"""
import json
import pathlib
import subprocess
import sys
import time
import urllib.request

API = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do"
DATA = pathlib.Path(__file__).parent / "data" / "lotto.json"
ROW_LEN = 20


def fetch(draw_no=None):
    url = API + (f"?srchLtEpsd={draw_no}" if draw_no else "")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return json.load(res)["data"]["list"][0]
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 * (attempt + 1))


def to_row(x):
    d = x["ltRflYmd"]
    nums = [x[f"tm{i}WnNo"] for i in range(1, 7)]
    winners = [x[f"rnk{k}WnNope"] for k in range(1, 6)]
    amounts = [x[f"rnk{k}WnAmt"] for k in range(1, 6)]
    return [x["ltEpsd"], f"{d[:4]}-{d[4:6]}-{d[6:]}", *nums, x["bnsWnNo"],
            x["wholEpsdSumNtslAmt"], *winners, *amounts]


def load(path):
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if data and len(data[0]) == ROW_LEN else []  # 예전 형식이면 처음부터


def save(path, data):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")


def main():
    # 중간에 끊기면 PART에 받은 데까지 남겨두고, 다음 실행 때 이어서 받는다
    part = DATA.with_suffix(".part.json")
    data = max(load(DATA), load(part), key=len)
    have = data[-1][0] if data else 0
    latest = fetch()
    for n in range(have + 1, latest["ltEpsd"] + 1):
        data.append(to_row(latest if n == latest["ltEpsd"] else fetch(n)))
        if n % 50 == 0:
            save(part, data)
        time.sleep(0.15)
    save(DATA, data)
    part.unlink(missing_ok=True)
    print(f"{have} -> {data[-1][0]} ({data[-1][1]})")
    here = pathlib.Path(__file__).parent
    if data[-1][0] != have:  # 새 회차가 있으면 인기도 모델 다시 학습
        subprocess.run([sys.executable, str(here.parent / "analysis" / "train.py")], check=True)
    # 다음 회차 추천 번호 기록 (Node 필요)
    try:
        subprocess.run(["node", str(here / "record_picks.js")], check=True)
    except FileNotFoundError:
        print("Node가 없어 추천 기록을 건너뛰었어요")


if __name__ == "__main__":
    main()
