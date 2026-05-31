# Mineral Haul Platform

Platform to manage mineral hauling from weighbridge to settlement.

## Local dev

1. Start PostgreSQL:
   - `docker compose up -d postgres`
   - اگر Docker روی سیستم شما بالا نمی‌آید، Postgres را دستی نصب/استارت کنید و `apps/backend/.env` را به DB واقعی وصل کنید.
2. Configure `.env` (see `apps/backend/.env.example`).
3. ساخت اسکیمای MVP:
   - اسکریپت `apps/backend/db/001_mvp_schema.sql` را با `psql` اجرا کنید.
3. Install & run:
   - `npm install`
   - `npm run dev`

## دو نقش همزمان (Community + Operational)

یک کاربر می‌تواند هم **عضو تعاونی** (خانوار/تعاونی) و هم **کار عملیاتی در معدن دیگر** (راننده/مالک ناوگان) باشد — یک لاگین، دو فضای کاری جدا:

| اپ | نقش‌های مجاز | انتخاب workspace |
|----|-------------|------------------|
| `community_app` | HOUSEHOLD، COOP_* | فقط `membership_kind=COMMUNITY` (نام تعاونی) |
| `driver_app` | DRIVER | فقط `membership_kind=OPERATIONAL` (نام معدن) |
| وب | همه | `WorkspaceSelectPage` — دو بخش «عضویت تعاونی» / «کار در معدن» |

اگر هر دو عضویت را دارید، از اپ/پنل مناسب همان «کلاه» استفاده کنید (deep link بین اپ‌ها در فاز بعد).

تست: `npm -w @app/backend run test:dual-role1` (۳ بار).

## Regression زیرساخت (قبل از UAT/staging)

پس از `db:migrate` + `db:seed` و بالا بودن API روی `TEST_BASE_URL` (پیش‌فرض `http://localhost:4000`):

- `npm run test:infra-regression` — زنجیره fail-fast: idem → audit → event → queue → recon → soft
- `npm run test:infra-regression:finance` — همان + `comm-ton1` + `set1` (تست‌های مالی بحرانی)

جزئیات: [`docs/uat-handover-checklist-fa.md`](docs/uat-handover-checklist-fa.md)

## استقرار Staging / Production

Runbook DevOps (Docker، env، backup، rollback، SMS):

- [`docs/deploy-runbook-fa.md`](docs/deploy-runbook-fa.md)

## ریپورت پروژه (پیشنهادها، انتقادها، ریسک‌ها)

برای ثبت ایده‌ها و تصمیم‌های مهم، از این فایل HTML استفاده کنید:

- `docs/project-report-fa.html`

