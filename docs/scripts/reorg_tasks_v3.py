# -*- coding: utf-8 -*-
"""Reorder v3: todo (pending) before done; update §14; add safe CORE-OS staging tasks."""
from pathlib import Path
import re

V3 = Path(__file__).resolve().parents[1] / "mvp-flow-chat-master-report-fa-v3.html"
text = V3.read_text(encoding="utf-8")

# --- §14: reflect COMM-TON-1 done ---
text = text.replace(
    """  <motion class="arch-warn">
    <strong>ارزیابی:</strong> این تغییر <strong>اساسی در Core Financial Architecture</strong> است (نه فقط UI). کد فعلی در <code>financeLedgerRepository.splitAmounts</code> سهم اجتماعی را <strong>۱۳٪ از کرایه</strong> (<code>totalFare × split.household</code>) محاسبه می‌کند — دقیقاً همان الگویی که کارفرما به‌خاطر ریسک <em>Operational Inflation</em> حذف کرده است.<br><br>
    <strong>قابل انجام است:</strong> منطق Pool و <code>distributePool</code> (تقسیم مساوی snapshot) می‌تواند بماند؛ ورودی Pool از «جمع درصد کرایه» به «جمع <code>تن خالص تأییدشده × نرخ ثابت</code>» عوض می‌شود. پرداخت عملیاتی و اقتصاد جامعه <strong>کاملاً جدا</strong> می‌شوند.
  </div>""".replace("<motion", "<motion"),
    """  <div class="arch-warn">
    <strong>ارزیابی (تصمیم کارفرما):</strong> این تغییر <strong>اساسی در Core Financial Architecture</strong> است (نه فقط UI). مدل قبلی: سهم اجتماعی = <strong>۱۳٪ از کرایه</strong> — ریسک <em>Operational Inflation</em>.<br><br>
    <strong>قابل انجام است:</strong> منطق Pool و <code>distributePool</code> می‌ماند؛ ورودی Pool = <code>تن خالص تأییدشده × نرخ ثابت</code>. پرداخت عملیاتی و اقتصاد جامعه <strong>کاملاً جدا</strong>.
  </div>
  <div class="good">
    <strong>✅ انجام شد — COMM-TON-1:</strong> <code>splitOperational</code> + <code>computeCommunityContribution</code>؛ تست <code>npm run test:comm-ton1</code> PASS. UI گزارش مالی دوخطی هنوز در <a href="#t-fin-dual-1">FIN-DUAL-1</a>.
  </div>""",
    1,
)

# Fix if motion typo
text = text.replace(
    '<motion class="arch-warn">',
    '<div class="arch-warn">',
)
text = text.replace('</motion>', '</div>', 1)  # only first in arch-warn if any left

text = text.replace(
    """  <h3>وضعیت در کد فعلی logestic</h3>
  <table>
    <thead><tr><th>اجزا</th><th>الان</th><th>باید شود</th></tr></thead>
    <tbody>
      <tr><td><code>ruleEngine</code></td><td><code>split.household = 0.13</code></td><td><code>community.rial_per_verified_ton</code> (ثابت per mine/coop)</td></tr>
      <tr><td><code>splitAmounts()</code></td><td>۳ درصد از <code>totalFare</code></td><td>عملیاتی: owner% + platform% از fare؛ جامعه: tons × rate</td></tr>
      <tr><td><code>communityPoolsRepository</code></td><td><code>addToPoolTotal(householdAmount)</code></td><td><code>addToPoolTotal(tons × per_ton)</code></td></tr>
      <tr><td>تست <code>test:pool1</code></td><td>فرمول ۱۳٪</td><td>سناریوی تن × نرخ ثابت</td></tr>
      <tr><td>AdminFinance / WF-FIN-LOAD</td><td>نمایش ۸۵/۱۳/۲</td><td>دو خط: Operational | Community (تن‌محور)</td></tr>
    </tbody>
  </table>

  <p><strong>تسک پیاده‌سازی:</strong> <a href="#t-comm-ton-1">COMM-TON-1 (P0)</a> — قبل از هر گزارش مالی جدید به مشتری. وابسته: باسکول تأییدشده (WB-UI-1 / VERIFIED).</p>
  <p class="muted">ورودی Pool با <strong>COMM-TON-1</strong> به مدل تن‌محور منتقل شد (دیگر ۱۳٪ از کرایه نیست).</p>""",
    """  <h3>وضعیت در کد logestic</h3>
  <table>
    <thead><tr><th>اجزا</th><th>وضعیت</th></tr></thead>
    <tbody>
      <tr><td><code>splitOperational</code> + <code>computeCommunityContribution</code></td><td><span class="status s-ok">✓</span> COMM-TON-1</td></tr>
      <tr><td><code>community.rial_per_verified_ton</code> در ruleEngine</td><td><span class="status s-ok">✓</span></td></tr>
      <tr><td><code>distributePool</code> (snapshot مساوی)</td><td><span class="status s-ok">✓</span> بدون تغییر منطق</td></tr>
      <tr><td>AdminFinance / WF-FIN-LOAD</td><td><span class="status s-part">△</span> <a href="#t-fin-dual-1">FIN-DUAL-1</a> — دو خط Operational | Community</td></tr>
    </tbody>
  </table>

  <p><strong>تسک:</strong> <a href="mvp-task-prompts-pro-fa.html#comm-ton-1">COMM-TON-1</a> ✅ — <a href="#done">§ done</a>.</p>""",
    1,
)

