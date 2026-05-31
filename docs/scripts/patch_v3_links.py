# -*- coding: utf-8 -*-
"""Add pro-prompt links to v3 report tasks."""
import re
from pathlib import Path

v3 = Path(__file__).resolve().parents[1] / "mvp-flow-chat-master-report-fa-v3.html"
text = v3.read_text(encoding="utf-8")

# Map task id suffix to anchor
anchors = {
    "tenant-1": "tenant-1", "wb-ui-1": "wb-ui-1", "rbac-fix-1": "rbac-fix-1",
    "obj-db-1": "obj-db-1", "nav-1": "nav-1", "kyc-reg-1": "kyc-reg-1",
    "kyc-nc-1": "kyc-nc-1", "hourly-rej-1": "hourly-rej-1", "emp-perm-1": "emp-perm-1",
    "dispatch-ui-1": "disp-ui-1", "hh-api-1": "hh-api-1", "fo-panel-1": "fo-panel-1",
    "wb-int-1": "wb-int-1", "bank-auto-1": "bank-auto-1", "set-cycle-1": "set-cycle-1",
    "receipt-pdf-1": "receipt-pdf-1", "currency-ui-1": "currency-ui-1",
    "redispatch-1": "redispatch-1", "hourly-app-1": "hourly-app-1", "sms-prod-1": "sms-prod-1",
    "consult-panel-1": "consult-ui-1", "need-hourly-1": "need-hourly-1",
    "wf-auth-1": "wf-auth-1", "wf-dash-1": "wf-dash-1", "wf-stepper-1": "wf-stepper-1",
    "wf-geofence-1": "wf-geofence-1", "wf-unload-1": "wf-unload-1",
    "wf-wb-read-1": "wf-wb-read-1", "wf-ops-dash-1": "wf-ops-dash-1",
    "wf-dispatch-board-1": "wf-dispatch-board-1", "wf-coop-kyc-wf-1": "wf-coop-kyc-wf-1",
    "wf-fin-load-1": "wf-fin-load-1", "wf-queue-1": "wf-queue-1", "wf-intransit-1": "wf-intransit-1",
}

link_tpl = '<p><a href="mvp-task-prompts-pro-fa.html#{anchor}"><strong>→ پرامپت حرفه‌ای کامل</strong></a></p>'

for task_id, anchor in anchors.items():
    marker = f'id="t-{task_id}"'
    link = link_tpl.format(anchor=anchor)
    if link in text:
        continue
    # Insert after first </motion> or </div> following task opening (title row)
    pattern = rf'(<li class="task" id="t-{re.escape(task_id)}">.*?</div>)'
    def repl(m):
        block = m.group(1)
        if link in block:
            return block
        return block + "\n      " + link
    text2, n = re.subn(pattern, repl, text, count=1, flags=re.DOTALL)
    if n:
        text = text2

# Add prompts-pro section before dod if missing
if 'id="prompts-pro"' not in text:
    section = '''
<section class="panel" id="prompts-pro">
  <h2>۱۶. الگوی پرامپت حرفه‌ای (برای Cursor)</h2>
  <p>هر کارت در <a href="mvp-task-prompts-pro-fa.html"><code>mvp-task-prompts-pro-fa.html</code></a> این ساختار را دارد:</p>
  <ol>
    <li><strong>زمینه</strong> — چرا این تسک و وضعیت فعلی کد</li>
    <li><strong>محدودیت‌ها / آنتی‌پترن</strong> — چه کارهایی ممنوع (مثلاً وزن دستی راننده)</li>
    <li><strong>فایل‌های کلیدی</strong> — مسیر دقیق در monorepo</li>
    <li><strong>پرامپت کپی</strong> — بلوک <code>pre</code> برای paste در چت جدید</li>
    <li><strong>Definition of Done</strong> — چک‌لیست پذیرش</li>
    <li><strong>تست</strong> — npm / Playwright / flutter test</li>
  </ol>
  <p class="muted">قاعده: یک چت = یک کارت. کل بلوک pre را کپی کنید؛ نصفه نزنید.</p>
</section>

'''
    text = text.replace('<section class="panel" id="dod">', section + '<section class="panel" id="dod">')

v3.write_text(text, encoding="utf-8")
print("Patched v3 links")
