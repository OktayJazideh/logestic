/// Mission progression aligned with backend `driverUpdateStep` (single forward transitions).
/// See `apps/backend/src/stores/missionStore.ts` — order: ASSIGNED → LOADING → ON_THE_WAY → UNLOADING → COMPLETED.
class MissionFlow {
  MissionFlow._();

  static const List<String> driverStepOrder = [
    'ASSIGNED',
    'LOADING',
    'ON_THE_WAY',
    'UNLOADING',
    'COMPLETED',
  ];

  static String labelFa(String status) {
    switch (status) {
      case 'ASSIGNED':
        return 'تخصیص ماموریت';
      case 'LOADING':
        return 'بارگیری در مبدأ';
      case 'ON_THE_WAY':
        return 'حمل (در مسیر)';
      case 'UNLOADING':
        return 'تخلیه در مقصد';
      case 'COMPLETED':
        return 'اتمام عملیات راننده';
      default:
        return status;
    }
  }

  /// Primary button label for advancing one step (or terminal state).
  static String primaryActionLabel(String currentStatus) {
    switch (currentStatus) {
      case 'ASSIGNED':
        return 'شروع بارگیری';
      case 'LOADING':
        return 'خروج از مبدأ — حمل به مقصد';
      case 'ON_THE_WAY':
        return 'ورود به مقصد — شروع تخلیه';
      case 'UNLOADING':
        return 'پایان عملیات راننده (صدور تیکت باسکول)';
      case 'COMPLETED':
        return 'تکمیل شده';
      default:
        return 'ثبت مرحله بعد';
    }
  }
}
