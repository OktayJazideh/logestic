/// واژگان ساده UI — هم‌خوان docs/ux/simple-ui-spec-fa.md §۴ و apps/web/src/lib/uiLabels.ts
const simpleLabels = <String, String>{
  'provisioning': 'درخواست کاربر جدید',
  'workspace': 'انتخاب محل کار',
  'dispatch': 'تخصیص بار',
  'settlement': 'تسویه',
  'hold': 'مبلغ بلوکه‌شده',
  'kyc': 'تأیید هویت',
  'otp': 'کد پیامکی',
  'geofence': 'محدوده معدن / کارخانه',
  'netTons': 'وزن خالص (تن)',
  'mission': 'مأموریت',
  'load': 'بار',
};

String simpleLabel(String key) => simpleLabels[key] ?? key;
