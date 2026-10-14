"""index.html → dist/index.html (claude.ai 아티팩트 배포용)

아티팩트는 <html>/<head>/<body>를 직접 감싸므로 페이지 내용만 남긴다.
style.css, strategy.js, app.js, data/*.json은 함께 배포되는 파일로 올린다.
사용:  python build_artifact.py
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
src = (HERE / "index.html").read_text(encoding="utf-8")

title = re.search(r"<title>.*?</title>", src, re.S).group(0)
body = re.search(r"<body>(.*)</body>", src, re.S).group(1).strip("\n")

out = HERE / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(f'{title}\n<link rel="stylesheet" href="style.css">\n{body}\n', encoding="utf-8")
print(out)
