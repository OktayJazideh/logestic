import '../models/api_models.dart';
import 'mission_flow.dart';

bool missionPrimaryEnabled(DriverMission m, {required bool loading}) {
  if (loading || MissionFlow.isDriverTerminal(m.status)) return false;
  return MissionFlow.canAdvanceInPlace(m.status) ||
      MissionFlow.mustConfirmGeofenceBeforeAdvance(m.status) ||
      MissionFlow.mustConfirmFactoryGeofenceBeforeAdvance(m.status) ||
      MissionFlow.mustUseInTransitScreen(m.status) ||
      MissionFlow.mustConfirmUnloadBeforeAdvance(m.status);
}

String missionPrimaryLabel(DriverMission m) {
  if (MissionFlow.mustConfirmFactoryGeofenceBeforeAdvance(m.status)) {
    return 'ثبت ورود به کارخانه';
  }
  return MissionFlow.primaryActionLabel(m.status);
}
