# -*- coding: utf-8 -*-
"""Patch v3 report: industrial OS section, mark completed tasks, update todo."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
V3 = ROOT / "mvp-flow-chat-master-report-fa-v3.html"
text = V3.read_text(encoding="utf-8")

INDUSTRIAL_SECTION = '''
<section class="panel" id="industrial-os">
  <h2>۱۷. Industrial Service OS — معماری Service-Agnostic (تصمیم جدید کارفرما)</h2>

  <div class="good">
    <strong>جمع‌بندی:</strong> هدف نهایی «سیستم‌عامل خدمات صنعتی» است نه فقط اپ حمل معدن. این <strong>جهت‌گیری معماری</strong> از الان باید دیده شود؛ پیاده‌سازی کامل همه دسته‌ها خارج MVP فاز ۱ است.
  </div>

  <h3>اصل طلایی پلتفرم</h3>
  <pre style="background:#F3F4F6;padding:12px;border-radius:8px;direction:ltr;text-align:left">Operation → Verification → Settlement</pre>
  <p>هر خدمتی که این سه مرحله را داشته باشد باید بتواند وارد اکوسیستم شود — بدون Hard-Code «حمل بار».</p>

  <h3>چهار ستون معماری (به‌جای Hard-Code حمل)</h3>
  <table>
    <thead><tr><th>ستون</th><th>معنی</th><th>وضعیت در کد logestic</th></tr></thead>
    <tbody>
      <tr><td><strong>OperationType</strong></td><td>نوع عملیات (حمل، ساعتی، غذا، …)</td><td><span class="status s-part">△</span> <code>operation_needs.operation_type</code> فقط TONNAGE|HOURLY؛ نیاز کاتالوگ</td></tr>
      <tr><td><strong>VerificationRule</strong></td><td>چگونه «تأیید» می‌شود (باسکول، GPS، شیفت، …)</td><td><span class="status s-part">△</span> باسکول+ساعتی پیاده؛ rule جدول عمومی ندارد</td></tr>
      <tr><td><strong>PricingRule</strong></td><td>Rate Card / RuleEngine</td><td><span class="status s-ok">✓</span> <code>rateCardsRepository</code> + <code>ruleEngine</code></td></tr>
      <tr><td><strong>SettlementRule</strong></td><td>عملیاتی + Community تن‌محور + Pool</td><td><span class="status s-ok">✓</span> پس از COMM-TON-1</td></tr>
    </tbody>
  </table>

  <h3>دسته‌های آینده (کارفرما — فاز ۲+)</h3>
  <ol>
    <li>حمل و لجستیک (خاک، کنسانتره، سوخت، آب، تجهیزات)</li>
    <li>ماشین‌آلات (لودر، بیل، حفاری، گریدر، ساعتی)</li>
    <li>نیروی انسانی و شیفتی</li>
    <li>رفاهی و کمپ</li>
    <li>مصرفی و پشتیبانی</li>
    <li>پروژه‌ای (عمرانی، برق، …)</li>
  </ol>

  <h3>تأثیر روی لایه‌های سیستم</h3>
  <table>
    <thead><tr><th>لایه</th><th>الان</th><th>باید رعایت شود</th></tr></thead>
    <tbody>
      <tr><td>Data Model</td><td>missions, loads, hourly</td><td>کاتالوگ <code>operation_types</code> + FK</td></tr>
      <tr><td>Workflow / FSM</td><td>FSM ۹‌حالته مأموریت</td><td>FSM per OperationType یا adapter</td></tr>
      <tr><td>Dispatch</td><td>راننده+وسیله برای حمل</td><td>dispatch strategy per type</td></tr>
      <tr><td>Settlement</td><td>تن‌محور + عملیاتی</td><td>SettlementRule per type</td></tr>
      <tr><td>Permission / UI</td><td>نقش‌های فعلی</td><td>منو و فرم بر اساس OperationType</td></tr>
    </tbody>
  </table>

  <p><strong>تسک MVP:</strong> <a href="#t-core-os-1">CORE-OS-1 (P1)</a> — بستر داده و قرارداد API (بدون پیاده‌سازی همه ۶ دسته).</p>
  <p class="muted">فاز ۱ همچنان روی <strong>حمل + ساعتی</strong> تحویل می‌دهد؛ اما نام‌گذاری و schema دیگر «فقط haul» نباشد.</p>
</section>

'''

if 'id="industrial-os"' not in text:
    text = text.replace('<section class="panel" id="decisions">', INDUSTRIAL_SECTION + '<section class="panel" id="decisions">', 1)

# TOC
if 'industrial-os' not in text[:5000]:
    text = text.replace(
        '<li><a href="#comm-share-arch">۱۴. اصلاح معماری Community Share',
        '<li><a href="#comm-share-arch">۱۴. Community Share تن‌محور</a></li>\n    <li><a href="#industrial-os">۱۷. Industrial Service OS</a></li>\n    <li><a href="#decisions">',
        1,
    )

# comm-share done note
text = text.replace(
    '<td><span class="status s-no">ندارد</span> هنوز ۱۳٪ از fare — <a href="#t-comm-ton-1">COMM-TON-1</a></td>',
    '<td><span class="status s-ok">انجام شد</span> <code>computeCommunityContribution</code> — COMM-TON-1</td>',
    1,
)

# Done section append
DONE_BATCH = '''
  <h3>دستهٔ سوم — انجام‌شده در بازبینی اخیر (۱۳ کارت)</h3>
  <p class="muted">بررسی کد + اسکریپت تست — ۱۴۰۵/۰۲/۲۸</p>
  <ul>
    <li>✅ <strong>COMM-TON-1</strong> — Community <code>tons × rial_per_ton</code>؛ <code>financeLedgerRepository.splitOperational</code> — <code>npm run test:comm-ton1</code></li>
    <li>✅ <strong>TENANT-1</strong> — workspaces + requireMineContext + WorkspaceSelectPage — <code>test:tenant1</code></li>
    <li>✅ <strong>WB-UI-1</strong> — WeighbridgePage ثبت empty/loaded + approve</li>
    <li>✅ <strong>RBAC-FIX-1</strong> — HOLD با <code>hold:create</code> — <code>test:rbac-fix1</code></li>
    <li>✅ <strong>OBJ-DB-1</strong> — <code>membership_objections</code> Postgres — <code>test:obj-db1</code> (جایگزین OBJ-1 RAM)</li>
    <li>✅ <strong>NAV-1</strong> — <code>panelNav.ts</code> + RequirePermission — <code>npm -w @app/web run test:nav1</code></li>
    <li>✅ <strong>KYC-REG-1</strong> — <code>POST /households/register</code> + community_app — <code>test:kyc-reg1</code></li>
    <li>✅ <strong>WF-AUTH-1</strong> — login + kyc_pending + suspended (driver_app)</li>
    <li>✅ <strong>WF-DASH-1</strong> — driver_home_screen + GET dashboard — flutter test</li>
    <li>✅ <strong>WF-STEPPER-1</strong> — mission_detail_screen + stepper ۷‌گانه</li>
    <li>✅ <strong>WF-GEOFENCE-1</strong> — mine_entry + factory_entry + geofence_math</li>
    <li>✅ <strong>WF-UNLOAD-1</strong> — unload_confirm_screen</li>
    <li>✅ <strong>KYC-NC-1</strong> — NEEDS_CORRECTION + resubmit (۴ entity) + KycInbox — <code>test:kyc-nc1</code></li>
  </ul>
'''
if 'دستهٔ سوم' not in text:
    text = text.replace(
        '<li>✅ OFFLINE-1, COMM-APP-1, KPI-1, TEST-1</li>\n  </ul>\n</section>\n\n<section class="panel" id="priority">',
        '<li>✅ OFFLINE-1, COMM-APP-1, KPI-1, TEST-1</li>\n' + DONE_BATCH + '</section>\n\n<section class="panel" id="priority">',
        1,
    )

# Update POOL-1 line
text = text.replace(
    '<strong>POOL-1</strong> (توزیع Pool ✓ — <em>ورودی ۱۳٪ از fare؛ بازنگری با COMM-TON-1</em>)',
    '<strong>POOL-1</strong> (توزیع Pool ✓ — ورودی اکنون تن‌محور با COMM-TON-1)',
    1,
)

# Remove completed todo items (comm-ton through kyc-nc)
pattern_done = re.compile(
    r'\s*<li class="task" id="t-comm-ton-1">.*?</li>\s*'
    r'<li class="task" id="t-tenant-1">.*?</li>\s*'
    r'<li class="task" id="t-wb-ui-1">.*?</li>\s*'
    r'<li class="task" id="t-rbac-fix-1">.*?</li>\s*'
    r'<li class="task" id="t-obj-db-1">.*?</li>\s*'
    r'<li class="task" id="t-nav-1">.*?</li>\s*'
    r'<li class="task" id="t-kyc-reg-1">.*?</li>\s*'
    r'<li class="task" id="t-kyc-nc-1">.*?</li>\s*',
    re.DOTALL,
)
text, n = pattern_done.subn('\n', text, count=1)
print("Removed done P0/P1 block:", n)

# Remove WF auth-unload at end
pattern_wf = re.compile(
    r'\s*<li class="task" id="t-wf-auth-1">.*?</li>\s*'
    r'<li class="task" id="t-wf-dash-1">.*?</li>\s*'
    r'<li class="task" id="t-wf-stepper-1">.*?</li>\s*'
    r'<li class="task" id="t-wf-geofence-1">.*?</li>\s*'
    r'<li class="task" id="t-wf-unload-1">.*?</li>\s*',
    re.DOTALL,
)
text, n2 = pattern_wf.subn('\n', text, count=1)
print("Removed done WF block:", n2)

CORE_OS_TODO = '''
    <li class="task" id="t-core-os-1">
      <div><span class="badge new">CORE-OS-1</span> <span class="priority p1">P1</span> <span class="title">بستر OperationType-Based (Industrial Service OS)</span></div>
      <p>تصمیم کارفرما — <a href="#industrial-os">§۱۷</a>. Service-Agnostic؛ بدون بازنویسی کل پلتفرم در فاز ۱.</p>
      <p><a href="mvp-task-prompts-pro-fa.html#core-os-1"><strong>→ پرامپت حرفه‌ای کامل</strong></a></p>
      <details class="prompt"><summary>خلاصه</summary><div class="promptfa"><ul>
        <li>جدول <code>operation_types</code> + seed: HAUL_TONNAGE, HOURLY_EQUIPMENT</li>
        <li><code>operation_needs.operation_type_id</code> FK (migrate از string)</li>
        <li>interfaces: VerificationRuleRef, PricingRuleRef در docs/types</li>
        <li>dispatchService: strategy registry — default haul</li>
        <li>UI: برچسب «عملیات» نه فقط «حمل»</li>
      </ul></div></details>
    </li>
'''

if 't-core-os-1' not in text:
    text = text.replace('<ul class="tasks">', '<ul class="tasks">\n' + CORE_OS_TODO, 1)

# Update todo header counts
text = re.sub(
    r'<h2>تسک‌های باقی‌مانده — \d+ کارت',
    '<h2>تسک‌های باقی‌مانده — ۲۳ کارت',
    text,
    count=1,
)
text = re.sub(
    r'۳۲ انجام‌شده \+ \d+ باقی',
    '۴۵ انجام‌شده + ۲۳ باقی',
    text,
    count=1,
)

# Priority table update
text = text.replace(
    '<tr><td><span class="priority p0">P0</span></td><td><strong>COMM-TON-1</strong></td><td>معماری مالی',
    '<tr><td><span class="priority p1">P1</span></td><td><strong>CORE-OS-1</strong></td><td>بستر OperationType — §۱۷</td></tr>\n      <tr><td><span class="priority p2">P2</span></td><td>HOURLY-REJ, EMP-PERM, …</td><td>ادامه فاز ۱</td></tr>\n      <tr style="display:none"><td><span class="priority p0">P0</span></td><td><strong>COMM-TON-1</strong></td><td>معماری مالی',
    1,
)

# Wireframe matrix — WF done
text = text.replace(
    '<tr><td>43</td><td>UI ورود OTP + Pending/Suspended (وایرفریم ۱)</td><td><span class="status s-part">△</span></td><td><code>login_screen.dart</code></td><td>→ WF-AUTH-1</td></tr>',
    '<tr><td>43</td><td>UI ورود OTP + Pending/Suspended (وایرفریم ۱)</td><td><span class="status s-ok">✓</span></td><td><code>login_screen.dart</code></td><td>WF-AUTH-1</td></tr>',
    1,
)
text = text.replace(
    '<tr><td>44</td><td>داشبورد راننده ۳ حالت (وایرفریم ۲)</td><td><span class="status s-no">✗</span></td><td>—</td><td>→ WF-DASH-1</td></tr>',
    '<tr><td>44</td><td>داشبورد راننده ۳ حالت (وایرفریم ۲)</td><td><span class="status s-ok">✓</span></td><td><code>driver_home_screen.dart</code></td><td>WF-DASH-1</td></tr>',
    1,
)
text = text.replace(
    '<tr><td>45</td><td>جزئیات مأموریت + استپر ۷ گام (وایرفریم ۳)</td><td><span class="status s-part">△</span></td><td><code>mission_stepper.dart</code></td><td>→ WF-STEPPER-1</td></tr>',
    '<tr><td>45</td><td>جزئیات مأموریت + استپر ۷ گام (وایرفریم ۳)</td><td><span class="status s-ok">✓</span></td><td><code>mission_detail_screen.dart</code></td><td>WF-STEPPER-1</td></tr>',
    1,
)
text = text.replace(
    '<tr><td>46</td><td>Geofence معدن/کارخانه (وایرفریم ۴، ۷)</td><td><span class="status s-no">✗</span></td><td>—</td><td>→ WF-GEOFENCE-1</td></tr>',
    '<tr><td>46</td><td>Geofence معدن/کارخانه (وایرفریم ۴، ۷)</td><td><span class="status s-ok">✓</span></td><td>mine/factory_entry</td><td>WF-GEOFENCE-1</td></tr>',
    1,
)
text = text.replace(
    '<tr><td>47</td><td>تأیید تخلیه + قفل (وایرفریم ۸)</td><td><span class="status s-no">✗</span></td><td>—</td><td>→ WF-UNLOAD-1</td></tr>',
    '<tr><td>47</td><td>تأیید تخلیه + قفل (وایرفریم ۸)</td><td><span class="status s-ok">✓</span></td><td><code>unload_confirm_screen.dart</code></td><td>WF-UNLOAD-1</td></tr>',
    1,
)

# Matrix row 4 KYC NEEDS_CORRECTION
text = text.replace(
    'NEEDS_CORRECTION API ندارد',
    'NEEDS_CORRECTION ✓ (KYC-NC-1)',
    1,
)

# Progress
text = text.replace('حدود <strong>۷۲٪</strong> هسته بک‌اند', 'حدود <strong>۸۰٪</strong> هسته بک‌اند', 1)
text = text.replace('<strong>۶۵٪</strong> اپ راننده', '<strong>۷۸٪</strong> اپ راننده', 1)

V3.write_text(text, encoding="utf-8")
print("Patched", V3)
