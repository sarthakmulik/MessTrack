import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/tokens';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'default' | 'breakfast' | 'lunch' | 'dinner';
  size?: 'small' | 'medium';
  style?: ViewStyle;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ 
  label, 
  variant = 'default', 
  size = 'small',
  style,
  dot = false
}) => {
  const getColors = () => {
    switch (variant) {
      case 'success': return { bg: Colors.success + '20', text: Colors.success };
      case 'error': return { bg: Colors.error + '20', text: Colors.error };
      case 'warning': return { bg: Colors.warning + '20', text: Colors.warning };
      case 'info': return { bg: Colors.info + '20', text: Colors.info };
      case 'breakfast': return { bg: Colors.breakfast + '20', text: Colors.breakfast };
      case 'lunch': return { bg: Colors.lunch + '20', text: Colors.lunch };
      case 'dinner': return { bg: Colors.dinner + '20', text: Colors.dinner };
      case 'default':
      default: return { bg: Colors.border, text: Colors.textSecondary };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[
      styles.badge, 
      { backgroundColor: bg },
      size === 'medium' && { paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
      style
    ]}>
      {dot && <View style={[styles.dot, { backgroundColor: text }]} />}
      <Text style={[
        styles.text, 
        { color: text },
        size === 'medium' && { fontSize: FontSize.sm }
      ]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
  },
});
