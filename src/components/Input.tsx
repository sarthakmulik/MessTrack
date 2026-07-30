import React, { forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../theme/tokens';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  required?: boolean;
}

const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      hint,
      icon,
      rightIcon,
      onRightIconPress,
      containerStyle,
      required,
      ...props
    },
    ref,
  ) => {
    const hasError = !!error;

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <Text style={styles.label}>
            {label}
            {required && <Text style={styles.required}> *</Text>}
          </Text>
        ) : null}

        <View style={[styles.inputRow, hasError && styles.inputError, props.editable === false && styles.inputDisabled]}>
          {icon ? <Text style={styles.leftIcon}>{icon}</Text> : null}
          <TextInput
            ref={ref}
            style={[styles.input, icon && styles.inputWithIcon]}
            placeholderTextColor={Colors.textMuted}
            {...props}
          />
          {rightIcon ? (
            <TouchableOpacity onPress={onRightIconPress} style={styles.rightIconBtn}>
              <Text style={styles.rightIcon}>{rightIcon}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? (
          <Text style={styles.errorText}>⚠ {error}</Text>
        ) : hint ? (
          <Text style={styles.hintText}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

Input.displayName = 'Input';
export default Input;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    marginBottom: 6,
  },
  required: {
    color: Colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#fff5f5',
  },
  inputDisabled: {
    backgroundColor: Colors.surfaceElevated,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 13,
  },
  inputWithIcon: {
    marginLeft: Spacing.sm,
  },
  leftIcon: {
    fontSize: 18,
  },
  rightIconBtn: {
    padding: 4,
  },
  rightIcon: {
    fontSize: 18,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  hintText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
});
