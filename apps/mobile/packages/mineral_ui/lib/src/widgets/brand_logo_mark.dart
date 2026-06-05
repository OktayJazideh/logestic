import 'package:flutter/material.dart';

/// Brand mark — aligned with brand/logo-mark.png and apps/web/public/logo-mark.png
class BrandLogoMark extends StatelessWidget {
  const BrandLogoMark({super.key, this.size = 72, this.borderRadius = 12});

  final double size;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: Image.asset(
        'assets/brand/logo-mark.png',
        package: 'mineral_ui',
        width: size,
        height: size,
        fit: BoxFit.cover,
      ),
    );
  }
}
