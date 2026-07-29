import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';
import { LinearGradient } from 'expo-linear-gradient';

interface DashboardStats {
  totalStudents: number;
  todayAttendance: number;
  activeSessions: number;
  messName: string;
}

const QUICK_ACTIONS = [
  { label: 'Students', icon: '👨‍🎓', route: 'Students', color: Colors.primary },
  { label: 'Plans', icon: '📋', route: 'Plans', color: Colors.accent },
  { label: 'Sessions', icon: '🍽️', route: 'Sessions', color: Colors.lunch },
  { label: 'QR Display', icon: '🔲', route: 'Sessions', color: Colors.dinner },
  { label: 'Attendance', icon: '✅', route: 'AdminAttendance', color: Colors.warning },
  { label: 'Billing', icon: '💰', route: 'Billing', color: Colors.breakfast },
  { label: 'Meals', icon: '⚙️', route: 'MealSettings', color: Colors.textMuted },
  { label: 'Payment Setup', icon: '💳', route: 'PaymentSettings', color: Colors.primary },
];

export default function AdminDashboardScreen({ navigation }: { navigation: any }) {
  const { profile, tenantId, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    todayAttendance: 0,
    activeSessions: 0,
    messName: '',
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!tenantId) return;

    try {
      const today = new Date().toISOString().split('T')[0];

      const [tenantRes, studentsRes, attendanceRes, sessionsRes] = await Promise.all([
        supabase.from('tenants').select('name').eq('id', tenantId).single(),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
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
      ]);

      setStats({
        messName: tenantRes.data?.name ?? 'Your Mess',
        totalStudents: studentsRes.count ?? 0,
        todayAttendance: attendanceRes.count ?? 0,
        activeSessions: sessionsRes.count ?? 0,
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
    year: 'numeric',
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()}, {profile?.name?.split(' ')[0] ?? 'Admin'} 👋</Text>
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
        {/* Stats Section with Gradient Card */}
        <Text style={styles.sectionTitle}>Today's Overview</Text>
        <LinearGradient
          colors={[Colors.primary, Colors.primaryLight]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statsGradientCard}
        >
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
          </View>
          
          <View style={styles.activeSessionBanner}>
            <Text style={styles.activeSessionText}>
              {stats.activeSessions > 0 ? `🟢 ${stats.activeSessions} Session Active Now` : '⚪ No active sessions currently'}
            </Text>
          </View>
        </LinearGradient>

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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  messName: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.text,
    marginTop: 2,
  },
  dateText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 4,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderRadius: 20,
    ...Shadows.soft,
  },
  signOutIcon: {
    fontSize: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  statsGradientCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.medium,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  statBoxMain: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: Spacing.md,
  },
  statValueMain: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.heavy,
    color: '#ffffff',
  },
  statLabelMain: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  activeSessionBanner: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  activeSessionText: {
    color: '#ffffff',
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  actionIcon: {
    fontSize: 28,
  },
  actionLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
});
