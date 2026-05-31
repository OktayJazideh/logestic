# -*- coding: utf-8 -*-
"""Generate mvp-task-prompts-pro-fa.html — run: python docs/scripts/gen_prompts.py"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# کارت‌های انجام‌شده — در HTML پایین صفحه + بنر ✅
DONE_ANCHORS = frozenset({
    "comm-ton-1", "tenant-1", "wb-ui-1", "rbac-fix-1", "obj-db-1", "nav-1",
    "kyc-reg-1", "wf-auth-1", "wf-dash-1", "wf-stepper-1", "wf-geofence-1",
    "wf-unload-1", "kyc-nc-1", "fin-policy-1", "acc-fund-1", "fin-dual-1",
    "comm-ui-legacy-1", "core-os-0", "core-os-1", "svc-contract-1", "invoice-draft-1",
    "mine-pay-flow-1", "platform-legal-1", "gov-workflow-1", "ws-dual-role-1", "sla-escalation-1",
    "wf-role-inbox-1", "wb-manual-1", "wb-int-1", "contract-version-ui-1", "hh-bulk-import-1",
    "hsa-matrix-1", "core-os-2", "e2e-uat-haul-1", "obj-rep-1", "natid-enf-1",
    "iban-audit-1", "emp-perm-1", "dispatch-ui-1", "hh-api-1", "fo-panel-1",
    "tenant-scope-1", "dispatch-lock-1", "wf-wb-read-1", "wf-ops-dash-1",
    "wf-dispatch-board-1", "wf-coop-kyc-wf-1", "wf-fin-load-1",
    "comm-coop-mobile-1", "pilot-taftan-1", "infra-regression-1", "bank-auto-1", "set-cycle-1",
    "receipt-pdf-1", "currency-ui-1", "redispatch-1", "sms-prod-1", "uat-signoff-1",
})

PENDING_ORDER = [
    "wf-queue-1", "wf-intransit-1", "driver-avail-1",
    "hh-kyc-committee-1", "hourly-rej-1", "consult-ui-1", "need-hourly-1", "hourly-app-1",
    "tenant-rls-1",
]

DONE_ORDER = [
    "comm-ton-1", "tenant-1", "wb-ui-1", "rbac-fix-1", "obj-db-1", "nav-1",
    "kyc-reg-1", "wf-auth-1", "wf-dash-1", "wf-stepper-1", "wf-geofence-1",
    "wf-unload-1", "kyc-nc-1", "fin-policy-1", "acc-fund-1", "fin-dual-1",
    "comm-ui-legacy-1", "core-os-0", "core-os-1", "svc-contract-1", "invoice-draft-1",
    "mine-pay-flow-1", "platform-legal-1", "gov-workflow-1", "ws-dual-role-1", "sla-escalation-1",
    "wf-role-inbox-1", "wb-manual-1", "wb-int-1", "contract-version-ui-1", "hh-bulk-import-1",
    "hsa-matrix-1", "core-os-2", "e2e-uat-haul-1", "obj-rep-1", "natid-enf-1",
    "iban-audit-1", "emp-perm-1", "dispatch-ui-1", "hh-api-1", "fo-panel-1",
    "tenant-scope-1", "dispatch-lock-1", "wf-wb-read-1", "wf-ops-dash-1",
    "wf-dispatch-board-1", "wf-coop-kyc-wf-1", "wf-fin-load-1",
    "comm-coop-mobile-1", "pilot-taftan-1", "infra-regression-1", "bank-auto-1", "set-cycle-1",
    "receipt-pdf-1", "currency-ui-1", "redispatch-1", "sms-prod-1", "uat-signoff-1",
]

DONE_BANNER = (
    '  <p class="done-banner">✅ <strong>انجام شده</strong> — بازبینی کد ۱۴۰۵/۰۲/۲۸. '
    'جزئیات: <a href="mvp-flow-chat-master-report-fa-v3.html#done">گزارش v3 § done</a>.</p>\n'
)


@dataclass
class TaskSpec:
    anchor: str
    code: str
    pri: str
    title: str
    ctx: str
    constraints: list[str]
    files: list[str]
    prompt: str
    dod: list[str]
    tests: list[str]
    done: bool = False


SPECS: list[TaskSpec] = []


def add(
    code: str,
    pri: str,
    title: str,
    anchor: str,
    ctx: str,
    constraints: list[str],
    files: list[str],
    prompt: str,
    dod: list[str],
    tests: list[str],
    *,
    done: bool | None = None,
) -> None:
    SPECS.append(
        TaskSpec(
            anchor=anchor,
            code=code,
            pri=pri,
            title=title,
            ctx=ctx,
            constraints=constraints,
            files=files,
            prompt=prompt,
            dod=dod,
            tests=tests,
            done=anchor in DONE_ANCHORS if done is None else done,
        )
    )


def render_task(s: TaskSpec) -> str:
    pri_cls = s.pri.lower()
    banner = DONE_BANNER if s.done else ""
    done_cls = " task-done" if s.done else ""
    return f"""
<article class="task{done_cls}" id="{s.anchor}">
  <h2><span class="badge">{s.code}</span> <span class="{pri_cls}">{s.pri}</span> {s.title}</h2>
{banner}  <div class="ctx"><strong>زمینه:</strong> {s.ctx}</div>
  <h3>محدودیت‌ها / آنتی‌پترن</h3>
  <ul>{"".join(f"<li>{c}</li>" for c in s.constraints)}</ul>
  <h3>فایل‌های کلیدی</h3>
  <ul>{"".join(f'<li><code>{f}</code></li>' for f in s.files)}</ul>
  <h3>پرامپت کپی — paste در Cursor</h3>
  <pre>{s.prompt}</pre>
  <h3>Definition of Done</h3>
  <ul>{"".join(f"<li>{d}</li>" for d in s.dod)}</ul>
  <h3>تست</h3>
  <ul>{"".join(f"<li>{t}</li>" for t in s.tests)}</ul>
