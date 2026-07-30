import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '../theme/tokens';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonItem({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: borderRadius ?? Radius.sm,
          backgroundColor: Colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Skeleton for a dashboard stats card
export function DashboardSkeleton() {
  return (
    <View style={styles.dashboardSkel}>
      <SkeletonItem height={24} width="60%" style={{ marginBottom: 8 }} />
      <SkeletonItem height={120} style={{ marginBottom: 16, borderRadius: Radius.xl }} />
      <SkeletonItem height={18} width="40%" style={{ marginBottom: 12 }} />
      <View style={styles.gridRow}>
        <SkeletonItem height={100} width="48%" borderRadius={Radius.lg} />
        <SkeletonItem height={100} width="48%" borderRadius={Radius.lg} />
      </View>
      <View style={styles.gridRow}>
        <SkeletonItem height={100} width="48%" borderRadius={Radius.lg} />
        <SkeletonItem height={100} width="48%" borderRadius={Radius.lg} />
      </View>
    </View>
  );
}

// Skeleton for a list row (students, attendance, etc.)
export function ListRowSkeleton() {
  return (
    <View style={styles.listRow}>
      <SkeletonItem width={48} height={48} borderRadius={24} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <SkeletonItem height={14} width="60%" style={{ marginBottom: 6 }} />
        <SkeletonItem height={12} width="40%" />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardSkel: {
    padding: 20,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
});

export default SkeletonItem;
