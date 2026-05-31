import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Observes device network presence (mine sites often have weak signal).
class ConnectivityService {
  ConnectivityService({
    Connectivity? connectivity,
    Future<bool> Function()? onlineProbe,
  })  : _connectivity = connectivity ?? Connectivity(),
        _onlineProbe = onlineProbe;

  final Connectivity _connectivity;
  final Future<bool> Function()? _onlineProbe;
  final _onlineController = StreamController<bool>.broadcast();

  Stream<bool> get onOnline => _onlineController.stream;
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  Future<bool> get isOnline async {
    if (_onlineProbe != null) return _onlineProbe();
    final results = await _connectivity.checkConnectivity();
    return _hasConnection(results);
  }

  bool _hasConnection(List<ConnectivityResult> results) {
    return results.any((r) => r != ConnectivityResult.none);
  }

  void start() {
    _subscription ??= _connectivity.onConnectivityChanged.listen((results) {
      _onlineController.add(_hasConnection(results));
    });
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
    _onlineController.close();
  }
}
