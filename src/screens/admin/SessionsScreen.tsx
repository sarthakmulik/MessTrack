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
  Modal,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';
import { MealSession } from '../../types';

const FALLBACK_MEAL_CONFIG: Record<string, { id?: string; icon: string; color: string; label: string; durationHours: number }> = {
  breakfast: { id: 'breakfast', icon: '🌅', color: Colors.breakfast, label: 'Breakfast', durationHours: 2 },
  lunch: { id: 'lunch', icon: '☀️', color: Colors.lunch, label: 'Lunch', durationHours: 2 },
  dinner: { id: 'dinner', icon: '🌙', color: Colors.dinner, label: 'Dinner', durationHours: 2 },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  unscheduled: { color: Colors.textMuted, label: 'Not Started' },
  scheduled: { color: Colors.textMuted, label: 'Scheduled' },
  active: { color: Colors.success, label: 'Active' },
  ended: { color: Colors.error, label: 'Ended' },
};

interface VirtualSession {
  meal_type: string;
  config: { id?: string; icon: string; color: string; label: string; durationHours: number };
  dbSession: (MealSession & { attendance_count?: number }) | null;
}

export default function SessionsScreen({ navigation }: { navigation: any }) {
  const { tenantId, tenant } = useAuth();
  
  const currentConfigs = tenant?.meal_configs || FALLBACK_MEAL_CONFIG;

  const [virtualSessions, setVirtualSessions] = useState<VirtualSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSessionData, setSelectedSessionData] = useState<{ mealType: string; existingSession: MealSession | null } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const fetchSessions = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase
        .from('meal_sessions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('session_date', today);

      if (error) throw error;
      const dbSessions = data ?? [];

      // Fetch attendance counts per session
      const counts = await Promise.all(
        dbSessions.map((s: MealSession) =>
          supabase
            .from('attendance_records')
            .select('id', { count: 'exact', head: true })
            .eq('meal_session_id', s.id)
            .eq('status', 'present'),
        ),
      );

      const dbMap = new Map();
      dbSessions.forEach((s: MealSession, i: number) => {
        dbMap.set(s.meal_type, { ...s, attendance_count: counts[i]?.count ?? 0 });
      });

      // Build virtual list
      const combined: VirtualSession[] = Object.entries(currentConfigs).map(([meal_type, config]: any) => ({
        meal_type,
        config,
        dbSession: dbMap.get(meal_type) || null,
      }));

      setVirtualSessions(combined);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, today, currentConfigs]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSessions();
  };

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const startSession = async (mealType: string, durationHours: number, existingSession: MealSession | null) => {
    if (!tenantId) return;
    setActionLoading(mealType);

    try {
      const now = new Date();
      const end = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
      let sessionId = existingSession?.id;

      if (existingSession) {
        // Update existing scheduled session
        const { error: updateError } = await supabase
          .from('meal_sessions')
          .update({
            status: 'active',
            start_time: now.toISOString(),
            end_time: end.toISOString(),
          })
          .eq('id', existingSession.id);
        if (updateError) throw updateError;
      } else {
        // Create new session
        const { data: newSession, error: createError } = await supabase
          .from('meal_sessions')
          .insert({
            tenant_id: tenantId,
            meal_type: mealType,
            session_date: today,
            start_time: now.toISOString(),
            end_time: end.toISOString(),
            status: 'active',
          })
          .select()
          .single();
        if (createError) throw createError;
        sessionId = newSession.id;
      }

      await fetchSessions();
      navigation.navigate('QRDisplay', { sessionId, mealType });
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to start session');
    } finally {
      setActionLoading(null);
    }
  };

  const endSession = async (dbSession: MealSession) => {
    Alert.alert('End Session', `Are you sure you want to end this session?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(dbSession.id);
          try {
            const { error } = await supabase
              .from('meal_sessions')
              .update({ status: 'ended', end_time: new Date().toISOString() })
              .eq('id', dbSession.id);
            if (error) throw error;
            await fetchSessions();
          } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Failed to end session');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const renderSession = ({ item }: { item: VirtualSession }) => {
    const { meal_type, config, dbSession } = item;
    const status = dbSession ? dbSession.status : 'unscheduled';
    const statusConf = STATUS_CONFIG[status] || STATUS_CONFIG['unscheduled'];
    const isLoading = actionLoading === meal_type || actionLoading === dbSession?.id;

    return (
      <View style={[styles.sessionCard, { borderLeftColor: config.color, borderLeftWidth: 4 }]}>
        <View style={styles.sessionHeader}>
          <View style={styles.sessionTitleRow}>
            <Text style={styles.mealIcon}>{config.icon}</Text>
            <Text style={[styles.mealLabel, { color: config.color }]}>{config.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConf.color + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusConf.color }]} />
            <Text style={[styles.statusText, { color: statusConf.color }]}>{statusConf.label}</Text>
          </View>
        </View>

        {dbSession && (
          <View style={styles.sessionMeta}>
            <Text style={styles.timeText}>🕐 {formatTime(dbSession.start_time)} – {formatTime(dbSession.end_time)}</Text>
            <Text style={styles.countText}>👥 {dbSession.attendance_count ?? 0} scans</Text>
          </View>
        )}

        <View style={styles.sessionActions}>
          {(!dbSession || dbSession.status === 'scheduled') && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: Colors.success }]}
              onPress={() => {
                setSelectedSessionData({ mealType: meal_type, existingSession: dbSession });
                setModalVisible(true);
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.text} />
              ) : (
                <Text style={styles.actionBtnText}>▶ Start Session Now</Text>
              )}
            </TouchableOpacity>
          )}

          {dbSession?.status === 'active' && (
            <View style={styles.activeActions}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Colors.primary, flex: 1 }]}
                onPress={() => navigation.navigate('QRDisplay', { sessionId: dbSession.id, mealType: meal_type })}
              >
                <Text style={styles.actionBtnText}>🔲 Show QR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: Colors.error, marginLeft: Spacing.sm }]}
                onPress={() => endSession(dbSession)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Text style={styles.actionBtnText}>⏹ End</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {dbSession?.status === 'ended' && (
            <View style={styles.endedContainer}>
              <Text style={styles.endedText}>Session ended • {dbSession.attendance_count} attended</Text>
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => {
                  setSelectedSessionData({ mealType: meal_type, existingSession: dbSession });
                  setModalVisible(true);
                }}
              >
                <Text style={styles.resumeBtnText}>↺ Resume Session</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

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

      <View style={styles.dateHeader}>
        <Text style={styles.dateTitle}>Today's Sessions</Text>
        <Text style={styles.dateSubtitle}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
      </View>

      <FlatList
        data={virtualSessions}
        keyExtractor={(item) => item.meal_type}
        renderItem={renderSession}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      />

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Session Duration</Text>
            <Text style={styles.modalSubtitle}>How long should this session stay active?</Text>
            
            <View style={styles.durationOptions}>
              {[1, 2, 3, 4, 5].map(hours => (
                <TouchableOpacity
                  key={hours}
                  style={styles.durationBtn}
                  onPress={() => {
                    setModalVisible(false);
                    if (selectedSessionData) {
                      startSession(selectedSessionData.mealType, hours, selectedSessionData.existingSession);
                    }
                  }}
                >
                  <Text style={styles.durationBtnText}>{hours} {hours === 1 ? 'Hour' : 'Hours'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  dateHeader: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    ...Shadows.soft,
    marginBottom: Spacing.sm,
  },
  dateTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  dateSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  listContent: { padding: Spacing.md, paddingBottom: 80 },
  sessionCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    ...Shadows.soft,
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  mealIcon: { fontSize: 24 },
  mealLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  sessionMeta: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.md },
  timeText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  countText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sessionActions: {},
  activeActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: {
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md,
    borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
  },
  actionBtnText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  endedContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  endedText: { color: Colors.textMuted, fontSize: FontSize.sm, fontStyle: 'italic', flex: 1 },
  resumeBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm },
  resumeBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.xl },
  modalContent: { backgroundColor: Colors.surface, padding: Spacing.xl, borderRadius: Radius.xl, ...Shadows.medium },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xl, textAlign: 'center' },
  durationOptions: { gap: Spacing.sm, marginBottom: Spacing.xl },
  durationBtn: { backgroundColor: Colors.background, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  durationBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary },
  modalCancelBtn: { paddingVertical: Spacing.sm, alignItems: 'center' },
  modalCancelText: { fontSize: FontSize.md, color: Colors.error, fontWeight: FontWeight.bold },
});
