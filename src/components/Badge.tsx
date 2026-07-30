import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Radius } from '../theme/tokens';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantConfig: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: { bg: Colors.success + '20', text: Colors.success, dot: Colors.success },
  warning: { bg: Colors.warning + '25', text: '#b45309', dot: Colors.warning },
  error:   { bg: Colors.error + '20',   text: Colors.error,   dot: Colors.error },
  info:    { bg: Colors.info + '20',    text: Colors.info,    dot: Colors.info },
  neutral: { bg: Colors.border,         text: Colors.textMuted, dot: Colors.textMuted },
};

export default function Badge({ label, variant = 'neutral', dot = false }: BadgeProps) {
  const config = variantConfig[variant];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      {dot && <View style={[styles.dot, { backgroundColor: config.dot }]} />}
      <Text style={[styles.label, { color: config.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});
