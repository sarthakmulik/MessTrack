import React from 'react';
import { View, StyleSheet, TouchableOpacityProps, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Radius, Shadows } from '../../theme/tokens';

interface CardProps extends TouchableOpacityProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  onPress?: () => void;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  style, 
  elevated = true, 
  onPress,
  padded = true,
  ...props 
}) => {
  const containerStyle = [
    styles.card,
    elevated && Shadows.soft,
    padded && { padding: Spacing.lg },
    style
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={containerStyle} {...props}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={containerStyle} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.md,
  },
});
