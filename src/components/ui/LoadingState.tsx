import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, FontSize } from '../../theme/tokens';

interface LoadingStateProps {
  message?: string;
  style?: ViewStyle;
  fullScreen?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = 'Loading...', 
  style,
  fullScreen = true 
}) => {
  return (
    <View style={[
      styles.container, 
      fullScreen && styles.fullScreen,
      style
    ]}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  message: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
});
