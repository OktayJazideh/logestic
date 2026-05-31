<div dir="rtl" lang="fa">

# راهنمای کامل استقرار روی سرور Linux (پایلوت / UAT)

این سند **گام‌به‌گام** استقرار پروژه **logestic** روی VPS لینوکس (مثلاً هاست ایران) را توضیح می‌دهد.

**مشخصات پیشنهادی شما (۸ گیگ RAM · ۴ هسته · ۸۰ گیگ)** برای پایلوت/UAT **کاملاً کافی** است:
- Postgres + API Node + nginx برای پنل وب → معمولاً زیر ۲ گیگ RAM در حالت عادی
- Flutter/APK را **روی سرور نمی‌سازیم** (روی PC خودتان build می‌کنید)

---

## ۱. معماری — Docker داریم یا نه؟

| جزء | روش استقرار در این پروژه |
|-----|---------------------------|
| **PostgreSQL 16** | **Docker Compose** ([`docker-compose.yml`](../docker-compose.yml)) |
| **Backend API (Node 20)** | مستقیم روی سرور + **systemd** (Docker برای API نداریم) |
| **Web Panel (React/Vite)** | `npm run build` → فایل‌های static در **nginx** |
| **اپ موبایل (Flutter)** | APK روی PC build → نصب دستی روی گوشی |
| **Redis** | **نیاز نیست** (صف job در MVP حافظه‌ای است) |

```text
[گوشی / مرورگر]
       │
       ▼
[nginx :443] ──► panel (static) + proxy /api → localhost:4000
       │
[systemd: logestic-api] ──► Node backend :4000
       │
[Docker: postgres:16] ──► localhost:5434
```

---

## ۲. قبل از شروع — چه چیزهایی لازم دارید؟

| مورد | توضیح |
|------|--------|
| **سرور Linux** | Ubuntu 22.04 یا 24.04 (Debian هم OK) |
| **دسترسی SSH** | IP + user (معمولاً `root` یا `ubuntu`) |
| **دامنه (توصیه‌شده)** | مثلاً `api.yourdomain.ir` و `panel.yourdomain.ir` |
| **DNS** | رکورد A هر دو ساب‌دامین → IP سرور |
| **Repo کد** | git clone یا آپلود zip پروژه |
| **(اختیاری UAT)** | SMS mock — بدون پنل SMS واقعی |

> بدون دامنه هم می‌شود با IP تست کرد، ولی **HTTPS و OTP روی موبایل** سخت‌تر می‌شود. برای پایلوت حداقل یک دامنه بگیرید.

---

## ۳. اتصال به سرور و به‌روزرسانی اولیه

روی **PC خودتان** (PowerShell یا ترمینال):

```bash
ssh root@YOUR_SERVER_IP
# یا
ssh ubuntu@YOUR_SERVER_IP
```

روی سرور:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg lsb-release ufw
```

---

## ۴. نصب Docker (فقط برای Postgres)

```bash
# Docker رسمی — Ubuntu
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker

# تست
docker run hello-world
```

---

## ۵. نصب Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # باید v20.x باشد
npm -v
```

---

## ۶. کاربر سرویس و مسیر پروژه

```bash
sudo useradd -m -s /bin/bash logestic || true
sudo mkdir -p /opt/logestic
sudo chown logestic:logestic /opt/logestic
```

### دریافت کد

**روش A — Git:**

```bash
sudo -u logestic git clone <URL_REPO> /opt/logestic
cd /opt/logestic
```

**روش B — آپلود zip از PC:**

```powershell
# روی Windows
scp -r D:\Workspace\logestic root@YOUR_SERVER_IP:/opt/logestic
ssh root@YOUR_SERVER_IP "chown -R logestic:logestic /opt/logestic"
```

---

## ۷. راه‌اندازی PostgreSQL با Docker

```bash
cd /opt/logestic

# Postgres را فقط روی localhost باز کنید (امنیت)
# در docker-compose.yml خط ports را به این شکل بگذارید:
#   "127.0.0.1:5434:5432"

docker compose up -d postgres
docker compose ps
docker logs mineral-postgres --tail 20
```

اتصال DB:

```env
DATABASE_URL=postgresql://mineral:mineral_password@127.0.0.1:5434/mineral_mvp
```

