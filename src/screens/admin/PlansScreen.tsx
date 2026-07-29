import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  Switch,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '../../theme/tokens';
import { SubscriptionPlan } from '../../types';

// dynamic from tenant

export default function PlansScreen({ navigation }: { navigation: any }) {
  const { tenantId, tenant } = useAuth();
  const mealConfigs = tenant?.meal_configs || {};
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('price');
      if (error) throw error;
      setPlans(data ?? []);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load plans');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPlans();
  };

  const toggleActive = async (plan: SubscriptionPlan) => {
    setTogglingId(plan.id);
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);
      if (error) throw error;
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, is_active: !p.is_active } : p)),
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update plan');
    } finally {
      setTogglingId(null);
    }
  };

  const renderPlan = ({ item }: { item: SubscriptionPlan }) => (
    <View style={[styles.card, !item.is_active && styles.cardInactive]}>
      {/* Header Row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.planName}>{item.name}</Text>
          <View style={[styles.badge, { backgroundColor: item.is_active ? Colors.success + '22' : Colors.textMuted + '22' }]}>
            <Text style={[styles.badgeText, { color: item.is_active ? Colors.success : Colors.textMuted }]}>
              {item.is_active ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
        </View>
        {togglingId === item.id ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Switch
            value={item.is_active}
            onValueChange={() => toggleActive(item)}
            trackColor={{ false: Colors.border, true: Colors.primary + '66' }}
            thumbColor={item.is_active ? Colors.primary : Colors.textMuted}
          />
        )}
      </View>

      {/* Price + Duration */}
      <View style={styles.priceRow}>
        <Text style={styles.price}>₹{item.price}</Text>
        <Text style={styles.duration}> / {item.duration_days} days</Text>
      </View>

      {/* Meals Included */}
      <View style={styles.mealsList}>
        {item.meal_types.map((mt) => {
          const config = mealConfigs[mt] || { icon: '🍽️', label: mt, color: Colors.textSecondary };
          return (
            <View key={mt} style={styles.mealBadge}>
              <Text style={styles.mealBadgeIcon}>{config.icon}</Text>
              <Text style={[styles.mealBadgeText, { color: config.color }]}>
                {config.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Days info */}
      <Text style={styles.daysText}>{item.days_included} days included in cycle</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={renderPlan}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No plans yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first plan</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddPlan', { onRefresh: fetchPlans })}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardInactive: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  planName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  badgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.sm },
  price: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.primary },
  duration: { fontSize: FontSize.md, color: Colors.textSecondary },
  mealsList: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  mealBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, backgroundColor: Colors.surface, borderColor: Colors.border,
  },
  mealBadgeIcon: { fontSize: 14 },
  mealBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  daysText: { fontSize: FontSize.sm, color: Colors.textMuted },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.text, fontWeight: FontWeight.semibold },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.xs },
  fab: {
    position: 'absolute', bottom: 28, right: 24,
    width: 56, height: 56, borderRadius: Radius.full,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: { fontSize: 28, color: Colors.text, fontWeight: FontWeight.bold, lineHeight: 32 },
});
