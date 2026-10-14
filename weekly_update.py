"""매주 자동 업데이트 (Windows 작업 스케줄러가 실행)

새 회차 당첨 데이터를 받고(update_data.py) 바뀐 게 있으면 GitHub에 올려
https://jewa-bro.github.io/lotto-picks/ 에 반영한다.
동행복권 사이트가 가끔 응답하지 않아서 실패하면 10분 뒤 다시 시도한다.
기록: logs/weekly_update.log
"""
import datetime
import json
import os
import pathlib
import subprocess
import sys
import time
import traceback

HERE = pathlib.Path(__file__).parent
LOG = HERE / "logs" / "weekly_update.log"
ATTEMPTS = 4
RETRY_WAIT = 600


def log(msg):
    LOG.parent.mkdir(exist_ok=True)
    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)


def run(*cmd):
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    res = subprocess.run(cmd, cwd=HERE, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} 실패\n{res.stdout}\n{res.stderr}")
    return res.stdout.strip()


def main():
    for attempt in range(1, ATTEMPTS + 1):
        try:
            out = run(sys.executable, "update_data.py")
            log(out.replace("\n", " | "))
            break
        except Exception as e:
            log(f"데이터 받기 실패 ({attempt}/{ATTEMPTS}): {str(e).splitlines()[0]}")
            if attempt == ATTEMPTS:
                return 1
            time.sleep(RETRY_WAIT)

    if not run("git", "status", "--porcelain", "data"):
        log("새 회차가 없어 올릴 게 없어요")
        return 0
    latest = json.loads((HERE / "data" / "lotto.json").read_text(encoding="utf-8"))[-1]
    run("git", "add", "data")
    run("git", "commit", "-m", f"{latest[0]}회 당첨 데이터 업데이트 ({latest[1]})")
    run("git", "push")
    log(f"{latest[0]}회 데이터를 GitHub에 올렸어요")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        log("오류\n" + traceback.format_exc())
        sys.exit(1)