> **Production واقعی:** رمز `mineral_password` را عوض کنید و در `docker-compose.yml` و `DATABASE_URL` یکسان کنید.

---

## ۸. تنظیم Backend (env)

```bash
sudo mkdir -p /etc/logestic
sudo nano /etc/logestic/backend.env
```

**نمونه برای پایلوت/UAT (بدون SMS واقعی):**

```env
NODE_ENV=development
PORT=4000

DATABASE_URL=postgresql://mineral:mineral_password@127.0.0.1:5434/mineral_mvp

# OTP بدون هزینه — کد از endpoint dev یا لاگ سرور
SMS_PROVIDER=mock

DISPATCH_MODE=manual
BANK_ADAPTER=mock

# آدرس عمومی API — بعد از nginx/SSL عوض کنید
PUBLIC_URL=https://api.yourdomain.ir
PLATFORM_NAME=Logestic
```

**نمونه Production (با SMS واقعی):**

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://mineral:STRONG_PASSWORD@127.0.0.1:5434/mineral_mvp

SMS_PROVIDER=kavenegar
SMS_API_KEY=your-api-key
SMS_SENDER_LINE=your-sender-line

PUBLIC_URL=https://api.yourdomain.ir
PLATFORM_NAME=Logestic
```

```bash
sudo chmod 600 /etc/logestic/backend.env
sudo chown root:root /etc/logestic/backend.env
```

---

## ۹. نصب وابستگی‌ها، migrate، seed

```bash
cd /opt/logestic
sudo -u logestic npm ci

cd /opt/logestic/apps/backend
sudo -u logestic npm run prisma:generate
sudo -u logestic npm run db:migrate

# فقط Staging/UAT — کاربران دمو (راننده، ادمین، …)
sudo -u logestic npm run db:seed

# build
sudo -u logestic npm run build
```

**Production بدون داده دمو:** مرحله `db:seed` را **نزنید**.

---

## ۱۰. systemd — سرویس API

```bash
sudo nano /etc/systemd/system/logestic-api.service
```

```ini
[Unit]
Description=Logestic Backend API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=logestic
WorkingDirectory=/opt/logestic/apps/backend
EnvironmentFile=/etc/logestic/backend.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now logestic-api
sudo systemctl status logestic-api
sudo journalctl -u logestic-api -f
```

### تست API روی خود سرور

```bash
curl -s http://127.0.0.1:4000/api/health
curl -s http://127.0.0.1:4000/api/health/z | head
```

---

## ۱۱. Build پنل وب

```bash
cd /opt/logestic/apps/web

# قبل از build — آدرس API عمومی
echo 'VITE_API_BASE=https://api.yourdomain.ir/api' | sudo -u logestic tee .env.production

