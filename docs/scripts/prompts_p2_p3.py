# -*- coding: utf-8 -*-
"""Detailed P2/P3 prompts — imported by gen_prompts.py"""


def p2_p3_tasks():
    """Returns list of dicts for add()"""
    return [
        {
            "code": "KYC-NC-1", "pri": "P2", "title": "وضعیت NEEDS_CORRECTION در KYC",
            "anchor": "kyc-nc-1",
            "ctx": "کارفرما: متقاضی باید بتواند پس از «نیاز به اصلاح» مدارک را اصلاح و resubmit کند. الان فقط approve/reject/suspend داریم.",
            "constraints": [
                "فقط COOP_ADMIN/COOP_OPERATOR در scope تعاونی خودش.",
                "reason اجباری در request-correction و reject.",
                "هر transition در audit_logs با before/after status.",
                "بدون تغییر جدول‌های اصلی — فقط enum/status جدید اگر لازم.",
            ],
            "files": [
                "apps/backend/src/routes/coopKyc.ts",
                "apps/backend/prisma/schema.prisma — HouseholdStatus, DriverApprovalStatus",
                "apps/web/src/pages/KycInbox.tsx",
                "apps/mobile/community_app — صفحه resubmit (اختیاری)",
            ],
            "prompt": """پروژه: logestic — کارت KYC-NC-1

## هدف
افزودن گردش‌کار NEEDS_CORRECTION برای household / driver / fleet_owner / vehicle.

## Backend — coopKyc.ts
برای هر entity (مثال households؛ تکرار برای drivers, fleet_owners, vehicles):

### POST /api/coop/households/:id/request-correction
- requireCooperativeScope + COOP_OPERATOR|COOP_ADMIN
- body: { "reason": string } — min 10 chars
- precondition: status in (PENDING, APPROVED) — document
- new status: NEEDS_CORRECTION
- audit: action=kyc_change, payload={ entity, from, to, reason }

### POST /api/coop/households/:id/resubmit
- نقش: HOUSEHOLD (خود متقاضی) یا COOP_* 
- precondition: status === NEEDS_CORRECTION
- body: فیلدهای قابل اصلاح (مثلاً bank_iban, documents) — national_id ممنوع
- new status: PENDING
- audit: kyc_resubmitted

### GET /api/coop/kyc/inbox?status=NEEDS_CORRECTION
- اضافه به فیلتر موجود

## Prisma
اگر enum ندارد: NEEDS_CORRECTION به HouseholdStatus و معادل‌ها — migration کوچک

## Web — KycInbox.tsx
- تب یا فیلتر «نیاز به اصلاح»
- دکمه «درخواست اصلاح» → modal reason → API
- برای ردیف NEEDS_CORRECTION: badge نارنجی + نمایش reason آخر

## تست scripts/test-kyc-nc1.ts
1) approve → request-correction → status NEEDS_CORRECTION
2) resubmit → PENDING
3) household resubmit بدون نقش → 403

ممنوع: حذف رکورد KYC؛ skip audit.""",
            "dod": ["۴ entity type پشتیبانی", "audit هر transition", "test-kyc-nc1 ×3 PASS"],
            "tests": ["npm -w @app/backend run test:kyc-nc1", "دستی: KycInbox فیلتر"],
        },
        {
            "code": "WF-WB-READ-1", "pri": "P2", "title": "باسکول read-only در اپ راننده",
            "anchor": "wf-wb-read-1",
            "ctx": "وایرفریم ۵ وزن دستی نشان می‌دهد — اسپک کارفرما: Source of Truth = باسکول/Agent، راننده **هرگز** وزن وارد نمی‌کند. WB-UI-1 ✓ وب؛ WB-MANUAL-1 ✓ failover. این کارت read-only status برای DRIVER.",
            "constraints": [
                "هیچ TextField/input برای کیلوگرم — grep driver_app برای weight submit.",
                "payment_hold (۵٪): بنر اطلاع‌رسانی — بدون دکمه release/hold.",
                "Auth: DRIVER فقط mission خودش — 403 otherwise.",
                "Offline: cache آخرین GET — فقط نمایش، بدون POST.",
                "هماهنگ missionFsm: AWAITING_WB, LOADED, VERIFIED states.",
            ],
            "files": [
                "apps/mobile/driver_app/lib/ui/screens/weighbridge_read_screen.dart (جدید)",
                "apps/backend/src/routes/driver.ts — GET weighbridge-status",
                "apps/backend/src/routes/weighbridge.ts — reuse ticket logic",
                "apps/mobile/driver_app/lib/ui/router.dart",
                "docs/wireframes-review/ — اسکرین باسکول",
            ],
            "prompt": """پروژه: logestic — WF-WB-READ-1 (P2 — driver_app read-only weighbridge)

## مرجع: گزارش v3 #wireframes ردیف ۵، WB-MANUAL-1 ✓

## هدف
راننده وضعیت باسکول مأموریت خود را ببیند — بدون هیچ action ثبت وزن.

## Backend — GET /api/driver/missions/:missionId/weighbridge-status
Auth: requireAuth + DRIVER + mission.driver_id === auth.user.driverId

Response 200:
```json
{
  "ticket_status": "EMPTY_REGISTERED" | "LOADED_REGISTERED" | "APPROVED" | "PENDING_EMPTY",
  "empty_weight_kg": 12000 | null,
  "loaded_weight_kg": 45000 | null,
  "net_weight_kg": 33000 | null,
  "entry_source": "AGENT" | "MANUAL" | "OPERATOR",
  "hold_percent": 5,
  "payment_hold": false,
  "hold_reason": null
}
```
- net از ticket approved — نه محاسبه client-side
- payment_hold از weighbridge hold state

## UI weighbridge_read_screen.dart
- AppBar: «وضعیت باسکول»
- Stepper افقی: خالی → پر → تأیید (highlight current)
- Cards: وزن خالی / پر / خالص — «—» if null + format kg فارسی
- اگر payment_hold: MaterialBanner قرمز «۵٪ کرایه تا بررسی عملیات مسدود است»
- اگر entry_source=MANUAL: badge «ثبت دستی — در حال بررسی»
- Pull-to-refresh → re-fetch
- **هیچ** FAB/submit/approve

## Navigation
mission_detail / mission_stepper: وقتی status ∈ {LOADED, AWAITING_WB, ARRIVED}
→ TextButton «مشاهده وضعیت باسکول» → /missions/:id/weighbridge

## تست
- flutter test test/weighbridge_read_test.dart — golden + mock API
- backend: DRIVER other mission → 403

## آنتی‌پترن
- POST empty-weight/loaded-weight از driver_app
- TextField عددی
- دکمه Approve/Hold release

## DoD
- grep driver_app POST weighbridge → zero
- HOLD banner when payment_hold=true""",
            "dod": ["read-only UI", "GET API scoped", "HOLD banner", "403 cross-driver"],
            "tests": ["flutter test test/weighbridge_read_test.dart", "npm -w @app/backend run test:wb-read1", "npm -w @app/backend run test:wb1 regression"],
        },
        {
            "code": "WF-DISPATCH-BOARD-1", "pri": "P2", "title": "Dispatch Board (وایرفریم ۹.۷)",
            "anchor": "wf-dispatch-board-1",
            "ctx": "وایرفریم ۹.۷ Kanban drag-drop دارد — کارفرما: dispatch **فقط سیستمی** (dispatchService)، نه assign دستی راننده. DISP-UI-1 دکمه در inbox؛ این کارت بورد ۵ ستونه عملیاتی.",
            "constraints": [
                "بدون drag-assign راننده به need — ممنوع در UI و API.",
                "POST dispatch همان dispatchOperationNeed — Idempotency-Key.",
                "requireMineContext + OPERATION_ADMIN|ADMIN.",
                "DISPATCH-LOCK-1: نمایش خطای active_mission_exists در toast.",
                "Auto-refresh 30s یا manual refresh — بدون websocket MVP.",
            ],
            "files": [
                "apps/web/src/pages/DispatchBoard.tsx (جدید)",
                "apps/backend/src/routes/admin.ts — GET dispatch-board",
                "apps/backend/src/services/dispatchService.ts",
                "apps/web/src/config/panelNav.ts",
                "apps/web/e2e/dispatch-board.spec.ts",
            ],
            "prompt": """پروژه: logestic — WF-DISPATCH-BOARD-1 (P2 — operational Kanban)

## مرجع: گزارش v3 وایرفریم ۹.۷، CORE-OS-2 ✓ dispatch registry

## هدف
بورد مشاهده pipeline نیاز → مأموریت — trigger dispatch خودکار، never manual driver pick.

## API GET /api/admin/dispatch-board
Query: mine_id (from session via requireMineContext)

```json
{
  "columns": {
    "PENDING_NEEDS": [{ "need_id", "village_name", "quantity_tons", "operation_type", "created_at" }],
    "DISPATCHED": [{ "need_id", "missions": [{ "mission_id", "driver_name", "vehicle_plate", "quantity_tons" }] }],
    "IN_PROGRESS": [{ "mission_id", "status", "driver_name", "vehicle_plate" }],
    "AWAITING_WB": [{ "mission_id", "driver_name", "ticket_status" }],
    "VERIFIED": [{ "mission_id", "verified_net_tons", "verified_at" }]
  },
  "generated_at": "ISO"
}
```
Map statuses from missionFsm — single query per column with mine_id filter.

## UI DispatchBoard.tsx
- 5 columns horizontal scroll — mineral theme cards
- PENDING_NEEDS card: دکمه «تخصیص خودکار» → POST /api/admin/dispatch { need_id }
  - Header Idempotency-Key: uuid
  - Success: move card animation + toast mission_ids
  - Error codes: no_dispatch_candidates, active_mission_exists, insufficient_vehicle_capacity
- سایر columns: read-only — click → link /panel/missions/:id
- Toolbar: refresh + last updated
- Route: /panel/dispatch-board — panelNav permission dispatch:create

## Playwright e2e/dispatch-board.spec.ts
seed PENDING need → click dispatch → card leaves PENDING column

## آنتی‌پترن
- Select driver dropdown
- Drag-drop between columns to assign
- manual driver_id in POST body (except ADMIN debug env)

## DoD
- 5 columns populated from API
- dispatch via service only
- e2e spec PASS""",
            "dod": ["GET dispatch-board API", "5-column UI", "auto-dispatch only", "Playwright e2e"],
            "tests": ["npx playwright test e2e/dispatch-board.spec.ts", "npm -w @app/backend run test:disp1"],
        },
        _task("HOURLY-REJ-1", "P3", "رد کارکرد ساعتی توسط مشاور", "hourly-rej-1",
              "کارفرما: مشاور (CONSULTANT) باید کارکرد ساعتی ENDED را با دلیل رد کند — **بدون** ledger/split. خارج فاز ۱ حمل تنی ولی در scope HOURLY.",
              ["CONSULTANT + hourly:reject permission.", "rejection_reason min 10 char.", "status→REJECTED — zero financeLedger calls.", "EMPLOYER/DRIVER/OPERATOR → 403."],
              ["apps/backend/src/routes/hourly.ts", "apps/backend/src/repositories/hourlyWorkLogsRepository.ts", "apps/web/src/pages/ConsultantHourlyInbox.tsx", "apps/backend/scripts/test-hourly-rej1.ts"],
              """پروژه: logestic — HOURLY-REJ-1 (P3 — consultant reject hourly)

## مرجع: گزارش v3 — HOURLY-* خارج فاز ۱ حمل — implement when hourly pilot starts

## Backend POST /api/hourly/:id/reject
- requirePermission('hourly:reject') — CONSULTANT, ADMIN
- body: { rejection_reason: string } — zod min 10
- precondition: log.status in (ENDED, PENDING_VERIFY)
- update: status=REJECTED, rejected_at, rejected_by_user_id
- **assert**: no call to financeLedgerRepository / splitOperational
- audit: hourly_rejected { reason, hours, operator_id }
- 409 if already VERIFIED or REJECTED

## UI ConsultantHourlyInbox.tsx (or extend PaymentControl)
- Table ENDED logs: operator, equipment, duration, started_at
- Row action «رد» → Modal textarea — disable if len<10
- Success: remove from pending list

## تست test-hourly-rej1.ts ×3
1) CONSULTANT reject → 200, REJECTED, no transactions
2) empty reason → 400
3) EMPLOYER → 403

## آنتی‌پترن
- reject creates debit/credit
- CONSULTANT sees settlement pages (NAV-1 scope)""",
              ["reject endpoint", "no ledger", "audit", "test-hourly-rej1 ×3"],
              ["npm -w @app/backend run test:hourly-rej1"]),
        _task("EMP-PERM-1", "P2", "EMPLOYER در Permission Matrix", "emp-perm-1",
              "employer.ts از requireRoles استفاده می‌کند؛ باید به permissions.ts مهاجرت کند.",
              ["EMPLOYER فقط needs:* خودش.", "OPERATION_ADMIN همچنان همه needs را می‌بیند."],
              ["apps/backend/src/types/permissions.ts", "apps/backend/src/routes/employer.ts", "apps/backend/src/middleware/rbac.ts"],
              """پروژه: logestic — EMP-PERM-1

permissions.ts — نقش EMPLOYER:
- needs:create
- needs:read_own
- needs:cancel

employer.ts:
- جایگزین requireRoles(['EMPLOYER']) با requirePermission
- GET /needs: اگر needs:read_own → filter employer_user_id = auth.userId
- POST cancel: needs:cancel + مالکیت

تست: EMPLOYER نمی‌تواند GET /admin/* ; OPERATION_ADMIN می‌تواند همه needs""",
              ["permissions.ts به‌روز", "employer.ts مهاجرت", "test:emp-perm1"],
              ["npm run test:emp-perm1"]),
        _task("DISP-UI-1", "P2", "دکمه Dispatch در EmployerInbox", "dispatch-ui-1",
              "dispatchService + CORE-OS-2 ✓ آماده؛ EmployerInbox.tsx فقط دکمه «تخصیص خودکار» برای OPERATION_ADMIN می‌خواهد — entry point سریع قبل از Dispatch Board.",
              ["POST /api/admin/dispatch موجود — Idempotency-Key header.", "فقط OPERATION_ADMIN|ADMIN — EMPLOYER نمی‌بیند.", "نمایش mission_id و error code از API.", "بدون انتخاب driver."],
              ["apps/web/src/pages/EmployerInbox.tsx", "apps/backend/src/routes/admin.ts", "apps/web/src/hooks/usePermissions.ts"],
              """پروژه: logestic — DISP-UI-1 (P2 — dispatch trigger in inbox)

## مرجع: گزارش v3 — dispatch سیستمی، WF-DISPATCH-BOARD-1 complementary

## وضعیت فعلی
EmployerInbox lists needs — no dispatch action for admin.

## EmployerInbox.tsx changes
For each row where need.status === 'PENDING':
- If user has permission `dispatch:create` (OPERATION_ADMIN|ADMIN):
  - Button «تخصیص خودکار» 
  - onClick: POST /api/admin/dispatch { need_id }
  - Headers: Idempotency-Key: crypto.randomUUID()
  - Loading state on row — disable double-click
  - Success: toast «مأموریت #{mission_id}» + link /panel/missions/:id
  - Error mapping:
    - no_dispatch_candidates → «ناوگان در دسترس نیست»
    - active_mission_exists → «راننده/وسیله مشغول»
    - insufficient_vehicle_capacity → «ظرفیت کافی نیست»
- If need.status === 'DISPATCHED': badge سبز + mission link(s)

EMPLOYER role: no button — read-only own needs

## Playwright apps/web/e2e/employer-inbox-dispatch.spec.ts
ADMIN seed → inbox → dispatch → status DISPATCHED

## آنتی‌پترن
- driver select dropdown
- dispatch without mine context

## DoD
- button visible only admin
- idempotency header sent
- e2e PASS""",
              ["admin-only dispatch button", "error toasts", "mission_id on success", "e2e spec"],
              ["npx playwright test e2e/employer-inbox-dispatch.spec.ts", "npm -w @app/backend run test:disp1"]),
        _task("HH-API-1", "P2", "API سهم خانوار + وضعیت pool", "hh-api-1",
              "community_app monthly_share_screen الان از wallet transactions مشتق می‌کند — گزارش v3: API اختصاص برای سهم CALCULATED/PAID و وضعیت pool قبل از distribute. COMM-TON-1 ✓ + COMM-UI-LEGACY-1 ✓.",
              ["Auth HOUSEHOLD — فقط household_id خودش از session.", "مبالغ rial در API — format تومان در Flutter.", "Community از pool — نه درصد کرایه.", "Scope: cooperative membership household (WS-DUAL-ROLE ✓).", "period_key YYYY-MM — ruleEngine.getPeriodKey."],
              ["apps/backend/src/routes/households.ts (جدید یا extend)", "apps/backend/src/repositories/communityPoolsRepository.ts", "apps/backend/src/repositories/walletsRepository.ts", "apps/mobile/community_app/lib/ui/screens/household/monthly_share_screen.dart", "apps/backend/scripts/test-hh-api1.ts"],
              """پروژه: logestic — HH-API-1 (P2 — household share + pool status API)

## مرجع: گزارش v3 #community-app، COMM-TON-1 ✓

## هدف
دو endpoint برای community_app — شفافیت سهم ماهانه و pool قبل/بعد distribute.

## GET /api/household/shares
Auth: HOUSEHOLD — household_id from auth profile
Query: ?period=2026-05 (optional — default current period)

Response 200:
```json
{
  "period_key": "2026-05",
  "community_rial_per_ton": 150000,
  "shares": [
    {
      "source": "POOL_DISTRIBUTION" | "MISSION_CONTRIBUTION",
      "mission_id": 42 | null,
      "amount_rial": 500000,
      "status": "CALCULATED" | "PAID",
      "paid_at": null,
      "description_fa": "توزیع استخر اجتماعی"
    }
  ],
  "total_rial": 500000
}
```
Data sources:
- transactions on household wallet type POOL_DISTRIBUTION for period
- optional: per-mission community attribution metadata (if stored)

## GET /api/household/pool-status
Auth: HOUSEHOLD — derive mine_id from household cooperative link

```json
{
  "period_key": "2026-05",
  "pool_total_rial": 45000000,
  "pool_status": "OPEN" | "SNAPSHOT_LOCKED" | "DISTRIBUTED",
  "household_count": 120,
  "estimated_share_rial": 375000,
  "distributed": false,
  "distributed_at": null
}
```
From community_pools + households_snapshot count — estimated = floor(total/n)

## Wire community_app
monthly_share_screen.dart:
- Replace/ad augment getHouseholdWallet parsing
- Call GET /household/shares + /household/pool-status
- Display: formatMoney(rial) → تومان
- Pool banner: «استخر دوره: X تومان — سهم تقریبی شما: Y»

## تست test-hh-api1.ts
- seed household + pool with snapshot
- HOUSEHOLD token → shares non-empty
- other household token → 403 on wrong scope
- period filter works

## آنتی‌پترن
- 13% of fare in response
- expose other households' shares
- hard-code community rate in route

## DoD
- 2 endpoints 200
- Flutter wired
- test-hh-api1 ×3 PASS""",
              ["GET /household/shares", "GET /household/pool-status", "Flutter monthly_share wired", "test-hh-api1"],
              ["npm -w @app/backend run test:hh-api1", "flutter test community_app"]),
        _task("FO-PANEL-1", "P2", "پنل مالک ناوگان", "fo-panel-1",
              "FLEET_OWNER نقش و KYC ✓ دارد ولی web panel اختصاصی ندارد. WS-DUAL-ROLE ✓: operational workspace — مالک فقط ناوگان/مأموریت‌های workspace انتخاب‌شده.",
              ["Scope: fleet_owner_id از auth — فقط vehicles/missions/wallet خودش.", "بدون settlement:lock/admin finance.", "NAV-1: permission wallet:read_own + route /panel/fleet-owner.", "مبالغ rial API — تومان UI.", "Dual hat: FLEET_OWNER + HOUSEHOLD → workspace select جدا."],
              ["apps/web/src/pages/FleetOwnerDashboard.tsx (جدید)", "apps/backend/src/routes/fleetOwner.ts (جدید)", "apps/web/src/App.tsx", "apps/web/src/config/panelNav.ts", "apps/backend/scripts/test-fo-panel1.ts"],
              """پروژه: logestic — FO-PANEL-1 (P2 — fleet owner dashboard)

## مرجع: گزارش v3 — FLEET_OWNER role، WS-DUAL-ROLE ✓

## Backend routes — apps/backend/src/routes/fleetOwner.ts
Mount: /api/fleet-owner — requireAuth + FLEET_OWNER + requireOperationalWorkspace

### GET /summary
```json
{
  "verified_missions_count": 12,
  "missions_in_progress": 1,
  "pending_settlement_rial": 45000000,
  "paid_this_month_rial": 120000000,
  "wallet_balance_rial": 5000000
}
```
Aggregate from missions (owner_id) + wallet transactions — mine scoped

### GET /vehicles
[{ id, plate, status, driver_name, capacity_tons, last_mission_at }]

### GET /missions?status=VERIFIED&limit=20&offset=0
[{ mission_id, status, verified_net_tons, operational_fare_rial, owner_amount_rial, paid, created_at }]

403 DRIVER role — 401 no auth

## Web FleetOwnerDashboard.tsx
Route /panel/fleet-owner — RequirePermission wallet:read_own + role FLEET_OWNER
- 4 KPI cards (summary API)
- Table vehicles — status badge
- Table recent missions — link to detail if exists
- Empty state: «هنوز مأموریتی ثبت نشده»

panelNav.ts: item for FLEET_OWNER only

## تست test-fo-panel1.ts
- FLEET_OWNER login + workspace → 200 summary
- DRIVER → 403 /api/fleet-owner/*
- cross owner_id → empty/403

## آنتی‌پترن
- settlement batch admin actions
- all mines data without workspace

## DoD
- dashboard renders
- API scoped
- test-fo-panel1 PASS""",
              ["3 API endpoints scoped", "FleetOwnerDashboard.tsx", "panelNav entry", "test-fo-panel1"],
              ["npm -w @app/backend run test:fo-panel1"]),
        _task("WB-INT-1", "P2", "معماری اتصال باسکول (Agent + API)", "wb-int-1",
              "کارفرما: وزن از دستگاه/Agent — نه راننده. WB-UI-1 ✓ operator web؛ WB-MANUAL-1 ✓ failover. این کارت ingest API برای Agent محلی با API key.",
              ["entry_source=AGENT در weighbridge tickets.", "X-Weighbridge-Key per bridge — env JSON map.", "Idempotent: (weighbridge_id, captured_at, reading_type).", "validate mission mine_id === bridge mine.", "Manual failover جدا — WB-MANUAL-1 ✓."],
              ["apps/backend/src/routes/weighbridge.ts", "apps/backend/src/services/weighbridgeIngestService.ts (جدید)", "apps/backend/src/config/env.ts", "apps/backend/scripts/test-wb-int1.ts"],
              """پروژه: logestic — WB-INT-1 (P2 — weighbridge agent ingest)

## مرجع: گزارش v3 — «اتصال سخت‌افزار فاز بعد» — MVP = API contract + mock agent

## Architecture
```
[Scale] → [Local Agent] → POST /api/weighbridge/ingest
                ↑ X-Weighbridge-Key
```
Agent مسئول: read serial/TCP scale, sign payload, retry idempotent

## env.ts
WEIGHBRIDGE_KEYS='{"1":"secret-key-bridge-a","2":"..."}' — JSON parse at boot

## POST /api/weighbridge/ingest
**No session auth** — API key only
Header: X-Weighbridge-Key
Body:
```json
{
  "weighbridge_id": 1,
  "mission_id": 42,
  "reading_type": "empty" | "loaded",
  "weight_kg": 12500,
  "captured_at": "2026-05-29T10:00:00Z",
  "plate": "12ب34567",
  "signature": "optional-hmac"
}
```

weighbridgeIngestService.ingest():
1) Validate key → bridge config
2) Load mission — same mine as bridge
3) Mission status allows reading_type
4) Upsert ticket — entry_source=AGENT, operator_id=null
5) Idempotent duplicate → 200 same ticket_id
6) Event weighbridge.agent_ingest

## تست test-wb-int1.ts
- valid ingest → empty registered, entry_source=AGENT
- duplicate → 200 idempotent
- wrong key → 401
- wrong mine mission → 403

## آنتی‌پترن
- ingest without mission_id
- driver JWT on this route
- overwrite MANUAL entry without audit

## DoD
- ingest endpoint + service
- env WEIGHBRIDGE_KEYS
- test-wb-int1 PASS""",
              ["POST /weighbridge/ingest", "weighbridgeIngestService", "AGENT entry_source", "test-wb-int1"],
              ["npm -w @app/backend run test:wb-int1", "npm -w @app/backend run test:wb-manual1 regression"]),
        _task("CONSULT-UI-1", "P3", "پنل مشاور (تأیید/رد ساعتی)", "consult-ui-1",
              "CONSULTANT نقش دارد — فقط hourly verify/reject، **نه** settlement/wallet/admin. NAV-1 ✓. HOURLY-REJ-1 reject API.",
              ["Route /panel/consultant/hourly — permission hourly:verify.", "Approve → POST /hourly/:id/verify با billable_hours.", "Reject → HOURLY-REJ-1 API.", "panelNav: CONSULTANT فقط inbox + logout."],
              ["apps/web/src/pages/ConsultantHourlyInbox.tsx (جدید)", "apps/backend/src/routes/hourly.ts", "apps/web/src/config/panelNav.ts", "apps/web/src/App.tsx"],
              """پروژه: logestic — CONSULT-UI-1 (P3 — consultant hourly inbox)

## مرجع: گزارش v3 — HOURLY خارج فاز ۱ — UI ready when backend hourly flows

## ConsultantHourlyInbox.tsx
GET /api/hourly?status=ENDED — mine scoped if applicable

Table columns:
- اپراتور / تجهیز / started_at / ended_at / duration_hours / status

Actions per row (status=ENDED):
- «تأیید» → Modal: billable_hours (default computed) → POST /hourly/:id/verify
- «رد» → Modal reason → POST /hourly/:id/reject (HOURLY-REJ-1)

No links to: /panel/settlement, /panel/admin/finance, /panel/wallet

## panelNav.ts
CONSULTANT visible items ONLY:
- /panel/consultant/hourly
- logout

## App.tsx
Route + RequirePermission hourly:verify

## تست
- test:consult-ui1 or manual: CONSULTANT menu count === 1 work item
- ADMIN can access for debug

## DoD
- page renders ENDED list
- approve/reject work
- no settlement nav leak""",
              ["ConsultantHourlyInbox page", "scoped panelNav", "approve/reject wired"],
              ["npm -w @app/backend run test:hourly1", "دستی CONSULTANT nav audit"]),
        _task("NEED-HOURLY-1", "P3", "ثبت نیاز عملیات ساعتی کارفرما", "need-hourly-1",
              "operation_needs الان HAUL_TONNAGE است — CORE-OS-0/1 ✓ operation_types. کارفرما عملیات ساعتی (ماشین‌آلات) جدا از حمل.",
              ["operation_type_code HOURLY_EQUIPMENT — از catalog.", "dispatch: hourlyDispatchStrategy ✓ stub — wire need creation.", "Employer form تب جدا — validation متفاوت.", "بدون break HAUL needs."],
              ["apps/backend/prisma/schema.prisma — operation_needs fields", "apps/backend/src/routes/employer.ts", "apps/web/src/pages/EmployerNeed.tsx", "apps/backend/scripts/test-need-hourly1.ts"],
              """پروژه: logestic — NEED-HOURLY-1 (P3 — hourly operation need)

## مرجع: CORE-OS-1 ✓ operation_type_id FK

## Schema (if missing)
operation_needs:
- operation_type_id → HOURLY_EQUIPMENT
- equipment_type: string (nullable)
- location_text: string
- estimated_hours: Decimal (nullable)
- quantity_tons: null for hourly

## POST /api/employer/needs
When operation_type=HOURLY_EQUIPMENT:
- require equipment_type, location_text
- quantity_tons optional/forbidden
- status PENDING — dispatch via hourlyDispatchStrategy

## EmployerNeed.tsx
Tabs: «حمل تنی» | «عملیات ساعتی»
Hourly form: equipment, location, estimated hours, village

## تست test-need-hourly1.ts
- create hourly need → 201 PENDING
- create haul need still works (regression test-emp1)

## آنتی‌پترن
- hourly need triggers haul dispatch
- break operation_needs FK

## DoD
- migration if needed
- dual tab form
- test-need-hourly1 PASS""",
              ["hourly need type in schema", "employer POST validation", "EmployerNeed tabs", "test-need-hourly1"],
              ["npm -w @app/backend run test:need-hourly1", "npm -w @app/backend run test:emp1"]),
        _task("WF-OPS-DASH-1", "P2", "داشبورد وب عملیاتی (وایرفریم ۹)", "wf-ops-dash-1",
              "وایرفریم ۹: KPI امروز، باسکول معطل، pool، holds — الان KPI پراکنده در adminKpi. صفحه landing OPERATION_ADMIN.",
              ["OPERATION_ADMIN + ADMIN — requireMineContext.", "Read-only dashboard — actions via links not inline dangerous ops.", "COMM-TON-1 ✓ pool totals.", "Recharts 7-day mission trend از kpiService."],
              ["apps/web/src/pages/OpsDashboard.tsx (جدید)", "apps/backend/src/services/kpiService.ts", "apps/backend/src/routes/adminKpi.ts", "apps/web/src/config/panelNav.ts"],
              """پروژه: logestic — WF-OPS-DASH-1 (P2 — operational dashboard wireframe 9)

## مرجع: docs/wireframes-review/ PNG #9

## API GET /api/admin/ops-dashboard
requireMineContext + ops permission

```json
{
  "missions_today": { "created": 5, "verified": 3, "in_progress": 2 },
  "weighbridge_pending": 4,
  "pool_current_rial": 120000000,
  "pool_period_key": "2026-05",
  "holds_active": 1,
  "needs_pending_dispatch": 2,
  "last_updated": "ISO"
}
```

Reuse kpiService + communityPoolsRepository + counts queries

## OpsDashboard.tsx — default home for OPERATION_ADMIN
Layout:
- Row 1: 6 KPI cards (numbers + icons)
- Row 2: Line chart missions 7 days (recharts)
- Row 3: Table 5 latest missions (id, status, driver, tons)
- Quick links: Weighbridge | Employer Inbox | Dispatch Board | Period Statement

Route: /panel/ops — redirect OPERATION_ADMIN from /panel if configured

## آنتی‌پترن
- dispatch button without confirm on dashboard (use links)
- cross-mine aggregates

## DoD
- 6 KPIs accurate vs seed
- chart renders
- quick links work
- screenshot ~ wireframe 9""",
              ["ops-dashboard API", "6 KPI cards", "7-day chart", "quick links", "OpsDashboard page"],
              ["دستی screenshot vs wireframe", "npm -w @app/backend run test:kpi1 regression"]),
        _task("WF-COOP-KYC-WF-1", "P2", "KYC inbox جدولی (وایرفریم ۱۰)", "wf-coop-kyc-wf-1",
              "KycInbox.tsx پایه ✓ — وایرفریم ۱۰: جدول فیلترپیشرفته، sort، مدارک، bulk approve. KYC-NC-1 ✓ NEEDS_CORRECTION.",
              ["Cooperative scope enforced.", "Bulk approve max 20 — confirm dialog.", "Pagination server-side.", "NEEDS_CORRECTION tab + reason column."],
              ["apps/web/src/pages/KycInbox.tsx", "apps/backend/src/routes/coopKyc.ts", "apps/web/e2e/kyc-inbox.spec.ts"],
              """پروژه: logestic — WF-COOP-KYC-WF-1 (P2 — KYC inbox table upgrade)

## مرجع: wireframe 10، KYC-NC-1 ✓

## API enhancement GET /api/coop/kyc/inbox
Query: status, village_id, entity_type, from_date, to_date, page, limit, sort=created_at:desc

Response: { items: [...], total, page, limit }

## KycInbox.tsx upgrade
Replace card list with DataTable:
| checkbox | نام | کدملی | روستا | نوع | وضعیت | تاریخ | مدارک |

Features:
- Column sort (client or server)
- Filter bar: village dropdown, status, entity_type, date range
- Documents column: link icon → charter_file_url / license_url (target blank)
- Bulk: select ≤20 → «تأیید گروهی» → confirm → sequential POST approve with progress
- Row colors: PENDING amber, NEEDS_CORRECTION orange (show correction_reason tooltip)

Keep existing approve/reject/suspend/request-correction actions

## Playwright kyc-inbox.spec.ts
Filter village → row count decreases

## آنتی‌پترن
- bulk >20 without batch API
- approve without cooperative scope

## DoD
- sortable filterable table
- bulk approve ≤20
- e2e filter test PASS""",
              ["paginated inbox API", "DataTable UI", "bulk approve max 20", "document links"],
              ["npx playwright test e2e/kyc-inbox.spec.ts", "npm -w @app/backend run test:kyc-nc1"]),
        _task("WF-FIN-LOAD-1", "P2", "مالی per Load (وایرفریم ۱۱)", "wf-fin-load-1",
              "وایرفریم ۱۱ — FIN-DUAL-1 ✓ دوخطی؛ این صفحه جدول per-mission با Operational | Community تن‌محور. COMM-TON-1 ✓ SVC-CONTRACT-1 ✓.",
              ["COMM-TON-1 ✓ prerequisite.", "بدون ستون ۱۳٪ یا coop_percent.", "rial API — تومان UI (CURRENCY-UI-1 optional).", "requireMineContext + admin finance permission."],
              ["apps/web/src/pages/FinanceByLoadPage.tsx (جدید)", "apps/backend/src/routes/adminFinance.ts", "apps/backend/src/repositories/financeLedgerRepository.ts", "apps/backend/scripts/test-fin-load1.ts"],
              """پروژه: logestic — WF-FIN-LOAD-1 (P2 — finance by load table)

## مرجع: wireframe 11، COMM-TON-1 ✓، FIN-DUAL-1 ✓

## API GET /api/admin/finance/by-load
Query: mine_id (session), from, to (ISO date), status=VERIFIED default

```json
{
  "items": [{
    "mission_id": 1,
    "plate": "12ب345",
    "verified_net_tons": 30,
    "operational_fare_rial": 90000000,
    "owner_amount_rial": 89100000,
    "platform_fee_rial": 900000,
    "community_contribution_rial": 4500000,
    "community_rate_per_ton_rial": 150000,
    "payment_hold": false,
    "hold_amount_rial": 0,
    "verified_at": "ISO"
  }],
  "totals": {
    "operational_fare_rial": ...,
    "community_contribution_rial": ...,
    "note": "community independent of fare"
  }
}
```
Source: financeLedgerRepository splits + mission weighbridge net tons

## FinanceByLoadPage.tsx
Route /panel/admin/finance/by-load
- DataTable columns: پلاک، تن خالص، کرایه عملیاتی، سهم مالک، کارمزد پلتفرم، مشارکت اجتماعی
- Footer totals row — **community sum independent of fare sum**
- Export CSV button
- HOLD badge row when payment_hold
- Date range picker

## تست test-fin-load1.ts
Two missions: different fare, same tons → same community_contribution
Totals match ledger query

## آنتی‌پترن
- community = fare * 0.13 column
- missing mine filter

## DoD
- API + page + CSV export
- test-fin-load1 PASS""",
              ["by-load API", "FinanceByLoadPage", "CSV export", "community independent of fare", "test-fin-load1"],
              ["npm -w @app/backend run test:fin-load1", "npm -w @app/backend run test:comm-ton1"]),
        _task("BANK-AUTO-1", "P3", "پرداخت خودکار پس از LOCK", "bank-auto-1",
              "کارفرما: پس از LOCK settlement — پرداخت خودکار (فاز بعد). MVP: Excel + mark-paid ✓. این کارت MockAdapter + queue.",
              ["MockBankAdapter default — MOCK_BANK_FAIL=true for failure path.", "Per-line SETTLED|FAILED — no whole batch rollback.", "MINE-PAY-FLOW ✓: mine pays coop separately.", "Idempotent payout per settlement_line."],
              ["apps/backend/src/lib/bankAdapter.ts (جدید)", "apps/backend/src/queues/handlers/settlementJobs.ts", "apps/backend/src/services/settlementService.ts", "apps/backend/scripts/test-bank-auto1.ts"],
              """پروژه: logestic — BANK-AUTO-1 (P3 — bank payout adapter)

## مرجع: گزارش v3 — BANK-AUTO عمداً فاز بعد

## Interface apps/backend/src/lib/bankAdapter.ts
```ts
interface BankAdapter {
  initiatePayout(line: { iban, amount_rial, reference, payee_name }): Promise<{ bank_ref: string, status: 'ACCEPTED'|'REJECTED' }>
}
```
Implementations: MockBankAdapter, (future) ZarinPal/Saman stub

## Queue job settlement.execute_payouts
Trigger: after batch LOCK (hook in settlementService or explicit admin action)
For each settlement_line with payout pending:
1) adapter.initiatePayout
2) INSERT payment_payouts { status, bank_ref }
3) event payout.completed | payout.failed
4) line FAILED → batch partial status MANUAL_REVIEW — not rollback

env: BANK_ADAPTER=mock, MOCK_BANK_FAIL=false

## Webhook POST /api/webhooks/bank (optional stub 501)

## تست test-bank-auto1.ts
- lock batch → enqueue → lines SETTLED mock
- MOCK_BANK_FAIL=true → line FAILED, batch MANUAL_REVIEW

## آنتی‌پترن
- auto payout before LOCK
- mine IBAN as payout destination for owner lines

## DoD
- MockAdapter + queue job
- test-bank-auto1 PASS""",
              ["BankAdapter interface", "MockBankAdapter", "execute_payouts job", "per-line status"],
              ["npm -w @app/backend run test:bank-auto1"]),
        _task("SET-CYCLE-1", "P3", "تسویه هفتگی مالک / ماهانه خانوار", "set-cycle-1",
              "کارفرما: owner weekly settlement, household monthly pool — two cycles. الان monthly-close combined.",
              ["settlement_batches.batch_type enum.", "Cron via jobQueue — not OS cron.", "Separate export filenames.", "Rule engine settlement.owner_period_days=7."],
              ["apps/backend/prisma/schema.prisma", "apps/backend/src/services/settlementService.ts", "apps/backend/src/services/ruleEngine.ts", "apps/backend/scripts/test-set-cycle1.ts"],
              """پروژه: logestic — SET-CYCLE-1 (P3 — dual settlement cycles)

## مرجع: گزارش v3 P3 — SET-CYCLE

## Schema
settlement_batches.batch_type: OWNER_WEEKLY | HOUSEHOLD_MONTHLY | COMBINED_LEGACY

## Rule engine
settlement.owner_period_days = 7 (per mine rule JSON)

## Queue cron job (daily 02:00 local — document TZ)
### OWNER_WEEKLY
Aggregate VERIFIED missions last 7 days per owner → create batch type OWNER_WEEKLY

### HOUSEHOLD_MONTHLY  
Day 1 of month: trigger distributePool if not done → batch HOUSEHOLD_MONTHLY lines

## API
GET /settlement/batches/:id/export-owner.csv — separate from household export

## تست test-set-cycle1.ts
Seed missions across weeks → cron simulation → correct batch_type

## آنتی‌پترن
- mix owner/household lines same file without label
- cron without idempotency (duplicate batches)

## DoD
- batch_type column
- cron handler
- test-set-cycle1 PASS""",
              ["batch_type enum", "weekly owner cron", "monthly household cron", "separate exports"],
              ["npm -w @app/backend run test:set-cycle1"]),
        _task("RECEIPT-PDF-1", "P3", "PDF رسید رسمی", "receipt-pdf-1",
              "کارفرما: PDF receipt با QR برای خانوار/مالک پس از payout. simplePdf.ts may exist.",
              ["RTL PDF.", "rial + تومان in text.", "receipt_file_url on settlement_line.", "Auth: line owner or ADMIN."],
              ["apps/backend/src/services/receiptPdfService.ts", "apps/backend/src/lib/simplePdf.ts", "apps/backend/src/routes/settlement.ts", "apps/backend/scripts/test-receipt-pdf1.ts"],
              """پروژه: logestic — RECEIPT-PDF-1 (P3 — settlement receipt PDF)

## GET /api/settlement/lines/:lineId/receipt.pdf
Auth: wallet owner matches line OR ADMIN

Generate via pdfkit or simplePdf:
- Logo + platform name
- Payee name, IBAN masked
- amount_rial + amount_toman_fa
- payment_reference, paid_at
- QR code: URL `{PUBLIC_URL}/verify/receipt/{reference}`

Store: settlement_lines.receipt_file_url (or regenerate on demand — document choice)

## تست test-receipt-pdf1.ts
Generate buffer → starts with %PDF- header
401 wrong owner

## DoD
- valid PDF
- URL persisted or cache policy documented""",
              ["receipt PDF endpoint", "RTL layout", "QR code", "receipt_file_url"],
              ["npm -w @app/backend run test:receipt-pdf1"]),
        _task("CURRENCY-UI-1", "P3", "نمایش تومان در UI (ریال در DB)", "currency-ui-1",
              "کارفرما قطعی: DB/API ریال — UI تومان. یک helper مرکزی web + flutter.",
              ["formatMoney(rial) — display only rounding.", "Never divide in API responses.", "Persian digits + thousand separator.", "Audit grep hardcoded /10 in UI."],
              ["apps/web/src/lib/formatMoney.ts", "apps/web/src/lib/formatMoney.test.ts", "apps/mobile/packages/mineral_ui/lib/format_money.dart", "grep SettlementPage AdminFinance Wallet FinanceByLoad monthly_share"],
              """پروژه: logestic — CURRENCY-UI-1 (P3 — toman display layer)

## Web apps/web/src/lib/formatMoney.ts
```ts
export function formatMoney(rial: number, opts?: { unit?: 'toman'|'rial', showUnit?: boolean }): string
// 10000 rial → «۱٬۰۰۰ تومان» with fa-IR digits
export function rialToToman(rial: number): number { return Math.floor(rial / 10) }
```

Replace all user-facing amounts in:
SettlementPage, PaymentControl, AdminFinance, WalletSummary, FinanceByLoad, PeriodStatementPage, FleetOwnerDashboard

## Flutter packages/mineral_ui/format_money.dart
Same logic — use in community_app + driver_app

## vitest formatMoney.test.ts
10000 → displays 1000 toman
0, negative guard

## آنتی‌پترن
- store toman in DB
- divide in backend JSON

## DoD
- single helper web+flutter
- main pages migrated
- unit tests PASS""",
              ["formatMoney.ts", "format_money.dart", "main pages migrated", "unit tests"],
              ["npm -w @app/web run test -- formatMoney", "grep -r '/ 10' apps/web/src/pages → zero"]),
        _task("REDISPATCH-1", "P3", "Re-Dispatch اضطراری با Audit", "redispatch-1",
              "OPERATION_ADMIN: cancel stuck mission + re-dispatch need — emergency only with reason.",
              ["reason min 20 char.", "Old mission → CANCELLED — cannot reach VERIFIED.", "audit + event mission.redispatched.", "Respect DISPATCH-LOCK after cancel."],
              ["apps/backend/src/routes/admin.ts", "apps/backend/src/services/dispatchService.ts", "apps/backend/src/lib/missionFsm.ts", "apps/backend/scripts/test-redispatch1.ts"],
              """پروژه: logestic — REDISPATCH-1 (P3 — emergency redispatch)

## POST /api/admin/missions/:id/redispatch
Permission: OPERATION_ADMIN + requireMineContext
Body: { reason: string (min 20), need_id?: number }

Flow:
1) Load mission — status in cancellable set (ASSIGNED..IN_TRANSIT)
2) If VERIFIED/SETTLED → 409
3) Transition mission → CANCELLED (missionFsm)
4) audit: mission.redispatch { reason, old_mission_id, need_id }
5) dispatchService.dispatchNeed(need_id ?? derive from load)
6) event mission.redispatched

## تست test-redispatch1.ts
- redispatch → old CANCELLED, new mission CREATED
- VERIFIED mission → 409
- missing reason → 400

## آنتی‌پترن
- silent cancel without audit
- skip DISPATCH-LOCK on new assign

## DoD
- endpoint + audit + event
- test-redispatch1 PASS""",
              ["POST redispatch endpoint", "CANCELLED old mission", "audit + event", "test-redispatch1"],
              ["npm -w @app/backend run test:redispatch1"]),
        _task("HOURLY-APP-1", "P3", "UI عملیات ساعتی در اپ", "hourly-app-1",
              "اپ OPERATOR: start/end hourly work با GPS. Consultant verifies on web (CONSULT-UI-1). NEED-HOURLY-1 prerequisite.",
              ["community_app or dedicated operator flow.", "POST /hourly/start|end.", "GPS coords required.", "Offline queue optional stub."],
              ["apps/mobile/community_app/lib/ui/screens/hourly/", "apps/backend/src/routes/hourly.ts", "apps/backend/scripts/test-hourly1.ts"],
              """پروژه: logestic — HOURLY-APP-1 (P3 — mobile hourly operator)

## Screens (community_app — OPERATOR role)
### hourly_start_screen.dart
- Select equipment/need if assigned
- Button «شروع» → POST /api/hourly/start { gps: {lat,lng}, need_id?, photo_uri? }
- Show active timer

### hourly_end_screen.dart  
- Button «پایان» → POST /api/hourly/:id/end { gps }
- Summary duration

## Flow
start → status ACTIVE → end → ENDED → appears in ConsultantHourlyInbox

## Offline (optional)
Queue requests in local storage — flush on reconnect

## تست
Manual emulator: start → end → CONSULTANT web sees ENDED

## DoD
- start/end screens wired
- hourly1 regression PASS""",
              ["start/end mobile screens", "GPS in API body", "ENDED in consultant inbox"],
              ["npm -w @app/backend run test:hourly1", "دستی emulator flow"]),
        _task("SMS-PROD-1", "P3", "SMS واقعی OTP و اعلان", "sms-prod-1",
              "Dev: OTP in log. Production: Kavenegar/FarazSMS adapter — **هرگز** log OTP in prod.",
              ["SmsProvider interface.", "SMS_PROVIDER=mock|kavenegar|faraz.", "Rate limit preserved.", "NODE_ENV=production strips OTP logs."],
              ["apps/backend/src/services/notificationService.ts", "apps/backend/src/lib/smsProvider.ts (جدید)", "apps/backend/src/config/env.ts", "apps/backend/src/routes/auth.ts"],
              """پروژه: logestic — SMS-PROD-1 (P3 — production SMS)

## env
SMS_PROVIDER=mock|kavenegar|faraz
SMS_API_KEY, SMS_SENDER_LINE

## smsProvider.ts
```ts
interface SmsProvider { sendOtp(mobile: string, code: string): Promise<void> }
```
MockSmsProvider: log only in development
KavenegarProvider: HTTP API wrapper

## Wire notificationService.sendOtp → provider factory

## auth.ts / otp issue
Remove console.log(code) when NODE_ENV=production

## Staging doc section in deploy-runbook-fa.md
Test with real mobile — expected delivery <30s

## آنتی‌پترن
- OTP in API response body
- commit API keys

## DoD
- provider switch works
- prod no OTP log
- staging checklist section""",
              ["SmsProvider interface", "kavenegar adapter", "no OTP log in prod"],
              ["manual staging SMS test", "grep console.log OTP in auth → gated"]),
        _task("WF-QUEUE-1", "P3", "صف زمان‌بندی (وایرفریم ۹.۳)", "wf-queue-1",
              "**خارج MVP فاز ۱** — spike only. کارفرما: dispatch سیستمی فعلاً کافی؛ queue scheduling فاز بعد.",
              ["No cron implementation.", "Document future queue_slots schema.", "Feature flag ENABLE_DISPATCH_QUEUE=false.", "Stub 501 if wireframe mandates UI placeholder."],
              ["docs/mvp-flow-chat-master-report-fa-v3.html §۱۵", "apps/backend/src/config/env.ts"],
              """پروژه: logestic — WF-QUEUE-1 (P3 — spike/documentation ONLY)

## ⚠️ خارج MVP — do NOT implement full scheduling

## Deliverables
1) Update گزارش v3 §۱۵ with future schema:
```sql
-- FUTURE queue_slots(driver_id, mine_id, slot_start, slot_end, status)
```

2) env ENABLE_DISPATCH_QUEUE=false (default)

3) Optional GET /api/admin/dispatch-queue → 501 { code: 'not_implemented', message_fa: '...' }

4) Comment in dispatchService: queue integration point

## آنتی‌پترن
- cron driver scheduling
- UI booking screen

## DoD
- doc updated
- no scheduling code merged""",
              ["v3 doc spike section", "ENABLE_DISPATCH_QUEUE=false", "no cron code"],
              ["N/A — documentation review"]),
        _task("WF-INTRANSIT-1", "P3", "صفحه In Transit (وایرفریم ۶)", "wf-intransit-1",
              "FSM state IN_TRANSIT: نقشه mine→factory، ETA تقریبی، CTA رسیدم به مقصد. WF-GEOFENCE-1 ✓ factory_entry.",
              ["No weight inputs.", "tel: employer_contact optional.", "Map: flutter_map or google_maps — use mine/factory coords from mission.", "Navigate to factory_entry on CTA."],
              ["apps/mobile/driver_app/lib/ui/screens/in_transit_screen.dart", "apps/mobile/driver_app/lib/ui/router.dart", "apps/mobile/driver_app/lib/ui/screens/mine_entry_screen.dart"],
              """پروژه: logestic — WF-INTRANSIT-1 (P3 — in transit screen)

## Trigger
mission.status === IN_TRANSIT (after LOADED transition)

## in_transit_screen.dart
- Map widget: marker mine (origin) + factory (destination)
- Polyline between coords from mission/load API
- ETA text: haversine distance / 40 km/h — label «تقریبی»
- Optional: IconButton tel: mission.employer_contact
- Primary CTA: «رسیدم به مقصد» → push factory_entry_screen (geofence WF-GEOFENCE-1)
- Secondary: weighbridge read-only link if AWAITING_WB

## Router
/mission/:id/in-transit — guard status

## Mission API enrichment (if needed)
GET /api/driver/missions/:id → add mine_lat/lng, factory_lat/lng, employer_contact

## تست flutter test with mock IN_TRANSIT mission — map widget finds markers

## آنتی‌پترن
- manual status skip geofence
- weight entry

## DoD
- screen + navigation
- CTA reaches factory_entry""",
              ["in_transit_screen", "map origin/dest", "CTA to factory_entry", "router guard"],
              ["flutter test test/in_transit_test.dart"]),
    ]


def _task(code, pri, title, anchor, ctx, constraints, files, prompt, dod, tests):
    return {
        "code": code, "pri": pri, "title": title, "anchor": anchor,
        "ctx": ctx, "constraints": constraints, "files": files,
        "prompt": prompt, "dod": dod, "tests": tests,
    }
