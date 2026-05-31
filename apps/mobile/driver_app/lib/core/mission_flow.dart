/// Mission progression aligned with backend 9-state FSM (architecture V1).
/// See `apps/backend/src/lib/missionFsm.ts`.
///
/// **WF-STEPPER-1 — official 9→7 UI map (wireframe):**
/// | UI step | Label (Fa)        | Backend states     | Driver advance notes      |
/// |--------:|-------------------|--------------------|---------------------------|
/// | 0       | تخصیص             | CREATED, ASSIGNED  | ASSIGNED → ACCEPTED       |
/// | 1       | پذیرش             | ACCEPTED           | → ARRIVED via WF-GEOFENCE |
/// | 2       | ورود معدن         | ARRIVED            | → LOADED                  |
/// | 3       | بارگیری / باسکول  | LOADED             | → IN_TRANSIT              |
/// | 4       | حمل               | IN_TRANSIT         | → DELIVERED via WF-UNLOAD |
/// | 5       | تحویل             | DELIVERED          | coop verifies             |
/// | 6       | تأیید             | VERIFIED, SETTLED  | terminal                  |
///
/// Driver may only advance along [driverStepOrder] (ASSIGNED … DELIVERED).
class MissionFlow {
  MissionFlow._();

  /// Full lifecycle (backend FSM).
  static const List<String> fullStepOrder = [
    'CREATED',
    'ASSIGNED',
    'ACCEPTED',
    'ARRIVED',
    'LOADED',
    'IN_TRANSIT',
    'DELIVERED',
    'VERIFIED',
    'SETTLED',
  ];

  /// Steps the driver advances via API (ASSIGNED → … → DELIVERED).
  static const List<String> driverStepOrder = [
    'ASSIGNED',
    'ACCEPTED',
    'ARRIVED',
    'LOADED',
    'IN_TRANSIT',
    'DELIVERED',
  ];

  /// Wireframe stepper labels (7 steps).
  static const List<String> uiStepLabelsFa = [
    'تخصیص',
    'پذیرش',
    'ورود معدن',
    'بارگیری / باسکول',
    'حمل',
    'تحویل',
    'تأیید',
  ];

  static const int uiStepCount = 7;

  /// WF-GEOFENCE-1: when true, ACCEPTED→ARRIVED must not skip geofence UI.
  static const bool wfGeofenceEnabled = true;

  /// WF-UNLOAD-1: when true, IN_TRANSIT→DELIVERED must not skip unload UI.
  static const bool wfUnloadEnabled = true;

  /// Maps backend status to wireframe step index `0..6`.
  static int uiStepIndexFromStatus(String status) {
    switch (status) {
      case 'CREATED':
      case 'ASSIGNED':
        return 0;
      case 'ACCEPTED':
        return 1;
      case 'ARRIVED':
        return 2;
      case 'LOADED':
        return 3;
      case 'IN_TRANSIT':
        return 4;
      case 'DELIVERED':
        return 5;
      case 'VERIFIED':
      case 'SETTLED':
        return 6;
      default:
        return 0;
    }
  }

  /// Next driver-advanceable backend status, or null if terminal / unknown.
  static String? nextDriverStep(String status) {
    final i = driverStepOrder.indexOf(status);
    if (i < 0 || i >= driverStepOrder.length - 1) return null;
    return driverStepOrder[i + 1];
  }

  /// Geofence gate before posting ARRIVED (WF-GEOFENCE).
  static bool mustConfirmGeofenceBeforeAdvance(String currentStatus) {
    return wfGeofenceEnabled && currentStatus == 'ACCEPTED';
  }

  /// Factory geofence gate before unload (WF-GEOFENCE, wireframe §۷).
  static bool mustConfirmFactoryGeofenceBeforeAdvance(String currentStatus) {
    return wfGeofenceEnabled && currentStatus == 'IN_TRANSIT';
  }

  /// WF-INTRANSIT-1 — map + ETA before factory geofence (no direct status skip).
  static bool mustUseInTransitScreen(String currentStatus) {
    return currentStatus == 'IN_TRANSIT';
  }

  /// Unload confirmation gate before posting DELIVERED (WF-UNLOAD).
  static bool mustConfirmUnloadBeforeAdvance(String currentStatus) {
    return wfUnloadEnabled && currentStatus == 'IN_TRANSIT' && !wfGeofenceEnabled;
  }

  /// Whether [MissionDetailScreen] may POST advance directly (no sub-flow).
  static bool canAdvanceInPlace(String currentStatus) {
    if (isDriverTerminal(currentStatus)) return false;
    if (nextDriverStep(currentStatus) == null) return false;
    return !mustConfirmGeofenceBeforeAdvance(currentStatus) &&
        !mustConfirmFactoryGeofenceBeforeAdvance(currentStatus) &&
        !mustConfirmUnloadBeforeAdvance(currentStatus);
  }

  static String labelFa(String status) {
    switch (status) {
      case 'CREATED':
        return 'ایجاد ماموریت';
      case 'ASSIGNED':
        return 'تخصیص به راننده';
      case 'ACCEPTED':
        return 'پذیرش راننده';
      case 'ARRIVED':
        return 'رسیدن به مبدأ';
      case 'LOADED':
        return 'بارگیری (باسکول)';
      case 'IN_TRANSIT':
        return 'حمل به مقصد';
      case 'DELIVERED':
        return 'تحویل در مقصد';
      case 'VERIFIED':
        return 'تأیید باسکول و سهم';
      case 'SETTLED':
        return 'تسویه ماهانه';
      default:
        return status;
    }
  }

  /// Primary button label for advancing one driver step (or terminal state).
  static String primaryActionLabel(String currentStatus) {
    if (mustConfirmGeofenceBeforeAdvance(currentStatus)) {
      return 'ثبت ورود به معدن';
    }
    if (mustConfirmFactoryGeofenceBeforeAdvance(currentStatus)) {
      return 'رسیدم به مقصد';
    }
    if (mustConfirmUnloadBeforeAdvance(currentStatus)) {
      return 'تأیید تحویل و تخلیه';
    }
    switch (currentStatus) {
      case 'ASSIGNED':
        return 'پذیرش ماموریت';
      case 'ACCEPTED':
        return 'ثبت رسیدن به مبدأ';
      case 'ARRIVED':
        return 'تأیید بارگیری (پس از باسکول)';
      case 'LOADED':
        return 'شروع حمل به مقصد';
      case 'IN_TRANSIT':
        return 'ثبت تحویل در مقصد';
      case 'DELIVERED':
        return 'منتظر تأیید باسکول';
      case 'VERIFIED':
      case 'SETTLED':
        return 'تکمیل شده';
      default:
        return 'ثبت مرحله بعد';
    }
  }

  static bool isDriverTerminal(String status) {
    return status == 'DELIVERED' || status == 'VERIFIED' || status == 'SETTLED';
  }

  /// WF-WB-READ-1: link to read-only weighbridge status (incl. IN_TRANSIT / AWAITING_WB).
  static bool showWeighbridgeStatusLink(String status) {
    return status == 'ARRIVED' ||
        status == 'LOADED' ||
        status == 'IN_TRANSIT' ||
        status == 'DELIVERED';
  }
}
