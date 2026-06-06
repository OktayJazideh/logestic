<div dir="rtl" lang="fa">

# کاربران دمو (هر نقش) + استقرار Linux + APK

**مرجع:** [گزارش v4](mvp-flow-chat-master-report-fa-v4.html) · [Runbook کامل](deploy-runbook-fa.md) · [UAT checklist](uat-handover-checklist-fa.md) · **[UAT User Journey (HTML)](uat-pilot-user-journey-fa.html)**

---

## ۱. پیش‌نیاز محلی (قبل از deploy)

```powershell
cd D:\Workspace\logestic
docker start mineral-postgres   # یا: docker compose up -d postgres
npm install
npm -w @app/backend run db:migrate
npm -w @app/backend run db:seed
```

Backend:

```powershell
npm -w @app/backend run dev
```

Web panel:

```powershell
npm -w @app/web run dev
```

- API: `http://localhost:4000`
- Panel: `http://localhost:5173`

---

## ۲. ورود OTP (development / staging با mock SMS)

### گام ورود

1. در پنل یا اپ: شماره موبایل را وارد کنید → «درخواست OTP»
2. OTP را بگیرید (یکی از روش‌های زیر)
3. کد را وارد کنید → انتخاب **workspace** (معدن TAFTAN)

### گرفتن OTP در dev

```http
GET http://localhost:4000/api/auth/__dev/otp?mobile_number=09000000003
```

یا PowerShell:

```powershell
Invoke-RestMethod "http://localhost:4000/api/auth/__dev/otp?mobile_number=09000000003"
```

> **Production** (`NODE_ENV=production`): endpoint بالا **404** است — OTP فقط از SMS واقعی.

### انتخاب workspace (بعد از login)

| نقش | `mine_id` | `membership_kind` |
|-----|-----------|-------------------|
| حمل / معدن / باسکول | `1` (TAFTAN) | `OPERATIONAL` |
| تعاونی / خانوار | `1` | `COMMUNITY` |

---

## ۳. Seed مینیمال vs لیست پایلوت (افراد)

### بعد از `db:seed` (پیش‌فرض — بدون PII)

| چه چیزی | وضعیت |
|---------|--------|
| معدن تفتان + بتا، روستاها، تعاونی‌ها | ✓ در DB |
| Rate card + قرارداد HAUL (99/1 + Community placeholder) | ✓ |
| **یک ADMIN** | ✓ موبایل پیش‌فرض `09000000000` (یا `SEED_ADMIN_MOBILE`) — **بدون** کد ملی/نام در seed |
| کاربران پایلوت (راننده، تعاونی، …) | **خالی** — شما از پنل اضافه می‌کنید |

```powershell
# فقط برای تست خودکار قدیمی (۱۵ حساب 09000000* + KYC ساختگی):
$env:SEED_UAT_ENTITIES="1"
npm -w @app/backend run db:seed
```

### چک‌لیست نقش‌های UAT تفتان (لیست پایلوت شما)

> **راهنمای ساده — از صفر تا تست کامل:** [uat-pilot-user-journey-fa.html](uat-pilot-user-journey-fa.html) — اول این را بخوانید (فلو + ۱۵ قدم حمل)

از **پنل ADMIN → مدیریت کاربران** (`/panel/admin/users`) هر نقش را با موبایل واقعی بسازید. کد ملی و نام **اختیاری** در ایجاد حساب؛ شبا **فقط** در ثبت/KYC خانوار و ناوگان. هر موبایل/کد ملی/شبا باید **یکتا** باشد.

