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

## ریپورت پروژه (پیشنهادها، انتقادها، ریسک‌ها)

برای ثبت ایده‌ها و تصمیم‌های مهم، از این فایل HTML استفاده کنید:

- `docs/project-report-fa.html`

