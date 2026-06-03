import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../mineral_theme.dart';

/// Six single-digit OTP boxes (wireframe step 2).
class OtpPinInput extends StatefulWidget {
  const OtpPinInput({
    super.key,
    required this.onChanged,
    this.enabled = true,
  });

  final ValueChanged<String> onChanged;
  final bool enabled;

  @override
  State<OtpPinInput> createState() => OtpPinInputState();
}

class OtpPinInputState extends State<OtpPinInput> {
  static const _length = 6;
  final _controllers = List.generate(_length, (_) => TextEditingController());
  final _focusNodes = List.generate(_length, (_) => FocusNode());

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get value => _controllers.map((c) => c.text).join();

  void clear() {
    for (final c in _controllers) {
      c.clear();
    }
    widget.onChanged('');
    _focusNodes.first.requestFocus();
  }

  void _notify() => widget.onChanged(value);

  void _onChanged(int index, String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length > 1) {
      _pasteDigits(digits, startIndex: index);
      return;
    }
    _controllers[index].text = digits;
    _controllers[index].selection = TextSelection.collapsed(offset: digits.length);
    _notify();
    if (digits.isNotEmpty && index < _length - 1) {
      _focusNodes[index + 1].requestFocus();
    }
  }

  void _pasteDigits(String digits, {required int startIndex}) {
    var i = startIndex;
    for (var j = 0; j < digits.length && i < _length; j++, i++) {
      _controllers[i].text = digits[j];
    }
    _notify();
    if (i < _length) {
      _focusNodes[i].requestFocus();
    } else {
      _focusNodes.last.unfocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: List.generate(_length, (i) {
        return SizedBox(
          width: 46,
          height: 52,
          child: TextField(
            controller: _controllers[i],
            focusNode: _focusNodes[i],
            enabled: widget.enabled,
            textAlign: TextAlign.center,
            keyboardType: TextInputType.number,
            maxLength: 6,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: MineralTheme.primaryDark,
                ),
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              counterText: '',
              contentPadding: EdgeInsets.zero,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: MineralTheme.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: MineralTheme.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: MineralTheme.primary, width: 1.5),
              ),
            ),
            onChanged: (v) => _onChanged(i, v),
            onTap: () {
              _controllers[i].selection = TextSelection(
                baseOffset: 0,
                extentOffset: _controllers[i].text.length,
              );
            },
          ),
        );
      }),
    );
  }
}
