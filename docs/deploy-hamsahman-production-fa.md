<div dir="rtl" lang="fa">

# استقرار Production — hamsahman.ir (DEPLOY-SAHMAN-1)

**دامنه:** `https://hamsahman.ir`  
**مسیر سرور:** `/opt/logestic/logestic`  
**env API:** `/etc/logestic/backend.env`

---

## ۱. DNS

| رکورد | نوع | مقدار |
|--------|-----|--------|
| `@` | A | IP سرور VPS |
| `www` | A یا CNAME | همان IP یا `hamsahman.ir` |

پس از propagate:

```bash
dig +short hamsahman.ir A
```

---

## ۲. SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hamsahman.ir -d www.hamsahman.ir
```

---

## ۳. env بک‌اند (production + SMS واقعی)

```bash
sudo cp /opt/logestic/logestic/deploy/config/backend.env.production.example /etc/logestic/backend.env
sudo nano /etc/logestic/backend.env
sudo chmod 600 /etc/logestic/backend.env
```

**الزامی:**

| متغیر | مقدار |
|--------|--------|
| `NODE_ENV` | `production` |
| `SMS_PROVIDER` | `kavenegar` |
| `SMS_API_KEY` | از پنل کاوه‌نگار |
| `SMS_SENDER_LINE` | مثلاً `2000660110` |
| `PUBLIC_URL` | `https://hamsahman.ir` |
| `TRUST_PROXY` | `true` |

> با `NODE_ENV=production` API دیگر `__dev/otp` و `__dev/login` و `__dev/seed/*` را برنمی‌گرداند.

**کاوه‌نگار:** پنل → خطوط → خط ارسال → **فعال‌سازی API** (بدون آن خطای `kavenegar_427`).

---

## ۴. nginx

```bash
sudo cp /opt/logestic/logestic/deploy/config/nginx-hamsahman.ir.conf /etc/nginx/sites-available/hamsahman.ir
sudo ln -sf /etc/nginx/sites-available/hamsahman.ir /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

پنل و API روی **یک دامنه**: `/` → وب · `/api/` → بک‌اند `127.0.0.1:4000`.

---

## ۵. Build و deploy از Windows

```powershell
cd D:\Workspace\logestic
.\scripts\deploy-production-hamsahman.ps1
```

یا دستی:

```powershell
# بک‌اند
cd apps\backend
npx prisma generate
npm run build

# وب — بدون دمو
cd ..\web
$env:VITE_API_BASE = "/api"
$env:VITE_ENABLE_DEMO_LOGIN = "false"
npm run build
```

آپلود + migrate روی VPS (مثل staging):

```powershell
scp -r apps/backend/dist root@YOUR_VPS:/opt/logestic/logestic/apps/backend/
scp -r apps/backend/prisma root@YOUR_VPS:/opt/logestic/logestic/apps/backend/
scp -r apps/web/dist root@YOUR_VPS:/opt/logestic/logestic/apps/web/
ssh root@YOUR_VPS "cd /opt/logestic/logestic/apps/backend && npx prisma migrate deploy && systemctl restart logestic-api && systemctl reload nginx"
```

---

## ۶. دیتابیس production

```bash
cd /opt/logestic/logestic/apps/backend
sudo -u logestic npx prisma migrate deploy
```

**بدون** `db:seed` دمو — فقط:

```bash
# یک‌بار: ساختار + ADMIN (موبایل از SEED_ADMIN_MOBILE)
SEED_ADMIN_MOBILE=09XXXXXXXXX npm run db:seed
```

کاربران پایلوت از پنل ADMIN (`/panel/admin/users`).

---

## ۷. تست SMS

روی VPS:

```bash
cd /opt/logestic/logestic
npm -w @app/backend run test:sms-prod1 -- --live
```

انتظار: `live Kavenegar OK` + پیامک روی `SMS_TEST_MOBILE`.

ورود واقعی:

```bash
curl -s -X POST https://hamsahman.ir/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile_number":"09XXXXXXXXX"}'
```

- پاسخ فقط `expires_in_seconds` — **بدون** `otp` در JSON
- `GET /api/auth/__dev/otp` → **404**

---

## ۸. Smoke checklist

| # | تست | انتظار |
|---|-----|--------|
| 1 | `curl https://hamsahman.ir/api/health` | `ok: true` |
| 2 | پنل HTTPS بدون warning | باز شود |
| 3 | ورود OTP | SMS برسد |
| 4 | صفحه login | **بدون** «ورود دمو» |
| 5 | ADMIN workspace-select | معادن لیست شود |
| 6 | `journalctl -u logestic-api -n 20` | بدون خطای SMS |

---

## ۹. APK موبایل (production)

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://hamsahman.ir
```

---

## ۱۰. عیب‌یابی

| علامت | اقدام |
|--------|--------|
| API بالا نمی‌آید + `production: SMS_API_KEY` | env §۳ را کامل کنید |
| `kavenegar_427` | فعال‌سازی API خط در پنل |
| OTP نمی‌رسد ولی 200 | کاربر در DB ثبت نشده — پنل ADMIN |
| دمو هنوز دیده می‌شود | rebuild وب با `VITE_ENABLE_DEMO_LOGIN=false` |

</div>
