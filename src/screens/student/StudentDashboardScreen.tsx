import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Switch,
  Linking,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import Badge from '../../components/Badge';
import { DashboardSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import MealChip from '../../components/MealChip';

const MEAL_COLORS: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};
const MEAL_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' };

interface MessCard {
  student_id: string;
  tenant_id: string;
  tenant_name: string;
  plan_name: string;
  days_remaining: number;
  attendance_this_month: number;
  meal_types: string[];
  meal_configs?: Record<string, any>;
  end_date: string;
}

interface TodayMenu {
  meal_type: string;
  items: string[];
}

interface LeaveStatus {
  [meal_type: string]: boolean;
}

export default function StudentDashboardScreen({ navigation }: any) {
  const { user, signOut } = useAuth();
  const [cards, setCards] = useState<MessCard[]>([]);
  const [studentName, setStudentName] = useState('Student');
  const [studentIds, setStudentIds] = useState<Record<string, string>>({}); // tenant_id -> student_id
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayMenus, setTodayMenus] = useState<TodayMenu[]>([]);
  const [leaveStatus, setLeaveStatus] = useState<LeaveStatus>({});
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [primaryTenantId, setPrimaryTenantId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // Single optimized query: students + their active subscriptions + tenant info
      const { data: studentRecords, error } = await supabase
        .from('students')
        .select(`
          id, name, tenant_id, is_active,
          tenants:tenant_id(id, name, meal_configs),
          subscriptions!inner(
            id, status, end_date, start_date,
            plan:subscription_plans(name, meal_types)
          )
        `)
        .eq('auth_user_id', user.id)
        .eq('is_active', true)
        .eq('subscriptions.status', 'active')
        .order('subscriptions.created_at', { ascending: false });

      if (error) throw error;

      if (!studentRecords || studentRecords.length === 0) {
        setCards([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setStudentName(studentRecords[0]?.name ?? 'Student');

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const tenantIdMap: Record<string, string> = {};

      // Fetch attendance counts in parallel
      const attendanceCounts = await Promise.all(
        studentRecords.map((r) =>
          supabase
            .from('attendance_records')
            .select('id', { count: 'exact', head: true })
            .eq('student_id', r.id)
            .eq('status', 'present')
            .gte('scanned_at', startOfMonth)
            .then((res) => ({ student_id: r.id, count: res.count ?? 0 })),
        ),
      );

      const countMap: Record<string, number> = {};
      attendanceCounts.forEach((c) => (countMap[c.student_id] = c.count));

      const cardsList: MessCard[] = [];
      for (const r of studentRecords) {
        const sub = (r.subscriptions as any[])?.[0];
        if (!sub) continue;

        const endDate = new Date(sub.end_date);
        const daysRemaining = Math.max(
          0,
          Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );

        tenantIdMap[r.tenant_id] = r.id;

        cardsList.push({
          student_id: r.id,
          tenant_id: r.tenant_id,
          tenant_name: (r.tenants as any)?.name ?? 'Mess',
          plan_name: sub.plan?.name ?? 'Plan',
          days_remaining: daysRemaining,
          attendance_this_month: countMap[r.id] ?? 0,
          meal_types: sub.plan?.meal_types ?? [],
          meal_configs: (r.tenants as any)?.meal_configs ?? {},
          end_date: sub.end_date,
        });
      }

      setCards(cardsList);
      setStudentIds(tenantIdMap);

      // Fetch menus and leaves for the first (primary) mess
      if (cardsList.length > 0) {
        const primaryTenant = cardsList[0].tenant_id;
        const primaryStudent = cardsList[0].student_id;
        setPrimaryTenantId(primaryTenant);

        const [menusRes, leavesRes] = await Promise.all([
          supabase
            .from('daily_menus')
            .select('meal_type, items')
            .eq('tenant_id', primaryTenant)
            .eq('menu_date', today),
          supabase
            .from('meal_leaves')
            .select('meal_type')
            .eq('student_id', primaryStudent)
            .eq('leave_date', today),
        ]);

        setTodayMenus(menusRes.data ?? []);
        const leaveMap: LeaveStatus = {};
        (leavesRes.data ?? []).forEach((l) => {
          leaveMap[l.meal_type] = true;
        });
        setLeaveStatus(leaveMap);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleLeave = async (mealType: string, enabled: boolean) => {
    if (!primaryTenantId) return;
    const studentId = studentIds[primaryTenantId];
    if (!studentId) return;

    setLeaveLoading(true);
    try {
      if (enabled) {
        await supabase.from('meal_leaves').upsert(
          { student_id: studentId, tenant_id: primaryTenantId, leave_date: today, meal_type: mealType },
          { onConflict: 'student_id,leave_date,meal_type' },
        );
      } else {
        await supabase
          .from('meal_leaves')
          .delete()
          .eq('student_id', studentId)
          .eq('leave_date', today)
          .eq('meal_type', mealType);
      }
      setLeaveStatus((prev) => ({ ...prev, [mealType]: enabled }));
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLeaveLoading(false);
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <DashboardSkeleton />
      </View>
    );
  }

  const primaryCard = cards[0];
  const isExpiringSoon = primaryCard && primaryCard.days_remaining <= 5;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()} 👋</Text>
          <Text style={styles.studentName}>{studentName.split(' ')[0]}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutIcon}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Expiry Warning Banner */}
      {isExpiringSoon && (
        <View style={styles.expiryBanner}>
          <Text style={styles.expiryBannerText}>
            ⚠️ Your subscription expires in {primaryCard.days_remaining} day
            {primaryCard.days_remaining !== 1 ? 's' : ''}! Contact your mess admin to renew.
          </Text>
        </View>
      )}

      {/* No Subscription Empty State */}
      {cards.length === 0 ? (
        <EmptyState
          icon="🍽️"
          title="No Active Plans"
          subtitle="You don't have any active mess subscriptions. Ask your Mess Admin to add you to a plan."
        />
      ) : (
        <>
          {/* Subscription Cards */}
          {cards.map((card) => (
            <LinearGradient
              key={card.student_id}
              colors={[Colors.primary, Colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.subCard}
            >
              <View style={styles.subCardHeader}>
                <Badge label="ACTIVE" variant="success" dot />
                <Text style={styles.subMessName}>{card.tenant_name}</Text>
              </View>
              <Text style={styles.subPlanName}>{card.plan_name}</Text>

              <View style={styles.subStatsRow}>
                <View style={styles.subStatBox}>
                  <Text style={styles.subStatValue}>{card.days_remaining}</Text>
                  <Text style={styles.subStatLabel}>Days Left</Text>
                </View>
                <View style={styles.subStatDivider} />
                <View style={styles.subStatBox}>
                  <Text style={styles.subStatValue}>{card.attendance_this_month}</Text>
                  <Text style={styles.subStatLabel}>Meals This Month</Text>
                </View>
              </View>

              <View style={styles.mealChipsRow}>
                {(card.meal_types ?? []).map((m) => {
                  const config = card.meal_configs?.[m] ?? { label: m.toUpperCase(), color: '#ffffff' };
                  return (
                    <View key={m} style={styles.mealChipWhite}>
                      <Text style={styles.mealChipWhiteText}>{MEAL_EMOJI[m] ?? '🍴'} {config.label ?? m}</Text>
                    </View>
                  );
                })}
              </View>
            </LinearGradient>
          ))}

          {/* Skip Meal Today — Quick Toggle */}
          {primaryCard && primaryCard.meal_types.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Skip Meal Today?</Text>
              <View style={styles.leaveCard}>
                <Text style={styles.leaveCardSubtitle}>
                  Let your mess know you're skipping. Helps them reduce food waste. ♻️
                </Text>
                {primaryCard.meal_types.map((mealType) => (
                  <View key={mealType} style={styles.leaveRow}>
                    <View style={styles.leaveRowLeft}>
                      <Text style={styles.leaveEmoji}>{MEAL_EMOJI[mealType] ?? '🍴'}</Text>
                      <Text style={styles.leaveMealName}>
                        {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                      </Text>
                    </View>
                    <Switch
                      value={!!leaveStatus[mealType]}
                      onValueChange={(val) => toggleLeave(mealType, val)}
                      disabled={leaveLoading}
                      trackColor={{ false: Colors.border, true: Colors.error + '99' }}
                      thumbColor={leaveStatus[mealType] ? Colors.error : Colors.textMuted}
                    />
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Today's Menu */}
          {todayMenus.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Today's Menu 🍛</Text>
              {todayMenus.map((menu) => (
                <View key={menu.meal_type} style={styles.menuCard}>
                  <Text style={[styles.menuMealType, { color: MEAL_COLORS[menu.meal_type] ?? Colors.text }]}>
                    {MEAL_EMOJI[menu.meal_type]} {menu.meal_type.charAt(0).toUpperCase() + menu.meal_type.slice(1)}
                  </Text>
                  <Text style={styles.menuItems}>{menu.items.join(' · ')}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      {/* Quick Actions — 3-column fixed grid */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {[
          { icon: '📷', title: 'Scan QR', desc: 'Mark attendance', route: 'ScanTab', color: Colors.primary },
          { icon: '📅', title: 'History', desc: 'Past meals', route: 'HistoryTab', color: Colors.success },
          { icon: '🧾', title: 'My Bills', desc: 'Invoices', route: 'BillsTab', color: Colors.warning },
        ].map((a) => (
          <TouchableOpacity
            key={a.route}
            style={styles.actionCard}
            onPress={() => navigation.navigate(a.route)}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconBg, { backgroundColor: a.color + '22' }]}>
              <Text style={styles.actionIcon}>{a.icon}</Text>
            </View>
            <Text style={styles.actionTitle}>{a.title}</Text>
            <Text style={styles.actionDesc}>{a.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: 100 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.sm,
  },
  greeting: { fontSize: FontSize.md, color: Colors.textMuted, fontWeight: FontWeight.medium },
  studentName: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.text, marginTop: 2 },
  signOutBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderRadius: 20, ...Shadows.soft,
  },
  signOutIcon: { fontSize: 20 },

  expiryBanner: {
    backgroundColor: Colors.warning + '22',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  expiryBannerText: { color: '#92400e', fontSize: FontSize.sm, fontWeight: FontWeight.semibold, lineHeight: 20 },

  // Subscription Card
  subCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.medium,
  },
  subCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  subMessName: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  subPlanName: { color: '#ffffff', fontSize: 26, fontWeight: FontWeight.heavy, marginBottom: Spacing.md },
  subStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  subStatBox: { flex: 1, alignItems: 'center' },
  subStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  subStatValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: '#ffffff' },
  subStatLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 3, textAlign: 'center' },
  mealChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mealChipWhite: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  mealChipWhiteText: { color: '#ffffff', fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },

  // Leave Toggle
  leaveCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  leaveCardSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 20 },
  leaveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  leaveRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leaveEmoji: { fontSize: 22 },
  leaveMealName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },

  // Today's Menu
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  menuMealType: { fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: 4 },
  menuItems: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 20 },

  // Quick Actions — 3-column
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  actionIconBg: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  actionIcon: { fontSize: 22 },
  actionTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginBottom: 2, textAlign: 'center' },
  actionDesc: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },
});
