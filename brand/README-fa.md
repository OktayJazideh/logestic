# راهنمای برند همسهمان

دامنه: **hamsahman.ir** · رنگ اصلی: `#1E3A2F` / `#152921`

## نام‌های مرتبط (همه زیر یک برند)

| محصول | نام نمایشی | زیرعنوان |
|--------|------------|----------|
| برند اصلی | **همسهمان** | لجستیک معدن |
| پنل وب | **پنل همسهمان** | حمل، باسکول و مدیریت تعاونی |
| اپ راننده | **همسهمان · راننده** | مأموریت و باسکول |
| اپ تعاونی | **همسهمان · تعاونی** | اعضا و عملیات ساعتی |

## فایل‌های لوگو

| فایل | کاربرد |
|------|--------|
| `brand/logo-mark.svg` | آیکن مربعی (هدر، favicon پایه) |
| `brand/logo-full-fa.svg` | لوگو + متن فارسی |
| `apps/web/public/favicon.svg` | فاویکون پنل |

## کد منبع نام‌ها

- وب: `apps/web/src/brand/names.ts`
- موبایل: `apps/mobile/packages/mineral_api/lib/src/brand_names.dart`
- بک‌اند (PDF/SMS): env `PLATFORM_NAME=Hamsahman`

## آیکن اندروید

- Android 8+: `mipmap-anydpi-v26/ic_launcher.xml` (adaptive)
- راننده: پس‌زمینه `#152921`
- تعاونی: پس‌زمینه `#1E3A2F` (کمی روشن‌تر)

برای جایگزینی PNGهای قدیمی با طراحی حرفه‌ای‌تر:

```bash
# اختیاری — بعد از قرار دادن brand/app-icon-1024.png
flutter pub run flutter_launcher_icons
```

## بازسازی پنل بعد از تغییر favicon

```bash
cd apps/web && npm run build
```
