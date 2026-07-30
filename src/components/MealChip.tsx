import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Radius } from '../theme/tokens';

interface MealChipProps {
  label: string;
  color: string;
  size?: 'sm' | 'md';
}

export default function MealChip({ label, color, size = 'md' }: MealChipProps) {
  return (
    <View
      style={[
        styles.chip,
        size === 'sm' && styles.chipSm,
        { backgroundColor: color + '22', borderColor: color + '55' },
      ]}
    >
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 4,
  },
  chipSm: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  labelSm: {
    fontSize: FontSize.xs,
  },
});
