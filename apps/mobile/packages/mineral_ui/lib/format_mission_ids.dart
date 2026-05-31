/// Wireframe-style public identifiers for loads and missions.
String formatLoadId(int loadId) => 'LOAD-$loadId';

String formatMissionCode(int missionId) {
  final padded = missionId.toString().padLeft(4, '0');
  return 'MSN-$padded';
}
