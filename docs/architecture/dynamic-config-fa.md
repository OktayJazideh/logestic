# تنظیمات داینامیک معدن — اصل «هیچ عدد business در کد»

## اصل

مقادیر مالی و عملیاتی کسب‌وکار (کارمزد پلتفرم، ریال Community به ازای تن، نرخ قرارداد، …) **فقط** از دیتابیس و پنل ADMIN خوانده می‌شوند. در `src/services` و مسیر production هیچ fallback عددی ثابت (مثل `0.01`، `500_000`، `RULE_DEFAULTS`) وجود ندارد.

## منبع حقیقت

| تنظیم | جدول / API |
|--------|------------|
| کارمزد پلتفرم (`platform_fee_value`) | `mines` · `PATCH /api/admin/mines/:id/settings` |
| Community به ازای تن | `service_contracts.fixed_community_amount_rial_per_unit` (قرارداد فعال HAUL) |
| قوانین سراسری (باسکول، SLA تسویه، …) | `finance_rules` — فقط اگر در DB seed شده باشد |

## بارگذاری در runtime

`loadMineFinanceConfig(mineId)` در `mineSettingsService` فیلدهای الزامی را می‌خواند:

- `platform_fee_value` روی معدن (بین ۰ و ۱، غیر null)
- قرارداد خدمات فعال برای تعاونی/عملیات پیش‌فرض (`HAUL_TONNAGE` + cooperative_id=1 مگر در ctx مشخص شود)

اگر چیزی ناقص باشد → **`MineConfigIncompleteError`** → HTTP **400**، کد `mine_config_incomplete`، پیام **«تنظیمات معدن ناقص»**.

## seed و دمو

- `apps/backend/scripts/seedConstants.ts` و `src/lib/seedFinanceRules.ts` فقط برای **`db:seed`**، `ensureSeeded` و اسکریپت‌های regression.
- پایلوت تفتان: `TAFTAN_PLATFORM_FEE_VALUE`، `TAFTAN_FIXED_COMMUNITY_RIAL_PER_UNIT` در seed اعمال می‌شود.
- تست‌های integration می‌توانند fixture صریح در DB بگذارند؛ سرویس‌ها default کد ندارند.

## آنتی‌پترن

- `?? 0.01` یا `RULE_DEFAULTS[key]` در مسیر production
- `DEFAULT_PLATFORM_FEE_VALUE` در services
- برگرداندن مقدار پیش‌فرض وقتی DB null است (باید 400 باشد)

## مرجع کد

- `apps/backend/src/services/mineSettingsService.ts` — `loadMineFinanceConfig`
- `apps/backend/src/lib/mineConfigErrors.ts` — `MineConfigIncompleteError`
- `apps/backend/src/services/financePolicyService.ts` — `resolveFinancePolicy`
- `apps/backend/src/services/ruleEngine.ts` — بدون fallback؛ `RuleNotConfiguredError` اگر rule در DB نباشد

## تست

```bash
npm run test:infra-regression:finance
```

شامل `comm-ton1`، `fin-policy1`، `set1`، `hold-settlement1` و زنجیره infra-regression.
