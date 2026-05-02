import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session_store.dart';
import '../../models/api_models.dart';
import '../widgets/weighbridge_flow_strip.dart';

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
        return 'منتظر ثبت وزن توسط اپراتور باسکول';
      case 'EMPTY_REGISTERED':
        return 'وزن خالی ثبت شد';
      case 'LOADED_REGISTERED':
        return 'وزن‌ها ثبت شد — منتظر تأیید ناظر';
      case 'ADJUSTED':
        return 'اصلاح وزن ثبت شد';
      case 'APPROVED':
        return 'تأیید شد و سهم مالی ثبت شد';
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
              if (_ticket == null && !_loading)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    'هنوز ردیف تیکت باسکول برای این ماموریت ثبت نشده است. اگر تازه عملیات را تمام کرده‌اید، بروزرسانی کنید؛ '
                    'در غیر این صورت با پشتیبانی تماس بگیرید.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.4),
                  ),
                ),
              if (_ticket != null) ...[
                WeighbridgeFlowStrip(
                  ticketStatus: _ticket!.status,
                  ticketPending: false,
                ),
                const SizedBox(height: 12),
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
                        if (_ticket!.emptyWeight != null ||
                            _ticket!.loadedWeight != null ||
                            _ticket!.netWeight != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4, bottom: 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                if (_ticket!.emptyWeight != null)
                                  Text('وزن خالی: ${_ticket!.emptyWeight}'),
                                if (_ticket!.loadedWeight != null)
                                  Text('وزن پر: ${_ticket!.loadedWeight}'),
                                if (_ticket!.netWeight != null)
                                  Text(
                                    'وزن خالص: ${_ticket!.netWeight}',
                                    style: const TextStyle(fontWeight: FontWeight.w600),
                                  ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 8),
                        const Text(
                          'پس از اتمام ماموریت توسط شما، اپراتور باسکول وزن‌ها را ثبت می‌کند؛ ناظر پس از بررسی تأیید یا رد می‌کند. '
                          'پس از تأیید معتبر، سهم طبق قانون مالی مصوب (تقسیم ۸۵/۱۳/۲) در کیف‌پول‌ها ثبت می‌شود.',
                          style: TextStyle(color: Colors.black54, height: 1.35),
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

