<div dir="rtl" lang="fa">

# Runbook استقرار — logestic MVP

راهنمای **DevOps** برای Staging و Production. مرجع کارت‌ها: SMS-PROD-1، UAT-SIGNOFF-1، PILOT-TAFTAN-1.

**چک‌لیست پذیرش کارفرما:** [`uat-handover-checklist-fa.md`](uat-handover-checklist-fa.md)

---

## ۱. پیش‌نیاز

| سرویس | نسخه | الزام |
|--------|------|-------|
| Node.js | 20 LTS+ | بله |
| PostgreSQL | 16 | بله |
| Redis | — | **خیر** (صف job در MVP in-memory است) |
| Reverse proxy | nginx/Caddy + TLS | Production |

---

## ۲. Docker Compose (Postgres)

فایل [`docker-compose.yml`](../docker-compose.yml) در ریشه repo:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5434:5432"
    environment:
      POSTGRES_USER: mineral
      POSTGRES_PASSWORD: mineral_password
      POSTGRES_DB: mineral_mvp
```

```powershell
cd D:\Workspace\logestic
docker compose up -d postgres
docker compose ps
```

`DATABASE_URL` متناظر:

```env
DATABASE_URL=postgresql://mineral:mineral_password@localhost:5434/mineral_mvp
```

> Production: Postgres managed (RDS/Cloud SQL) — container فقط برای dev/staging سبک.

---

## ۳. نصب، migrate، seed

```powershell
cd D:\Workspace\logestic
npm install
npm -w @app/backend run db:migrate
npm -w @app/backend run build
```

| محیط | seed |
|------|------|
| Staging / پایلوت UAT | `npm -w @app/backend run db:seed` |
| Production | **بدون** seed demo — داده از migration + onboarding |

```powershell
npm -w @app/backend start
```

Web panel (اختیاری همان host):

```powershell
npm -w @app/web run build
# serve dist/ با nginx یا:
npm -w @app/web run preview
```

### Smoke پس از deploy

```powershell
npm run test:infra-regression
npm -w @app/backend run test:pilot-taftan1
```

---

## ۴. متغیرهای محیط

**مرجع نمونه:** [`apps/backend/.env.example`](../apps/backend/.env.example)

```powershell
copy apps\backend\.env.example apps\backend\.env
```

### ۴.۱ الزامی

| متغیر | مثال | توضیح |
|--------|------|--------|
| `NODE_ENV` | `development` / `production` | production → `__dev/*` غیرفعال |
| `PORT` | `4000` | پورت API |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Postgres |

### ۴.۲ SMS

| متغیر | Staging (پیش‌فرض UAT) | Production |
|--------|----------------------|------------|
| `SMS_PROVIDER` | **`mock`** | `kavenegar` یا `faraz` |
| `SMS_API_KEY` | خالی در mock | کلید پنل |
| `SMS_SENDER_LINE` | خالی در mock | خط ارسال |

Fallback قدیمی: `KAVENEGAR_API_KEY` + `KAVENEGAR_SENDER` یا `FARAZSMS_*`.

**آنتی‌پترن:** API key در git commit نشود؛ OTP در body پاسخ API برنگردد.

### ۴.۳ سایر (اختیاری)

| متغیر | پیش‌فرض | کاربرد |
|--------|---------|--------|
| `DISPATCH_MODE` | `manual` | `auto` = dispatch بلافاصله پس از need |
| `BANK_ADAPTER` | `mock` | payout خودکار پس از lock |
| `PUBLIC_URL` | `http://localhost:4000` | QR رسید PDF |
| `PLATFORM_NAME` | `Logestic` | برند PDF |
| `WEIGHBRIDGE_KEYS` | — | JSON کلید ingest WB-INT-1 |
| `FCM_SERVER_KEY` | — | push موبایل |

Web frontend (`apps/web/.env` یا build-time):

```env
VITE_API_BASE=https://api.example.ir/api
```

---

## ۵. Staging vs Production — SMS

### Staging / UAT (بدون هزینه SMS)

```env
NODE_ENV=development
SMS_PROVIDER=mock
```

OTP dev:

```text
GET /api/auth/__dev/otp?mobile_number=09XXXXXXXXX
```

رگرسیون بدون SMS واقعی:

```powershell
npm -w @app/backend run test:sms-prod1
```

### Staging — تست SMS واقعی (SMS-PROD-1)

```env
NODE_ENV=production
SMS_PROVIDER=kavenegar
SMS_API_KEY=<from-panel>
SMS_SENDER_LINE=<sender-line>
```

1. Backend restart
2. `curl -X POST https://api-staging.example.ir/api/auth/request-otp -H "Content-Type: application/json" -d "{\"mobile_number\":\"09XXXXXXXXX\"}"`
3. OTP ظرف **< ۳۰ ثانیه** برسد؛ پاسخ فقط `expires_in_seconds` — **بدون** `otp` در JSON
4. خطای 427 کاوه‌نگار: فعال‌سازی خط در پنل API
5. log سرور نباید `code=` یا OTP چاپ کند

### Production

```env
NODE_ENV=production
SMS_PROVIDER=kavenegar
```

- `GET /api/auth/__dev/otp` → **404**
- `GET /api/auth/__dev/audit` → **404**

---

## ۶. systemd (Linux — نمونه)

مسیرها را با deploy واقعی جایگزین کنید (`/opt/logestic`).

### ۶.۱ Backend

`/etc/systemd/system/logestic-api.service`:

```ini
[Unit]
Description=logestic API
After=network.target postgresql.service

[Service]
Type=simple
User=logestic
WorkingDirectory=/opt/logestic/apps/backend
EnvironmentFile=/etc/logestic/backend.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now logestic-api
sudo journalctl -u logestic-api -f
```

### ۶.۲ Web (static)

پس از `npm -w @app/web run build`، `dist/` را با nginx سرو کنید:

```nginx
server {
  listen 443 ssl;
  server_name panel.example.ir;
  root /opt/logestic/apps/web/dist;
  location / {
    try_files $uri $uri/ /index.html;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
  }
}
```

---

## ۷. Backup / Restore Postgres

### Backup

```bash
pg_dump "$DATABASE_URL" -Fc -f "backup_$(date +%Y%m%d_%H%M).dump"
```

Windows (PowerShell):

```powershell
pg_dump "postgresql://mineral:mineral_password@localhost:5434/mineral_mvp" -Fc -f backup_uat.dump
```

### Restore (DB خالی یا staging rebuild)

```bash
# ایجاد DB خالی در صورت نیاز
createdb -h HOST -U USER mineral_mvp_restore

pg_restore -d "$DATABASE_URL" --clean --if-exists backup_YYYYMMDD.dump
npm -w @app/backend run db:migrate
```

**قبل از restore production:** maintenance window + backup تازه.

---

## ۸. Rollback migration (Prisma)

1. **حتماً backup** (§۷)
2. شناسایی migration مشکل‌دار در `apps/backend/prisma/migrations/`
3. Mark rolled-back (اگر deploy نیمه‌کاره):

```powershell
cd apps\backend
npx prisma migrate resolve --rolled-back 0042_mission_cancelled
```

4. Deploy نسخه قبلی **کد** + schema سازگار
5. در صورت نیاز SQL دستی inverse — Prisma rollback خودکار ندارد؛ migration معکوس یا restore backup

```powershell
npm -w @app/backend run db:migrate
```

---

## ۹. CI / regression قبل از promote

```powershell
npm run test:infra-regression
npm run test:comm-ton1
npm run test:invoice-draft1
npm -w @app/backend run test:pilot-taftan1
npm -w @app/web run test:e2e -- uat-haul
```

مرجع کامل: [`uat-handover-checklist-fa.md`](uat-handover-checklist-fa.md)

---

## ۱۰. عیب‌یابی سریع

| علامت | علت محتمل | اقدام |
|--------|-----------|--------|
| `P1001 Can't reach database` | Postgres down / پورت اشتباه | `docker compose up -d` · بررسی `DATABASE_URL` |
| OTP 404 در staging | `NODE_ENV=production` | mock + dev endpoint یا SMS واقعی |
| monthly-close 202 + timeout | job queue | poll `/api/admin/jobs/{id}` · log API |
| Playwright `Protocol socks5 not supported` | متغیر proxy سیستم | `$env:NO_PROXY="*"`؛ حذف `HTTP_PROXY`/`ALL_PROXY` |
| `active_mission_exists` / `batch_exists_for_period` در e2e | دادهٔ ماه جاری از تست قبلی | e2e خودکار `POST /api/__dev/cleanup/settlement-period` می‌زند؛ backend را restart کنید |

---

*UAT-SIGNOFF-1 · هم‌تراز `apps/backend/.env.example` و `docker-compose.yml`*

</div>
