import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';

interface MessSubscription {
  student_id: string;
  tenant_id: string;
  tenant_name: string;
  status: string;
  plan_name: string;
  days_remaining: number;
  attendance_this_month: number;
  meal_types: string[];
  meal_configs?: Record<string, any>;
}

export default function StudentDashboardScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [subscriptions, setSubscriptions] = useState<MessSubscription[]>([]);
  const [studentName, setStudentName] = useState<string>('Student');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // 1. Fetch all student records for this auth user across all messes
      const { data: studentRecords, error: studentError } = await supabase
        .from('students')
        .select('*, tenants(id, name, meal_configs)')
        .eq('auth_user_id', user.id)
        .eq('is_active', true);

      if (studentError) throw studentError;
      if (!studentRecords || studentRecords.length === 0) {
        setSubscriptions([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setStudentName(studentRecords[0]?.name || 'Student');

      const subsList: MessSubscription[] = [];
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      // 2. For each mess, fetch their active subscription and attendance
      for (const record of studentRecords) {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*, plan:subscription_plans(*)')
          .eq('student_id', record.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count: attendanceCount } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', record.id)
          .eq('status', 'present')
          .gte('scanned_at', startOfMonth);

        if (subData) {
          const endDate = new Date(subData.end_date);
          const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

          subsList.push({
            student_id: record.id,
            tenant_id: record.tenant_id,
            tenant_name: record.tenants?.name || 'Mess',
            meal_configs: record.tenants?.meal_configs || {},
            status: subData.status,
            plan_name: subData.plan?.name || 'Unknown Plan',
            days_remaining: daysRemaining,
            attendance_this_month: attendanceCount || 0,
            meal_types: subData.plan?.meal_types || [],
          });
        }
      }

      setSubscriptions(subsList);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {studentName.split(' ')[0]} 👋</Text>
          <Text style={styles.subtitle}>Your Active Mess Subscriptions</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Subscription Cards */}
      {subscriptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🍽️</Text>
          <Text style={styles.emptyTitle}>No Active Plans</Text>
          <Text style={styles.emptySubtitle}>You don't have any active subscriptions right now. Ask your Mess Admin to add you to a plan.</Text>
        </View>
      ) : (
        subscriptions.map((sub, index) => (
          <View key={index} style={styles.subCard}>
            <View style={styles.cardHeader}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>ACTIVE</Text>
              </View>
              <Text style={styles.messName}>{sub.tenant_name}</Text>
            </View>

            <Text style={styles.planName}>{sub.plan_name}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{sub.days_remaining}</Text>
                <Text style={styles.statLabel}>Days Left</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{sub.attendance_this_month}</Text>
                <Text style={styles.statLabel}>Meals This Month</Text>
              </View>
            </View>

            <View style={styles.mealsIncluded}>
              <Text style={styles.mealsLabel}>Includes: </Text>
              {sub.meal_types.map(m => {
                const config = sub.meal_configs?.[m] || { label: m.toUpperCase(), color: Colors.primary };
                return (
                  <View key={m} style={[styles.mealChip, { backgroundColor: config.color + '22', borderColor: config.color + '55' }]}>
                    <Text style={[styles.mealChipText, { color: config.color }]}>{config.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Scan')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBg, { backgroundColor: Colors.primary + '22' }]}>
            <Text style={styles.actionIcon}>📷</Text>
          </View>
          <Text style={styles.actionTitle}>Scan QR</Text>
          <Text style={styles.actionDesc}>Mark attendance</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('AttendanceHistory')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBg, { backgroundColor: Colors.success + '22' }]}>
            <Text style={styles.actionIcon}>📅</Text>
          </View>
          <Text style={styles.actionTitle}>History</Text>
          <Text style={styles.actionDesc}>View past meals</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('StudentInvoices')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconBg, { backgroundColor: Colors.warning + '22' }]}>
            <Text style={styles.actionIcon}>🧾</Text>
          </View>
          <Text style={styles.actionTitle}>My Bills</Text>
          <Text style={styles.actionDesc}>View invoices</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: Spacing.md,
    fontSize: FontSize.md,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    marginTop: 4,
  },
  signOutBtn: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  signOutText: {
    color: Colors.error,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  subCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    backgroundColor: Colors.success + '33',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.success + '55',
  },
  statusText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  messName: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  planName: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  mealsIncluded: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  mealsLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginRight: Spacing.xs,
  },
  mealChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mealChipText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  emptyContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIconBg: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginBottom: 4,
  },
  actionDesc: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
});
