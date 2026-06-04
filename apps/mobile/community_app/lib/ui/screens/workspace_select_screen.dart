import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:mineral_ui/mineral_theme.dart';
import 'package:mineral_ui/mineral_ui.dart';

import '../../core/community_api_client.dart';
import '../../core/community_roles.dart';
import '../../core/household_gate.dart';

class WorkspaceSelectScreen extends StatefulWidget {
  const WorkspaceSelectScreen({
    super.key,
    required this.api,
    required this.token,
    required this.role,
    required this.sessionStore,
  });

  final CommunityApiClient api;
  final String token;
  final String role;
  final SessionStore sessionStore;

  @override
  State<WorkspaceSelectScreen> createState() => _WorkspaceSelectScreenState();
}

class _WorkspaceSelectScreenState extends State<WorkspaceSelectScreen> {
  bool _loading = false;
  String? _error;

  Future<List<Workspace>> _load() async {
    final all = await widget.api.getWorkspaces(token: widget.token);
    if (isMineOperatorRole(widget.role)) {
      return all.where((w) => w.isOperational).toList();
    }
    return all.where((w) => w.isCommunity).toList();
  }

  Future<void> _select(Workspace ws) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.api.selectWorkspace(
        token: widget.token,
        mineId: ws.mineId,
        cooperativeId: isMineOperatorRole(widget.role) ? null : ws.cooperativeId,
        membershipKind: isMineOperatorRole(widget.role) ? 'OPERATIONAL' : 'COMMUNITY',
      );
      await widget.sessionStore.saveMineId(ws.mineId);
      if (!mounted) return;
      await navigateAfterWorkspace(
        context: context,
        api: widget.api,
        token: widget.token,
        role: widget.role,
      );
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
        appBar: AppBar(
          title: Text(isMineOperatorRole(widget.role) ? 'انتخاب معدن عملیاتی' : 'انتخاب عضویت تعاونی'),
          actions: [
            LogoutAppBarButton(
              onLogout: () async {
                await widget.sessionStore.clearSession();
                if (!context.mounted) return;
                Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
              },
            ),
          ],
        ),
        body: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                isMineOperatorRole(widget.role) ? 'فضای عملیاتی معدن' : 'عضویت در تعاونی',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
              ),
              const SizedBox(height: 4),
              Text(
                isMineOperatorRole(widget.role)
                    ? 'معدنی را که اپراتور عملیات ساعتی در آن هستید انتخاب کنید.'
                    : isHouseholdRole(widget.role)
                        ? 'فقط فضای تعاونی — کار عملیاتی در معدن دیگر از اپ راننده/وب است.'
                        : 'فضای کاری تعاونی خود را انتخاب کنید.',
                style: const TextStyle(fontSize: 12, color: MineralTheme.muted),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: FutureBuilder<List<Workspace>>(
                  future: _load(),
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snap.hasError) {
                      return Center(child: Text(snap.error.toString()));
                    }
                    final items = snap.data ?? [];
                    if (items.isEmpty) {
                      return Center(
                        child: Text(
                          isMineOperatorRole(widget.role)
                              ? 'عضویت عملیاتی فعالی برای شما ثبت نشده است.'
                              : 'عضویت تعاونی فعالی برای شما ثبت نشده است.',
                        ),
                      );
                    }
                    return ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        final w = items[i];
                        return Card(
                          child: ListTile(
                            title: Text(w.displayTitle),
                            subtitle: Text('${w.roles.join(' · ')}\nمعدن: ${w.mineName}'),
                            isThreeLine: true,
                            trailing: const Icon(Icons.chevron_left),
                            onTap: _loading ? null : () => _select(w),
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