| نقش | موبایل (پر کنید) | cooperative_id | workspace | کار اصلی |
|-----|------------------|----------------|-----------|----------|
| **ADMIN** | (همان seed) | — | OPERATIONAL · mine 1 | کاربران، تأیید درخواست‌ها |
| **EMPLOYER** | | — | OPERATIONAL · mine 1 | ثبت نیاز حمل |
| **OPERATION_ADMIN** | | — | OPERATIONAL · mine 1 | dispatch، تأیید باسکول |
| **OPERATION_ADMIN** (lock) | | — | OPERATIONAL · mine 1 | lock settlement |
| **COOP_ADMIN** | | `1` | COMMUNITY · mine 1 | KYC، اعضا |
| **COOP_OPERATOR** | | `1` | OPERATIONAL · mine 1 | **وزن دستی باسکول** |
| **DRIVER** | | `1` | OPERATIONAL · mine 1 | FSM در اپ راننده |
| **FLEET_OWNER** | | `1` | OPERATIONAL · mine 1 | ناوگان + KYC + شبا |
| **HOUSEHOLD** | | `1` | COMMUNITY · mine 1 | ثبت خانوار + KYC + شبا |
| **CONSULTANT** | | — | OPERATIONAL · mine 1 | ساعتی (فاز ۲+) |
| **OPERATOR** | | — | OPERATIONAL · mine 1 | ساعتی (فاز ۲+) |

> **CLIENT-DATA-PILOT-1 ✓ (دمو):** gate بسته شد — seed فقط ساختار + placeholder؛ افراد از پنل. Community/IBAN/روستای واقعی را هنگام UAT میدانی از پنل قرارداد و KYC وارد کنید.

### حساب‌های دمو قدیمی (فقط با `SEED_UAT_ENTITIES=1`)

| نقش | موبایل |
|-----|--------|
| EMPLOYER | `09000000007` |
| OPERATION_ADMIN | `09000000002` |
| COOP_ADMIN | `09000000001` |
| COOP_OPERATOR | `09000000111` |
| DRIVER | `09000000003` |
| … | جدول کامل در git history / seed `seedUatPilotUsers` |

### مسیر UAT حمل (خلاصه)

```
EMPLOYER → نیاز
OPERATION_ADMIN → dispatch
DRIVER (app) → FSM تا DELIVERED
COOP_OPERATOR (web) → وزن خالی/پر دستی
OPERATION_ADMIN → approve باسکول → VERIFIED (99/1)
```

**باسکول:** Agent سخت‌افزار **الزامی نیست** — اپرator در `/panel/weighbridge` وزن را از نمایشگر باسکول می‌خواند و وارد می‌کند.

---

## ۴. استقرار روی سرور Linux (VPS)

فرض: Ubuntu 22/24 · دامنه `api.example.ir` و `panel.example.ir` · Postgres روی همان سرور یا managed.

### ۴.۱ نصب پیش‌نیاز

```bash
sudo apt update
sudo apt install -y git curl nginx certbot python3-certbot-nginx

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Postgres 16 (اگر local)
sudo apt install -y postgresql postgresql-contrib
```

### ۴.۲ Clone و build

```bash
sudo useradd -m -s /bin/bash logestic || true
sudo mkdir -p /opt/logestic
sudo chown logestic:logestic /opt/logestic

sudo -u logestic git clone <REPO_URL> /opt/logestic
cd /opt/logestic
sudo -u logestic npm install
sudo -u logestic npm -w @app/backend run db:migrate
sudo -u logestic npm -w @app/backend run build
sudo -u logestic npm -w @app/web run build
```

Staging/UAT:

```bash
sudo -u logestic npx prisma migrate deploy   # حداقل 0046_identity_unique
sudo -u logestic npm -w @app/backend run db:seed   # مینیمال — سپس کاربران پایلوت از پنل ADMIN
# اختیاری دمو قدیمی: SEED_UAT_ENTITIES=1 npm -w @app/backend run db:seed
```

### ۴.۳ فایل env