# matrix row 22
text = text.replace(
    '<tr><td>22</td><td>Community تن‌محور → Pool</td><td><span class="status s-no">✗</span></td><td>—</td><td><code>COMM-TON-1</code>; Pool distribute ✓</td></tr>',
    '<tr><td>22</td><td>Community تن‌محور → Pool</td><td><span class="status s-ok">✓</span></td><td><code>computeCommunityContribution</code></td><td>FIN-DUAL-1 برای UI</td></tr>',
    1,
)

# Swap sections: todo+priority before done
m_done = re.search(r'(<section class="panel" id="done">.*?</section>\s*\n)', text, re.DOTALL)
m_pri = re.search(r'(<section class="panel" id="priority">.*?</section>\s*\n)', text, re.DOTALL)
m_todo = re.search(r'(<section class="panel" id="todo">.*?</section>\s*\n)', text, re.DOTALL)
if m_done and m_pri and m_todo:
    done_block = m_done.group(1)
    pri_block = m_pri.group(1)
    todo_block = m_todo.group(1)
    # remove all three
    for b in (done_block, pri_block, todo_block):
        text = text.replace(b, "", 1)
    # insert before prompts-pro (or where done was)
    insert_at = text.find('<section class="panel" id="prompts-pro">')
    pending_section = pri_block + todo_block + done_block
    text = text[:insert_at] + pending_section + text[insert_at:]

# TOC order
text = text.replace(
    """    <li><a href="#done">تسک‌های انجام‌شده (۴۵ کارت)</a></li>
    <li><a href="#priority">اولویت‌بندی P1→P3</a></li>
    <li><a href="#todo">تسک‌های باقی‌مانده (۲۳ کارت)</a></li>""",
    """    <li><a href="#priority">اولویت‌بندی P1→P3</a></li>
    <li><a href="#todo">تسک‌های باقی‌مانده</a></li>
    <li><a href="#done">تسک‌های انجام‌شده (۴۵+ کارت)</a></li>""",
    1,
)

# Insert safe staging tasks after todo header, before core-os-1
CORE_OS_0 = '''
    <li class="task" id="t-core-os-0">
      <div><span class="badge new">CORE-OS-0</span> <span class="priority p1">P1</span> <span class="title">کاتالوگ operation_types (فقط افزودنی — بدون شکستن FK)</span></motion>
      <p class="note"><strong>چرا جدا؟</strong> Industrial OS را بدون دست زدن به missions/FSM/settlement شروع می‌کنیم — کمترین ریسک.</p>
      <p>جدول + seed (HAUL_TONNAGE، HOURLY_EQUIPMENT) + <code>GET /api/operation-types</code>. <strong>بدون</strong> حذف ستون <code>operation_type</code> string.</p>
      <p><a href="mvp-task-prompts-pro-fa.html#core-os-0"><strong>→ پرامپت</strong></a></p>
    </li>
'''.replace('<motion>', '</motion>').replace('</motion>', '</div>', 1).replace('<motion>', '<div>')

