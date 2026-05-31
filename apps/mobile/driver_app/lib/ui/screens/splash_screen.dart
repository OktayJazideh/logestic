import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';

import '../../core/driver_api_client.dart';
import '../../core/driver_auth_gate.dart';
import '../../core/otp_validation.dart';
import '../router.dart';

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
    if (!mounted) return;

    if (session == null) {
      Navigator.pushReplacementNamed(context, '/login');
      return;
    }

    if (session.role != 'DRIVER') {
      await widget.sessionStore.clearSession();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('این اپ فقط برای نقش راننده است.')),
      );
      Navigator.pushReplacementNamed(context, '/login');
      return;
    }

    final api = DriverApiClient(baseUrl: AppRouter.baseUrl);
    try {
      await navigateAfterDriverAuth(
        context: context,
        api: api,
        token: session.accessToken,
        sessionStore: widget.sessionStore,
      );
    } catch (e) {
      if (!mounted) return;
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushReplacementNamed(context, '/login');
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(persianApiError(e))),
      );
      Navigator.pushReplacementNamed(context, '/login');
    } finally {
      api.close();
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: MineralTheme.bg,
        body: Center(
          child: CircularProgressIndicator(color: MineralTheme.primary),
        ),
      ),
    );
  }
}
