<div dir="rtl" lang="fa">

# چک‌لیست UAT و تحویل — logestic

**کارت:** UAT-SIGNOFF-1 · **مرجع:** [گزارش v3 § testing](mvp-flow-chat-master-report-fa-v3.html#testing) · [Runbook استقرار](deploy-runbook-fa.md)

این سند برای تیم **کارفرما** (پذیرش UAT) و **DevOps** (استقرار Staging) است. هر بند شامل دستور **copy-paste** است. برای چاپ PDF: از Markdown viewer یا «Print to PDF» استفاده کنید.

---

## ۰. خلاصهٔ دستورات (یک‌جا)

```powershell
cd D:\Workspace\logestic
docker compose up -d postgres
copy apps\backend\.env.example apps\backend\.env
npm install
npm -w @app/backend run db:migrate
npm -w @app/backend run db:seed
npm run test:infra-regression
npm run test:comm-ton1
npm run test:invoice-draft1
npm -w @app/backend run test:pilot-taftan1
npm -w @app/web run test:e2e -- uat-haul
npm -w @app/backend run test:comm-app1
npm -w @app/backend run test:dual-role1
```

> مسیر `cd` را با مسیر clone روی سرور Staging جایگزین کنید. روی Linux/macOS از `/` به‌جای `\` استفاده کنید.

---

## ۱. پیش‌نیاز محیط

| مورد | نسخه / مقدار | تأیید |
|------|--------------|-------|
| Node.js | 20 LTS+ | [ ] `node -v` |
| npm | 10+ | [ ] `npm -v` |
| PostgreSQL | 16 (Docker یا نصب محلی) | [ ] پورت **5434** (Docker) یا مطابق `.env` |
| Redis | **اختیاری** — صف MVP در حافظه است (`InMemoryJobQueue`) | [ ] N/A مگر queue خارجی فعال شود |
| `DATABASE_URL` | در `apps/backend/.env` | [ ] |

### ۱.۱ Postgres (Docker — پیشنهادی)

```powershell
cd D:\Workspace\logestic
docker compose up -d postgres
# اگر container از قبل وجود دارد و متوقف است:
docker start mineral-postgres
```

منتظر healthy شدن container باشید:

```powershell
docker compose ps
```

### ۱.۲ فایل محیط

```powershell
copy apps\backend\.env.example apps\backend\.env
```

مقدار پیش‌فرض Docker (پورت **5434**):

```env
DATABASE_URL=postgresql://mineral:mineral_password@localhost:5434/mineral_mvp
NODE_ENV=development
PORT=4000
SMS_PROVIDER=mock
```

جزئیات متغیرها: [`apps/backend/.env.example`](../apps/backend/.env.example) و [`deploy-runbook-fa.md`](deploy-runbook-fa.md).

- [ ] Postgres در دسترس است
- [ ] `apps/backend/.env` با `DATABASE_URL` صحیح
- [ ] Staging/UAT: `SMS_PROVIDER=mock` (بدون SMS واقعی مگر تست جداگانه SMS-PROD-1)

---

## ۲. نصب، migrate و seed

```powershell
cd D:\Workspace\logestic
npm install
npm -w @app/backend run db:migrate
npm -w @app/backend run db:seed
```

- [ ] `npm install` بدون خطا
- [ ] `prisma migrate deploy` — همه migrationها اعمال شد
- [ ] `db:seed` — معدن **TAFTAN** (`mine_code=TAFTAN`) + کاربران OTP زیر

### کاربران seed (OTP dev)

پس از seed، OTP از endpoint توسعه (فقط `NODE_ENV≠production`):

```text
GET http://localhost:4000/api/auth/__dev/otp?mobile_number=09000000000
```

| نقش | موبایل | کاربرد UAT |
|-----|--------|------------|
| ADMIN | 09000000000 | settlement، period statement، audit |
| EMPLOYER | 09000000007 | ثبت نیاز |
| OPERATION_ADMIN | 09000000002 | dispatch، monthly-close |
| COOP_ADMIN | 09000000001 | KYC، تأیید صورت وضعیت |
| COOP_OPERATOR | 09000000111 | وزن باسکول |
| OPERATION_LOCKER | 09000000103 | lock settlement |
| DRIVER | 09000000003 | اپ راننده / FSM |
| HOUSEHOLD | 09000000005 | community app |
| FLEET_OWNER | 09000000004 | کیف پول مالک |

- [ ] seed TAFTAN + `service_contract` با `fixed_community_amount_rial_per_unit` (placeholder 400٬000 ریال/تن)

---

## ۳. تست‌های خودکار بحرانی (قبل از UAT دستی)

اسکریپت‌های backend (§۳.۱–۳.۳) در صورت نبود `TEST_BASE_URL`، سرور test را **خودکار** بالا می‌آورند — نیازی به `npm run dev` جدا نیست.

Playwright (§۳.۴) خودش backend + web را start می‌کند (`reuseExistingServer`). در صورت خطای proxy: `$env:NO_PROXY="*"` و حذف `HTTP_PROXY`/`ALL_PROXY`.

در ترمینال، از **ریشه monorepo**:

### ۳.۱ زیرساخت (INFRA-REGRESSION-1)

```powershell
cd D:\Workspace\logestic
npm run test:infra-regression
```

زنجیره fail-fast: `idem1` → `audit1` → `event1` → `queue1` → `recon1` → `soft1`

- [ ] `npm run test:infra-regression` — PASS

اختیاری (مالی):

```powershell
npm run test:infra-regression:finance
```

### ۳.۲ مالی بحرانی

```powershell
npm run test:comm-ton1
npm run test:invoice-draft1
```

- [ ] `test:comm-ton1` — PASS (Community تن‌محور + split)
- [ ] `test:invoice-draft1` — PASS (period_statement Draft → Review → Lock)

### ۳.۳ پایلوت تفتان (اتومات ۳×)

```powershell
npm -w @app/backend run test:pilot-taftan1
```

- [ ] `test:pilot-taftan1` — ۳ run PASS (۱۰ گام API؛ بدون `__dev/seed/demo`)

### ۳.۴ Playwright smoke (E2E-UAT-HAUL-1)

```powershell
npm -w @app/web run test:e2e -- uat-haul
```

نیاز: Chrome نصب + API روی `http://localhost:4000` (یا `API_BASE_URL`).

- [ ] Playwright `uat-haul` — PASS

API mirror (بدون UI):

```powershell
npm -w @app/backend run test:uat-haul1
```

- [ ] `test:uat-haul1` — ۳× PASS (اختیاری اگر E2E سبز است)

---

## ۴. سناریوی UAT دستی — پایلوت تفتان (۴۵–۹۰ دقیقه)

**پیش‌شرط:** §۲ seed TAFTAN · **بدون** `POST /api/__dev/seed/demo` (برخلاف سناریوی عمومی گزارش v3 §۳).

Backend: `http://localhost:4000` · Web: `http://localhost:5173` · اپ موبایل: `API base` = IP LAN سرور (نه `localhost` روی گوشی).

### گام ۱ — ورود و workspace

- [ ] **EMPLOYER** (`09000000007`): OTP → انتخاب معدن TAFTAN (OPERATIONAL)
- [ ] **OPERATION_ADMIN** (`09000000002`): workspace معدن TAFTAN
- [ ] **COOP_ADMIN** (`09000000001`): workspace تعاونی (COMMUNITY)
- [ ] **COOP_OPERATOR** (`09000000111`): workspace تعاونی برای باسکول

### گام ۲ — نیاز کارفرما

- [ ] وب `/panel/employer` یا API: نیاز **۱۰ تن**، `material_type=ORE`
- [ ] وضعیت نیاز: `PENDING`

### گام ۳ — Dispatch

- [ ] **OPERATION_ADMIN**: `POST /api/admin/needs/{id}/dispatch` یا Inbox/Dispatch Board
- [ ] مأموریت `ASSIGNED` + راننده KYC `APPROVED`

### گام ۴ — FSM راننده

- [ ] **DRIVER** (`09000000003`): workspace معدن → مأموریت
- [ ] `ACCEPTED` → `ARRIVED` (GPS)
- [ ] `LOADED` → `IN_TRANSIT` → `DELIVERED` (GPS در تحویل)

### گام ۵ — باسکول

- [ ] **COOP_OPERATOR**: `POST /api/weighbridge/tickets/{id}/weights` — `empty_weight` + `loaded_weight` (kg)
- [ ] net_weight خودکار؛ در صورت اختلاف ≥۵٪ → `PENDING_HOLD` (طبق WB-1)

### گام ۶ — تأیید و VERIFIED

- [ ] **OPERATION_ADMIN**: `POST .../approve` — مأموریت `VERIFIED`
- [ ] split عملیاتی: ~۹۸٪ مالک + ~۲٪ platform
- [ ] Community: `۱۰ تن × fixed_community_amount_rial_per_unit` از `service_contracts` (نه ۱۳٪ کرایه)

### گام ۷ — monthly-close

- [ ] **OPERATION_ADMIN**: `POST /api/admin/settlement/monthly-close` — `{ mine_id, year, month }`
- [ ] `settlement_batch` + `period_statement` ساخته شد

### گام ۸ — صورت وضعیت (INVOICE-DRAFT-1)

- [ ] **ADMIN**: `submit-review` روی period statement
- [ ] **COOP_ADMIN** + **OPERATION_ADMIN**: dual `approve`
- [ ] **ADMIN**: `lock` — وضعیت `LOCKED`

### گام ۹ — تسویه و پرداخت معدن

- [ ] **COOP_ADMIN** + **OPERATION_ADMIN**: approve settlement batch
- [ ] lock بدون پرداخت معدن → **409** `mine_payment_required` (انتظار)
- [ ] **ADMIN**: `register-mine-payment` با `payment_reference`
- [ ] **OPERATION_LOCKER** (`09000000103`): `lock` settlement — موفق

### گام ۱۰ — تأیید نهایی

- [ ] **FLEET_OWNER** / **HOUSEHOLD**: wallet — موجودی/تراکنش منطقی
- [ ] **ADMIN**: `/panel/admin/audit` — اقدامات حساس ثبت شده
- [ ] export CSV/Excel settlement (در صورت نیاز کارفرما)

---

## ۵. Smoke اپ موبایل

### ۵.۱ Community app (API + Flutter)

```powershell
npm -w @app/backend run test:comm-app1
npm -w @app/backend run test:hh-api1
```

- [ ] `test:comm-app1` — ۳× PASS (wallet household، KYC inbox، RBAC)
- [ ] `test:hh-api1` — ۳× PASS (سهم ماهانه / pool-status)

Smoke دستی (اختیاری):

```powershell
cd apps\mobile\community_app
flutter pub get
flutter test
```

- [ ] ورود HOUSEHOLD (`09000000005`) — OTP dev — صفحه wallet/summary بدون متن legacy «۱۳٪ کرایه»
- [ ] ورود COOP_ADMIN — hub KYC + اعضا

### ۵.۲ Driver app

```powershell
npm -w @app/backend run test:dual-role1
npm -w @app/backend run test:fsm1
```

- [ ] `test:dual-role1` — ۳× PASS (جداسازی COMMUNITY vs OPERATIONAL)
- [ ] `test:fsm1` — PASS (گذارهای FSM)

Smoke دستی (اختیاری):

```powershell
cd apps\mobile\driver_app
flutter pub get
flutter test
```

- [ ] DRIVER: انتخاب workspace معدن → لیست مأموریت → یک گام FSM
- [ ] Airplane mode → sync offline: `apps\mobile\driver_app\scripts\test-offline1.ps1`

---

## ۶. پشتیبان و بازیابی (نمونه)

جزئیات کامل: [`deploy-runbook-fa.md`](deploy-runbook-fa.md) § Backup.

```powershell
pg_dump "postgresql://mineral:mineral_password@localhost:5434/mineral_mvp" -Fc -f backup_uat.dump
```

- [ ] یک `pg_dump` گرفته شد
- [ ] یک بار restore روی DB **خالی تست** انجام و `db:migrate` + smoke بررسی شد

---

## ۷. امضای پذیرش کارفرما

| تاریخ | نام نماینده | نتیجه | یادداشت |
|-------|-------------|--------|---------|
| | | ☐ Pass / ☐ Fail | |

**معیار Pass:** همه بندهای §۱–§۵ (حداقل تست‌های §۳) سبز + §۴ بدون blocker بحرانی.

---

## ۸. بازبینی Tech Lead (داخلی)

| بازبین | تاریخ | تأیید |
|--------|-------|-------|
| | | ☐ دستورات §۰–§۳ با CI/`package.json` هم‌خوان |
| | | ☐ لینک‌ها: README → runbook · گزارش v3 footer → این چک‌لیست |
| | | ☐ Staging: `SMS_PROVIDER=mock` مگر تست SMS جدا |

---

*آخرین هم‌ترازی: UAT-SIGNOFF-1 · PILOT-TAFTAN-1 · E2E-UAT-HAUL-1 · INFRA-REGRESSION-1*

</div>
