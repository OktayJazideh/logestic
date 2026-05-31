class HouseholdWallet {
  HouseholdWallet({
    required this.id,
    required this.walletType,
    required this.householdId,
    required this.active,
  });

  final int id;
  final String walletType;
  final int householdId;
  final bool active;

  factory HouseholdWallet.fromJson(Map<String, dynamic> json) {
    return HouseholdWallet(
      id: json['id'] as int,
      walletType: json['wallet_type'] as String? ?? 'HOUSEHOLD',
      householdId: json['household_id'] as int,
      active: json['active'] as bool? ?? true,
    );
  }
}

class WalletTransaction {
  WalletTransaction({
    required this.id,
    required this.amount,
    required this.type,
    this.description,
    this.createdAt,
    this.missionId,
  });

  final int id;
  final double amount;
  final String type;
  final String? description;
  final DateTime? createdAt;
  final int? missionId;

  factory WalletTransaction.fromJson(Map<String, dynamic> json) {
    DateTime? dt;
    final raw = json['created_at'];
    if (raw is String) dt = DateTime.tryParse(raw);

    return WalletTransaction(
      id: json['id'] as int,
      amount: (json['amount'] as num).toDouble(),
      type: json['type'] as String,
      description: json['description'] as String?,
      createdAt: dt,
      missionId: json['mission_id'] as int?,
    );
  }

  bool get isPoolDistribution => type == 'POOL_DISTRIBUTION';
}

class VillageOption {
  VillageOption({required this.id, required this.name});

  final int id;
  final String name;

  factory VillageOption.fromJson(Map<String, dynamic> json) {
    return VillageOption(
      id: json['id'] as int,
      name: json['name'] as String? ?? 'روستا ${json['id']}',
    );
  }
}

class HouseholdProfile {
  HouseholdProfile({
    required this.id,
    required this.villageId,
    required this.headName,
    required this.nationalId,
    required this.status,
    this.cooperativeId,
    this.bankIban,
    this.walletActive = false,
  });

  final int id;
  final int villageId;
  final int? cooperativeId;
  final String headName;
  final String nationalId;
  final String? bankIban;
  final String status;
  final bool walletActive;

  bool get isPending => status == 'PENDING';
  bool get isApproved => status == 'APPROVED';

  factory HouseholdProfile.fromJson(Map<String, dynamic> json) {
    return HouseholdProfile(
      id: json['id'] as int,
      villageId: json['village_id'] as int,
      cooperativeId: json['cooperative_id'] as int?,
      headName: json['head_name'] as String,
      nationalId: json['national_id'] as String,
      bankIban: json['bank_iban'] as String?,
      status: json['status'] as String,
      walletActive: json['wallet_active'] as bool? ?? false,
    );
  }
}

class HouseholdWalletView {
  HouseholdWalletView({
    required this.wallet,
    required this.balance,
    required this.transactions,
    this.communityRialPerTon,
  });

  final HouseholdWallet wallet;
  final double balance;
  final List<WalletTransaction> transactions;
  /// From API when available (`community_rial_per_ton` or `community_rate_rial_per_ton`).
  final double? communityRialPerTon;

  factory HouseholdWalletView.fromJson(Map<String, dynamic> data) {
    final txs = (data['transactions'] as List<dynamic>? ?? [])
        .map((e) => WalletTransaction.fromJson(e as Map<String, dynamic>))
        .toList();
    final rateRaw = data['community_rial_per_ton'] ?? data['community_rate_rial_per_ton'];
    return HouseholdWalletView(
      wallet: HouseholdWallet.fromJson(data['wallet'] as Map<String, dynamic>),
      balance: (data['balance'] as num).toDouble(),
      transactions: txs,
      communityRialPerTon: rateRaw != null ? (rateRaw as num).toDouble() : null,
    );
  }
}

class CoopMember {
  CoopMember({
    required this.householdId,
    required this.headName,
    required this.villageId,
    required this.status,
    this.cooperativeId,
  });

