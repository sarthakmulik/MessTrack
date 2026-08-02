import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacityProps, 
  StyleProp, 
  ViewStyle, 
  TextStyle 
} from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  fullWidth = true,
  disabled,
  ...props
}) => {
  const getBackgroundColor = () => {
    if (disabled) return Colors.border;
    switch (variant) {
      case 'primary': return Colors.primary;
      case 'secondary': return Colors.surfaceElevated;
      case 'danger': return Colors.error;
      case 'outline': return 'transparent';
      case 'ghost': return 'transparent';
      default: return Colors.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return Colors.textMuted;
    switch (variant) {
      case 'primary': return Colors.surface;
      case 'danger': return Colors.surface;
      case 'secondary': return Colors.text;
      case 'outline': return Colors.primary;
      case 'ghost': return Colors.primary;
      default: return Colors.surface;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'small': return { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md };
      case 'large': return { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.xl };
      case 'medium':
      default: return { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'small': return FontSize.sm;
      case 'large': return FontSize.lg;
      case 'medium':
      default: return FontSize.md;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || isLoading}
      style={[
        styles.base,
        {
          backgroundColor: getBackgroundColor(),
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: disabled ? Colors.border : Colors.primary,
          alignSelf: fullWidth ? 'stretch' : 'center',
          ...getPadding(),
        },
        variant === 'primary' && !disabled ? Shadows.soft : {},
        style,
      ]}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {leftIcon && leftIcon}
          <Text
            style={[
              styles.text,
              {
                color: getTextColor(),
                fontSize: getFontSize(),
                marginLeft: leftIcon ? Spacing.sm : 0,
                marginRight: rightIcon ? Spacing.sm : 0,
              },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon && rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
});
