import 'package:flutter/material.dart';

import 'package:mineral_api/mineral_api.dart';

import '../../core/driver_api_client.dart';

class MineSelectScreen extends StatefulWidget {
  const MineSelectScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
  });

  final DriverApiClient api;
  final String token;
  final SessionStore sessionStore;

  @override
  State<MineSelectScreen> createState() => _MineSelectScreenState();
}

class _MineSelectScreenState extends State<MineSelectScreen> {
  bool _loading = false;
  String? _error;

  Future<List<Workspace>> _loadWorkspaces() async {
    final all = await widget.api.getWorkspaces(token: widget.token);
    return all.where((w) => w.isOperational).toList();
  }

  Future<void> _selectMine(Workspace ws) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.selectWorkspace(
        token: widget.token,
        mineId: ws.mineId,
        membershipKind: 'OPERATIONAL',
      );
      await widget.sessionStore.saveMineId(ws.mineId);
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/home', arguments: widget.token);
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

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(title: const Text('کار در معدن')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'کار در معدن',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              const SizedBox(height: 4),
              Text(
                'فقط فضاهای عملیاتی (راننده، مالک ناوگان، …) — عضویت تعاونی در اپ جامعه است.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: FutureBuilder<List<Workspace>>(
                  future: _loadWorkspaces(),
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snap.hasError) {
                      return Center(child: Text(snap.error.toString()));
                    }
                    final items = snap.data ?? [];
                    if (items.isEmpty) {
                      return const Center(child: Text('فضای عملیاتی فعالی برای شما ثبت نشده است.'));
                    }
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        final m = items[i];
                        return Card(
                          child: ListTile(
                            title: Text(m.displayTitle),
                            subtitle: Text(m.roles.join(' · ')),
                            trailing: const Icon(Icons.chevron_left),
                            onTap: _loading ? null : () => _selectMine(m),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
              ],
              if (_loading) const LinearProgressIndicator(),
            ],
          ),
        ),
      ),
    );
  }
}
