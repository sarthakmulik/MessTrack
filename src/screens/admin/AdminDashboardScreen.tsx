import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';
import Badge from '../../components/Badge';
import { DashboardSkeleton } from '../../components/SkeletonLoader';

interface DashboardStats {
  totalStudents: number;
  todayAttendance: number;
  activeSessions: number;
  messName: string;
  // New
  totalOnLeaveToday: number;
  cookFor: number;
  unpaidInvoicesCount: number;
  unpaidInvoicesAmount: number;
  expiringThisWeek: number;
  todayMenus: Array<{ meal_type: string; items: string[] }>;
}

const QUICK_ACTIONS = [
  { label: 'Students', icon: '👨‍🎓', route: 'Students', color: Colors.primary },
  { label: 'Plans', icon: '📋', route: 'Plans', color: Colors.accent },
  { label: 'Sessions', icon: '🍽️', route: 'Sessions', color: Colors.lunch },
  { label: 'QR Display', icon: '🔲', route: 'QRDisplay', color: Colors.dinner },
  { label: 'Attendance', icon: '✅', route: 'AdminAttendance', color: Colors.warning },
  { label: 'Billing', icon: '💰', route: 'Billing', color: Colors.breakfast },
  { label: 'Menu', icon: '🍛', route: 'Menu', color: '#8B5CF6' },
  { label: 'Payment', icon: '💳', route: 'PaymentSettings', color: Colors.primary },
];

const MEAL_COLORS: Record<string, string> = {
  breakfast: Colors.breakfast,
  lunch: Colors.lunch,
  dinner: Colors.dinner,
};

const MEAL_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
};

