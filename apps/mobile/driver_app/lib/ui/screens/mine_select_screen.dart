import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/session_store.dart';
import '../../models/api_models.dart';

class MineSelectScreen extends StatefulWidget {
  const MineSelectScreen({
    super.key,
    required this.api,
    required this.token,
    required this.sessionStore,
  });

  final ApiClient api;
  final String token;
  final SessionStore sessionStore;

  @override
  State<MineSelectScreen> createState() => _MineSelectScreenState();
}

class _MineSelectScreenState extends State<MineSelectScreen> {
  bool _loading = false;
  String? _error;

  Future<List<Mine>> _loadMines() => widget.api.getMines(token: widget.token);

  Future<void> _selectMine(int mineId) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.selectMine(token: widget.token, mineId: mineId);
      await widget.sessionStore.saveMineId(mineId);
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, '/missions', arguments: widget.token);
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
        appBar: AppBar(title: const Text('انتخاب معدن')),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Expanded(
                child: FutureBuilder<List<Mine>>(
                  future: _loadMines(),
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snap.hasError) {
                      return Center(child: Text(snap.error.toString()));
                    }
                    final mines = snap.data ?? [];
                    return ListView.separated(
                      itemCount: mines.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        final m = mines[i];
                        return Card(
                          child: ListTile(
                            title: Text(m.name),
                            subtitle: Text(m.mineCode),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: _loading ? null : () => _selectMine(m.id),
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

