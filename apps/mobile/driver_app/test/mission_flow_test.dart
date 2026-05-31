import 'package:flutter_test/flutter_test.dart';

import 'package:driver_app/core/mission_flow.dart';

void main() {
  group('MissionFlow 9→7 map', () {
    test('uiStepLabelsFa has 7 steps', () {
      expect(MissionFlow.uiStepLabelsFa.length, MissionFlow.uiStepCount);
      expect(MissionFlow.uiStepLabelsFa.length, 7);
    });

    test('uiStepIndexFromStatus groups backend states', () {
      expect(MissionFlow.uiStepIndexFromStatus('CREATED'), 0);
      expect(MissionFlow.uiStepIndexFromStatus('ASSIGNED'), 0);
      expect(MissionFlow.uiStepIndexFromStatus('ACCEPTED'), 1);
      expect(MissionFlow.uiStepIndexFromStatus('ARRIVED'), 2);
      expect(MissionFlow.uiStepIndexFromStatus('LOADED'), 3);
      expect(MissionFlow.uiStepIndexFromStatus('IN_TRANSIT'), 4);
      expect(MissionFlow.uiStepIndexFromStatus('DELIVERED'), 5);
      expect(MissionFlow.uiStepIndexFromStatus('VERIFIED'), 6);
      expect(MissionFlow.uiStepIndexFromStatus('SETTLED'), 6);
    });

    test('showWeighbridgeStatusLink for ARRIVED LOADED DELIVERED', () {
      expect(MissionFlow.showWeighbridgeStatusLink('ARRIVED'), isTrue);
      expect(MissionFlow.showWeighbridgeStatusLink('LOADED'), isTrue);
      expect(MissionFlow.showWeighbridgeStatusLink('DELIVERED'), isTrue);
      expect(MissionFlow.showWeighbridgeStatusLink('ASSIGNED'), isFalse);
    });

    test('nextDriverStep follows driverStepOrder only', () {
      expect(MissionFlow.nextDriverStep('ASSIGNED'), 'ACCEPTED');
      expect(MissionFlow.nextDriverStep('ACCEPTED'), 'ARRIVED');
      expect(MissionFlow.nextDriverStep('IN_TRANSIT'), 'DELIVERED');
      expect(MissionFlow.nextDriverStep('DELIVERED'), isNull);
      expect(MissionFlow.nextDriverStep('CREATED'), isNull);
    });

    test('geofence gate blocks in-place advance from ACCEPTED', () {
      expect(MissionFlow.mustConfirmGeofenceBeforeAdvance('ACCEPTED'), isTrue);
      expect(MissionFlow.canAdvanceInPlace('ACCEPTED'), isFalse);
    });

    test('factory geofence gate blocks in-place advance from IN_TRANSIT', () {
      expect(MissionFlow.mustConfirmFactoryGeofenceBeforeAdvance('IN_TRANSIT'), isTrue);
      expect(MissionFlow.mustUseInTransitScreen('IN_TRANSIT'), isTrue);
      expect(MissionFlow.mustConfirmUnloadBeforeAdvance('IN_TRANSIT'), isFalse);
      expect(MissionFlow.canAdvanceInPlace('IN_TRANSIT'), isFalse);
    });

    test('weighbridge link includes IN_TRANSIT', () {
      expect(MissionFlow.showWeighbridgeStatusLink('IN_TRANSIT'), isTrue);
    });

    test('can advance in place for ASSIGNED and ARRIVED', () {
      expect(MissionFlow.canAdvanceInPlace('ASSIGNED'), isTrue);
      expect(MissionFlow.canAdvanceInPlace('ARRIVED'), isTrue);
    });
  });
}
