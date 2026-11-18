// A QR code drawn with plain views (ONL-APP1): no native module, so no new build. The matrix is
// the site's own generator (pay/qr/qrMatrix.js, a copy of the frontend's); here each run of dark
// modules of a row is one view. Dark on light, a quiet zone of 4 modules, whole points per module.
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { colors } from '../constants/colors';
import { QUIET, moduleSide, qrRuns } from './online';

export default function QrCode({ text, side, label = 'QR code of the payment link' }) {
  const code = useMemo(() => {
    try { return qrRuns(text); } catch (e) { return null; }
  }, [text]);
  if (!code) return null;
  const cell = moduleSide(code.size, side);
  const full = cell * (code.size + QUIET * 2);
  return (
    <View style={{ width: full, height: full, backgroundColor: colors.bgCard }} accessible accessibilityRole="image" accessibilityLabel={label}>
      {code.runs.map((r) => (
        <View key={`${r.row}-${r.col}`} style={{
          position: 'absolute', top: (QUIET + r.row) * cell, left: (QUIET + r.col) * cell, width: r.len * cell, height: cell, backgroundColor: colors.fgDefault,
        }} />
      ))}
    </View>
  );
}
