# -*- coding: utf-8 -*-
"""
stamp_version.py — Đóng dấu cache-busting version đồng nhất lên TẤT CẢ
import JS nội bộ + thẻ <script> trong index.html.

Vì sao cần: Cloudflare ép max-age 4h lên file .js (ghi đè no-cache của origin).
Mỗi lần deploy, chạy script này với 1 token MỚI → mọi URL thành cache key mới
→ CF/trình duyệt buộc tải bản mới. Versioning KHÔNG đồng nhất (file này versioned,
file kia bare) gây nạp trùng module + bản cũ — script này loại bỏ hẳn rủi ro đó.

Dùng:  python tools/stamp_version.py [TOKEN]
       (không truyền TOKEN → tự sinh theo ngày-giờ)
"""
import os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS_DIR = os.path.join(ROOT, "js")
TOKEN = sys.argv[1] if len(sys.argv) > 1 else time.strftime("%Y%m%d%H%M")

# from '../x.js'  hoặc  from './x.js?v=cũ'  → from '../x.js?v=TOKEN'
RE_IMPORT = re.compile(r"""(from\s+['"])(\.\.?/[^'"?]+\.js)(?:\?[^'"]*)?(['"])""")
# src="js/x.js" hoặc src="js/x.js?v=cũ" → src="js/x.js?v=TOKEN"
RE_SRC = re.compile(r"""(src=["'])(js/[^"'?]+\.js)(?:\?[^"']*)?(["'])""")
# register("/sw.js") hoặc register("/sw.js?v=cũ") → register("/sw.js?v=TOKEN")
RE_SW = re.compile(r"""(register\(["'])(/sw\.js)(?:\?[^"']*)?(["'])""")
# href="css/x.css" hoặc href="css/x.css?v=cũ" → href="css/x.css?v=TOKEN"
# (QUAN TRỌNG: giao diện nằm trong CSS; không stamp thì CSS bị cache 7 ngày
#  ở Cloudflare/trình duyệt → deploy xong khách vẫn thấy giao diện CŨ.)
RE_CSS = re.compile(r"""(href=["'])(css/[^"'?]+\.css)(?:\?[^"']*)?(["'])""")

def stamp(path, pattern):
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    new = pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={TOKEN}{m.group(3)}", src)
    if new != src:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(new)
        return True
    return False

changed = 0
for dirpath, _, files in os.walk(JS_DIR):
    for fn in files:
        if fn.endswith(".js") and stamp(os.path.join(dirpath, fn), RE_IMPORT):
            changed += 1

idx = os.path.join(ROOT, "index.html")
# index.html cần cả 3: thẻ <script src>, <link href css> và dòng register sw.js
with open(idx, "r", encoding="utf-8") as f:
    html = f.read()
html2 = html
for pat in (RE_SRC, RE_CSS, RE_SW):
    html2 = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={TOKEN}{m.group(3)}", html2)
if html2 != html:
    with open(idx, "w", encoding="utf-8", newline="") as f:
        f.write(html2)
    changed += 1

# sw.js: bump CACHE_NAME theo token — không bump thì SW cũ tiếp tục phục vụ
# index.html/CSS precache CŨ sau deploy (khách không bao giờ thấy bản mới).
swp = os.path.join(ROOT, "sw.js")
if os.path.exists(swp):
    with open(swp, "r", encoding="utf-8") as f:
        sw = f.read()
    sw2 = re.sub(r'const CACHE_NAME = "paint-more-[^"]*"', f'const CACHE_NAME = "paint-more-{TOKEN}"', sw)
    if sw2 != sw:
        with open(swp, "w", encoding="utf-8", newline="") as f:
            f.write(sw2)
        changed += 1

print("Token = " + TOKEN)
print("Stamped files: " + str(changed) + " (js imports + index.html: script src + css href + sw register + sw CACHE_NAME).")