sudo -u logestic npm run build
# خروجی: /opt/logestic/apps/web/dist
```

---

## ۱۲. nginx + SSL (Let's Encrypt)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### پیکربندی nginx

```bash
sudo nano /etc/nginx/sites-available/logestic
```

```nginx
# پنل وب
server {
    listen 80;
    server_name panel.yourdomain.ir;
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name panel.yourdomain.ir;

    root /opt/logestic/apps/web/dist;
    index index.html;

    ssl_certificate     /etc/letsencrypt/live/panel.yourdomain.ir/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.ir/privkey.pem;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# API
server {
    listen 80;
    server_name api.yourdomain.ir;
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.ir;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.ir/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.ir/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/logestic /etc/nginx/sites-enabled/
sudo nginx -t
```

**SSL (بعد از اینکه DNS به IP اشاره کرد):**

```bash
sudo certbot --nginx -d panel.yourdomain.ir -d api.yourdomain.ir
sudo systemctl reload nginx
```

> certbot اول nginx را با HTTP بالا می‌آورد؛ اگر فایل بالا خط SSL دارد قبل از certbot، یک بار نسخه HTTP-only بگذارید یا از `certbot certonly --webroot` استفاده کنید.

---

## ۱۳. فایروال

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

**پورت Postgres (5434) را به اینترنت باز نکنید** — فقط `127.0.0.1` کافی است.

---

## ۱۴. Smoke test بعد از deploy

روی سرور:

```bash
cd /opt/logestic
export DATABASE_URL=postgresql://mineral:mineral_password@127.0.0.1:5434/mineral_mvp
export TEST_BASE_URL=http://127.0.0.1:4000

npm -w @app/backend run test:infra-regression
npm -w @app/backend run test:pilot-taftan1
```

از PC (بعد از SSL):

```bash
curl -s https://api.yourdomain.ir/api/health
```

### ورود OTP در UAT (mock)

1. مرورگر: `https://panel.yourdomain.ir`
2. شماره ادمین: `09000000000` → درخواست OTP
3. گرفتن کد (فقط وقتی `NODE_ENV=development`):

```bash
curl "https://api.yourdomain.ir/api/auth/__dev/otp?mobile_number=09000000000"
```

4. workspace: **mine 1 · OPERATIONAL**

جدول کامل کاربران دمو: [`demo-users-and-deploy-fa.md`](demo-users-and-deploy-fa.md)

---

## ۱۵. اپ موبایل (Flutter) — build روی PC، نه سرور

روی **Windows/Mac** (Flutter SDK نصب باشد):

```bash
cd apps/mobile/driver_app
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.ir

# خروجی:
# build/app/outputs/flutter-apk/app-release.apk
```

```bash
cd ../community_app
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.yourdomain.ir
```

APK را به گوشی منتقل کنید (USB، تلگرام، …) و نصب کنید.

> `API_BASE_URL` **حتماً** آدرس عمومی HTTPS باشد — `localhost` روی گوشی به گوشی خودش اشاره می‌کند.

---

## ۱۶. به‌روزرسانی نسخه (deploy بعدی)

```bash
cd /opt/logestic
sudo -u logestic git pull   # یا آپلود نسخه جدید

sudo -u logestic npm ci
cd apps/backend
sudo -u logestic npm run prisma:generate
sudo -u logestic npm run db:migrate
sudo -u logestic npm run build
sudo systemctl restart logestic-api

cd ../web
sudo -u logestic npm run build
sudo systemctl reload nginx
```

---

## ۱۷. Backup دیتابیس

```bash
# نصب client (اگر pg_dump ندارید)
sudo apt install -y postgresql-client

export DATABASE_URL=postgresql://mineral:mineral_password@127.0.0.1:5434/mineral_mvp
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/logestic_$(date +%Y%m%d_%H%M).dump"
```

کرون روزانه (مثال):

```bash
sudo crontab -e
# 0 3 * * * pg_dump "postgresql://..." -Fc -f /var/backups/logestic_daily.dump
```

---

## ۱۸. عیب‌یابی

| علامت | علت محتمل | راه‌حل |
|--------|-----------|--------|
| `Can't reach database` | Postgres down | `docker compose up -d postgres` · `DATABASE_URL` |
| API بالا نمی‌آید | env اشتباه | `journalctl -u logestic-api -n 50` |
| پنل سفید / 404 | build نشده | `npm -w @app/web run build` · مسیر `root` nginx |
| login خطای شبکه | `VITE_API_BASE` اشتباه | rebuild web با URL درست |
| OTP 404 | `NODE_ENV=production` بدون SMS | `SMS_PROVIDER=mock` + dev OTP **یا** SMS واقعی |
| موبایل وصل نمی‌شود | HTTP یا firewall | HTTPS + `API_BASE_URL` دامنه |
| `502 Bad Gateway` | API crash | `systemctl status logestic-api` |

---

## ۱۹. چک‌لیست سریع پایلوت

- [ ] Postgres با Docker بالا است
- [ ] `db:migrate` + `db:seed` (UAT)
- [ ] `logestic-api` active است
- [ ] `https://api.../api/health` → OK
- [ ] `https://panel...` باز می‌شود
- [ ] login با `09000000000` (ADMIN)
- [ ] login راننده `09000000003` در driver app
- [ ] APK با `API_BASE_URL=https://api...` build شده

---

## ۲۰. اسناد مرتبط

| سند | محتوا |
|-----|--------|
| [`deploy-runbook-fa.md`](deploy-runbook-fa.md) | runbook DevOps · SMS · rollback |
| [`demo-users-and-deploy-fa.md`](demo-users-and-deploy-fa.md) | جدول موبایل هر نقش · APK |
| [`uat-handover-checklist-fa.md`](uat-handover-checklist-fa.md) | چک‌لیست UAT |

---

*آخرین به‌روزرسانی: هم‌تراز `docker-compose.yml` · Node 20 · Postgres 16 · systemd + nginx*

</div>
