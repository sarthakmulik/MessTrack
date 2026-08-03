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
  Modal,
} from 'react-native';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/ui/LoadingState';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '../../theme/tokens';
import { Student, Subscription, SubscriptionPlan } from '../../types';

interface StudentWithSub extends Student {
  is_active: boolean;
  active_subscriptions: {
    id: string;
    status: string;
    end_date: string;
    plan_name?: string;
    duration_days?: number;
  }[];
}

interface RenewalReq {
  id: string;
  student_id: string;
  student_name: string;
  requested_at: string;
  notes?: string;
}

export default function StudentsScreen({ navigation }: { navigation: any }) {
  const { tenantId } = useAuth();
  const [students, setStudents] = useState<StudentWithSub[]>([]);
  const [filtered, setFiltered] = useState<StudentWithSub[]>([]);
  const [pendingRenewals, setPendingRenewals] = useState<RenewalReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Assign Plan Modal State
  const [planModalVisible, setPlanModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentWithSub | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const fetchStudents = useCallback(async () => {
    if (!tenantId) return;
    try {
      // 1. Fetch pending renewal requests
      const { data: renewalData } = await supabase
        .from('renewal_requests')
        .select('*, students(name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      setPendingRenewals((renewalData || []).map((r: any) => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.students?.name || 'Student',
        requested_at: r.requested_at,
        notes: r.notes,
      })));

      // 2. Fetch students & active subscriptions
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          subscriptions (
            id,
            status,
            end_date,
            subscription_plans ( name, duration_days )
          )
        `)
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) throw error;

      const mapped: StudentWithSub[] = (data ?? []).map((s: any) => {
        const activeSubs = (s.subscriptions || []).filter((sub: any) => sub.status === 'active').map((sub: any) => ({
          id: sub.id,
          status: sub.status,
          end_date: sub.end_date,
          plan_name: sub.subscription_plans?.name,
          duration_days: sub.subscription_plans?.duration_days ?? 30,
        }));

        return {
          ...s,
          is_active: s.is_active ?? true,
          active_subscriptions: activeSubs,
        };
      });

      setStudents(mapped);
      setFiltered(mapped);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    const q = search.toLowerCase();
    if (!q) {
      setFiltered(students);
    } else {
      setFiltered(
        students.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.email.toLowerCase().includes(q) ||
            (s.phone ?? '').includes(q),
        ),
      );
    }
  }, [search, students]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStudents();
  };

  // 1-Tap Renewal Approval
  const handleApproveRenewal = async (req: RenewalReq) => {
    try {
      const student = students.find((s) => s.id === req.student_id);
      const activeSub = student?.active_subscriptions[0];

      if (activeSub) {
        // Extend existing subscription by +30 days (or duration_days)
        const currentEnd = new Date(activeSub.end_date);
        const newEnd = new Date(currentEnd.getTime() + (activeSub.duration_days ?? 30) * 24 * 60 * 60 * 1000);
        const newEndStr = newEnd.toISOString().split('T')[0];

        await supabase
          .from('subscriptions')
          .update({ end_date: newEndStr })
          .eq('id', activeSub.id);
      }

      // Mark request approved
      await supabase
        .from('renewal_requests')
        .update({ status: 'approved' })
        .eq('id', req.id);

      Alert.alert('Success 🎉', `Approved renewal for ${req.student_name}! Pass extended.`);
      fetchStudents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRejectRenewal = async (reqId: string) => {
    try {
      await supabase
        .from('renewal_requests')
        .update({ status: 'rejected' })
        .eq('id', reqId);
      fetchStudents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const toggleStudentStatus = async (studentId: string, currentStatus: boolean) => {
    Alert.alert(
      currentStatus ? 'Deactivate Student?' : 'Reactivate Student?',
      currentStatus 
        ? 'This student will no longer be able to scan QR codes for this mess.'
        : 'This student will be able to scan QR codes again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: currentStatus ? 'Deactivate' : 'Reactivate', 
          style: currentStatus ? 'destructive' : 'default',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('students')
                .update({ is_active: !currentStatus })
                .eq('id', studentId);
              if (error) throw error;
              fetchStudents();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          }
        }
      ]
    );
  };

  const openPlanModal = async (student: StudentWithSub) => {
    setSelectedStudent(student);
    setPlanModalVisible(true);
    setLoadingPlans(true);
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
      if (error) throw error;
      setPlans(data ?? []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoadingPlans(false);
    }
  };

  const assignPlan = async (plan: SubscriptionPlan) => {
    if (!selectedStudent || !tenantId) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration_days);
      const endDateStr = endDate.toISOString().split('T')[0];

      const { error } = await supabase.from('subscriptions').insert({
        student_id: selectedStudent.id,
        tenant_id: tenantId,
        plan_id: plan.id,
        start_date: today,
        end_date: endDateStr,
        status: 'active',
      });

      if (error) throw error;

      Alert.alert('Success', `Assigned ${plan.name} to ${selectedStudent.name}`);
      setPlanModalVisible(false);
      fetchStudents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading && !refreshing) {
    return <LoadingState message="Loading student roster..." />;
  }

  const renderStudentItem = ({ item }: { item: StudentWithSub }) => {
    return (
      <Card style={[styles.card, !item.is_active && styles.inactiveCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.studentInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.studentName}>{item.name}</Text>
              {!item.is_active && (
                <Badge label="INACTIVE" variant="error" />
              )}
            </View>
            <Text style={styles.studentSubtext}>{item.email}</Text>
            {item.phone ? <Text style={styles.studentSubtext}>📱 {item.phone}</Text> : null}
          </View>
        </View>

        {/* Active Subscriptions List */}
        <View style={styles.subscriptionSection}>
          {item.active_subscriptions.length > 0 ? (
            item.active_subscriptions.map((sub) => (
              <View key={sub.id} style={styles.subRow}>
                <Badge label="ACTIVE PLAN" variant="success" dot />
                <Text style={styles.planName}>{sub.plan_name ?? 'Custom Plan'}</Text>
                <Text style={styles.expiryText}>Expires: {sub.end_date}</Text>
              </View>
            ))
          ) : (
            <View style={styles.noSubRow}>
              <Badge label="NO ACTIVE PLAN" variant="warning" />
            </View>
          )}
        </View>

        {/* Action Controls */}
        <View style={styles.actionRow}>
          <Button
            title="+ Assign Plan"
            variant="outline"
            size="small"
            onPress={() => openPlanModal(item)}
            style={styles.actionBtn}
          />
          <TouchableOpacity
            style={[styles.toggleBtn, !item.is_active && styles.reactivateBtn]}
            onPress={() => toggleStudentStatus(item.id, item.is_active)}
          >
            <Text style={[styles.toggleBtnText, !item.is_active && styles.reactivateBtnText]}>
              {item.is_active ? 'Deactivate' : 'Reactivate'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.searchContainer}>
          <Input
            placeholder="Search students by name, email..."
            value={search}
            onChangeText={setSearch}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
        <TouchableOpacity
          style={styles.addFab}
          onPress={() => navigation.navigate('AddStudent')}
        >
          <Text style={styles.addFabText}>+ Student</Text>
        </TouchableOpacity>
      </View>

      {/* Pending Renewal Requests Section */}
      {pendingRenewals.length > 0 && (
        <View style={styles.renewalSection}>
          <Text style={styles.renewalSectionTitle}>⏰ Pending Renewal Requests ({pendingRenewals.length})</Text>
          {pendingRenewals.map((req) => (
            <View key={req.id} style={styles.renewalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.renewalStudentName}>{req.student_name}</Text>
                <Text style={styles.renewalSub}>
                  Requested on {new Date(req.requested_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>

              <View style={styles.renewalActions}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApproveRenewal(req)}>
                  <Text style={styles.approveBtnText}>Approve & Extend ⚡</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => handleRejectRenewal(req.id)}>
                  <Text style={styles.rejectBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Students List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderStudentItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No students found.</Text>
          </View>
        }
      />

      {/* Assign Plan Modal */}
      <Modal
        visible={planModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPlanModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Subscription Plan</Text>
            <Text style={styles.modalSub}>
              Assigning plan for {selectedStudent?.name}
            </Text>

            {loadingPlans ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
            ) : plans.length === 0 ? (
              <Text style={{ color: Colors.textMuted, marginVertical: Spacing.lg }}>
                No active plans available. Create a plan in the Plans screen first.
              </Text>
            ) : (
              plans.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.planOptionCard}
                  onPress={() => assignPlan(p)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planOptionName}>{p.name}</Text>
                    <Text style={styles.planOptionSub}>
                      {p.duration_days} Days · ₹{p.price}
                    </Text>
                  </View>
                  <Badge label="Select" variant="info" />
                </TouchableOpacity>
              ))
            )}

            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setPlanModalVisible(false)}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topHeader: {
    flexDirection: 'row',
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchContainer: { flex: 1 },
  addFab: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  addFabText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  renewalSection: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  renewalSectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.warning, marginBottom: 6 },
  renewalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '15',
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  renewalStudentName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  renewalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  renewalActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  approveBtn: { backgroundColor: Colors.success, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full },
  approveBtnText: { color: '#ffffff', fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  rejectBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full },
  rejectBtnText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  listContainer: { padding: Spacing.md, paddingBottom: 40 },
  card: { marginBottom: Spacing.md },
  inactiveCard: { opacity: 0.5 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  studentInfo: { flex: 1 },
  studentName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  studentSubtext: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },

  subscriptionSection: {
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginVertical: Spacing.xs,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.text, flex: 1, marginLeft: Spacing.xs },
  expiryText: { fontSize: FontSize.xs, color: Colors.textMuted },
  noSubRow: { alignItems: 'flex-start' },

  actionRow: { flexDirection: 'row', marginTop: Spacing.sm, gap: Spacing.sm, alignItems: 'center' },
  actionBtn: { flex: 1 },
  toggleBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  toggleBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  reactivateBtn: { borderColor: Colors.success, backgroundColor: Colors.success + '10' },
  reactivateBtnText: { color: Colors.success, fontWeight: FontWeight.bold },

  emptyState: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md, marginTop: 2 },
  planOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planOptionName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  planOptionSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
