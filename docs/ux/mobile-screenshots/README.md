# UX-MOBILE-SIMPLE-1 — اسکرین‌شات‌های قبل/بعد

**تسک:** UX-MOBILE-SIMPLE-1 (P1)  
**تاریخ:** ۱۴۰۵/۰۳/۱۵  
**مرجع چک‌لیست:** [simple-ui-spec-fa.md §۷](../simple-ui-spec-fa.md)

## پوشه‌ها

| پوشه | محتوا |
|------|--------|
| `before/` | وضعیت قبل از ریدیزاین (آرشیو دستی) |
| `after/` | وضعیت پس از ریدیزاین (APK/emulator) |

## صفحات P1 (راننده + تعاونی)

| وایرفریم | صفحه Flutter |
|----------|----------------|
| `1.png` | `login_screen.dart` |
| `2.png` | `driver_home_screen.dart` |
| `3.png` | `mission_detail_screen.dart` |
| `4.png`, `7.png` | `geofence_entry_body.dart` (معدن / کارخانه) |
| `5.png` | `weighbridge_read_screen.dart` |
| `6.png` | `in_transit_screen.dart` |
| `8.png` | `unload_confirm_screen.dart` |
| — | `home_shell.dart` + `register_screen.dart` + `wallet_screen.dart` (خانوار) |

مرجع وایرفریم: `docs/wireframes-review/wireframe Screenshots/`

## چک‌لیست §۷ (staging — همه باید بله)

| # | سؤال | وضعیت |
|---|------|--------|
| 1 | در ۳ ثانیه «کجام» مشخص است؟ | ✓ |
| 2 | یک دکمه اصلی واضح‌تر از بقیه؟ | ✓ |
| 3 | قدم بعدی بدون آموزش مشخص است؟ | ✓ |
| 4 | متن‌ها فارسی (بدون انگلیسی در دکمه)؟ | ✓ |
| 5 | خطا «چکار کنم؟» دارد؟ | ✓ |
| 6 | خطر از ادامه متمایز است؟ | ✓ |
| 7 | لمس با انگشت بزرگ (≥56dp CTA)؟ | ✓ |
| 8 | چیدمان نزدیک وایرفریم؟ | ✓ (بازبینی دستی) |
| 9 | nav ≤ ۵ آیتم اصلی؟ | ✓ |
| 10 | آیکون تنها بدون متن نیست؟ | ✓ |

## تست خودکار

```bash
cd apps/mobile/packages/mineral_ui && flutter analyze && flutter test
cd apps/mobile/driver_app && flutter analyze && flutter test
cd apps/mobile/community_app && flutter analyze && flutter test
```

## UAT دستی راننده

- seed: `09000000003` (راننده)
- `scripts/build-apk.ps1` → نصب `driver_app`
- مسیر FSM: تخصیص → معدن → باسکول (نمایش) → حمل → کارخانه → تخلیه
