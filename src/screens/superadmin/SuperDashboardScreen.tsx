import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Tenant, Profile } from '../../types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../theme/tokens';

interface TenantWithAdmin extends Tenant {
  admin_name?: string;
  admin_email?: string;
  student_count?: number;
}

export default function SuperDashboardScreen({ navigation }: any) {
  const { signOut, profile } = useAuth();
  const [tenants, setTenants] = useState<TenantWithAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTenants = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with admin info and student count
      const enriched: TenantWithAdmin[] = await Promise.all(
        (data || []).map(async (t: Tenant) => {
          const [profileRes, studentCountRes] = await Promise.all([
            supabase.from('profiles').select('name, email').eq('id', t.owner_id).single(),
            supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
          ]);

          return {
            ...t,
            admin_name: profileRes.data?.name,
            admin_email: profileRes.data?.email,
            student_count: studentCountRes.count ?? 0,
          };
        }),
      );

      setTenants(enriched);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTenants();
  };

  const toggleActive = async (tenant: TenantWithAdmin) => {
    const { error } = await supabase
      .from('tenants')
      .update({ is_active: !tenant.is_active })
      .eq('id', tenant.id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, is_active: !t.is_active } : t)),
      );
    }
  };

  const renderTenant = ({ item }: { item: TenantWithAdmin }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.messIcon}>🍱</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.messName}>{item.name}</Text>
            <Text style={styles.messAddress} numberOfLines={1}>
              {item.address || 'No address'}
            </Text>
          </View>
          <View style={[styles.badge, item.is_active ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={styles.badgeText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardMeta}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Admin</Text>
          <Text style={styles.metaValue}>{item.admin_name || '—'}</Text>
          <Text style={styles.metaSubValue} numberOfLines={1}>{item.admin_email || ''}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Students</Text>
          <Text style={[styles.metaValue, { color: Colors.primary }]}>{item.student_count}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Meals</Text>
          <Text style={styles.metaValue}>{(item.meal_types as string[]).length}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.toggleBtn, item.is_active ? styles.toggleBtnDeactivate : styles.toggleBtnActivate]}
        onPress={() =>
          Alert.alert(
            item.is_active ? 'Deactivate Mess' : 'Activate Mess',
            `Are you sure you want to ${item.is_active ? 'deactivate' : 'activate'} "${item.name}"?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Confirm', onPress: () => toggleActive(item) },
            ],
          )
        }
      >
        <Text style={styles.toggleBtnText}>
          {item.is_active ? '🔴 Deactivate' : '🟢 Activate'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>MessTrack</Text>
          <Text style={styles.headerSub}>Super Admin • {profile?.name}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{tenants.length}</Text>
          <Text style={styles.statLabel}>Total Messes</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {tenants.filter((t) => t.is_active).length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.textMuted }]}>
            {tenants.filter((t) => !t.is_active).length}
          </Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading messes...</Text>
        </View>
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(item) => item.id}
          renderItem={renderTenant}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={styles.emptyText}>No messes yet</Text>
              <Text style={styles.emptySubText}>Tap + to create the first mess</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateMess')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 54,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    marginTop: 2,
  },
  signOutBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signOutText: {
    color: Colors.error,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: Spacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  messIcon: {
    fontSize: 28,
    marginRight: Spacing.sm,
  },
  messName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  messAddress: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeActive: {
    backgroundColor: 'rgba(76,175,125,0.15)',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  badgeInactive: {
    backgroundColor: 'rgba(255,82,82,0.15)',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  cardMeta: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  metaSubValue: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  toggleBtn: {
    padding: Spacing.sm,
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: Radius.sm,
  },
  toggleBtnDeactivate: {
    backgroundColor: 'rgba(255,82,82,0.1)',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  toggleBtnActivate: {
    backgroundColor: 'rgba(76,175,125,0.1)',
    borderWidth: 1,
    borderColor: Colors.success,
  },
  toggleBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  emptySubText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  fabIcon: {
    fontSize: 32,
    color: Colors.text,
    lineHeight: 36,
  },
});