  final int householdId;
  final String headName;
  final int villageId;
  final int? cooperativeId;
  final String status;

  factory CoopMember.fromJson(Map<String, dynamic> json) {
    return CoopMember(
      householdId: json['household_id'] as int,
      headName: json['head_name'] as String,
      villageId: json['village_id'] as int,
      cooperativeId: json['cooperative_id'] as int?,
      status: json['status'] as String,
    );
  }
}

/// KYC inbox row (`KycInboxTableItem` on backend).
class KycInboxItem {
  KycInboxItem({
    required this.id,
    required this.entityType,
    required this.name,
    required this.status,
    required this.createdAt,
    this.cooperativeId,
    this.nationalId,
    this.villageId,
    this.villageName,
    this.correctionReason,
    this.charterFileUrl,
    this.licenseFileUrl,
    this.identityFileUrl,
    this.ownershipDocUrl,
    this.insuranceDocUrl,
  });

  final int id;
  final String entityType;
  final String name;
  final String status;
  final String createdAt;
  final int? cooperativeId;
  final String? nationalId;
  final int? villageId;
  final String? villageName;
  final String? correctionReason;
  final String? charterFileUrl;
  final String? licenseFileUrl;
  final String? identityFileUrl;
  final String? ownershipDocUrl;
  final String? insuranceDocUrl;

  /// Legacy alias for household-only screens.
  String get label => name;

  /// Legacy alias.
  String get kind => entityType;

  String get rowKey => '$entityType-$id';

  factory KycInboxItem.fromJson(Map<String, dynamic> json) {
    if (json.containsKey('entity_type')) {
      return KycInboxItem._fromApiRow(json);
    }
    return KycInboxItem._fromLegacyRow(json);
  }

  factory KycInboxItem._fromApiRow(Map<String, dynamic> json) {
    return KycInboxItem(
      id: json['id'] as int,
      entityType: json['entity_type'] as String,
      name: json['name'] as String,
      status: json['status'] as String,
      createdAt: json['created_at'] as String? ?? '',
      cooperativeId: json['cooperative_id'] as int?,
      nationalId: json['national_id'] as String?,
      villageId: json['village_id'] as int?,
      villageName: json['village_name'] as String?,
      correctionReason: json['correction_reason'] as String?,
      charterFileUrl: json['charter_file_url'] as String?,
      licenseFileUrl: json['license_file_url'] as String?,
      identityFileUrl: json['identity_file_url'] as String?,
      ownershipDocUrl: json['ownership_doc_url'] as String?,
      insuranceDocUrl: json['insurance_doc_url'] as String?,
    );
  }

  factory KycInboxItem._fromLegacyRow(Map<String, dynamic> json) {
    return KycInboxItem(
      id: json['id'] as int,
      entityType: json['kind'] as String? ?? 'household',
      name: json['label'] as String,
      status: json['status'] as String,
      createdAt: '',
      cooperativeId: json['cooperative_id'] as int?,
      nationalId: json['national_id'] as String?,
    );
  }
}

class KycInboxPage {
  KycInboxPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
    required this.status,
  });

  final List<KycInboxItem> items;
  final int total;
  final int page;
  final int limit;
  final String status;

  bool get hasMore => items.length < total;

  factory KycInboxPage.fromJson(Map<String, dynamic> json) {
    if (json['items'] is List<dynamic>) {
      final list = json['items'] as List<dynamic>;
      return KycInboxPage(
        items: list
            .map((e) => KycInboxItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: json['total'] as int? ?? list.length,
        page: json['page'] as int? ?? 1,
        limit: json['limit'] as int? ?? list.length,
        status: json['status'] as String? ?? 'PENDING',
      );
    }
    final legacy = KycInbox.fromJson(json);
    return KycInboxPage(
      items: legacy.households,
      total: legacy.households.length,
      page: 1,
      limit: legacy.households.length,
      status: 'PENDING',
    );
  }
}

/// Legacy grouped inbox (nested `inbox.households`).
class KycInbox {
  KycInbox({required this.households});