</article>"""



def sort_specs(specs: list[TaskSpec]) -> list[TaskSpec]:
    pending = [s for s in specs if not s.done]
    done = [s for s in specs if s.done]

    def key_pending(s: TaskSpec) -> tuple[int, int]:
        try:
            return (0, PENDING_ORDER.index(s.anchor))
        except ValueError:
            return (1, 999)

    def key_done(s: TaskSpec) -> tuple[int, int]:
        try:
            return (0, DONE_ORDER.index(s.anchor))
        except ValueError:
            return (1, 999)

    pending.sort(key=key_pending)
    done.sort(key=key_done)
    return pending + done


def build_toc(pending: list[TaskSpec], done: list[TaskSpec]) -> str:
    lines = [
        '<nav class="toc">',
        "  <strong>باقی‌مانده — اولویت اجرا (بالا → پایین)</strong>",
    ]
    for s in pending:
        mark = " (P1)" if s.pri == "P1" else ""
        lines.append(f'  <a href="#{s.anchor}">{s.code}{mark}</a>')
    lines += [
        '  <hr style="border:none;border-top:1px solid #E5E7EB;margin:10px 0" />',
        f"  <strong>انجام‌شده ({len(done)} کارت — پایین صفحه)</strong>",
    ]
    for s in done:
        lines.append(f'  <a href="#{s.anchor}">{s.code} ✅</a>')
    lines.append("</nav>")
    return "\n".join(lines)


def build_html(specs: list[TaskSpec]) -> str:
    ordered = sort_specs(specs)
    pending = [s for s in ordered if not s.done]
    done = [s for s in ordered if s.done]
    n_pending = len(pending)
    n_done = len(done)

    articles_pending = "\n".join(render_task(s) for s in pending)
    articles_done = "\n".join(render_task(s) for s in done)

    return f"""<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>پرامپت‌های حرفه‌ای MVP — {len(specs)} کارت (logestic)</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  :root{{--bg:#FAFAF7;--panel:#fff;--text:#1F2937;--muted:#6B7280;--border:#E5E7EB;--primary:#1B5E20}}
  body{{margin:0;background:var(--bg);font-family:Tahoma,sans-serif;font-size:15px;line-height:1.85;color:var(--text)}}
  .wrap{{max-width:1100px;margin:0 auto;padding:24px 18px 80px}}
  header{{background:linear-gradient(180deg,#0F3D17,#1B5E20);color:#fff;border-radius:14px;padding:20px;margin-bottom:18px}}
  header a{{color:#D1FAE5}}
  .task{{border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:20px;background:#fff}}
  .task-done{{opacity:.92;border-color:#A7F3D0}}
  .task h2{{margin:0 0 8px;font-size:17px;color:#0F3D17}}
  .badge{{display:inline-block;background:#7C3AED;color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;margin-left:6px}}
  .p0{{background:#7F1D1D;color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}}
  .p1{{background:#FEE2E2;color:#991B1B;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}}
  .p2{{background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}}
  .p3{{background:#E0E7FF;color:#3730A3;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700}}
  h3{{font-size:14px;color:#0F3D17;margin:14px 0 6px}}
  ul{{margin:6px 0;padding-inline-start:22px}}
  pre{{background:#0B1020;color:#E5E7EB;padding:14px;border-radius:8px;direction:ltr;text-align:left;font-size:12px;line-height:1.65;white-space:pre-wrap;word-break:break-word}}
  code{{background:#F1F5F9;padding:1px 5px;border-radius:4px;font-size:12.5px}}
  .ctx{{background:#FFFBEB;border:1px solid #FCD34D;padding:10px;border-radius:8px;font-size:13.5px;margin:8px 0}}
  .done-banner{{background:#ECFDF5;border:1px solid #A7F3D0;padding:8px 12px;border-radius:8px;font-size:13px;margin:0 0 10px}}
  nav.toc{{background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:20px}}
  nav.toc a{{display:block;padding:3px 0;font-size:13.5px}}
  .section-h{{font-size:16px;color:#0F3D17;border-bottom:2px solid #E5E7EB;padding-bottom:8px;margin:28px 0 16px}}
  .guide{{background:#E0F2FE;border:1px solid #7DD3FC;padding:12px;border-radius:8px;font-size:13.5px;margin-bottom:16px}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>پرامپت‌های حرفه‌ای MVP — {len(specs)} کارت</h1>
  <p><strong>{n_pending} باقی‌مانده</strong> (بالا) · <strong>{n_done} انجام‌شده</strong> (پایین + بنر ✅). یک چت Cursor = یک کارت — کل بلوک <code>pre</code> را کپی کنید.</p>
  <p>مرجع: <a href="mvp-flow-chat-master-report-fa-v3.html">گزارش v3</a> · <a href="mvp-flow-chat-master-report-fa-v3.html#client-answers-detail">جزئیات پاسخ کارفرما (الزامی)</a> · <a href="mvp-flow-chat-master-report-fa-v3.html#prompt-checklist">چک‌لیست ترتیب اجرا</a></p>
</header>

<div class="guide">
  <strong>راهنما:</strong> P1 انجام شده — از بالا با P2 شروع کنید (DISP-UI → HH-API → FO-PANEL → TENANT-SCOPE → WF-* → PILOT-TAFTAN). هر پرامپت شامل مرجع گزارش v3، وضعیت کد فعلی، آنتی‌پترن و تست است. <strong>پس از اتمام هر کارت:</strong> anchor را به <code>DONE_ANCHORS</code> در <code>docs/scripts/gen_prompts.py</code> اضافه کنید، سپس <code>python docs/scripts/gen_prompts.py</code> — کارت به پایین با بنر ✅ منتقل می‌شود.
</div>

{build_toc(pending, done)}

<h2 class="section-h" id="tasks-pending">تسک‌های باقی‌مانده ({n_pending})</h2>
{articles_pending}

<h2 class="section-h" id="tasks-done">تسک‌های انجام‌شده ({n_done})</h2>
{articles_done}

</div>
</body>
</html>
"""


# ─── تعریف کارت‌ها ─────────────────────────────────────────────

add("COMM-TON-1", "P0", "Community Share تن‌محور (جایگزین ۱۳٪ از کرایه)", "comm-ton-1",
    "تصمیم قطعی کارفرما (§۱۴ گزارش v3): Community Contribution = verified_net_tons × fixed_rial_per_ton — مستقل از کرایه.",
    [
        "حذف split.household از درصد کرایه — انگیزه Operational Inflation.",
        "Platform fee فقط روی Operational Payment.",
        "Community → community_pool فقط؛ بدون wallet مستقیم خانوار در split.",
        "net_tons فقط از باسکول تأییدشده (VERIFIED).",
        "distributePool() منطق تقسیم مساوی snapshot حفظ شود.",
    ],
    [
        "apps/backend/src/repositories/financeLedgerRepository.ts",
        "apps/backend/src/services/ruleEngine.ts",
        "apps/backend/src/repositories/communityPoolsRepository.ts",
        "apps/backend/scripts/test-comm-ton1.ts",
        "apps/web/src/pages/AdminFinance.tsx",
    ],
    """پروژه: logestic — کارت COMM-TON-1 (P0 — Core Financial Architecture)

## هدف
جداسازی Operational Economy و Community Economy:

Mine Payment = Operational Payment + Community Contribution

Operational: totalFare → ownerAmount + platformAmount (fee فقط اینجا)
Community: verified_net_tons × community_rial_per_ton → pool only

## وضعیت — بخوان
financeLedgerRepository.ts: splitOperational, computeCommunityContribution

## DoD
test-comm-ton1 ×3 PASS — community مستقل از fare""",
    ["splitOperational + computeCommunityContribution", "test-comm-ton1 PASS"],
    ["npm -w @app/backend run test:comm-ton1"],
)

add("TENANT-1", "P1", "Multi-Tenant Workspace", "tenant-1",
    "Login مرکزی → انتخاب معدن → APIها با mine_id.",
    ["هویت مرکزی.", "FSM/settlement ممنوع."],
    ["apps/backend/src/routes/workspaces.ts", "apps/web/src/pages/WorkspaceSelectPage.tsx"],
    """پروژه: logestic — TENANT-1
workspaces + requireMineContext + test-tenant1""",
    ["test-tenant1 PASS"], ["npm run test:tenant1"])

add("WB-UI-1", "P1", "UI ثبت وزن باسکول (وب)", "wb-ui-1",
    "WeighbridgePage عملیاتی — empty/loaded + approve.",
    ["راننده وزن وارد نمی‌کند."],
    ["apps/web/src/pages/WeighbridgePage.tsx"],
    """پروژه: logestic — WB-UI-1 — WeighbridgePage + Playwright""",
    ["ثبت از وب"], ["playwright weighbridge"])

add("RBAC-FIX-1", "P1", "HOLD → OPERATION_ADMIN", "rbac-fix-1",
    "hold:create برای OPERATION_ADMIN نه CONSULTANT.",
    ["از permissions استفاده کن."],
    ["apps/backend/src/routes/weighbridge.ts"],
    """پروژه: logestic — RBAC-FIX-1 — hold:create + test-rbac-fix1""",
    ["CONSULTANT 403"], ["npm run test:rbac-fix1"])

add("OBJ-DB-1", "P1", "اعتراض Postgres", "obj-db-1",
    "membership_objections جایگزین RAM.",
    ["reporter اجباری."],
    ["apps/backend/src/repositories/objectionsRepository.ts"],
    """پروژه: logestic — OBJ-DB-1""",
    ["persist"], ["npm run test:obj-db1"])

add("NAV-1", "P1", "ناوبری نقش‌محور وب", "nav-1",
    "panelNav + RequirePermission.",
    ["منو از myPermissions."],
    ["apps/web/src/lib/panelNav.ts"],
    """پروژه: logestic — NAV-1""",
    ["منوی نقش‌محور"], ["npm -w @app/web run test:nav1"])

add("KYC-REG-1", "P1", "ثبت‌نام خودخدمت خانوار", "kyc-reg-1",
    "POST /households/register + community_app.",
    ["کدملی قفل."],
    ["apps/backend/src/routes/households.ts"],
    """پروژه: logestic — KYC-REG-1""",
    ["ثبت PENDING"], ["npm run test:kyc-reg1"])

add("WF-AUTH-1", "P1", "UI ورود OTP", "wf-auth-1",
    "login + kyc_pending + suspended.",
    ["بدون skip KYC."],
    ["apps/mobile/driver_app/lib/ui/screens/login_screen.dart"],
    """پروژه: logestic — WF-AUTH-1""",
    ["۳ حالت پس از login"], ["flutter test"])

add("WF-DASH-1", "P1", "داشبورد ۳ حالت", "wf-dash-1",
    "IDLE / ACTIVE / AWAITING_WB.",
    ["از API."],
    ["apps/mobile/driver_app/lib/ui/screens/driver_home_screen.dart"],
    """پروژه: logestic — WF-DASH-1""",
    ["۳ layout"], ["flutter test"])

add("WF-STEPPER-1", "P1", "استپر ۷ گام", "wf-stepper-1",
    "۹ state → ۷ UI.",
    ["map در mission_flow."],
    ["apps/mobile/driver_app/lib/ui/widgets/mission_stepper.dart"],
    """پروژه: logestic — WF-STEPPER-1""",
    ["۷ گام"], ["flutter test"])

add("WF-GEOFENCE-1", "P1", "Geofence", "wf-geofence-1",
    "mine_entry + factory_entry.",
    ["GPS اجباری."],
    ["apps/mobile/driver_app/lib/ui/screens/mine_entry_screen.dart"],
    """پروژه: logestic — WF-GEOFENCE-1""",
    ["خارج geofence disabled"], ["flutter test"])

add("WF-UNLOAD-1", "P1", "تأیید تخلیه", "wf-unload-1",
    "unload_confirm → DELIVERED.",
    ["بدون وزن دستی."],
    ["apps/mobile/driver_app/lib/ui/screens/unload_confirm_screen.dart"],
    """پروژه: logestic — WF-UNLOAD-1""",
    ["flow کامل"], ["flutter test"])

# ─── کارت‌های جدید — پرامپت کامل (پس از پاسخ مکاتبه کارفرما — ۱۴۰۵/۰۲) ───

add(
    "SVC-CONTRACT-1",
    "P1",
    "Service Contract: واحد محاسبه + Community Amount ثابت + نسخه قرارداد",
    "svc-contract-1",
    "کارفرما: Community برای همه خدمات (حمل تن، آب لیتر، غذا تعداد، باطله تن، ماشین‌آلات ساعت). هر قرارداد جدا — خاک و کانسنگ می‌توانند fixed_community_amount متفاوت داشته باشند. کشف: کارشناس رسمی/تأییدشده → ۱۵٪ یک‌بار خارج سیستم → fixed_rial در قرارداد سالانه. فرمول سیستم: Usage × Fixed Amount. یک Rate Card فعال per قرارداد.",
    [
        "درصد (۰.۱۵) در DB ذخیره نشود — فقط fixed_rial_community_amount_per_unit.",
        "MVP پیاده: HAUL_TONNAGE + unit=TON. Stub enum: WATER_LITER, FOOD_COUNT, WASTE_TON, EQUIPMENT_HOUR.",
        "تغییر نرخ: فقط amendment_ref + contract_version++ + status SUPERSEDED + audit — permission contract:amend.",
        "لینک rate_card_id — حداکثر یک ACTIVE per contract+period.",
        "امضا/تأیید: optional signed_at_mine, signed_at_coop (metadata).",
        "بدون rewrite settlement — wire computeCommunityContribution از contract نه ruleEngine پراکنده.",
    ],
    [
        "apps/backend/prisma/schema.prisma — service_contracts (جدید)",
        "apps/backend/src/repositories/serviceContractsRepository.ts",
        "apps/backend/src/services/financePolicyResolver.ts",
        "apps/backend/src/repositories/financeLedgerRepository.ts",
        "apps/web/src/pages/RateCards.tsx",
        "apps/backend/scripts/test-svc-contract1.ts",
    ],
    """پروژه: logestic — SVC-CONTRACT-1 (P1)

## مرجع تصمیم کارفرما (الزامی)
- گزارش v3: #client-answers-detail
- یک مبلغ برای همه بار؟ → **هر Service Contract جدا**
- ۱۳۰/۱۵۰ هزار تومان = فقط مثال — placeholder تا عدد قرارداد بیاید

## Schema service_contracts
- mine_id, cooperative_id, operation_type_code
- unit: TON | LITER | HOUR | COUNT
- base_rate_rial, fixed_community_amount_rial_per_unit
- rate_card_id nullable FK
- valid_from, valid_to, contract_version, amendment_ref
- status: DRAFT | ACTIVE | SUPERSEDED

## API
- POST/PUT: COOP_ADMIN + MINE_ADMIN (dual — هر دو برای ACTIVE)
- GET /api/mines/:id/service-contracts/active?operation_type=HAUL_TONNAGE

## Wire
- computeCommunityContribution(mission): usage از verified_net_tons × contract.fixed_community_amount_rial_per_unit
- splitOperational: کرایه از Rate Card همان contract — Community **جدا** (هرگز از operational کم نشود)

## آنتی‌پترن
- global community rate برای همه مواد
- ذخیره percent در DB
- فعال‌سازی دو contract ACTIVE همزمان برای همان mine+operation_type

## تست test-svc-contract1.ts
- دو contract مختلف fixed amount → community متفاوت
- amendment → version 2 + audit row""",
    ["service_contracts + unit enum", "COMM-TON-1 regression PASS", "test-svc-contract1"],
    ["npm -w @app/backend run test:svc-contract1", "npm run test:comm-ton1"],
)

add(
    "INVOICE-DRAFT-1",
    "P1",
    "صورت وضعیت ماهانه: Draft → Review → Lock (Human Supervised)",
    "invoice-draft-1",
    "کارفرما (HSA): سیستم Draft صورت وضعیت می‌سازد — مستقیم «رسمی قابل پرداخت» به معدن نمی‌فرستد. Review: مدیر تعاونی، مدیر عملیات معدن، نماینده مالی. دلایل رد: باسکول اشتباه، برگشتی، مغایرت، مأموریت باطل. پس از Lock → معدن به IBAN تعاونی واریز می‌کند.",
    [
        "وضعیت: DRAFT → PENDING_REVIEW → APPROVED → LOCKED.",
        "محتوا: تناژ، تعداد سرویس، operational_total، community_total، deductions، period_key.",
        "پس از LOCK: payable_iban = cooperative official (از KYC)؛ لینک monthly-close/settlement.",
        "رد با rejection_reason اجباری + audit.",
        "بدون BANK-AUTO؛ بدون ارسال خودکار SMS به معدن در MVP.",
    ],
    [
        "apps/backend/prisma/schema.prisma — period_statements",
        "apps/backend/src/services/periodStatementService.ts",
        "apps/backend/src/routes/adminFinance.ts",
        "apps/web/src/pages/PeriodStatementPage.tsx",
        "apps/backend/scripts/test-invoice-draft1.ts",
    ],
    """پروژه: logestic — INVOICE-DRAFT-1 (P1)

## مرجع: گزارش v3 #hsa — ۸ مرحله HSA

## هدف
صورت وضعیت رسمی دوره (مثلاً فروردین ۱۴۰۵) قبل از هر واریز معدن.

## period_statements (پیشنهاد)
- mine_id, cooperative_id, period_key (YYYY-MM)
- status, totals (operational_rial, community_rial, deductions_rial, payable_rial)
- cooperative_payable_iban, locked_at, locked_by_user_id
- approvals[] یا جدول period_statement_approvals (role, user_id, at)

## Workflow
1) Job/monthly-close → aggregate VERIFIED missions → INSERT draft
2) COOP_ADMIN / OPERATION_ADMIN / finance role: GET draft + line items
3) POST .../reject { reason } | POST .../approve
4) وقتی همه نقش‌های لازم approve کردند → LOCKED (قفل مالی — immutable lines)
5) UI معدن: فقط پس از LOCK «قابل پرداخت» + IBAN تعاونی

## آنتی‌پترن
- skip review → مستقیم LOCK
- ویرایش خطوط پس از LOCK
- معدن IBAN مالک/خانوار در فیلد payable

## تست
seed ۲ mission → draft totals درست → reject → approve → lock → 409 edit""",
    ["period_statements table", "draft + approve + lock", "test-invoice-draft1"],
    ["npm -w @app/backend run test:invoice-draft1"],
)

add(
    "MINE-PAY-FLOW-1",
    "P1",
    "جریان پرداخت: معدن فقط به حساب تعاونی — نه تسویه خرد",
    "mine-pay-flow-1",
    "کارفرما: معدن در تسویه خرد شرکت نمی‌کند. فقط صورت وضعیت Lock شده → واریز به حساب رسمی تعاونی. سپس (داخلی) Settlement Sheet: مالک ۹۹٪، خانوار از pool، Community. MVP: Excel+mark-paid. سؤال ۳ الف/ب: مالک/خانوار از تعاونی/پلتفرم — نه از معدن مستقیم.",
    [
        "export Excel: ستون payee_type = MINE_TO_COOP | INTERNAL_FLEET_OWNER | INTERNAL_HOUSEHOLD | INTERNAL_COMMUNITY.",
        "mine_payment batch جدا از settlement_payout batch در UI.",
        "پس از واریز معدن: ثبت mine_payment_reference روی period_statement.",
        "Community: optional flag community_via_coop_account=true در metadata.",
        "آنتی‌پترن: هر خط export با mine_id به عنوان payer برای IBAN مالک.",
    ],
    [
        "apps/backend/src/repositories/settlementRepository.ts",
        "apps/web/src/pages/SettlementPage.tsx",
        "apps/web/src/pages/PeriodStatementPage.tsx",
        "docs/mvp-flow-chat-master-report-fa-v3.html §۱۹",
    ],
    """پروژه: logestic — MINE-PAY-FLOW-1 (P1)

## مرجع: #client-answers-detail — «معدن به مالک نمی‌زند»

## هدف
تفکیک واضح دو لایه پرداخت در UI و export.

## تغییرات
1) PeriodStatement (LOCKED): دکمه «ثبت واریز معدن» → mine_payment_reference, paid_at
2) SettlementPage: تب «پرداخت معدن به تعاونی» vs «تسویه داخلی به ذی‌نفعان»
3) export CSV/Excel: header راهنما فارسی برای اپراتور بانک
4) پس از mine paid → اجازه lock settlement batch داخلی (یا همان flow فعلی با guard)

## آنتی‌پترن
- sendToBank که IBAN مالک را به عنوان مقصد از طرف معدن نشان دهد
- مخلوط کردن community pool payout با mine payment در یک فایل بدون برچسب

## DoD
- راهنمای ۳ مرحله‌ای در SettlementPage
- تست دستی: export فقط coop IBAN در بخش mine payment""",
    ["mine payment = coop IBAN only", "docs updated", "UI labels"],
    ["manual: settlement flow review"],
)

add(
    "PLATFORM-LEGAL-1",
    "P2",
    "نقش پلتفرم: Infrastructure — تفکیک نام‌گذاری ledger (مثل اسنپ)",
    "platform-legal-1",
    "کارفرما: پلتفرم کارفرما/پیمانکار اجرایی نیست. ۱٪ = Platform Service Fee. Community = Restricted Fund. Operational = settlement عبوری. Naming در API/UI/Terms.",
    [
        "بدون تغییر منطق محاسبه — فقط labels + fund_type در ACC-FUND-1 هماهنگ شود.",
        "Terms کوتاه در docs یا صفحه About در پنل.",
    ],
    [
        "apps/backend/src/types/permissions.ts",
        "apps/web/src/pages/AdminFinance.tsx",
        "apps/backend/src/repositories/financeLedgerRepository.ts",
    ],
    """پروژه: logestic — PLATFORM-LEGAL-1 (P2)

## مرجع: #platform-role (مثل اسنپ)
پلتفرم: Infrastructure / Settlement / Transparency — **نه** کارفرمای عملیات، **نه** پیمانکار اجرایی.

## تغییرات نام‌گذاری (فارسی + انگلیسی در API)
| قدیم (اجتناب) | جدید |
|----------------|------|
| سهم شرکت از عملیات | Platform Service Fee |
| درآمد تعاونی از معدن | Restricted Community Fund |
| پرداخت معدن به راننده | Operational settlement (داخلی تعاونی) |

## فایل‌ها
- AdminFinance.tsx: سه section با عنوان‌های بالا
- financeLedgerRepository: comments + fund_type هماهنگ ACC-FUND-1
- types/api responses: فیلدهای optional display_label

## Terms (یک پاراگراف RTL در PanelHome footer یا About)
«پلتفرم تنها زیرساخت ثبت، محاسبه و شفافیت مالی است و کارفرمای مستقیم عملیات معدن نیست.»

## آنتی‌پترن
- «پلتفرم پرداخت‌کننده کرایه»
- community_pool در KPI درآمد پلتفرم""",
    ["terminology consistent", "ACC-FUND-1 aligned"],
    ["npm run test:platform-legal1 (3×)", "npm run test:fin-dual1 when DATABASE_URL up"],
)

add(
    "GOV-WORKFLOW-1",
    "P2",
    "Governance: تأیید چندلایه + SLA stub (Human Supervised, not Dependent)",
    "gov-workflow-1",
    "کارفرما: نه Single-Party Approval. لایه‌ها: Operational Verification (معدن/باسکول)، Contract Dual (معدن+تعاونی)، Settlement Maker/Checker، Community Committee (stub)، Platform Staff فقط Audit/Monitor — نه تأیید عملیات روزمره. Human Supervised نه Human Dependent: SLA، Escalation، Queue.",
    [
        "settlement lock: حداقل ۲ user با نقش متفاوت (مثلاً COOP_ADMIN + OPERATION_ADMIN).",
        "period_statement approve: COOP + MINE (هر دو قبل از LOCK).",
        "approval_tasks stub: entity_type, entity_id, assigned_role, due_at, escalated_to, status.",
        "Platform ADMIN: permission audit:read, settlement:lock ممنوع بدون dual.",
        "Override/manual: audit.action=OVERRIDE اجباری.",
    ],
    [
        "apps/backend/src/middleware/rbac.ts",
        "apps/backend/src/types/permissions.ts",
        "apps/backend/src/routes/settlement.ts",
        "apps/backend/prisma/schema.prisma",
    ],
    """پروژه: logestic — GOV-WORKFLOW-1 (P2)

## مرجع: گزارش v3 #governance

## هدف
جلوگیری از: امضای طلایی، گلوگاه انسانی، نقش اجرایی پلتفرم.

## MVP (حداقل)
1) settlement POST .../lock: reject اگر همان user قبلاً approve کرده (maker/checker)
2) period_statement: نیاز COOP_ADMIN approve + OPERATION_ADMIN approve قبل از LOCK
3) permissions.ts: جدا کردن settlement:approve از settlement:lock
4) CONSULTANT/ADMIN: بدون weighbridge approve در MVP (فقط OPERATOR/OPERATION_ADMIN)

## Schema stub (migration OK)
approval_tasks(id, entity_type, entity_id, required_role, due_at, completed_at, escalated_to)

## فاز بعد (comment در کد)
- cron: due_at passed → escalate
- queue: assign_to_role نه assign_to_user

## آنتی‌پترن
- یک COOP_ADMIN همه چیز را approve+lock کند
- پلتفرم staff به عنوان «تأییدکننده باسکول» پیش‌فرض""",
    ["dual approval settlement lock", "audit on override"],
    ["npm run test:gov-workflow1 (3×)", "npm run test:set1", "npm run test:invoice-draft1"],
    done=True,
)

add(
    "WS-DUAL-ROLE-1",
    "P2",
    "عضویت Community جدا از Workspace عملیاتی (دو نقش همزمان)",
    "ws-dual-role-1",
    "سؤال کارفرما: عضو Community تفتان + مالک ناوگان تهران — یکی باشند یا جدا؟ پاسخ: جدا. در کد: households/drivers/fleet_owners vs user_workspace_memberships. UX باید دو «کلاه» را قاطی نکند.",
    [
        "GET /api/workspaces: فیلدهای membership_kind=COMMUNITY|OPERATIONAL و cooperative_id/mine_id",
        "community_app فقط HOUSEHOLD/COOP roles؛ driver_app فقط DRIVER؛ web با workspace select",
        "هنگام login چند membership: WorkspaceSelectPage گروه‌بندی «عضویت تعاونی» vs «کار در معدن»",
        "API scope: household wallet فقط cooperative_id عضویت — نه معدن تهران",
        "fleet_owner missions فقط workspace عملیاتی انتخاب‌شده",
    ],
    [
        "apps/backend/src/routes/workspaces.ts",
        "apps/backend/src/repositories/workspaceMembershipsRepository.ts",
        "apps/web/src/pages/WorkspaceSelectPage.tsx",
        "apps/mobile/community_app/lib/main.dart",
        "apps/mobile/driver_app/lib/main.dart",
    ],
    """پروژه: logestic — WS-DUAL-ROLE-1 (P2)

## مرجع: گزارش v3 #client-arch-qa سوال ۱

## هدف
یک کاربر واقعی، یک لاگین؛ ولی «عضو تعاونی» و «کار در معدن دیگر» در UI و scope جدا دیده شوند.

## Backend
1) listActiveForUser: برگرداندن workspace rows با kind:
   - COMMUNITY: role HOUSEHOLD|COOP_* + cooperative_id (mine از coop)
   - OPERATIONAL: DRIVER|FLEET_OWNER|OPERATION_ADMIN|... + mine_id
2) assertUserCanAccessMine: اگر role=HOUSEHOLD و فقط community membership — 403 روی routes عملیاتی معدن دیگر
3) households/me: فقط cooperative عضویت — بدون leak داده معدن دیگر

## Web WorkspaceSelectPage
- دو بخش RTL: «عضویت در تعاونی» / «کار در معدن»
- زیرعنوان: نام تعاونی یا نام معدن

## Mobile
- community_app: اگر فقط HOUSEHOLD — بدون انتخاب معدن عملیاتی
- اگر user هر دو دارد — deep link به اپ مناسب (document در README کوتاه)

## آنتی‌پترن
- یک cooperative_id روی user که همه scopeها را قفل کند
- نمایش wallet تهران در اپ community تفتان""",
    ["workspaces API kind field", "WorkspaceSelect grouped UI", "household cannot access other mine operational API"],
    ["npm -w @app/backend run test:dual-role1 (3×)", "npm -w @app/backend run test:tenant1"],
    done=True,
)

add(
    "SLA-ESCALATION-1",
    "P2",
    "SLA / Escalation / Timeout روی تأییدها (پس از GOV-WORKFLOW-1)",
    "sla-escalation-1",
    "سؤال کارفرما: اگر تأیید چند روز معطل بماند — SLA از الان؟ پاسخ: MVP بدون escalate خودکار؛ schema و due_at از الان؛ cron فاز بعد. وابسته GOV-WORKFLOW-1 (approval_tasks stub).",
    [
        "Migration: approval_tasks با due_at, status=PENDING|DONE|ESCALATED, escalated_to_role",
        "period_statement PENDING_REVIEW: due_at = created_at + 72h (config env)",
        "settlement batch قبل از lock: stale flag در GET list اگر > SLA",
        "بدون SMS خودکار در MVP — فقط notification in-app stub",
        "cron job nightly: escalate stale → audit + notification job",
    ],
    [
        "apps/backend/prisma/schema.prisma",
        "apps/backend/src/services/periodStatementService.ts",
        "apps/backend/src/queues/handlers/notificationJobs.ts",
        "apps/backend/src/lib/appInit.ts",
        "apps/web/src/pages/PeriodStatementPage.tsx",
    ],
    """پروژه: logestic — SLA-ESCALATION-1 (P2)

## پیش‌نیاز: GOV-WORKFLOW-1 (dual approve) یا حداقل period_statement approvals

## Schema
approval_tasks(
  id, entity_type, entity_id,
  required_role, assigned_user_id nullable,
  due_at, completed_at, escalated_to_role, status, created_at
)

## MVP
1) هنگام submit period_statement به PENDING_REVIEW: insert approval_tasks برای COOP_ADMIN و OPERATION_ADMIN با due_at
2) GET /api/admin/approvals/stale?mine_id= — لیست معطل‌ها
3) PeriodStatementPage: badge «گذشته از مهلت» اگر now > due_at
4) lib/slaConfig.ts: DEFAULT_APPROVAL_SLA_HOURS=72 از env

## فاز بعد (comment + feature flag ENABLE_SLA_ESCALATION=false)
- cron در appInit: tasks با due_at < now و status=PENDING → ESCALATED + notify OPERATION_ADMIN
- escalation chain: COOP_ADMIN → OPERATION_ADMIN → ADMIN

## آنتی‌پترن
- auto-approve بدون انسان
- قفل شدن entity برای همیشه بدون رد/reject""",
    ["approval_tasks table", "due_at on review submit", "stale list API", "UI overdue badge"],
    ["npm run test:sla-escalation1 (3×)"],
    done=True,
)

add(
    "WF-ROLE-INBOX-1",
    "P2",
    "صندوق کار مشترک بر اساس نقش (جلوگیری از SPOF — بدون صف per-user)",
    "wf-role-inbox-1",
    "سؤال کارفرما: Queue-Based یا MVP ساده؟ پاسخ MVP: هر کس با همان نقش می‌تواند ادامه دهد + audit. نه assign به یک نفر. متمایز از WF-QUEUE-1 (زمان‌بندی راننده P3).",
    [
        "GET /api/inbox?role=COOP_ADMIN&mine_id= — items: period_statement PENDING_REVIEW, objections PENDING, kyc PENDING",
        "هیچ assigned_to_user اجباری در MVP",
        "POST approve/lock: audit performed_by — هر operator مجاز",
        "صفحه web ApprovalsInbox.tsx در منوی COOP_ADMIN و OPERATION_ADMIN",
        "RBAC: همان permissionهای فعلی — inbox فقط aggregate view",
    ],
    [
        "apps/backend/src/routes/admin.ts (یا inbox.ts جدید)",
        "apps/web/src/pages/ApprovalsInbox.tsx",
        "apps/web/src/config/panelNav.ts",
        "apps/backend/src/repositories/periodStatementRepository.ts",
    ],
    """پروژه: logestic — WF-ROLE-INBOX-1 (P2)

## مرجع: گزارش v3 #client-arch-qa سوال ۴

## هدف
اگر «علی» نبود «رضا» همان کار را از inbox نقش انجام دهد — بدون انتقال دستی اکانت.

## API GET /api/inbox
Query: mine_id (requireMineContext), optional types[]=period_statement|kyc|objection
Response: { items: [{ type, id, title, status, waiting_since, required_roles[] }] }
Sort: oldest waiting_since first

## Web ApprovalsInbox.tsx
- تب‌ها: صورت وضعیت | KYC | اعتراض
- هر ردیف: لینک به صفحه جزئیات موجود (PeriodStatementPage, KycInbox, ...)
- متن راهنما: «هر کاربر با این نقش می‌تواند اقدام کند»

## آنتی‌پترن
- lock per user که فقط assignee بتواند
- inbox بدون mine_id scope""",
    ["inbox API", "ApprovalsInbox page", "nav link for COOP_ADMIN"],
    ["npm run test:inbox1 (3×)"],
    done=True,
)

add(
    "CONTRACT-VERSION-UI-1",
    "P2",
    "UI نسخه‌گذاری Service Contract و Rate Card (مدل داده آماده)",
    "contract-version-ui-1",
    "سؤال کارفرما: versioning از الان در data model؟ پاسخ: بله DB الان؛ UI مدیریت نسخه/الحاقیه لازم. SVC-CONTRACT-1 backend ✓.",
    [
        "service_contracts.contract_version + amendment_ref + valid_from/to",
        "ایجاد نسخه جدید = رکورد جدید DRAFT — نه update in-place روی ACTIVE",
        "missions.rate_card_id snapshot — تغییر تعرفه آینده مأموریت گذشته را عوض نکند",
        "صفحه web ServiceContractsPage یا توسعه rateCards + contract tab",
    ],
    [
        "apps/backend/src/routes/serviceContracts.ts",
        "apps/web/src/pages/RateCards.tsx",
        "apps/backend/prisma/schema.prisma",
        "apps/backend/scripts/test-svc-contract1.ts",
    ],
    """پروژه: logestic — CONTRACT-VERSION-UI-1 (P2)

## هدف
کارفرما بتواند الحاقیه/نسخه جدید ثبت کند بدون شکستن تاریخچه.

## API
POST /api/service-contracts/:id/new-version
Body: valid_from, base_rate_rial, fixed_community_amount_rial_per_unit, amendment_ref
- نسخه قبلی ACTIVE → valid_to=now اگر overlapping
- نسخه جدید contract_version++

## UI
- لیست نسخه‌های یک mine+coop+operation_type
- badge ACTIVE / DRAFT / EXPIRED
- دکمه «نسخه جدید (الحاقیه)»

## آنتی‌پترن
- UPDATE مستقیم rate روی contract ACTIVE با missionهای باز
- یک rate_card global برای همه معادن""",
    ["new-version API", "UI version list", "old missions keep old rate_card_id"],
    ["npm run test:contract-version-ui1 (3×)", "npm run test:svc-contract1"],
    done=True,
)

add(
    "HH-BULK-IMPORT-1",
    "P2",
    "ورود اولیه خانوار (Whitelist import) برای پایلوت — بدون حذف Registration",
    "hh-bulk-import-1",
    "سؤال کارفرما: Whitelist یا Registration+Approval؟ پاسخ: ثبت+تأیید؛ برای پایلوت import گروهی ادمین.",
    [
        "POST /api/coop/households/import — CSV: national_id, full_name, village_id, mobile_optional",
        "همه ردیف‌ها status=PENDING — همان KYC flow",
        "permission: coop:manage یا kyc:approve",
        "audit: households.bulk_import با row_count",
        "بدون auto-APPROVED مگر flag صریح IMPORT_AUTO_APPROVE=false default",
    ],
    [
        "apps/backend/src/routes/coop.ts",
        "apps/backend/src/repositories/householdsRepository.ts",
        "apps/web/src/pages/CoopRequests.tsx",
    ],
    """پروژه: logestic — HH-BULK-IMPORT-1 (P2)

## هدف
پایلوت تفتان: ۵۰ خانوار از Excel کارفرما — بدون ثبت دستی تک‌تک.

## CSV columns (header required)
national_id,full_name,village_code,mobile

## Flow
1) parse CSV → validate national_id checksum
2) duplicate national_id → skip + report
3) create household PENDING + optional user invite OTP later
4) response: { imported, skipped, errors[] }

## Web
CoopRequests → تب «ورود گروهی» → upload CSV → preview table → confirm

## آنتی‌پترن
- APPROVED بدون reviewer
- import بدون audit""",
    ["import API", "CSV preview UI", "all rows PENDING by default"],
    ["npm run test:hh-bulk-import1 (3×)"],
    done=True,
)

add(
    "HSA-MATRIX-1",
    "P2",
    "ماتریس HSA: چه چیز خودکار / چه چیز دستی (سند + راهنمای پنل)",
    "hsa-matrix-1",
    "سؤال کارفرما: کدام بخش Auto Calc + Human Review و کدام Manual؟ پاسخ: سند یک‌صفحه‌ای در گزارش + باکس راهنما در PanelHome.",
    [
        "بدون تغییر منطق مالی",
        "docs: جدول در گزارش v3 #hsa-matrix",
        "PanelHome: Collapse «راهنمای نقش انسان در سیستم»",
        "هم‌تراز INVOICE-DRAFT و GOV-WORKFLOW",
    ],
    [
        "docs/mvp-flow-chat-master-report-fa-v3.html",
        "apps/web/src/pages/PanelHome.tsx",
    ],
    """پروژه: logestic — HSA-MATRIX-1 (P2 — عمدتاً مستندات)

## جدول (در گزارش v3 #hsa-matrix)
| مرحله | سیستم | انسان |
| محاسبه ۹۹/۱ | خودکار | بازبینی صورت وضعیت |
| Community تن×ثابت | خودکار | Lock دوره |
| Draft صورت وضعیت | خودکار | Review+Approve |
| Dispatch | — | انسان |
| KYC | — | تأیید/رد |
| واریز بانک | فایل Excel | mark-paid + رسید |
| Pool distribute | محاسبه سهم | تریگر ادمین |

## PanelHome.tsx
- Info box RTL با ۴ bullet برای OPERATION_ADMIN/COOP_ADMIN

## آنتی‌پترن
- auto-pay بدون Lock
- راننده وزن وارد کند""",
    ["#hsa-matrix section in v3", "PanelHome info box"],
    ["manual review by product owner"],
    done=True,
)

add(
    "HH-KYC-COMMITTEE-1",
    "P3",
    "تأیید خانوار: کمیته / چند امضا (قابل تنظیم per تعاونی)",
    "hh-kyc-committee-1",
    "سؤال ۷ کارفرما (گزارش v3 #governance): تأیید خانوار توسط یک اپراتور کافی است یا کمیته؟ MVP پایلوت: یک COOP_ADMIN/OPERATOR؛ فاز بعد: quorum=N configurable per cooperative بدون شکستن رفتار فعلی.",
    [
        "پیش‌فرض quorum=1 — رفتار فعلی approve با یک کلیک حفظ شود.",
        "quorum>1 فقط وقتی cooperatives.settings_json.household_approval_quorum تنظیم شده.",
        "جدول household_approvals جدا از approve نهایی — audit هر امضا.",
        "خارج blocker پایلوت فاز ۱ — فقط stub + تست quorum=2.",
        "هماهنگ با GOV-WORKFLOW-1 و KYC-NC-1 (NEEDS_CORRECTION).",
    ],
    [
        "apps/backend/prisma/schema.prisma — household_approvals, cooperatives.settings_json",
        "apps/backend/src/routes/coopKyc.ts — POST .../approve",
        "apps/backend/src/lib/kycWorkflow.ts",
        "apps/backend/scripts/test-hh-kyc-committee1.ts",
    ],
    """پروژه: logestic — HH-KYC-COMMITTEE-1 (P3 — configurable quorum)

## مرجع الزامی
- گزارش v3: #client-answers-detail سؤال ۷، #governance
- پایلوت: یک تأییدکننده تعاونی کافی است
- صورت‌وضعیت مالی: dual approval جدا (INVOICE-DRAFT ✓)

## هدف
امکان N امضا برای تأیید household — بدون شکستن MVP با quorum=1.

## Schema
```prisma
model household_approvals {
  id               BigInt   @id @default(autoincrement())
  household_id     BigInt
  approver_user_id BigInt
  role             String   @db.VarChar(32)
  approved_at      DateTime @default(now())
  @@unique([household_id, approver_user_id])
}
```
cooperatives.settings_json: `{ "household_approval_quorum": 1 }` — default در seed

## Logic در coopKyc.ts POST /coop/households/:id/approve
1) خواندن quorum از cooperative متقاضی (default 1)
2) INSERT household_approvals (reject duplicate approver → 409)
3) COUNT distinct approvers — اگر < quorum → 202 { pending: true, approvals: n, quorum }
4) اگر >= quorum → status=APPROVED (همان مسیر فعلی + wallet create)
5) audit: kyc_household_approval با approver_id

## آنتی‌پترن
- quorum=2 در seed پایلوت بدون درخواست کارفرما
- حذف approve تک‌مرحله‌ای برای coopهای با quorum=1
- یک user دو بار approve کند

## تست test-hh-kyc-committee1.ts
- quorum=1: یک approve → APPROVED (regression KYC فعلی)
- quorum=2: approve اول → pending؛ approve دوم user متفاوت → APPROVED
- همان user دوباره → 409""",
    ["quorum=1 backward compatible", "household_approvals table", "test-hh-kyc-committee1"],
    ["npm -w @app/backend run test-hh-kyc-committee1", "npm run test:kyc-reg1 regression"],
)

add(
    "WB-MANUAL-1",
    "P2",
    "باسکول Manual failover: دلیل + تأیید + Audit",
    "wb-manual-1",
    "کارفرما: Source of Truth حمل = Net Weight باسکول. Manual فقط Failover: لاگ + دلیل + تأیید انسانی (SUPERVISOR/OPERATION_ADMIN) + Audit Trail. راننده وزن وارد نمی‌کند.",
    [
        "entry_source=MANUAL نیاز entry_note ≥ ۲۰ کاراکتر + reason_code enum (SCALE_DOWN, NETWORK, OTHER).",
        "POST weights با MANUAL: permission weighbridge:manual_override (نه COOP_OPERATOR تنها).",
        "audit: weighbridge.manual_entry با ticket_id, operator_id, reason.",
        "PENDING_HOLD اگر manual → flag requires_supervisor_approve قبل از mission approve.",
    ],
    [
        "apps/backend/src/routes/weighbridge.ts",
        "apps/web/src/pages/WeighbridgePage.tsx",
        "apps/backend/scripts/test-wb-manual1.ts",
    ],
    """پروژه: logestic — WB-MANUAL-1 (P2)

## آنتی‌پترن
- راننده empty_weight/loaded_weight در body
- MANUAL بدون audit
- MANUAL بدون تأیید دوم برای VERIFIED

## تست test-wb-manual1.ts
- COOP_OPERATOR + MANUAL → 403
- OPERATION_ADMIN + MANUAL + note → 200 + audit
- approve mission با manual ticket بدون supervisor → 409""",
    ["manual gated", "audit", "test-wb-manual1"],
    ["npm -w @app/backend run test:wb-manual1"],
)

add(
    "PILOT-TAFTAN-1",
    "P2",
    "اولین tenant پایلوت: طلای تفتان — seed + UAT (پلتفرم چندمعدنی)",
    "pilot-taftan-1",
    "محصول SaaS چندمعدنی — طلای تفتان tenant اول UAT. گزارش v3 § prompt-checklist ردیف ۱۰: seed واقعی + سناریوی ۹۰ دقیقه‌ای + community از service_contract. پیش‌نیاز: COMM-TON-1، SVC-CONTRACT-1، INVOICE-DRAFT، MINE-PAY-FLOW ✓.",
    [
        "کد production نباید if mine.code==TAFTAN داشته باشد — فقط seed و docs.",
        "service_contract ACTIVE با fixed_community_amount_rial_per_unit (env یا seed constant).",
        "اختیاری: mine/coop دوم برای تست TENANT-SCOPE.",
        "uat-handover-checklist-fa.md §۳ با OTP dev و شماره seed.",
        "هم‌تراز با E2E-UAT-HAUL-1 ✓.",
    ],
    [
        "apps/backend/scripts/seed.ts",
        "docs/uat-handover-checklist-fa.md",
        "apps/backend/scripts/test-pilot-taftan1.ts (جدید)",
        "docs/mvp-flow-chat-master-report-fa-v3.html#prompt-checklist",
    ],
    """پروژه: logestic — PILOT-TAFTAN-1 (P2 — seed + UAT bundle)

## مرجع: گزارش v3 #prompt-checklist ردیف ۱۰

## seed.ts (idempotent upsert by code)
- mine TAFTAN + cooperative + ACTIVE service_contract HAUL_TONNAGE
- rate_card ACTIVE، users همه نقش‌ها، workspace memberships
- fixed_community_amount در DB — نه فقط env

## UAT checklist §۳ — ۱۰ گام
seed → workspace → need → dispatch → driver FSM → weighbridge VERIFIED
→ assert 99/1 + community=tons×fixed → period_statement → lock → settlement

## test-pilot-taftan1.ts
پس از seed: TAFTAN mine + contract + driver APPROVED

## آنتی‌پترن: hard-code TAFTAN در routes؛ community بدون contract row""",
    ["seed TAFTAN", "checklist §۳", "test-pilot-taftan1"],
    ["npm -w @app/backend run db:seed", "npm -w @app/backend run test:pilot-taftan1"],
)

# ─── کارت‌های قبلی — پرامپت کامل ─────────────────────────────

add("CORE-OS-0", "P1", "کاتالوگ operation_types (افزودنی — بدون FK break)", "core-os-0",
    "کارفرما §۱۷ Industrial Service OS. <strong>مرحله ۱ کم‌ریسک:</strong> فقط جدول کاتالوگ + API خواندنی — missions، FSM، dispatch و COMM-TON-1 دست نخورند.",
    [
        "این PR فقط جدول جدید + seed + GET — بدون FK روی operation_needs/missions.",
        "ستون operation_type (string) فعلی حذف یا rename نشود.",
        "بدون تغییر dispatchService در این کارت (→ CORE-OS-2).",
        "بدون پیاده‌سازی دسته‌های غذا/رفاهی/عمرانی.",
        "migration باید backward-compatible و rollback-safe باشد.",
    ],
    [
        "apps/backend/prisma/schema.prisma",
        "apps/backend/prisma/migrations/",
        "apps/backend/src/repositories/operationTypesRepository.ts (جدید)",
        "apps/backend/src/routes/operationTypes.ts (جدید)",
        "apps/backend/src/app.ts — mount router",
        "apps/backend/scripts/test-core-os0.ts (جدید)",
        "docs/mvp-flow-chat-master-report-fa-v3.html §۱۷",
    ],
    """پروژه: logestic — CORE-OS-0 (P1 — additive catalog only)

## هدف
شروع Industrial Service OS با **کمترین ریسک**: کاتالوگ OperationType بدون شکستن جریان حمل فعلی.

## پیش‌نیاز
COMM-TON-1 ✅ — این کارت settlement را تغییر نمی‌دهد.

## ۱) Prisma — model OperationType
```prisma
model OperationType {
  id              String   @id @default(cuid())
  code            String   @unique  // HAUL_TONNAGE, HOURLY_EQUIPMENT
  category        String   // LOGISTICS | MACHINERY
  name_fa         String
  name_en         String?
  verification_kind String  // WEIGHBRIDGE | HOURLY_LOG
  pricing_kind    String   // RATE_CARD_TONNAGE | HOURLY
  settlement_kind String   // OPERATIONAL_PLUS_COMMUNITY_TON | HOURLY_ONLY
  is_active       Boolean  @default(true)
  created_at      DateTime @default(now())
}
```

## ۲) Seed (در migration یا seed script)
| code | category | verification | pricing | settlement |
|------|----------|--------------|---------|------------|
| HAUL_TONNAGE | LOGISTICS | WEIGHBRIDGE | RATE_CARD_TONNAGE | OPERATIONAL_PLUS_COMMUNITY_TON |
| HOURLY_EQUIPMENT | MACHINERY | HOURLY_LOG | HOURLY | HOURLY_ONLY |

## ۳) operationTypesRepository.ts
- listActive(): OperationType[]
- getByCode(code): OperationType | null
- assertCodeExists(code) → 400

## ۴) API
GET /api/operation-types
- auth: هر نقش لاگین‌شده با mine context
- response: { items: [{ id, code, name_fa, category, verification_kind, pricing_kind }] }
- فقط is_active=true

## ۵) تست scripts/test-core-os0.ts
1) GET /operation-types → 200, length >= 2
2) codes شامل HAUL_TONNAGE و HOURLY_EQUIPMENT
3) ایجاد need قدیمی با operation_type=TONNAGE هنوز کار می‌کند (بدون FK)

## آنتی‌پترن
- ALTER operation_needs ADD FK در همین PR
- تغییر dispatchService
- حذف enum TONNAGE|HOURLY از کد

## Definition of Done
- migration اعمال شد
- seed ۲ نوع
- GET API + test-core-os0 PASS
- test:comm-ton1 و smoke موجود نشکند""",
    [
        "جدول operation_types + ۲ seed",
        "GET /api/operation-types",
        "test-core-os0 PASS",
        "بدون FK break",
    ],
    [
        "npm -w @app/backend run test:core-os0",
        "npm -w @app/backend run test:comm-ton1 (regression)",
    ],
)

add("CORE-OS-1", "P1", "FK operation_type_id + backfill (وابسته CORE-OS-0)", "core-os-1",
    "مرحله ۲: اتصال operation_needs به کاتالوگ — ستون nullable، backfill، dual-write موقت. dispatch registry در CORE-OS-2.",
    [
        "پیش‌نیاز: CORE-OS-0 ✅ (جدول operation_types موجود).",
        "operation_type_id ابتدا NULLABLE — بعد از backfill می‌توان NOT NULL کرد.",
        "ستون string operation_type تا پایان فاز ۱ نگه دارید (dual-write).",
        "missions و FSM ۹‌حالته رفتار قبلی — فقط need به کاتالوگ وصل شود.",
        "بدون dispatch registry در این PR.",
    ],
    [
        "apps/backend/prisma/schema.prisma — operation_needs.operation_type_id",
        "apps/backend/prisma/migrations/",
        "apps/backend/src/repositories/operationTypesRepository.ts",
        "apps/backend/src/repositories/operationNeedsRepository.ts (یا معادل)",
        "apps/backend/src/routes/employer.ts",
        "apps/backend/scripts/test-core-os1.ts (جدید)",
    ],
    """پروژه: logestic — CORE-OS-1 (P1 — FK + backfill)

## هدف
operation_needs به کاتالوگ operation_types وصل شود — بدون شکستن نیازهای قدیمی.

## ۱) Migration
ALTER operation_needs ADD COLUMN operation_type_id TEXT NULL;
ADD FK → operation_types(id) ON DELETE RESTRICT;

## ۲) Backfill script (در migration SQL یا ts)
UPDATE operation_needs SET operation_type_id = (
  SELECT id FROM operation_types WHERE code = CASE
    WHEN operation_type = 'TONNAGE' THEN 'HAUL_TONNAGE'
    WHEN operation_type = 'HOURLY' THEN 'HOURLY_EQUIPMENT'
    ELSE 'HAUL_TONNAGE'
  END
) WHERE operation_type_id IS NULL;

## ۳) Dual-write در create/update need
POST /api/employer/needs:
- قبول operation_type_id (ترجیح) یا operation_type legacy
- اگر فقط legacy: resolve id از کاتالوگ
- هر دو فیلد را پر کن تا گزارش‌های قدیمی کار کنند

## ۴) operationPipeline.ts (قرارداد نوع — بدون پیاده‌سازی کامل)
export type VerificationKind = 'WEIGHBRIDGE' | 'HOURLY_LOG' | ...
export interface OperationPipelineMeta {
  verification_kind: string;
  pricing_kind: string;
  settlement_kind: string;
}
// از operation_types join بخوان — برای UI و فاز بعد

## ۵) EmployerNeed.tsx (حداقل)
- اختیاری: dropdown از GET /operation-types
- label: «نوع عملیات» نه فقط «حمل»

## ۶) تست test-core-os1.ts
1) create need با operation_type_id → ذخیره OK
2) create need با operation_type=TONNAGE فقط → backfill id
3) list needs — join name_fa از operation_types

## آنتی‌پترن
- DROP COLUMN operation_type در MVP
- تغییر mission FSM states
- refactor dispatchService (→ CORE-OS-2)

## DoD
- backfill 100٪ needs موجود
- dual-write
- test-core-os1 PASS""",
    [
        "nullable FK + backfill",
        "dual-write create need",
        "test-core-os1 PASS",
    ],
    ["npm -w @app/backend run test:core-os1"],
)

add("CORE-OS-2", "P2", "Dispatch strategy registry (پس از CORE-OS-1)", "core-os-2",
    "مرحله ۳: استخراج منطق dispatch فعلی به HaulDispatchStrategy — رفتار production برای حمل **همان قبل**.",
    [
        "پیش‌نیاز: CORE-OS-1 ✅.",
        "HaulDispatchStrategy = copy رفتار فعلی dispatchService — zero behavior change.",
        "HourlyDispatchStrategy: stub یا مسیر hourly موجود.",
        "selectStrategy فقط از operation_types.code — نه if scattered.",
        "تست regression: dispatch haul need → همان mission shape.",
    ],
    [
        "apps/backend/src/services/dispatchService.ts",
        "apps/backend/src/services/dispatch/strategies/haulDispatchStrategy.ts (جدید)",
        "apps/backend/src/services/dispatch/strategies/hourlyDispatchStrategy.ts (جدید)",
        "apps/backend/src/services/dispatch/dispatchRegistry.ts (جدید)",
        "apps/backend/scripts/test-core-os2.ts (جدید)",
    ],
    """پروژه: logestic — CORE-OS-2 (P2 — dispatch registry)

## هدف
```typescript
interface DispatchStrategy {
  readonly code: string;
  canDispatch(need: OperationNeed, ctx: DispatchContext): Promise<boolean>;
  dispatch(need: OperationNeed, ctx: DispatchContext): Promise<DispatchResult>;
}
```

## ۱) dispatchRegistry.ts
const strategies = new Map<string, DispatchStrategy>();
register(new HaulDispatchStrategy());
register(new HourlyDispatchStrategy());

export function resolveStrategy(operationTypeCode: string): DispatchStrategy

## ۲) HaulDispatchStrategy
- انتقال body فعلی dispatchService.dispatch() بدون تغییر منطق
- code = 'HAUL_TONNAGE'

## ۳) HourlyDispatchStrategy
- اگر hourly path جدا دارد: wrap
- وگرنه: throw 501 با پیام واضح — NEED-HOURLY-1 بعداً

## ۴) dispatchService.ts refactor
export async function dispatchOperationNeed(needId: string) {
  const need = await loadNeedWithOperationType(needId);
  const strategy = resolveStrategy(need.operationType.code);
  return strategy.dispatch(need, ctx);
}

## ۵) تست test-core-os2.ts
1) need HAUL_TONNAGE → mission ایجاد — همان فیلدهای قبل
2) need نامعتبر → 400
3) snapshot تعداد assignment مثل قبل

## آنتی‌پترن
- if (need.type === 'TONNAGE') در routes جدید
- تغییر FSM transition table

## DoD
- registry + ۲ strategy
- test-core-os2 PASS
- test dispatch موجود (اگر هست) PASS""",
    [
        "DispatchStrategy interface",
        "Haul = رفتار قبلی",
        "test-core-os2 PASS",
    ],
    ["npm -w @app/backend run test:core-os2"],
)

add("FIN-DUAL-1", "P1", "نمایش دوخطی Operational | Community (UI فقط)", "fin-dual-1",
    "COMM-TON-1 در ledger ✅. AdminFinance و گزارش load باید دو اقتصاد جدا نشان دهند — نه ۸۵/۱۳/۲.",
    [
        "فقط UI/API read — **هیچ تغییر** در financeLedgerRepository.",
        "از ledger entries یا summary API با فیلدهای operational_* و community_* بخوان.",
        "برچسب household٪ یا split ۱۳٪ را حذف کن.",
        "مبالغ ریال در API؛ تومان با CURRENCY-UI-1 یا helper محلی.",
    ],
    [
        "apps/web/src/pages/AdminFinance.tsx",
        "apps/web/src/pages/FinanceByLoadPage.tsx (یا WF-FIN-LOAD وقتی ساخته شد)",
        "apps/backend/src/services/adminFinanceService.ts — اگر summary ناقص است فقط فیلد اضافه",
        "apps/backend/scripts/test-fin-dual1.ts (اختیاری — API snapshot)",
    ],
    """پروژه: logestic — FIN-DUAL-1 (P2 — UI/reporting only)

## هدف
نمایش شفاف برای کارفرما/ادمین:

| بخش | منبع | فیلدها |
|-----|------|--------|
| Operational | totalFare | ownerAmount, platformAmount, totalFare |
| Community | verified net tons | net_tons, rial_per_ton, communityAmount → pool |

## ۱) AdminFinance.tsx
کارت‌های جدا:
- «پرداخت عملیاتی» — جمع owner + platform در دوره
- «مشارکت اجتماعی (تن‌محور)» — جمع community contributions به pool
- حذف pie chart 85/13/2 اگر هست

جدول loads/missions:
- ستون Operational (ریال)
- ستون Community (ریال) + tons
- tooltip: «مستقل از کرایه»

## ۲) adminFinanceService (فقط اگر لازم)
summary.cards:
  operational_total_rial
  community_contributions_rial
  // نه household_percent

## ۳) FinanceByLoad / modal جزئیات
برای یک load VERIFIED:
```
Operational:  980,000 ریال (owner 960,400 + platform 19,600)
Community:   10,000,000 ریال (20.0 ton × 500,000 ریال/ton) → Pool
```

## ۴) تست
- test-fin-dual1.ts: GET admin finance summary — هر دو فیلد > 0 در seed
- Playwright اختیاری: AdminFinance دو section دیده شود

## آنتی‌پترن
- صدا زدن splitAmounts قدیمی
- محاسبه community از fare در frontend

## DoD
- هیچ ۸۵/۱۳/۲ در UI
- اعداد با test-comm-ton1 سازگار
- regression test:comm-ton1 PASS""",
    [
        "دو بخش Operational | Community در AdminFinance",
        "حذف نمایش درصدی household از fare",
        "سازگار با COMM-TON-1",
    ],
    [
        "npm -w @app/backend run test:fin-dual1 (اگر نوشتی)",
        "دستی: AdminFinance بعد از یک load VERIFIED",
    ],
)

add(
    "FIN-POLICY-1",
    "P1",
    "سیاست مالی per-mine: ۹۹/۱، حالت‌های Community، LEGACY اختیاری",
    "fin-policy-1",
    "کارفرما: ۹۹٪ مالک / ۱٪ Platform Fee فقط از کرایه عملیاتی. Community **کاملاً مستقل** — هرگز از operational کم نشود. Rate Card قراردادی؛ MVP per ton؛ یک کارت فعال per contract. LEGACY ۸۵/۱۳/۲ فقط با پرچم صریح.",
    [
        "پیش‌فرض: platform_fee_value=0.01 (۱٪) برای mine جدید؛ regression seed بدون تغییر تا test:comm-ton1 PASS.",
        "community از service_contract.fixed_rial_per_unit (پس از SVC-CONTRACT-1) یا rule fallback.",
        "community_contribution_mode: FIXED_RIAL_PER_UNIT (نه PER_TON hardcode در resolver).",
        "legacy PERCENTAGE_OF_OPERATIONAL فقط اگر mine.allow_legacy_community_percent=true.",
        "هیچ کسر community در splitOperational.",
    ],
    [
        "apps/backend/src/services/ruleEngine.ts",
        "apps/backend/src/repositories/financeLedgerRepository.ts",
        "apps/backend/prisma/schema.prisma — finance_rules یا mines اگر فیلد JSON لازم است",
        "apps/backend/scripts/test-fin-policy1.ts (جدید)",
        "docs/mvp-flow-chat-master-report-fa-v3.html#fin-policy-ledger",
    ],
    """پروژه: logestic — FIN-POLICY-1 (P1 — policy layer only)

## مرجع الزامی
- گزارش v3: #client-answers-detail
- Community **هرگز** از operational_payment کسر نشود
- ۹۹٪ مالک / ۱٪ Platform Fee **فقط** از کرایه عملیاتی

## هدف
`resolveFinancePolicy(mineId, ctx)` — Core Stable, Policy Flexible.

## Policy object (خروجی resolver)
- platform_fee_mode: PERCENTAGE_OF_OPERATIONAL_PAYMENT
- platform_fee_value: 0.01 (پیش‌فرض کارفرما)
- community_contribution_mode: FIXED_RIAL_PER_UNIT (از service_contract)
- community_contribution_base: VERIFIED_NET_TONNAGE (حمل) | per contract unit
- legacy: PERCENTAGE_OF_OPERATIONAL فقط اگر mine.allow_legacy_community_percent=true

## Wire
1) splitOperational(totalFare, policy) → owner 99%, platform 1% (با rounding ریال در انتها)
2) computeCommunityContribution → **جدا** از splitOperational؛ از contract.fixed_rial_per_unit × usage
3) Rate Card: یک ACTIVE per service_contract (لینک SVC-CONTRACT-1)

## تست test-fin-policy1.ts
- seed ثابت: خروجی = test:comm-ton1
- mine با platform 0.01 → platformAmount === round(operational * 0.01)
- assert communityAmount + ownerAmount + platformAmount accounting جدا

## آنتی‌پترن
- household/platform از درصد کرایه در مسیر اصلی
- community = fare * 0.13
- hard-code 0.02 platform در financeLedgerRepository

## DoD
- test:comm-ton1 + test:fin-policy1 PASS""",
    [
        "resolveFinancePolicy + wire",
        "پیش‌فرض = رفتار فعلی COMM-TON-1",
        "سناریوی ۱٪ platform قابل تست",
    ],
    [
        "npm -w @app/backend run test:comm-ton1",
        "npm -w @app/backend run test:fin-policy1",
    ],
)

add(
    "ACC-FUND-1",
    "P1",
    "Accounting lanes: fund_type + ledger_lane روی transactions (nullable → backfill)",
    "acc-fund-1",
    "کارفرما: سه جریان مالی از نظر حسابداری جدا دیده شوند — Operational Money / Platform Revenue / Community Restricted. برای audit، مفاصاحساب، مالیات بعدی.",
    [
        "ستون‌های جدید **nullable**؛ backfill برای ردیف‌های موجود از wallet_type + type + mission_id.",
        "TransactionType موجود (CREDIT/DEBIT/POOL_DISTRIBUTION) دست نخورده بماند — این کارت «لایهٔ دوم» تگ است نه جایگزینی enum فعلی.",
        "هیچ تغییر در مجموع مبالغ یا settlement math در PR اول — فقط metadata + پر کردن در مسیر split جدید.",
        "ایندکس برای گزارش: (mine_id اگر اضافه کردید از join) یا حداقل wallet_id + fund_type.",
        "Reconciliation موجود باید PASS بماند یا با فیلتر optional سازگار شود.",
    ],
    [
        "apps/backend/prisma/schema.prisma — model transactions",
        "apps/backend/prisma/migrations/",
        "apps/backend/src/repositories/financeLedgerRepository.ts — هنگام insert تراکنش، set fund_type",
        "apps/backend/src/services/reconciliationService.ts — در صورت نیاز ignore null",
        "apps/backend/scripts/test-acc-fund1.ts",
    ],
    """پروژه: logestic — ACC-FUND-1 (P1 — accounting metadata)

## مرجع: #platform-role — سه لجر
- OPERATIONAL_PASS_THROUGH — کرایه مالک (امانی عبوری)
- PLATFORM_REVENUE — ۱٪ Platform Service Fee
- COMMUNITY_RESTRICTED — سهم اجتماعی / pool (نه درآمد شرکت)

## fund_type enum (پیشنهاد)
OPERATIONAL | PLATFORM | COMMUNITY_RESTRICTED

## Wire در financeLedgerRepository
- owner credit → OPERATIONAL
- platform credit → PLATFORM
- community_pool credit → COMMUNITY_RESTRICTED
- pool distribution → COMMUNITY_RESTRICTED

## آنتی‌پترن
- platform_fee برچسب «سهم معدن»
- community در گزارش درآمد عملیاتی پلتفرم

## تست test-acc-fund1.ts
- پس از VERIFIED: هر transaction.fund_type NOT NULL
- گزارش AdminFinance فیلتر per fund_type

## هدف
هر ردیف `transactions` بداند پول از کدام **صندوق معنایی** آمده:

| fund_type (String یا Enum جدید) | معنی |
|----------------------------------|------|
| OPERATIONAL | تسویه ناوگان / کرایه عملیاتی |
| PLATFORM_REVENUE | کارمزد پلتفرم |
| COMMUNITY_RESTRICTED | سهم اجتماعی / pool — restricted در گزارش مالی |

ستون اختیاری دوم: `ledger_lane` = OPERATIONAL_LEDGER | PLATFORM_LEDGER | COMMUNITY_LEDGER (یا معادل کوتاه).

## ۱) Prisma
ALTER جدول transactions: ADD fund_type TEXT NULL, ADD ledger_lane TEXT NULL;
Enum prisma اختیاری — اگر Enum، مقادیر را در یک فایل types ثابت کنید.

## ۲) Backfill SQL/TS
- wallet PLATFORM + CREDIT/DEBIT مرتبط با fee → PLATFORM_REVENUE
- wallet OWNER از split operational → OPERATIONAL
- تراکنش‌های مرتبط با community_pool → COMMUNITY_RESTRICTED
- POOL_DISTRIBUTION → COMMUNITY_RESTRICTED

## ۳) Wire
در financeLedgerRepository جایی که transaction ساخته می‌شود: fund_type و ledger_lane را پر کن.

## ۴) تست test-acc-fund1.ts
بعد از یک approve باسکول در seed: همه تراکنش‌های آن mission مقدار fund_type غیر null داشته باشند.

## آنتی‌پترن
- شکستن API responses فرانت در همین PR (فقط اگر فیلد جدید expose شد optional باشد)

## DoD
- migration + backfill
- مسیر جدید پر کردن تگ
- test-acc-fund1 PASS
- test:comm-ton1 PASS""",
    [
        "migration nullable + backfill",
        "insert path sets fund_type",
        "test-acc-fund1 PASS",
    ],
    [
        "npm -w @app/backend run test:acc-fund1",
        "npm -w @app/backend run test:comm-ton1",
    ],
)

add(
    "OBJ-REP-1",
    "P2",
    "اعتراض: رگرسیون reporter + تست (DoD کارفرما)",
    "obj-rep-1",
    "مسیر استاندارد: POST /coop/objections با reporter از session و Prisma NOT NULL. این کارت برای تست خودکار، هر مسیر جایگزین، و هم‌خوانی audit/UI با § decisions است.",
    [
        "بدون session → 401 روی ایجاد اعتراض.",
        "reporter_user_id همیشه از auth — در DB برای رکورد جدید nullable نباشد.",
        "پس از تغییر: npm run test:obj1 و test:obj-db1 سبز بمانند.",
        "MembersTransparencyPage و لیست API با فیلدهای reporter شفاف برای audit.",
    ],
    [
        "apps/backend/src/repositories/objectionsRepository.ts",
        "apps/backend/src/routes/coop.ts — POST /coop/objections",
        "apps/backend/src/stores/entitiesStore.ts — delegate به repository",
        "apps/backend/prisma/schema.prisma — membership_objections",
        "apps/web/src/pages/MembersTransparencyPage.tsx",
        "apps/backend/scripts/test-obj1.ts",
        "apps/backend/scripts/test-obj-db1.ts",
    ],
    """پروژه: logestic — OBJ-REP-1 (P2)

## هدف
قفل DoD کارفرما: اعتراض ناشناس ممنوع. مسیر اصلی از قبل reporter را از req.user می‌گیرد؛ این تسک **رگرسیون و پوشش کامل** است.

## کار
- مرور createObjection: اگر جایی reporter optional مانده → reject یا NOT NULL.
- اسکریپت تست: در test-obj1 (یا فایل جدید کنار آن) سناریوهای بدون token، token بدون scope coop، و happy path COOP_ADMIN/HOUSEHOLD.
- اختیاری: assert در route قبل از create اگر user.id تهی (نباید برسد).

## تست
npm -w @app/backend run test:obj1  (۳ بار طبق کامنت اسکریپت)
npm -w @app/backend run test:obj-db1""",
    ["reporter از auth در تمام مسیرها", "test:obj1 ×3 + test:obj-db1 PASS"],
    [
        "npm -w @app/backend run test:obj1",
        "npm -w @app/backend run test:obj-db1",
    ],
)

add(
    "NATID-ENF-1",
    "P2",
    "کد ملی: enforce یکتا و قفل پس از ثبت در API (ماتریس #۴۰)",
    "natid-enf-1",
    "Schema ممکن است unique داشته باشد؛ گزارش می‌گوید API enforce ناقص — جلوگیری از دور زدن فرم.",
    [
        "تمام مسیرهای create/update national_id — cooperative household driver fleet owner.",
        "خطای 409 با پیام یکسان (بدون افشای وجود رکورد).",
        "بدون تغییر COMM-TON-1 یا settlement.",
    ],
    [
        "apps/backend/src/routes/households.ts",
        "apps/backend/src/routes/coopKyc.ts",
        "apps/backend/scripts/test-natid-enf1.ts",
    ],
    """پروژه: logestic — NATID-ENF-1

## هدف
هر جا national_id در body می‌آید: قبل از commit بررسی unique در scope منطقی (cooperative یا global طبق اسکیمای فعلی).

## پیاده‌سازی
- helper assertNationalIdAvailable(entityType, id, nationalId, prisma)
- فراخوانی در POST register، PATCH coop KYC، و غیره

## تست
- duplicate national_id → 409
- update همان entity همان national_id → 200""",
    ["409 تکراری", "test-natid-enf1 PASS"],
    ["npm -w @app/backend run test:natid-enf1"],
)

add(
    "IBAN-AUDIT-1",
    "P2",
    "تغییر شبا (IBAN) فقط با Audit و endpoint اختصاصی (ماتریس #۴۱)",
    "iban-audit-1",
    "کارفرما: تغییر حساب بانکی حساس است؛ باید در audit_logs ثبت شود نه مخفی در PATCH عمومی.",
    [
        "POST یا PATCH اختصاصی مثلاً POST /api/coop/households/:id/bank-account",
        "قبل/بعد در audit payload؛ reason اختیاری.",
        "validate IBAN format پایه (طول/الگو) — بدون وابستگی خارجی.",
    ],
    [
        "apps/backend/src/routes/coopKyc.ts یا households.ts",
        "apps/backend/src/stores/auditLogStore.ts",
        "apps/web — دکمه اصلاح شبا در فرم KYC در صورت نیاز",
        "apps/backend/scripts/test-iban-audit1.ts",
    ],
    """پروژه: logestic — IBAN-AUDIT-1

## هدف
Endpoint جدا برای تغییر bank_iban با audit الزام‌آور.

## DoD
- تغییر IBAN از مسیر عمومی KYC حذف یا به همین endpoint redirect
- audit action=iban_changed
- test-iban-audit1.ts""",
    ["endpoint + audit", "test-iban-audit1 PASS"],
    ["npm -w @app/backend run test:iban-audit1"],
)

add(
    "COMM-UI-LEGACY-1",
    "P1",
    "حذف UI/متن مدل قدیمی ۱۳٪ / ۸۵-۱۳-۲ (هم‌تراز COMM-TON-1)",
    "comm-ui-legacy-1",
    "بک‌اند COMM-TON-1 ✓ ولی UI هنوز مدل درصدی را نشان می‌دهد — گمراه‌کننده برای کارفرما و UAT. کارفرما: درصد فقط کشف اولیه؛ سیستم Usage×ثابت.",
    [
        "community_app: monthly_share_screen.dart خط ۱۳٪ — جایگزین با «سهم ثابت به ازای تن تأییدشده».",
        "هر Label در web/mobile با ۸۵/۱۳/۲ یا «درصد کرایه» — grep و حذف.",
        "AdminFinance: تأیید دو بخش Operational | Community بدون درصد household از fare.",
        "بدون تغییر منطق ledger.",
    ],
    [
        "apps/mobile/community_app/lib/ui/screens/household/monthly_share_screen.dart",
        "apps/web/src/pages/AdminFinance.tsx",
        "apps/web/src/pages/WalletSummary.tsx",
        "grep در apps/ برای ۱۳٪|0.13|85/13",
    ],
    """پروژه: logestic — COMM-UI-LEGACY-1 (P1 — UI only)

## مرجع: #client-answers-detail — درصد در DB نیست

## کار
1) grep: `۱۳`, `13%`, `0.13`, `85`, `household.*percent` در web + mobile
2) monthly_share_screen: متن فارسی + اگر API دارد فیلدهای community_rial_per_ton نمایش
3) Wallet/AdminFinance: فقط operational_total و community_contribution جدا

## آنتی‌پترن
- تغییر computeCommunityContribution
- نمایش «سهم اجتماعی = X٪ کرایه»

## DoD
- grep صفر در UI (به جز comments/docs)
- FIN-DUAL-1 می‌تواند همزمان یا بعد باشد""",
    ["no 13% in community_app", "AdminFinance dual labels"],
    ["grep apps/mobile/community_app", "grep apps/web/src"],
)

add(
    "E2E-UAT-HAUL-1",
    "P1",
    "Playwright E2E: نیاز → dispatch → باسکول → settlement (دود UAT)",
    "e2e-uat-haul-1",
    "گزارش #dod و PILOT-TAFTAN-1 نیاز سناریوی end-to-end دارند. الان e2e فقط login و employer need→inbox. کارفرما: یک سیکل کامل حمل + monthly-close برای پذیرش.",
    [
        "apps/web/e2e/ — فایل جدید uat-haul-smoke.spec.ts",
        "استفاده از seed/demo + OTP dev",
        "بدون وابستگی به SMS واقعی",
        "پس از INVOICE-DRAFT/MINE-PAY: گسترش تست به period statement",
    ],
    [
        "apps/web/e2e/uat-haul-smoke.spec.ts",
        "apps/web/playwright.config.ts",
        "apps/backend/scripts/seed.ts",
    ],
    """پروژه: logestic — E2E-UAT-HAUL-1 (P1)

## سناریو حداقل (API یا UI)
1) ADMIN seed demo
2) EMPLOYER need 10t
3) OPERATION_ADMIN dispatch
4) COOP_OPERATOR weighbridge weights → approve
5) ADMIN monthly-close یا settlement export visible
6) assert no 403 cross-mine

## اختیاری UI steps در Playwright اگر پایدار است

## DoD
- `npm -w @app/web run test:e2e -- uat-haul` PASS در CI local
- مستند در uat-handover-checklist §۴""",
    ["e2e spec exists", "documents in checklist"],
    ["npm -w @app/web run test:e2e"],
)

add(
    "TENANT-SCOPE-1",
    "P2",
    "گسترش requireMineContext به همه routeهای عملیاتی/مالی",
    "tenant-scope-1",
    "TENANT-1 ✓ workspace انتخاب می‌شود ولی requireMineContext فقط روی employer/driver/weighbridge/hourly است. گزارش v3 ماتریس #۳۹: settlement، adminFinance، wallet، rateCards بدون mine در session — ریسک نشت داده بین معدن‌ها در SaaS چندمستاجره.",
    [
        "الگو: requireMineContext() + requireOperationalWorkspace() از middleware موجود — بدون middleware جدید.",
        "همه queryها باید auth.mineId را filter کنند — نه فقط header check.",
        "ADMIN: bypass با ?mine_id= صریح در query (document در route).",
        "COOP role: scope به cooperative همان mine — assertCooperativeMineScope اگر وجود دارد.",
        "test-tenant-scope1.ts: دو mine در seed — token mine A نباید batch/transaction mine B ببیند.",
    ],
    [
        "apps/backend/src/middleware/requireMineContext.ts",
        "apps/backend/src/routes/settlement.ts",
        "apps/backend/src/routes/adminFinance.ts",
        "apps/backend/src/routes/wallet.ts",
        "apps/backend/src/routes/coop.ts",
        "apps/backend/src/routes/rateCards.ts",
        "apps/backend/src/app.ts — wire router groups",
        "apps/backend/scripts/test-tenant-scope1.ts",
    ],
    """پروژه: logestic — TENANT-SCOPE-1 (P2 — app-level tenant hardening)

## مرجع: گزارش v3 ماتریس #۳۹، #coverage-gap

## وضعیت فعلی — بخوان قبل از تغییر
- requireMineContext.ts + requireOperationalWorkspace() موجود
- TENANT-1: workspaces + WorkspaceSelectPage ✓
- settlement/adminFinance/wallet: **بدون** mine guard

## Routes to wrap (حداقل — grep `router` در هر فایل)
| فایل | endpoints |
|------|-----------|
| settlement.ts | batch list, lock, export, monthly-close |
| adminFinance.ts | finance summary, by-load (اگر هست) |
| wallet.ts | GET balance/transactions — filter mine + owner |
| coop.ts | endpoints عملیاتی مرتبط mine (نه pure community KYC) |
| rateCards.ts | GET list — mine_id از session |

## پیاده‌سازی
1) در app.ts یا هر router: `router.use(requireMineContext())` برای گروه admin/settlement
2) repository calls: همیشه `where: { mine_id: auth.mineId }` یا join loads.mine_id
3) 400 mine_not_selected اگر session بدون mine
4) 403 اگر mine_id در body/query با session mismatch (ADMIN exception)

## تست test-tenant-scope1.ts
Setup: seed mine A + mine B؛ user COOP_ADMIN فقط membership A
- GET /api/admin/settlement/batches → فقط batches mine A
- GET با manipulate mine B id → 403 یا empty
- monthly-close روی mine B → 403
سه بار اجرا (pattern سایر test scripts)

## آنتی‌پترن
- فیلتر mine فقط در UI — نه API
- breaking HOUSEHOLD community routes (WS-DUAL-ROLE ✓)
- TENANT-RLS در همین PR (→ TENANT-RLS-1 جدا)

## DoD
- grep settlement routes → requireMineContext
- test-tenant-scope1 PASS ×3""",
    ["settlement/admin scoped", "wallet scoped", "test-tenant-scope1 ×3"],
    ["npm -w @app/backend run test:tenant-scope1"],
)

add(
    "DISPATCH-LOCK-1",
    "P2",
    "قفل سخت: یک راننده / یک وسیله — فقط یک مأموریت فعال",
    "dispatch-lock-1",
    "ماتریس #۱۰ گزارش v3 △: dispatchService کاندید می‌دهد ولی listDispatchCandidatesForMine راننده busy را exclude نمی‌کند. test-disp1 خط ۱۶۱ انتظار 409 دارد — این کارت enforce + test اختصاص DISPATCH-LOCK.",
    [
        "Active mission = status در {ASSIGNED, LOADING, LOADED, IN_TRANSIT, ARRIVED, AWAITING_WB} — از missionFsm.ts بخوان.",
        "قبل از createMission در haulDispatchStrategy: assert !hasActiveMission(driver_id) && !hasActiveMission(vehicle_id).",
        "code خطا: active_mission_exists — HTTP 409.",
        "test-disp-lock1.ts سه بار + regression test-disp1.",
        "بدون تغییر الگوریتم ۳۰تن / planMissionAssignments.",
    ],
    [
        "apps/backend/src/services/dispatch/strategies/haulDispatchStrategy.ts",
        "apps/backend/src/repositories/dispatchRepository.ts — hasActiveMission helper",
        "apps/backend/src/lib/missionFsm.ts — ACTIVE_STATUSES constant",
        "apps/backend/scripts/test-disp-lock1.ts",
        "apps/backend/scripts/test-disp1.ts — regression",
    ],
    """پروژه: logestic — DISPATCH-LOCK-1 (P2 — concurrency guard)

## مرجع: گزارش v3 ماتریس #۱۰ «یک راننده فعال»

## هدف
جلوگیری از double-assign راننده/وسیله — DoD کارفرما با تست خودکار.

## پیاده‌سازی
### dispatchRepository.ts
```ts
export async function hasActiveMissionForDriver(driverId: number): Promise<boolean>
export async function hasActiveMissionForVehicle(vehicleId: number): Promise<boolean>
```
Query missions WHERE driver_id/vehicle_id AND status IN (...ACTIVE...)

### haulDispatchStrategy.ts — قبل از createMission در loop
```ts
if (await hasActiveMissionForDriver(plan.candidate.driver_id))
  return { ok: false, code: 'active_mission_exists', message: '...' }
```
همین برای vehicle_id

### admin dispatch endpoint
409 با body `{ code: 'active_mission_exists', driver_id?, vehicle_id? }`

## تست test-disp-lock1.ts
1) dispatch need1 → driver A assigned → OK
2) dispatch need2 همان mine → اگر A دوباره pick شد → 409
3) mission A را SETTLED/CANCELLED کن → dispatch need3 → OK
4) vehicle lock: دو need همزمان same vehicle → 409

## آنتی‌پترن
- lock فقط در UI
- skip check برای ADMIN (مگر audit redispatch → REDISPATCH-1)

## DoD
- test-disp-lock1 ×3 PASS
- test-disp1 regression PASS""",
    ["hasActiveMission helper", "409 active_mission_exists", "test-disp-lock1 ×3"],
    ["npm -w @app/backend run test:disp-lock1", "npm -w @app/backend run test:disp1"],
    done=True,
)

add(
    "COMM-COOP-MOBILE-1",
    "P2",
    "community_app: صفحات تعاونی + API parity با وب",
    "comm-coop-mobile-1",
    "گزارش v3 ردیف ۳۸ △: community_app KYC household ✓ ولی coop operator نمی‌تواند از موبایل همان کار KycInbox.tsx وب را بکند (pending، approve، NEEDS_CORRECTION، request-correction). KYC-NC-1 ✓ backend — این کارت UI parity.",
    [
        "همان APIهای coopKyc.ts — بدون endpoint جدید مگر GET inbox paginated.",
        "COOP_OPERATOR|COOP_ADMIN — scope cooperative از token.",
        "NEEDS_CORRECTION + resubmit flow (KYC-NC-1 ✓).",
        "بدون settlement/wallet/admin در app تعاونی.",
        "RTL + mineral theme هماهنگ community_app.",
    ],
    [
        "apps/mobile/community_app/lib/ui/screens/coop/kyc_inbox_screen.dart",
        "apps/mobile/community_app/lib/ui/screens/coop/members_screen.dart",
        "apps/mobile/community_app/lib/core/community_api_client.dart",
        "apps/web/src/pages/KycInbox.tsx — مرجع parity",
        "apps/backend/src/routes/coopKyc.ts",
    ],
    """پروژه: logestic — COMM-COOP-MOBILE-1 (P2 — coop KYC mobile parity)

## مرجع: گزارش v3 #wireframes ردیف ۳۸، ۴۹ (KYC inbox)

## وضعیت فعلی
- KycInbox.tsx وب: tabs PENDING/NEEDS_CORRECTION، approve/reject/suspend/correction ✓
- community_app/coop/: screens پایه — parity ناقص

## هدف
COOP_OPERATOR از community_app بتواند inbox KYC را مدیریت کند.

## API (موجود — wire only)
- GET /api/coop/kyc/inbox?status=PENDING|NEEDS_CORRECTION
- POST /api/coop/{households|drivers|fleet_owners|vehicles}/:id/approve
- POST .../request-correction { reason }
- POST .../reject { reason }

## UI kyc_inbox_screen.dart
1) TabBar: «در انتظار» | «نیاز به اصلاح»
2) ListTile: نام، نوع entity، status badge، تاریخ
3) Tap → detail bottom sheet: مدارک (URL اگر هست)، دکمه‌ها
4) Approve → confirm → API → refresh
5) «درخواست اصلاح» → dialog reason ≥10 char
6) Pull-to-refresh + infinite scroll (page/limit)

## Navigation
- Role COOP_*: tab «تعاونی» در shell → KYC Inbox + Members
- HOUSEHOLD: این صفحات hidden

## تست
- flutter test: mock API approve flow
- دستی: COOP_OPERATOR login → inbox → approve household

## آنتی‌پترن
- API duplicate در mobile-only route
- skip NEEDS_CORRECTION tab
- bulk approve >20 بدون confirm (هماهنگ WF-COOP-KYC-WF-1)

## DoD
- parity حداقلی با KycInbox.tsx
- flutter test coop kyc PASS""",
    ["coop mobile inbox tabs", "approve + request-correction", "COOP role only"],
    ["flutter test test/coop_kyc_inbox_test.dart", "دستی: COOP_OPERATOR flow"],
)

add(
    "INFRA-REGRESSION-1",
    "P2",
    "اسکریپت یکپارچه regression زیرساخت (recon/queue/audit/idem)",
    "infra-regression-1",
    "گزارش v3 #coverage-gap: RECON-1، QUEUE-1، AUDIT-1، IDEM-1 پیاده شده‌اند ولی قبل از UAT/pilot باید یک دستور npm همه را زنجیره کند — ریسک شکستن بی‌تست.",
    [
        "فقط package.json scripts — بدون تغییر business logic.",
        "fail-fast: اولین test fail → exit 1.",
        "شامل testهای مالی بحرانی: comm-ton1, set1 (optional flag).",
        "CI/local: `npm run test:infra-regression` قبل از deploy staging.",
    ],
    [
        "apps/backend/package.json",
        "package.json (root workspace)",
        ".github/workflows/ci.yml — اضافه به pipeline اگر وجود دارد",
    ],
    """پروژه: logestic — INFRA-REGRESSION-1 (P2 — test harness)

## مرجع: گزارش v3 #coverage-gap، #testing

## هدف
یک دستور برای regression زیرساخت غیرUI قبل از PILOT-TAFTAN/UAT.

## apps/backend/package.json
```json
"test:infra-regression": "npm run test:idem1 && npm run test:audit1 && npm run test:event1 && npm run test:queue1 && npm run test:recon1 && npm run test:soft1",
"test:infra-regression:finance": "npm run test:infra-regression && npm run test:comm-ton1 && npm run test:set1"
```

## root package.json (workspace)
```json
"test:infra-regression": "npm -w @app/backend run test:infra-regression"
```

## ترتیب (سبک → سنگین، fail-fast)
idem1 → audit1 → event1 → queue1 → recon1 → soft1

## CI (اختیاری در همین PR)
.github/workflows/ci.yml — step بعد از unit tests

## آنتی‌پترن
- `|| true` که fail را پنهان کند
- testهای flaky بدون fix

## DoD
- `npm run test:infra-regression` سبز روی DB seed شده
- README یا uat-handover-checklist لینک به دستور""",
    ["test:infra-regression script root+backend", "fail-fast chain", "documented in checklist"],
    ["npm run test:infra-regression", "npm run test:infra-regression:finance (optional)"],
)

add(
    "TENANT-RLS-1",
    "P3",
    "Postgres RLS سخت per mine_id (فاز ۱.۵ — اختیاری)",
    "tenant-rls-1",
    "گزارش v3 ماتریس #۳۹: TENANT-SCOPE-1 app-level است؛ RLS DB لایه دوم دفاع برای SaaS production. **خارج blocker پایلوت** — فقط با تأیید صریح کارفرما و پس از TENANT-SCOPE-1 ✓.",
    [
        "پیش‌نیاز: TENANT-SCOPE-1 merged و test-tenant-scope1 PASS.",
        "Prisma migration: ENABLE ROW LEVEL SECURITY + policies per table.",
        "Session variable: SET app.mine_id در middleware prisma extension یا $executeRaw per request.",
        "Role bypass: postgres superuser / migration role — seed script باید SET LOCAL یا BYPASS.",
        "بدون شکستن test:tenant1 و dev seed.",
    ],
    [
        "apps/backend/prisma/migrations/00xx_rls_mine_id/migration.sql",
        "apps/backend/src/db/prisma.ts — SET app.mine_id on connect",
        "apps/backend/src/middleware/requireMineContext.ts",
        "docs/security/rls-mine-id.md (جدید)",
        "apps/backend/scripts/test-tenant-rls1.ts",
    ],
    """پروژه: logestic — TENANT-RLS-1 (P3 — optional DB hardening)

## مرجع: گزارش v3 #coverage-gap، ماتریس #۳۹

## ⚠️ فقط اگر کارفرما تأیید کرد — skip OK برای پایلوت اول

## جداول اولویت (mine_id مستقیم یا via loads)
missions (join loads.mine_id), loads, operation_needs, settlement_batches,
community_pools, period_statements, service_contracts

## Migration pattern
```sql
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
CREATE POLICY loads_mine_isolation ON loads
  USING (mine_id = NULLIF(current_setting('app.mine_id', true), '')::bigint);
```

## Wire prisma.ts
After requireMineContext: `await prisma.$executeRaw`SET app.mine_id = ${mineId}`

## test-tenant-rls1.ts
- دو connection: mine A setting → SELECT loads → فقط A
- بدون setting → deny یا empty (policy dependent)

## آنتی‌پترن
- RLS بدون TENANT-SCOPE (double incomplete)
- شکستن prisma migrate dev
- policies روی users/sessions

## DoD
- docs/security/rls-mine-id.md
- migration + test script
- manual DBA sign-off""",
    ["RLS migration", "app.mine_id session var", "test-tenant-rls1", "security doc"],
    ["npm -w @app/backend run test:tenant-rls1", "manual DBA review"],
)

add(
    "DRIVER-AVAIL-1",
    "P3",
    "اعلام آمادگی راننده (وایرفریم — اختیاری MVP)",
    "driver-avail-1",
    "وایرفریم ۲ دکمه «اعلام آمادگی» — کارفرما در اسپک **اختیاری** و خارج فاز ۱. اگر برای پایلوت خواست: toggle آمادگی راننده برای dispatch ranking (نه جایگزین DISPATCH-LOCK).",
    [
        "خارج فاز ۱ مگر تأیید صریح کارفرما در chat.",
        "ready=true/false — default true برای APPROVED drivers.",
        "dispatchService: optional filter candidates where ready=true (feature flag).",
        "بدون push notification در MVP.",
    ],
    [
        "apps/backend/prisma/schema.prisma — drivers.is_available Boolean default true",
        "apps/backend/src/routes/driver.ts",
        "apps/backend/src/repositories/dispatchRepository.ts",
        "apps/mobile/driver_app/lib/ui/screens/driver_home_screen.dart",
    ],
    """پروژه: logestic — DRIVER-AVAIL-1 (P3 — optional)

## ⚠️ فقط پس از تأیید کارفرما

## Backend
POST /api/driver/availability { ready: boolean }
- auth DRIVER
- update drivers.is_available + audit driver.availability_changed

GET /api/driver/me — include is_available

## dispatchRepository (behind env ENABLE_DRIVER_AVAILABILITY=true)
listDispatchCandidatesForMine: filter drivers where is_available !== false

## UI driver_home_screen
Toggle «آماده کار» — sync با API — badge در home

## آنتی‌پترن
- block dispatch بدون UI toggle
- availability جایگزین active mission lock

## DoD (if approved)
- migration + endpoint + toggle UI
- test manual emulator""",
    ["optional — confirm with client first", "is_available column", "toggle UI"],
    ["manual — skip if not approved"],
)

add(
    "UAT-SIGNOFF-1",
    "P3",
    "بستهٔ تحویل: چک‌لیست UAT + Runbook استقرار",
    "uat-signoff-1",
    "کارفرما اولویت: «تست واقعی و پایدار». این کارت سند handover یک‌جا است — env، migration، seed TAFTAN، npm testهای بحرانی، smoke Playwright، backup، امضای پذیرش.",
    [
        "عمدتاً docs — کد فقط اگر script/build gap باشد.",
        "هم‌تراز PILOT-TAFTAN-1 و E2E-UAT-HAUL-1 ✓.",
        "فارسی RTL، قابل چاپ PDF از Markdown.",
        "لینک از footer گزارش v3.",
    ],
    [
        "docs/uat-handover-checklist-fa.md",
        "docs/deploy-runbook-fa.md (جدید یا merge)",
        "docs/mvp-flow-chat-master-report-fa-v3.html",
        "package.json — لیست test:infra-regression, test:comm-ton1, ...",
    ],
    """پروژه: logestic — UAT-SIGNOFF-1 (P3 — delivery bundle)

## مرجع: گزارش v3 #testing، #dod، PILOT-TAFTAN-1

## هدف
دو سند فارسی برای تیم کارفرما + DevOps:

### 1) docs/uat-handover-checklist-fa.md (گسترش)
- [ ] پیش‌نیاز: Node, Postgres, Redis (اگر queue), DATABASE_URL
- [ ] `npm install` + `prisma migrate deploy` + `db:seed`
- [ ] `npm run test:infra-regression`
- [ ] `npm run test:comm-ton1` + `test:invoice-draft1`
- [ ] Playwright smoke: `npm -w @app/web run test:e2e -- uat-haul`
- [ ] سناریوی ۹۰ دقیقه §۳ PILOT-TAFTAN (checkbox هر گام)
- [ ] Community app + driver app smoke
- [ ] امضا: نام، تاریخ، Pass/Fail، یادداشت

### 2) docs/deploy-runbook-fa.md
- Docker compose یا systemd units
- env نمونه (.env.example reference)
- backup/restore Postgres
- rollback migration
- staging vs production SMS_PROVIDER=mock

## لینک‌ها
- footer گزارش v3 → uat-handover-checklist
- README root → deploy-runbook

## آنتی‌پترن
- checklist بدون دستورات copy-paste
- omit test commands

## DoD
- هر دو فایل commit
- tech lead review checkbox""",
    ["uat-handover-checklist complete", "deploy-runbook-fa.md", "v3 footer link"],
    ["بازبینی دستی tech lead", "کارفرما sign-off blank section"],
)

# Import full P2/P3 from companion module
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompts_p2_p3 import p2_p3_tasks  # noqa: E402

for t in p2_p3_tasks():
    add(
        t["code"], t["pri"], t["title"], t["anchor"],
        t["ctx"], t["constraints"], t["files"], t["prompt"], t["dod"], t["tests"],
    )


if __name__ == "__main__":
    out = ROOT / "mvp-task-prompts-pro-fa.html"
    html = build_html(SPECS)
    out.write_text(html, encoding="utf-8")
    pending = sum(1 for s in SPECS if not s.done)
    done = sum(1 for s in SPECS if s.done)
    print(f"Wrote {len(SPECS)} tasks to {out} ({pending} pending, {done} done)")
