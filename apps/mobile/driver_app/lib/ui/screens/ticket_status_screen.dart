import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session_store.dart';
import '../../models/api_models.dart';

class TicketStatusScreen extends StatefulWidget {
  const TicketStatusScreen({
    super.key,
    required this.api,
    required this.sessionStore,
    required this.token,
    required this.missionId,
  });

  final ApiClient api;
  final SessionStore sessionStore;
  final String token;
  final int missionId;

  @override
  State<TicketStatusScreen> createState() => _TicketStatusScreenState();
}

class _TicketStatusScreenState extends State<TicketStatusScreen> {
  bool _loading = false;
  String? _error;
  WeighbridgeTicket? _ticket;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final t = await widget.api.getMissionTicket(token: widget.token, missionId: widget.missionId);
      setState(() => _ticket = t);
    } catch (e) {
      if (e is ApiException && e.isUnauthorized) {
        await widget.sessionStore.clearSession();
        if (!mounted) return;
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
        return;
      }
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _statusTitle(String status) {
    switch (status) {
      case 'PENDING_EMPTY':
        return 'در انتظار ثبت باسکول';
      case 'APPROVED':
        return 'تایید شد';
      case 'REJECTED':
        return 'رد شد';
      default:
        return status;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'APPROVED':
        return const Color(0xFF1B5E20);
      case 'REJECTED':
        return const Color(0xFFB91C1C);
      default:
        return const Color(0xFF92400E);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('وضعیت باسکول'),
        ),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_loading) const LinearProgressIndicator(),
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
              ],
              if (_ticket == null && !_loading) const Text('اطلاعاتی برای نمایش وجود ندارد'),
              if (_ticket != null) ...[
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Ticket شماره: ${_ticket!.ticketNumber}',
                                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Builder(
                              builder: (context) {
                                final statusColor = _statusColor(_ticket!.status);
                                return Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: statusColor.withOpacity(0.1),
                                    border: Border.all(color: statusColor.withOpacity(0.3)),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    _statusTitle(_ticket!.status),
                                    style: TextStyle(
                                      color: statusColor,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF9FAFB),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFE5E7EB)),
                          ),
                          child: Wrap(
                            spacing: 18,
                            runSpacing: 8,
                            children: [
                              Text('Mission: ${_ticket!.missionId}'),
                              Text('Load: ${_ticket!.loadId}'),
                              Text('Status Code: ${_ticket!.status}'),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'این صفحه وضعیت را از پنل اپراتور باسکول دریافت می‌کند.',
                          style: TextStyle(color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('به‌روزرسانی'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('بازگشت به ماموریت‌ها'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

