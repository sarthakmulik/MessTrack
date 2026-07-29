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
  StatusBar,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Tenant } from '../../types';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

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
        <Text style={[styles.toggleBtnText, item.is_active ? { color: Colors.error } : { color: Colors.success }]}>
          {item.is_active ? 'Deactivate Mess' : 'Activate Mess'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>MessTrack Central</Text>
          <Text style={styles.headerSub}>Super Admin • {profile?.name}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutIcon}>🚪</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={styles.emptyText}>No messes created yet.</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fabContainer}
        onPress={() => navigation.navigate('CreateMess')}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[Colors.primary, Colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Text style={styles.fabIcon}>+</Text>
        </LinearGradient>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  signOutBtn: {
    padding: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.full,
    ...Shadows.soft,
  },
  signOutIcon: {
    fontSize: 20,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  list: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.soft,
  },
  cardHeader: {
    marginBottom: Spacing.sm,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  messName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  messAddress: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  badgeActive: {
    backgroundColor: Colors.success + '22',
  },
  badgeInactive: {
    backgroundColor: Colors.error + '22',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  metaSubValue: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  toggleBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  toggleBtnActivate: {
    borderColor: Colors.success + '66',
    backgroundColor: Colors.success + '11',
  },
  toggleBtnDeactivate: {
    borderColor: Colors.error + '66',
    backgroundColor: Colors.error + '11',
  },
  toggleBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  empty: {
    alignItems: 'center',
    marginTop: Spacing.xxl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  fabContainer: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    borderRadius: 32,
    ...Shadows.large,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
});
