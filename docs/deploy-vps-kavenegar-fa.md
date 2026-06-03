<div dir="rtl" lang="fa">

# Deploy روی VPS + SMS کاوه‌نگار

**مسیر پروژه روی سرور:** `/opt/logestic/logestic`

---

## ۱. Pull آخرین کد (روی VPS)

```bash
cd /opt/logestic/logestic
sudo -u logestic git pull
```

از Windows (اگر push از PC):

```powershell
cd D:\Workspace\logestic
git -c http.proxy= -c https.proxy= pull origin main
git -c http.proxy= -c https.proxy= push origin main
```

---

## ۲. فایل env سرور

```bash
sudo nano /etc/logestic/backend.env
```

**نمونه درست** (کلید را از پنل کاوه‌نگار بگذارید — **نه** در git):

```env
DATABASE_URL=postgresql://mineral:mineral_password@127.0.0.1:5434/mineral_mvp

NODE_ENV=development
PORT=4000

SMS_PROVIDER=kavenegar
SMS_API_KEY=کلید_API_از_پنل_کاوه‌نگار
SMS_SENDER_LINE=2000660110

DISPATCH_MODE=manual
BANK_ADAPTER=mock

PUBLIC_URL=http://185.36.145.164:4000
PLATFORM_NAME=Hamsahman
```

| متغیر | اشتباه رایج |
|--------|-------------|
| `SMS_API_KEY` | کلید را در `BANK_ADAPTER` نگذارید |
| `BANK_ADAPTER` | فقط `mock` یا `none` |
| `SMS_SENDER_LINE` | خط جدا — مثلاً `2000660110` |

```bash
sudo chmod 600 /etc/logestic/backend.env
```

**کاوه‌نگار:** پنل → حساب من → خطوط → `2000660110` → **فعال‌سازی API** (بدون آن خطای 427).

---

## ۳. Build و restart API

```bash
cd /opt/logestic/logestic
sudo -u logestic npm -w @app/backend run build
sudo systemctl restart logestic-api
sudo systemctl status logestic-api
```

اگر `active (running)` نیست:

```bash
sudo journalctl -u logestic-api -n 40 --no-pager
```

---

## ۴. تست SMS

```bash
cd /opt/logestic/logestic
npm -w @app/backend run test:sms-prod1 -- --live
```

اسکریپت خودکار `/etc/logestic/backend.env` را می‌خواند.

انتظار: `live Kavenegar OK` و پیامک روی `09013019626`.

اگر خطا دیدید:

```bash
sudo journalctl -u logestic-api -n 30 --no-pager | grep -i kavenegar
```

| خطا | کار |
|-----|-----|
| `kavenegar_427` | پنل → خطوط → `2000660110` → **فعال‌سازی API** |
| `skip live` | `SMS_API_KEY` در env نیست — فایل §۲ را چک کنید |

---

## ۵. ورود پنل وب

```bash
curl -s -X POST http://127.0.0.1:4000/api/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile_number":"09013019626"}'
```

- **SMS واقعی:** کد از پیامک
- **`NODE_ENV=development`:** fallback:

```bash
curl -s "http://127.0.0.1:4000/api/auth/__dev/otp?mobile_number=09013019626"
```

پنل: `http://185.36.145.164` → workspace **OPERATIONAL · معدن ۱**

---

## ۶. (اختیاری) rebuild پنل وب

```bash
cd /opt/logestic/logestic/apps/web
sudo -u logestic env VITE_API_BASE=http://185.36.145.164:4000/api npm run build
sudo systemctl reload nginx
```

با آدرس IP در `VITE_API_BASE`، بخش **«ورود دمو (UAT)»** زیر دکمه «دریافت کد» نمایش داده می‌شود (ادمین، کارفرما، عملیات، …).

**برای کار کردن دکمه‌های دمو:** `SMS_PROVIDER=mock` و `NODE_ENV=development` و `db:seed`.

---

## ۷. APK با ورود دمو

APK با `API_BASE_URL=http://185.36.145.164:4000` به‌صورت خودکار پنل دمو را نشان می‌دهد (staging روی IP).

```bash
# روی PC
flutter build apk --release --dart-define=API_BASE_URL=http://185.36.145.164:4000
```

</div>
