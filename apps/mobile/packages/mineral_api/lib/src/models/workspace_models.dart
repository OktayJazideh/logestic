class Workspace {
  Workspace({
    required this.mineId,
    required this.mineName,
    required this.roles,
    required this.membershipKind,
    this.cooperativeId,
    this.cooperativeName,
    this.subtitle = '',
  });

  final int mineId;
  final String mineName;
  final List<String> roles;
  final String membershipKind;
  final int? cooperativeId;
  final String? cooperativeName;
  final String subtitle;

  bool get isCommunity => membershipKind == 'COMMUNITY';
  bool get isOperational => membershipKind == 'OPERATIONAL';

  String get displayTitle {
    if (subtitle.isNotEmpty) return subtitle;
    if (isCommunity && cooperativeName != null && cooperativeName!.isNotEmpty) {
      return cooperativeName!;
    }
    return mineName;
  }

  factory Workspace.fromJson(Map<String, dynamic> json) {
    final rolesRaw = json['roles'] as List<dynamic>? ?? [];
    final kind = json['membership_kind'] as String? ?? 'OPERATIONAL';
    final subtitle = json['subtitle'] as String? ?? '';
    final coopName = json['cooperative_name'] as String?;
    final mineName = json['mine_name'] as String? ?? '';
    return Workspace(
      mineId: (json['mine_id'] as num).toInt(),
      mineName: mineName,
      roles: rolesRaw.map((e) => e.toString()).toList(),
      membershipKind: kind,
      cooperativeId: json['cooperative_id'] != null ? (json['cooperative_id'] as num).toInt() : null,
      cooperativeName: coopName,
      subtitle: subtitle.isNotEmpty
          ? subtitle
          : (kind == 'COMMUNITY' && coopName != null ? coopName : mineName),
    );
  }
}