export default function AdminDashboardScreen({ navigation }: { navigation: any }) {
  const { profile, tenantId, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    todayAttendance: 0,
    activeSessions: 0,
    messName: '',
    totalOnLeaveToday: 0,
    cookFor: 0,
    unpaidInvoicesCount: 0,
    unpaidInvoicesAmount: 0,
    expiringThisWeek: 0,
    todayMenus: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!tenantId) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [
        tenantRes,
        studentsRes,
        attendanceRes,
        sessionsRes,
        leavesRes,
        unpaidInvoicesRes,
        expiringSubsRes,
        menusRes,
      ] = await Promise.all([
        supabase.from('tenants').select('name').eq('id', tenantId).single(),
        supabase
          .from('students')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'present')
          .gte('scanned_at', `${today}T00:00:00`)
          .lte('scanned_at', `${today}T23:59:59`),
        supabase
          .from('meal_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('session_date', today)
          .eq('status', 'active'),
        supabase
          .from('meal_leaves')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('leave_date', today),
        supabase
          .from('invoices')
          .select('id, total_amount')
          .eq('tenant_id', tenantId)
          .in('status', ['sent', 'overdue']),
        supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .lte('end_date', weekFromNow)
          .gte('end_date', today),
        supabase
          .from('daily_menus')
          .select('meal_type, items')
          .eq('tenant_id', tenantId)
          .eq('menu_date', today),
      ]);

      const totalStudents = studentsRes.count ?? 0;
      const onLeave = leavesRes.count ?? 0;
      const unpaidAmount = (unpaidInvoicesRes.data ?? []).reduce(
        (sum, inv) => sum + (inv.total_amount ?? 0),
        0,
      );

      setStats({
        messName: tenantRes.data?.name ?? 'Your Mess',
        totalStudents,
        todayAttendance: attendanceRes.count ?? 0,
        activeSessions: sessionsRes.count ?? 0,
        totalOnLeaveToday: onLeave,
        cookFor: Math.max(0, totalStudents - onLeave),
        unpaidInvoicesCount: unpaidInvoicesRes.data?.length ?? 0,
        unpaidInvoicesAmount: unpaidAmount,
        expiringThisWeek: expiringSubsRes.count ?? 0,
        todayMenus: menusRes.data ?? [],
      });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const todayStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <View style={{ width: 160, height: 26, backgroundColor: Colors.border, borderRadius: 6, marginTop: 4 }} />
          </View>
          <View style={styles.signOutBtn} />
        </View>
        <DashboardSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            {getGreeting()}, {profile?.name?.split(' ')[0] ?? 'Admin'} 👋
          </Text>
          <Text style={styles.messName}>{stats.messName}</Text>
          <Text style={styles.dateText}>{todayStr}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutIcon}>🚪</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Main Stats Gradient Card */}
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsGradientCard}
        >
          <Text style={styles.statsCardTitle}>Today's Overview</Text>
          <View style={styles.statRow}>
            <View style={styles.statBoxMain}>
              <Text style={styles.statValueMain}>{stats.todayAttendance}</Text>
              <Text style={styles.statLabelMain}>Meals Served</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBoxMain}>
              <Text style={styles.statValueMain}>{stats.totalStudents}</Text>
              <Text style={styles.statLabelMain}>Total Students</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBoxMain}>
              <Text style={styles.statValueMain}>{stats.totalOnLeaveToday}</Text>
              <Text style={styles.statLabelMain}>On Leave</Text>
            </View>
          </View>

          <View style={styles.activeSessionBanner}>
            <Text style={styles.activeSessionText}>
              {stats.activeSessions > 0
                ? `🟢 ${stats.activeSessions} Session Active Now`
                : '⚪ No active sessions currently'}
            </Text>
          </View>
        </LinearGradient>

        {/* ✨ NEW: Cook For Today Widget */}
        <View style={styles.cookForCard}>
          <View style={styles.cookForLeft}>
            <Text style={styles.cookForEmoji}>🍳</Text>
            <View>
              <Text style={styles.cookForLabel}>Cook For Today</Text>
              <Text style={styles.cookForSub}>
                {stats.totalOnLeaveToday} student{stats.totalOnLeaveToday !== 1 ? 's' : ''} marked leave
              </Text>
            </View>
          </View>
          <View>
            <Text style={styles.cookForNumber}>{stats.cookFor}</Text>
            <Text style={styles.cookForSub2}>students</Text>
          </View>
        </View>

        {/* ✨ NEW: Alerts Row */}
        {(stats.unpaidInvoicesCount > 0 || stats.expiringThisWeek > 0) && (
          <>
            <Text style={styles.sectionTitle}>⚠️ Alerts</Text>
            <View style={styles.alertsRow}>
              {stats.unpaidInvoicesCount > 0 && (
                <TouchableOpacity
                  style={[styles.alertCard, { borderLeftColor: Colors.error }]}
                  onPress={() => navigation.navigate('Billing')}
                >
                  <Text style={styles.alertIcon}>💰</Text>
                  <Text style={styles.alertValue}>{stats.unpaidInvoicesCount}</Text>
                  <Text style={styles.alertLabel}>Unpaid Bills</Text>
                  <Text style={styles.alertSub}>₹{stats.unpaidInvoicesAmount.toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              )}
              {stats.expiringThisWeek > 0 && (
                <TouchableOpacity
                  style={[styles.alertCard, { borderLeftColor: Colors.warning }]}
                  onPress={() => navigation.navigate('Students')}
                >
                  <Text style={styles.alertIcon}>⏰</Text>
                  <Text style={styles.alertValue}>{stats.expiringThisWeek}</Text>
                  <Text style={styles.alertLabel}>Expiring Soon</Text>
                  <Text style={styles.alertSub}>within 7 days</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ✨ NEW: Today's Menu Preview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Menu</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Menu')}>
            <Text style={styles.seeAll}>{stats.todayMenus.length > 0 ? 'Edit' : '+ Post Menu'}</Text>
          </TouchableOpacity>
        </View>

        {stats.todayMenus.length === 0 ? (
          <TouchableOpacity
            style={styles.menuEmptyCard}
            onPress={() => navigation.navigate('Menu')}
          >
            <Text style={styles.menuEmptyIcon}>📋</Text>
            <Text style={styles.menuEmptyText}>
              No menu posted for today.{'\n'}
              <Text style={{ color: Colors.primary }}>Tap to post menu →</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          stats.todayMenus.map((menu) => (
            <View key={menu.meal_type} style={styles.menuCard}>
              <View style={styles.menuCardHeader}>
                <Text style={styles.menuMealEmoji}>{MEAL_EMOJI[menu.meal_type] ?? '🍽️'}</Text>
                <Text style={[styles.menuMealType, { color: MEAL_COLORS[menu.meal_type] ?? Colors.text }]}>
                  {menu.meal_type.charAt(0).toUpperCase() + menu.meal_type.slice(1)}
                </Text>
              </View>
              <Text style={styles.menuItems}>{menu.items.join(' · ')}</Text>
            </View>
          ))
        )}

        {/* Quick Actions Grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.actionCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(action.route)}
            >
              <View style={[styles.iconWrapper, { backgroundColor: action.color + '15' }]}>
                <Text style={styles.actionIcon}>{action.icon}</Text>
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  messName: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.text, marginTop: 2 },
  dateText: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  signOutBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderRadius: 20, ...Shadows.soft,
  },
  signOutIcon: { fontSize: 20 },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  seeAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },

  // Gradient Stats Card
  statsGradientCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.medium },
  statsCardTitle: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  statBoxMain: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: Spacing.sm },
  statValueMain: { fontSize: 32, fontWeight: FontWeight.heavy, color: '#ffffff' },
  statLabelMain: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.85)', marginTop: 4, textAlign: 'center' },
  activeSessionBanner: { backgroundColor: 'rgba(255,255,255,0.2)', padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.xs },
  activeSessionText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  // Cook For Card
  cookForCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  cookForLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cookForEmoji: { fontSize: 36 },
  cookForLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  cookForSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  cookForNumber: { fontSize: 40, fontWeight: FontWeight.heavy, color: Colors.primary, textAlign: 'right' },
  cookForSub2: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right' },

  // Alerts
  alertsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  alertCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    ...Shadows.soft,
  },
  alertIcon: { fontSize: 22, marginBottom: 4 },
  alertValue: { fontSize: 26, fontWeight: FontWeight.heavy, color: Colors.text },
  alertLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  alertSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  // Menu
  menuEmptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    borderStyle: 'dashed',
  },
  menuEmptyIcon: { fontSize: 32, marginBottom: Spacing.sm },
  menuEmptyText: { color: Colors.textMuted, textAlign: 'center', lineHeight: 22, fontSize: FontSize.md },
  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  menuCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  menuMealEmoji: { fontSize: 18 },
  menuMealType: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  menuItems: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 20 },

  // Quick Actions
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  iconWrapper: {
    width: 56, height: 56, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text, textAlign: 'center' },
});
