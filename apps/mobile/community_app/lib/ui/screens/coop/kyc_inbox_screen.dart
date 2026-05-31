import 'package:flutter/material.dart';
import 'package:mineral_api/mineral_api.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/community_api_client.dart';
import '../../../models/community_models.dart';
import '../../widgets/error_banner.dart';

class KycInboxScreen extends StatefulWidget {
  const KycInboxScreen({
    super.key,
    required this.api,
    required this.token,
    required this.onUnauthorized,
  });

  final CommunityApiClient api;
  final String token;
  final VoidCallback onUnauthorized;

  @override
  State<KycInboxScreen> createState() => _KycInboxScreenState();
}

class _KycInboxScreenState extends State<KycInboxScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _scrollControllers = <String, ScrollController>{
    'PENDING': ScrollController(),
    'NEEDS_CORRECTION': ScrollController(),
  };

  final _itemsByTab = <String, List<KycInboxItem>>{
    'PENDING': [],
    'NEEDS_CORRECTION': [],
  };
  final _totalByTab = <String, int>{'PENDING': 0, 'NEEDS_CORRECTION': 0};
  final _pageByTab = <String, int>{'PENDING': 1, 'NEEDS_CORRECTION': 1};
  final _loadingByTab = <String, bool>{'PENDING': true, 'NEEDS_CORRECTION': true};
  final _loadingMoreByTab = <String, bool>{'PENDING': false, 'NEEDS_CORRECTION': false};
  String? _error;
  static const _limit = 20;

  String get _currentStatus =>
      _tabController.index == 0 ? 'PENDING' : 'NEEDS_CORRECTION';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(_onTabChanged);
    for (final status in ['PENDING', 'NEEDS_CORRECTION']) {
      _scrollControllers[status]!.addListener(() => _onScroll(status));
      _load(status: status, reset: true);
    }
  }

  @override
  void dispose() {
    _tabController.removeListener(_onTabChanged);
    _tabController.dispose();
    for (final c in _scrollControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _onTabChanged() {
    if (_tabController.indexIsChanging) return;
    setState(() {});
  }

  void _onScroll(String status) {
    final c = _scrollControllers[status]!;
    if (!c.hasClients || _loadingMoreByTab[status] == true) return;
    if (c.position.pixels < c.position.maxScrollExtent - 120) return;
    final items = _itemsByTab[status]!;
    final total = _totalByTab[status]!;
    if (items.length >= total) return;
    _load(status: status, reset: false);
  }

  Future<void> _load({required String status, required bool reset}) async {
    if (reset) {
      setState(() {
        _loadingByTab[status] = true;
        _error = null;
        _pageByTab[status] = 1;
      });
    } else {
      if (_loadingMoreByTab[status] == true) return;
      setState(() => _loadingMoreByTab[status] = true);
    }

    final page = reset ? 1 : (_pageByTab[status]! + 1);

    try {
      final result = await widget.api.getKycInboxPage(
        token: widget.token,
        status: status,
        page: page,
        limit: _limit,
      );
      if (!mounted) return;
      setState(() {
        if (reset) {
          _itemsByTab[status] = result.items;
        } else {
          _itemsByTab[status] = [..._itemsByTab[status]!, ...result.items];
        }
        _totalByTab[status] = result.total;
        _pageByTab[status] = page;
      });
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = formatApiError(e));
    } finally {
      if (mounted) {
        setState(() {
          _loadingByTab[status] = false;
          _loadingMoreByTab[status] = false;
        });
      }
    }
  }

  Future<String?> _promptReason(
    BuildContext context, {
    required String title,
    required int minLength,
    String hint = '',
  }) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          maxLines: 4,
          decoration: InputDecoration(
            hintText: hint.isNotEmpty ? hint : 'حداقل $minLength کاراکتر',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('انصراف')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('تأیید'),
          ),
        ],
      ),
    );
  }

  Future<bool> _confirmApprove(KycInboxItem item) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأیید درخواست'),
        content: Text('آیا «${item.name}» (${kycEntityLabelFa(item.entityType)}) تأیید شود؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('انصراف')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('تأیید'),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _approve(KycInboxItem item) async {
    if (!await _confirmApprove(item)) return;
    try {
      await widget.api.approveKycEntity(
        token: widget.token,
        entityType: item.entityType,
        id: item.id,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('«${item.name}» تأیید شد')),
      );
      await _load(status: _currentStatus, reset: true);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    }
  }

  Future<void> _reject(KycInboxItem item) async {
    final reason = await _promptReason(
      context,
      title: 'دلیل رد',
      minLength: 3,
    );
    if (reason == null || reason.length < 3) return;
    try {
      await widget.api.rejectKycEntity(
        token: widget.token,
        entityType: item.entityType,
        id: item.id,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('«${item.name}» رد شد')),
      );
      await _load(status: _currentStatus, reset: true);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    }
  }

  Future<void> _requestCorrection(KycInboxItem item) async {
    final reason = await _promptReason(
      context,
      title: 'درخواست اصلاح',
      minLength: 10,
      hint: 'حداقل ۱۰ کاراکتر — دلیل اصلاح برای متقاضی',
    );
    if (reason == null || reason.length < 10) return;
    try {
      await widget.api.requestKycCorrection(
        token: widget.token,
        entityType: item.entityType,
        id: item.id,
        reason: reason,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('درخواست اصلاح ثبت شد')),
      );
      await _load(status: _currentStatus, reset: true);
    } on ApiException catch (e) {
      if (e.isUnauthorized) {
        widget.onUnauthorized();
        return;
      }
      setState(() => _error = e.message);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('باز کردن لینک ممکن نشد')),
      );
    }
  }

  void _showDetail(KycInboxItem item, {required bool actionsEnabled}) {
    final docs = kycDocLinks(item);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(item.name, style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 8),
              Text('نوع: ${kycEntityLabelFa(item.entityType)}'),
              if (item.nationalId != null && item.nationalId!.isNotEmpty)
                Text('شناسه: ${item.nationalId}'),
              if (item.villageName != null && item.villageName!.isNotEmpty)
                Text('روستا: ${item.villageName}'),
              Text('تاریخ: ${formatKycDate(item.createdAt)}'),
              if (item.correctionReason != null && item.correctionReason!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'دلیل اصلاح: ${item.correctionReason}',
                    style: const TextStyle(color: MineralTheme.muted),
                  ),
                ),
              if (docs.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('مدارک', style: TextStyle(fontWeight: FontWeight.w600)),
                ...docs.map(
                  (d) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.attach_file),
                    title: Text(d.label),
                    onTap: () => _openUrl(d.url),
                  ),
                ),
              ],
              if (!actionsEnabled)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'منتظر ارسال مجدد توسط متقاضی',
                    style: TextStyle(color: MineralTheme.muted, fontSize: 13),
                  ),
                ),
              if (actionsEnabled) ...[
                const SizedBox(height: 16),
                ElevatedButton(
                  key: const Key('kyc_sheet_approve'),
                  onPressed: () {
                    Navigator.pop(ctx);
                    _approve(item);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: MineralTheme.primary,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('تأیید'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _requestCorrection(item);
                  },
                  child: const Text('درخواست اصلاح'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    _reject(item);
                  },
                  child: const Text('رد'),
                ),
              ],
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _statusChip(String status) {
    final badge = kycStatusBadge(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Color(int.parse(badge.bg.replaceFirst('#', '0xFF'))),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        badge.label,
        style: TextStyle(
          fontSize: 12,
          color: Color(int.parse(badge.fg.replaceFirst('#', '0xFF'))),
        ),
      ),
    );
  }

  Widget _buildTabBody(String status) {
    final loading = _loadingByTab[status] == true;
    final items = _itemsByTab[status]!;
    final loadingMore = _loadingMoreByTab[status] == true;
    final actionsEnabled = status == 'PENDING';

    if (loading && items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: () => _load(status: status, reset: true),
      child: ListView(
        controller: _scrollControllers[status],
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          if (_error != null && _error!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ErrorBanner(message: _error!),
            ),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('صندوق ورودی خالی است.')),
            )
          else
            ...items.map(
              (item) => ListTile(
                title: Text(item.name),
                subtitle: Text(
                  '${kycEntityLabelFa(item.entityType)} · ${formatKycDate(item.createdAt)}',
                ),
                trailing: _statusChip(item.status),
                onTap: () => _showDetail(item, actionsEnabled: actionsEnabled),
              ),
            ),
          if (loadingMore)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: TabBar(
            controller: _tabController,
            labelColor: MineralTheme.primary,
            tabs: const [
              Tab(text: 'در انتظار'),
              Tab(text: 'نیاز به اصلاح'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildTabBody('PENDING'),
              _buildTabBody('NEEDS_CORRECTION'),
            ],
          ),
        ),
      ],
    );
  }
}
