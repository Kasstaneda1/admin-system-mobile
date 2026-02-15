import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

const VARIANT_COLORS = {
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,
  primary: colors.primary,
};

export default function StatusBadge({ label, variant = 'primary', count }) {
  const bgColor = VARIANT_COLORS[variant] || colors.primary;

  if (count !== undefined) {
    return (
      <View style={[styles.countBadge, { backgroundColor: bgColor }]}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  label: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },
});
