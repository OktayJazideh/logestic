#!/usr/bin/env python3
"""Add done banners to completed task articles in mvp-task-prompts-pro-fa.html."""
from pathlib import Path

DONE_IDS = [
    "comm-ton-1", "tenant-1", "wb-ui-1", "rbac-fix-1", "obj-db-1", "nav-1",
    "kyc-reg-1", "wf-auth-1", "wf-dash-1", "wf-stepper-1", "wf-geofence-1",
    "wf-unload-1", "kyc-nc-1",
]
BANNER = (
    '  <p class="done-banner">✅ <strong>انجام شده</strong> — بازبینی کد ۱۴۰۵/۰۲/۲۸. '
    'جزئیات در <a href="mvp-flow-chat-master-report-fa-v3.html#done">گزارش v3 § done</a>.</p>\n'
)
STYLE = "  .done-banner{background:#ECFDF5;border:1px solid #A7F3D0;padding:8px 12px;border-radius:8px;font-size:13px;margin:0 0 10px}\n"

path = Path(__file__).resolve().parents[1] / "mvp-task-prompts-pro-fa.html"
text = path.read_text(encoding="utf-8")

if ".done-banner" not in text:
    text = text.replace("</style>\n", STYLE + "</style>\n", 1)

for tid in DONE_IDS:
    marker = f'<article class="task" id="{tid}">'
    if marker not in text:
        continue
    idx = text.index(marker)
    h2_end = text.index("</h2>", idx) + len("</h2>")
    chunk = text[idx:h2_end + 80]
    if "done-banner" in chunk:
        continue
    text = text[:h2_end] + "\n" + BANNER + text[h2_end:]

path.write_text(text, encoding="utf-8")
print("Updated", path.name)