  final List<KycInboxItem> households;

  factory KycInbox.fromJson(Map<String, dynamic> json) {
    final inbox = json['inbox'] as Map<String, dynamic>? ?? json;
    final list = inbox['households'] as List<dynamic>? ?? [];
    return KycInbox(
      households: list
          .map((e) => KycInboxItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class KycDocLink {
  const KycDocLink({required this.label, required this.url});

  final String label;
  final String url;
}

String kycEntityPathSegment(String entityType) {
  switch (entityType) {
    case 'household':
      return 'households';
    case 'driver':
      return 'drivers';
    case 'fleet_owner':
      return 'fleet_owners';
    case 'vehicle':
      return 'vehicles';
    default:
      return 'households';
  }
}

String kycEntityLabelFa(String entityType) {
  switch (entityType) {
    case 'household':
      return 'خانوار';
    case 'driver':
      return 'راننده';
    case 'fleet_owner':
      return 'مالک ناوگان';
    case 'vehicle':
      return 'خودرو';
    default:
      return entityType;
  }
}

List<KycDocLink> kycDocLinks(KycInboxItem item) {
  final links = <KycDocLink>[];
  if (item.charterFileUrl != null && item.charterFileUrl!.isNotEmpty) {
    links.add(KycDocLink(label: 'سند', url: item.charterFileUrl!));
  }
  if (item.licenseFileUrl != null && item.licenseFileUrl!.isNotEmpty) {
    links.add(KycDocLink(label: 'گواهینامه', url: item.licenseFileUrl!));
  }
  if (item.identityFileUrl != null &&
      item.identityFileUrl!.isNotEmpty &&
      item.identityFileUrl != item.charterFileUrl) {
    links.add(KycDocLink(label: 'هویت', url: item.identityFileUrl!));
  }
  if (item.ownershipDocUrl != null &&
      item.ownershipDocUrl!.isNotEmpty &&
      item.ownershipDocUrl != item.charterFileUrl) {
    links.add(KycDocLink(label: 'مالکیت', url: item.ownershipDocUrl!));
  }
  if (item.insuranceDocUrl != null && item.insuranceDocUrl!.isNotEmpty) {
    links.add(KycDocLink(label: 'بیمه', url: item.insuranceDocUrl!));
  }
  return links;
}

String formatKycDate(String iso) {
  if (iso.isEmpty) return '—';
  try {
    final dt = DateTime.parse(iso);
    return '${dt.year}/${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')}';
  } catch (_) {
    return iso.length >= 10 ? iso.substring(0, 10) : iso;
  }
}

({String bg, String fg, String label}) kycStatusBadge(String status) {
  switch (status) {
    case 'PENDING':
      return (bg: '#FEF3C7', fg: '#92400E', label: 'در انتظار');
    case 'NEEDS_CORRECTION':
      return (bg: '#FFEDD5', fg: '#C2410C', label: 'نیاز به اصلاح');
    case 'APPROVED':
      return (bg: '#DCFCE7', fg: '#166534', label: 'تأیید شده');
    default:
      return (bg: '#F3F4F6', fg: '#374151', label: status);
  }
}

class MembershipObjection {
  MembershipObjection({
    required this.id,
    required this.householdId,
    required this.reporterName,
    required this.reason,
    required this.status,
    this.reporterMobile,
    this.createdAt,
  });

  final int id;
  final int householdId;
  final String reporterName;
  final String? reporterMobile;
  final String reason;
  final String status;
  final DateTime? createdAt;

  factory MembershipObjection.fromJson(Map<String, dynamic> json) {
    DateTime? dt;
    final raw = json['created_at'];
    if (raw is String) dt = DateTime.tryParse(raw);

    return MembershipObjection(
      id: json['id'] as int,
      householdId: json['household_id'] as int,
      reporterName: json['reporter_name'] as String? ?? 'ناشناس',
      reporterMobile: json['reporter_mobile'] as String?,
      reason: json['reason'] as String,
      status: json['status'] as String,
      createdAt: dt,
    );
  }
}

class MonthlyShareEntry {
  MonthlyShareEntry({
    required this.periodKey,
    required this.amount,
    required this.source,
    required this.status,
    this.missionId,
    this.paidAt,
    this.descriptionFa,
    this.transactionId,
    this.createdAt,
  });

  final String periodKey;
  final double amount;
  final String source;
  final String status;
  final int? missionId;
  final DateTime? paidAt;
  final String? descriptionFa;
  final int? transactionId;
  final DateTime? createdAt;

  factory MonthlyShareEntry.fromShareJson(Map<String, dynamic> json, {required String periodKey}) {
    DateTime? paidAt;
    final rawPaid = json['paid_at'];
    if (rawPaid is String) paidAt = DateTime.tryParse(rawPaid);

    return MonthlyShareEntry(
      periodKey: periodKey,
      amount: (json['amount_rial'] as num).toDouble(),
      source: json['source'] as String? ?? 'POOL_DISTRIBUTION',
      status: json['status'] as String? ?? 'CALCULATED',
      missionId: json['mission_id'] as int?,
      paidAt: paidAt,
      descriptionFa: json['description_fa'] as String?,
    );
  }
}

class HouseholdSharesView {
  HouseholdSharesView({
    required this.periodKey,
    required this.communityRialPerTon,
    required this.shares,
    required this.totalRial,
  });

  final String periodKey;
  final double communityRialPerTon;
  final List<MonthlyShareEntry> shares;
  final double totalRial;

  factory HouseholdSharesView.fromJson(Map<String, dynamic> json) {
    final periodKey = json['period_key'] as String;
    final list = json['shares'] as List<dynamic>? ?? [];
    return HouseholdSharesView(
      periodKey: periodKey,
      communityRialPerTon: (json['community_rial_per_ton'] as num).toDouble(),
      shares: list
          .map((e) => MonthlyShareEntry.fromShareJson(e as Map<String, dynamic>, periodKey: periodKey))
          .toList(),
      totalRial: (json['total_rial'] as num).toDouble(),
    );
  }
}

class HouseholdPoolStatusView {
  HouseholdPoolStatusView({
    required this.periodKey,
    required this.poolTotalRial,
    required this.poolStatus,
    required this.householdCount,
    required this.estimatedShareRial,
    required this.distributed,
    this.distributedAt,
  });

  final String periodKey;
  final double poolTotalRial;
  final String poolStatus;
  final int householdCount;
  final double estimatedShareRial;
  final bool distributed;
  final DateTime? distributedAt;

  factory HouseholdPoolStatusView.fromJson(Map<String, dynamic> json) {
    DateTime? distributedAt;
    final raw = json['distributed_at'];
    if (raw is String) distributedAt = DateTime.tryParse(raw);

    return HouseholdPoolStatusView(
      periodKey: json['period_key'] as String,
      poolTotalRial: (json['pool_total_rial'] as num).toDouble(),
      poolStatus: json['pool_status'] as String,
      householdCount: json['household_count'] as int,
      estimatedShareRial: (json['estimated_share_rial'] as num).toDouble(),
      distributed: json['distributed'] as bool? ?? false,
      distributedAt: distributedAt,
    );
  }
}

List<MonthlyShareEntry> monthlySharesFromTransactions(List<WalletTransaction> txs) {
  final pool = txs.where((t) => t.isPoolDistribution).toList()
    ..sort((a, b) {
      final ad = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final bd = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return bd.compareTo(ad);
    });

  return pool.map((t) {
    final dt = t.createdAt ?? DateTime.now();
    final key = '${dt.year}-${dt.month.toString().padLeft(2, '0')}';
    return MonthlyShareEntry(
      periodKey: key,
      amount: t.amount,
      source: 'POOL_DISTRIBUTION',
      status: 'CALCULATED',
      transactionId: t.id,
      createdAt: t.createdAt,
    );
  }).toList();
}