# fix botched replace
CORE_OS_0 = '''
    <li class="task" id="t-core-os-0">
      <div><span class="badge new">CORE-OS-0</span> <span class="priority p1">P1</span> <span class="title">کاتالوگ operation_types (فقط افزودنی — بدون شکستن FK)</span></div>
      <p class="note"><strong>چرا جدا؟</strong> Industrial OS را بدون دست زدن به missions/FSM/settlement شروع می‌کنیم — کمترین ریسک.</p>
      <p>جدول + seed (HAUL_TONNAGE، HOURLY_EQUIPMENT) + <code>GET /api/operation-types</code>. <strong>بدون</strong> حذف ستون <code>operation_type</code> string.</p>
      <p><a href="mvp-task-prompts-pro-fa.html#core-os-0"><strong>→ پرامپت</strong></a></p>
    </li>
'''

FIN_DUAL = '''
    <li class="task" id="t-fin-dual-1">
      <motion><span class="badge new">FIN-DUAL-1</span> <span class="priority p2">P2</span> <span class="title">نمایش دوخطی Operational | Community در پنل مالی</span></div>
      <p>پس از COMM-TON-1 — فقط UI/گزارش؛ بدون تغییر ledger. جایگزین نمایش ۸۵/۱۳/۲.</p>
      <p><a href="mvp-task-prompts-pro-fa.html#fin-dual-1"><strong>→ پرامپت</strong></a></p>
    </li>
'''.replace('<motion>', '<div>')

CORE_OS_2 = '''
    <li class="task" id="t-core-os-2">
      <div><span class="badge new">CORE-OS-2</span> <span class="priority p2">P2</span> <span class="title">Dispatch strategy registry (پس از CORE-OS-1)</span></div>
      <p><code>DispatchStrategy</code> per operation_types.code؛ haul = کد فعلی. بدون if(haul) پراکنده در ۲۰ فایل.</p>
      <p><a href="mvp-task-prompts-pro-fa.html#core-os-2"><strong>→ پرامپت</strong></a></p>
    </li>
'''

if 't-core-os-0' not in text:
    text = text.replace(
        '<li class="task" id="t-core-os-1">',
        CORE_OS_0 + '\n    <li class="task" id="t-core-os-1">',
        1,
    )

# Update core-os-1 title line to mention depends on OS-0
text = text.replace(
    '<span class="title">بستر OperationType-Based (Industrial Service OS)</span></motion>',
    '<span class="title">FK operation_type_id + backfill (وابسته CORE-OS-0)</span></div>',
    1,
)
text = text.replace(
    '<span class="title">بستر OperationType-Based (Industrial Service OS)</span></div>',
    '<span class="title">FK operation_type_id + backfill (وابسته CORE-OS-0)</span></div>',
    1,
)

if 't-fin-dual-1' not in text:
    text = text.replace(
        '<li class="task" id="t-fo-panel-1">',
        FIN_DUAL + '\n    <li class="task" id="t-fo-panel-1">',
        1,
    )

if 't-core-os-2' not in text:
    text = text.replace(
        '<li class="task" id="t-hourly-rej-1">',
        CORE_OS_2 + '\n    <li class="task" id="t-hourly-rej-1">',
        1,
    )

# Update counts
text = re.sub(
    r'<h2>تسک‌های باقی‌مانده — \d+ کارت',
    '<h2>تسک‌های باقی‌مانده — ۲۶ کارت (اولویت‌بندی — انجام‌نشده بالا)',
    text,
    count=1,
)

# Priority table
text = re.sub(
    r'<tr><td><span class="priority p1">P1</span></td><td><strong>CORE-OS-1</strong></td><td>بستر OperationType-Based — §۱۷ Industrial OS</td></tr>',
    '<tr><td><span class="priority p1">P1</span></td><td><strong>CORE-OS-0</strong> → <strong>CORE-OS-1</strong></td><td>کاتالوگ افزودنی سپس FK nullable + backfill — §۱۷</td></tr>',
    text,
    count=1,
)
text = re.sub(
    r'<tr><td><span class="priority p2">P2</span></td><td>HOURLY-REJ, EMP-PERM',
    '<tr><td><span class="priority p2">P2</span></td><td>CORE-OS-2, FIN-DUAL, HOURLY-REJ, EMP-PERM',
    text,
    count=1,
)

# Reorder todo list: P1 first (os-0, os-1), then all P2, then P3
# Extract task items and sort - complex; instead fix consult-panel position manually in HTML after script

# Footer
text = re.sub(
    r'۴۵ انجام‌شده \+ \d+ باقی',
    '۴۵ انجام‌شده + ۲۶ باقی',
    text,
    count=1,
)

V3.write_text(text, encoding="utf-8")
print("OK:", V3.name)