`/etc/logestic/backend.env`:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/mineral_mvp
SMS_PROVIDER=kavenegar
SMS_API_KEY=کلید_از_پنل_کاوه‌نگار
SMS_SENDER_LINE=2000660110
PUBLIC_URL=https://api.example.ir
PLATFORM_NAME=Hamsahman
DISPATCH_MODE=manual
```

> **کاوه‌نگار:** خط آزمایشی `2000660110` فقط بعد از فعال‌سازی **سطح دسترسی API** در پنل (حساب من → خطوط) پیامک می‌فرستد. خطای `427` یعنی API برای این خط فعال نیست.
>
> تست زنده: `npm -w @app/backend run test:sms-prod1 -- --live` (با env بالا)
>
> **امنیت:** کلید API را فقط در env سرور بگذارید، نه در git.

> اول staging می‌توانید `SMS_PROVIDER=mock` بگذارید؛ برای OTP واقعی روی گوشی `kavenegar` + کلید.

Web build-time (`apps/web/.env.production`):

```env
VITE_API_BASE=https://api.example.ir/api
```

سپس دوباره `npm -w @app/web run build`.

### ۴.۴ systemd

`/etc/systemd/system/logestic-api.service` — [نمونه کامل در deploy-runbook-fa.md §۶](deploy-runbook-fa.md)

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now logestic-api
curl -s http://127.0.0.1:4000/api/health || curl -s http://127.0.0.1:4000/
```

### ۴.۵ nginx + SSL

```bash
sudo certbot --nginx -d panel.example.ir -d api.example.ir
```

نمونه panel (static + proxy API):

```nginx
server {
  listen 443 ssl http2;
  server_name panel.example.ir;
  root /opt/logestic/apps/web/dist;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}

server {
  listen 443 ssl http2;
  server_name api.example.ir;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### ۴.۶ Smoke پس از deploy

```bash
cd /opt/logestic
npm run test:infra-regression
npm -w @app/backend run test:pilot-taftan1
```

---

## ۵. ساخت APK (Flutter)

نیاز: [Flutter SDK](https://docs.flutter.dev/get-started/install) 3.16+ · Android SDK · JDK 17.

### ۵.۱ Driver app

```bash
cd /opt/logestic/apps/mobile/driver_app
flutter pub get

# آدرس API سرور — IP عمومی یا دامنه (نه localhost روی گوشی!)
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.example.ir

# خروجی:
# build/app/outputs/flutter-apk/app-release.apk
```

نصب روی گوشی: فایل APK را کپی کنید یا از `adb install build/app/outputs/flutter-apk/app-release.apk`.

### ۵.۲ Community app

```bash
cd /opt/logestic/apps/mobile/community_app
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://api.example.ir

# build/app/outputs/flutter-apk/app-release.apk
```

### ۵.۳ نکات موبایل

| موضوع | راه‌حل |
|--------|--------|
| گوشی به API وصل نمی‌شود | `API_BASE_URL` = HTTPS دامنه واقعی؛ firewall پورت 443 |
| OTP روی گوشی | staging: mock + dev OTP از مرورگر PC؛ production: SMS |
| Emulator Android | پیش‌فرض `http://10.0.2.2:4000` (host machine) |
| iOS | `flutter build ipa` — نیاز Mac + Apple Developer |

### ۵.۴ App Bundle (کافه‌بازار / Play — فاز بعد)

```bash
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.ir
```

---

## ۶. چک سریع «چیزی کم نیست؟»

| بخش | وضعیت | تست |
|-----|--------|-----|
| Auth OTP + workspace | ✓ | login هر نقش از جدول §۳ |
| Dispatch + FSM | ✓ | `test:pilot-taftan1` |
| باسکول دستی (COOP_OPERATOR) | ✓ | `test:wb1` · WeighbridgePage |
| Split 99/1 | ✓ | seed + pilot-taftan |
| HOLD settlement | ✓ | `test:hold-settlement1` |
| Period statement HSA | ✓ | `test:invoice-draft1` |
| Community app | ✓ | `test:comm-app1` |
| Agent سخت‌افزار | scaffold فقط | **فاز بعد** — `apps/weighbridge-agent/` |
| Deploy production | runbook آماده | §۴ این سند |

---

## ۷. تصمیم قفل — باسکول

**فاز ۱ UAT:** ورود **دستی اپرator** در پنل وب (مسیر رسمی).  
**فاز بعد:** Local Agent به Serial/TCP — کد scaffold موجود، deploy اختیاری.

</div>
