import 'package:flutter/material.dart';

import '../../core/session_store.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.sessionStore});

  final SessionStore sessionStore;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final session = await widget.sessionStore.readSession();
    final mineId = await widget.sessionStore.readMineId();
    if (!mounted) return;

    if (session == null) {
      Navigator.pushReplacementNamed(context, '/login');
      return;
    }

    if (session.role != 'DRIVER') {
      // Driver app only.
      await widget.sessionStore.clearSession();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('این اپ فقط برای نقش راننده است.')),
      );
      Navigator.pushReplacementNamed(context, '/login');
      return;
    }

    if (mineId == null) {
      Navigator.pushReplacementNamed(context, '/mine-select', arguments: session.accessToken);
      return;
    }

    Navigator.pushReplacementNamed(context, '/missions', arguments: session.accessToken);
  }

  @override
  Widget build(BuildContext context) {
    return const Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      ),
    );
  }
}

