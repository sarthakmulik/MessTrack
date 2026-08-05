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
  Linking,
  Modal,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing, Shadows } from '../../theme/tokens';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

interface StudentBillingRow {
  student_id: string;
  student_name: string;
  student_email: string;
  student_phone?: string;
  plan_name: string;
  rate_per_day: number;
  days_present_this_month: number;
  total_due: number;
  paid_amount: number;
  balance_due: number;
  existing_invoice_id: string | null;
  invoice_status: string | null;
}

const formatYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function BillingScreen() {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<StudentBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Tenant UPI Config
  const [tenantUpiId, setTenantUpiId] = useState('');
  const [tenantUpiName, setTenantUpiName] = useState('');

  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<StudentBillingRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Current billing period (IST Safe)
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const periodStartStr = formatYMD(periodStart);
  const periodEndStr = formatYMD(periodEnd);

  const fetchBilling = useCallback(async () => {
    if (!tenantId) return;
    try {
      // 1. Fetch Tenant UPI Settings
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name, upi_id, upi_name')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantData) {
        setTenantUpiId(tenantData.upi_id || '');
        setTenantUpiName(tenantData.upi_name || tenantData.name || '');
      }

      // 2. Get all active students with subscriptions
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name, email, phone, subscriptions(*, plan:subscription_plans(name, price, days_included, duration_days, meal_types))')
        .eq('tenant_id', tenantId)
        .order('name');

      if (sErr) throw sErr;

      const result: StudentBillingRow[] = [];

      for (const s of (students || []) as any[]) {
        const activeSubs = (s.subscriptions || []).filter(
          (sub: any) => sub.status === 'active'
        );
        if (activeSubs.length === 0) continue;

        // Fetch all attendance this month for this student
        const { data: allAttendance } = await supabase
          .from('attendance_records')
          .select('id, subscription_id')
          .eq('student_id', s.id)
          .eq('status', 'present')
          .gte('scanned_at', `${periodStartStr}T00:00:00`)
          .lte('scanned_at', `${formatYMD(now)}T23:59:59`);

        const attendanceList = allAttendance || [];
        let totalMeals = 0;
        let calculatedTotalDue = 0;
        let planNames: string[] = [];

        for (const sub of activeSubs) {
          const plan = sub.plan;
          if (!plan) continue;
          planNames.push(plan.name);

          // Calculate per-meal rate
          const mealTypesCount = (plan.meal_types || []).length || 1;
          const ratePerMeal = (plan.price / plan.days_included) / mealTypesCount;

          const mealsForSub = attendanceList.filter((a: any) => 
            a.subscription_id === sub.id || (activeSubs.length === 1 && !a.subscription_id)
          ).length;

          totalMeals += mealsForSub;
          calculatedTotalDue += (mealsForSub * ratePerMeal);
        }

        if (planNames.length === 0) continue;

        const avgRate = totalMeals > 0 ? calculatedTotalDue / totalMeals : 0;

        // Check for existing invoice this period
        const { data: existingInvoice } = await supabase
          .from('invoices')
          .select('id, status, paid_amount, total_amount')
          .eq('student_id', s.id)
          .eq('tenant_id', tenantId)
          .eq('period_start', periodStartStr)
          .maybeSingle();

        const totalDue = existingInvoice ? (existingInvoice.total_amount ?? 0) : calculatedTotalDue;
        const paidAmount = existingInvoice?.paid_amount ?? 0;
        const balanceDue = Math.max(0, totalDue - paidAmount);

        result.push({
          student_id: s.id,
          student_name: s.name,
          student_email: s.email,
          student_phone: s.phone,
          plan_name: planNames.join(' + '),
          rate_per_day: avgRate,
          days_present_this_month: totalMeals,
          total_due: totalDue,
          paid_amount: paidAmount,
          balance_due: balanceDue,
          existing_invoice_id: existingInvoice?.id ?? null,
          invoice_status: existingInvoice?.status ?? null,
        });
      }

      setRows(result);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, periodStartStr]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const generateInvoice = async (row: StudentBillingRow) => {
    if (!tenantId) return;
    if (row.total_due <= 0) {
      Alert.alert('Info', `No dues for ${row.student_name} this period (0 meals scanned).`);
      return;
    }
    setGeneratingId(row.student_id);
    try {
      const { error } = await supabase.from('invoices').insert({
        student_id: row.student_id,
        tenant_id: tenantId,
        period_start: periodStartStr,
        period_end: periodEndStr,
        days_present: row.days_present_this_month,
        rate_per_day: row.rate_per_day,
        total_amount: row.total_due,
        paid_amount: 0.00,
        status: 'sent',
      });

      if (error && error.code !== '23505') throw error;
      Alert.alert('✅ Invoice Generated', `Invoice for ${row.student_name}: ₹${row.total_due.toFixed(0)}`);
      await fetchBilling();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const openPaymentModal = (row: StudentBillingRow) => {
    setSelectedInvoice(row);
    setPaymentAmount(row.balance_due.toString());
    setPaymentMethod('cash');
    setPaymentNotes('');
    setPaymentModalVisible(true);
  };

  const submitPayment = async () => {
    if (!selectedInvoice || !selectedInvoice.existing_invoice_id || !tenantId) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    setSubmittingPayment(true);
    try {
      const currentUser = (await supabase.auth.getUser()).data.user;

      const { error } = await supabase.from('payments').insert({
        invoice_id: selectedInvoice.existing_invoice_id,
        student_id: selectedInvoice.student_id,
        tenant_id: tenantId,
        amount: amount,
        method: paymentMethod,
        notes: paymentNotes || `Collected by admin`,
        logged_by: currentUser?.id,
        status: 'success',
      });

      if (error) throw error;
      
      setPaymentModalVisible(false);
      await fetchBilling();

      // Send payment receipt via WhatsApp
      Alert.alert(
        'Payment Recorded! 🎉',
        `₹${amount.toFixed(0)} collected for ${selectedInvoice.student_name}. Send WhatsApp receipt?`,
        [
          { text: 'Done', style: 'cancel' },
          { 
            text: 'Send Receipt 📲', 
            onPress: () => shareReceiptViaWhatsApp(selectedInvoice, amount)
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Payment Error', err.message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const generateAllInvoices = async () => {
    const pending = rows.filter((r) => !r.existing_invoice_id);
    if (pending.length === 0) {
      Alert.alert('Info', 'All active students already have invoices for this period.');
      return;
    }

    Alert.alert(
      'Generate All Invoices',
      `Generate invoices for ${pending.length} student(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate All',
          onPress: async () => {
            setGeneratingAll(true);
            for (const row of pending) {
              await generateInvoice(row);
            }
            setGeneratingAll(false);
          },
        },
      ],
    );
  };

  const shareViaWhatsApp = (row: StudentBillingRow) => {
    const periodLabel = new Date(periodStartStr).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    let upiSection = '';
    if (tenantUpiId) {
      const upiUrl = `upi://pay?pa=${tenantUpiId}&pn=${encodeURIComponent(tenantUpiName || 'Mess')}&am=${row.balance_due.toFixed(0)}&cu=INR&tn=MessBill`;
      upiSection = `\n\n*Pay Online via UPI (GPay/PhonePe):*\n${upiUrl}`;
    }

    const message =
      `*MessTrack Bill Statement 🧾*\n` +
      `Student: ${row.student_name}\n` +
      `Period: ${periodLabel}\n` +
      `Plan: ${row.plan_name}\n` +
      `Meals Attended: ${row.days_present_this_month}\n` +
      `Total Bill: ₹${row.total_due.toFixed(0)}\n` +
      `Paid So Far: ₹${row.paid_amount.toFixed(0)}\n` +
      `*Balance Dues: ₹${row.balance_due.toFixed(0)}*` +
      upiSection +
      `\n\nPlease clear your balance at the earliest. Thank you! 🙏`;

    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp not found', 'Please install WhatsApp on your phone.');
    });
  };

  const shareReceiptViaWhatsApp = (row: StudentBillingRow, amountPaid: number) => {
    const message =
      `*Mess Payment Receipt ✅*\n` +
      `Student: ${row.student_name}\n` +
      `Amount Paid: ₹${amountPaid.toFixed(0)}\n` +
      `Payment Mode: ${paymentMethod.toUpperCase()}\n` +
      `Remaining Balance: ₹${Math.max(0, row.balance_due - amountPaid).toFixed(0)}\n\n` +
      `Thank you for your payment! 🙏`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp not found', 'Please install WhatsApp on your phone.');
    });
  };

  const exportCSV = async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          scanned_at,
          status,
          dining_option,
          meal_sessions ( meal_type, session_date ),
          students ( name, email, phone )
        `)
        .eq('tenant_id', tenantId)
        .gte('scanned_at', `${periodStartStr}T00:00:00`)
        .lte('scanned_at', `${formatYMD(now)}T23:59:59`)
        .order('scanned_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert('No Data', 'No attendance records found for this month.');
        return;
      }

      let csv = 'Student Name,Email,Phone,Date,Meal Type,Dining Option,Status,Scanned At\n';
      data.forEach((row: any) => {
        const studentName = `"${row.students?.name || ''}"`;
        const email = `"${row.students?.email || ''}"`;
        const phone = `"${row.students?.phone || ''}"`;
        const date = `"${(row.meal_sessions as any)?.session_date || ''}"`;
        const mealType = `"${(row.meal_sessions as any)?.meal_type || ''}"`;
        const diningOption = `"${row.dining_option || 'dine_in'}"`;
        const status = `"${row.status}"`;
        const scannedAt = `"${row.scanned_at}"`;
        csv += `${studentName},${email},${phone},${date},${mealType},${diningOption},${status},${scannedAt}\n`;
      });

      const fileUri = `${FileSystem.documentDirectory}Attendance_${periodStartStr}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('File Saved', `CSV file saved to ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Export Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Metrics Calculations
  const totalInvoiced = rows.reduce((sum, r) => sum + r.total_due, 0);
  const totalCollected = rows.reduce((sum, r) => sum + r.paid_amount, 0);
  const totalPendingDues = rows.reduce((sum, r) => sum + r.balance_due, 0);

  const toggleMarkPaid = async (row: StudentBillingRow) => {
    if (!row.existing_invoice_id || !tenantId) return;
    const isCurrentlyPaid = row.invoice_status === 'paid' || row.balance_due <= 0;

    Alert.alert(
      isCurrentlyPaid ? 'Mark Invoice as Unpaid?' : 'Mark Invoice as Paid?',
      isCurrentlyPaid 
        ? `Reset bill for ${row.student_name} to unpaid status?`
        : `Mark full payment of ₹${row.total_due.toFixed(0)} for ${row.student_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCurrentlyPaid ? 'Mark Unpaid' : 'Mark Paid ✅',
          onPress: async () => {
            try {
              if (isCurrentlyPaid) {
                await supabase
                  .from('invoices')
                  .update({ paid_amount: 0.00, status: 'sent' })
                  .eq('id', row.existing_invoice_id);

                await supabase
                  .from('payments')
                  .delete()
                  .eq('invoice_id', row.existing_invoice_id);
              } else {
                const currentUser = (await supabase.auth.getUser()).data.user;
                await supabase.from('payments').insert({
                  invoice_id: row.existing_invoice_id,
                  student_id: row.student_id,
                  tenant_id: tenantId,
                  amount: row.balance_due,
                  method: 'cash',
                  notes: 'Manually marked as paid by admin',
                  logged_by: currentUser?.id,
                  status: 'success',
                });

                await supabase
                  .from('invoices')
                  .update({ paid_amount: row.total_due, status: 'paid' })
                  .eq('id', row.existing_invoice_id);
              }

              await fetchBilling();
              Alert.alert('Success', `Invoice updated for ${row.student_name}.`);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  const statusColor = (row: StudentBillingRow) => {
    if (row.invoice_status === 'paid' || (row.balance_due <= 0 && !!row.existing_invoice_id)) return Colors.success;
    if (row.invoice_status === 'partially_paid') return Colors.warning;
    if (row.invoice_status === 'overdue') return Colors.error;
    if (row.existing_invoice_id) return Colors.primary;
    return Colors.textMuted;
  };

  const statusText = (row: StudentBillingRow) => {
    if (row.invoice_status === 'paid' || (row.balance_due <= 0 && !!row.existing_invoice_id)) return '✅ Paid';
    if (row.invoice_status === 'partially_paid') return '⚠️ Partial';
    if (row.invoice_status === 'overdue') return '🔴 Overdue';
    if (row.existing_invoice_id) return '📤 Sent';
    return '📝 Draft';
  };

  const renderRow = ({ item }: { item: StudentBillingRow }) => {
    const isGen = generatingId === item.student_id;
    const isPaid = item.invoice_status === 'paid' || (item.balance_due <= 0 && !!item.existing_invoice_id);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.studentInfo}>
            <Text style={styles.name}>{item.student_name}</Text>
            <Text style={styles.plan}>{item.plan_name}</Text>
          </View>
          <View style={[styles.statusChip, { borderColor: statusColor(item) }]}>
            <Text style={[styles.statusChipText, { color: statusColor(item) }]}>
              {statusText(item)}
            </Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Meals</Text>
            <Text style={styles.metaVal}>{item.days_present_this_month}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Total Bill</Text>
            <Text style={styles.metaVal}>₹{item.total_due.toFixed(0)}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Paid</Text>
            <Text style={[styles.metaVal, { color: Colors.success }]}>₹{item.paid_amount.toFixed(0)}</Text>
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLabel}>Balance</Text>
            <Text style={[styles.metaVal, { color: item.balance_due > 0 ? Colors.error : Colors.textMuted }]}>
              ₹{item.balance_due.toFixed(0)}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          {!item.existing_invoice_id ? (
            <TouchableOpacity
              style={styles.genBtn}
              onPress={() => generateInvoice(item)}
              disabled={isGen}
            >
              {isGen ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <Text style={styles.genBtnText}>Generate Invoice 📄</Text>
              )}
            </TouchableOpacity>
          ) : (
            <>
              {item.balance_due > 0 && (
                <TouchableOpacity
                  style={styles.collectBtn}
                  onPress={() => openPaymentModal(item)}
                >
                  <Text style={styles.collectBtnText}>Collect 💰</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.collectBtn, { backgroundColor: isPaid ? Colors.textMuted : Colors.primary }]}
                onPress={() => toggleMarkPaid(item)}
              >
                <Text style={styles.collectBtnText}>{isPaid ? 'Unpaid 🔄' : 'Mark Paid ✅'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.whatsappBtn}
                onPress={() => shareViaWhatsApp(item)}
              >
                <Text style={styles.whatsappBtnText}>WhatsApp 💬</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Action Bar */}
      <View style={styles.topActions}>
        <TouchableOpacity
          style={styles.genAllBtn}
          onPress={generateAllInvoices}
          disabled={generatingAll}
        >
          {generatingAll ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.genAllText}>Generate All Invoices ⚡</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.exportBtn} onPress={exportCSV}>
          <Text style={styles.exportText}>Export CSV 📊</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>₹{totalInvoiced.toFixed(0)}</Text>
          <Text style={styles.statLbl}>Total Invoiced</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: Colors.success }]}>₹{totalCollected.toFixed(0)}</Text>
          <Text style={styles.statLbl}>Collected</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: Colors.warning }]}>₹{totalPendingDues.toFixed(0)}</Text>
          <Text style={styles.statLbl}>Pending Dues</Text>
        </View>
      </View>

      {/* Student List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.student_id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBilling(); }}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyText}>No billing data found for this period.</Text>
            </View>
          }
        />
      )}

      {/* Record Payment Modal */}
      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Collect Payment 💰</Text>
            <Text style={styles.modalSubtitle}>
              Record cash/UPI payment for {selectedInvoice?.student_name}
            </Text>

            <Text style={styles.label}>Amount Paid (₹)</Text>
            <Input
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
              placeholder="Enter amount"
            />

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.methodRow}>
              {(['cash', 'upi', 'bank_transfer'] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodBtn,
                    paymentMethod === method && styles.methodBtnActive,
                  ]}
                  onPress={() => setPaymentMethod(method)}
                >
                  <Text
                    style={[
                      styles.methodText,
                      paymentMethod === method && styles.methodTextActive,
                    ]}
                  >
                    {method.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Notes / Transaction Ref (Optional)</Text>
            <Input
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              placeholder="e.g. Paid cash at counter"
            />

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setPaymentModalVisible(false)}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <Button
                title="Record Payment"
                onPress={submitPayment}
                isLoading={submittingPayment}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topActions: { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
  genAllBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  genAllText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  exportBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  exportText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.xs, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statVal: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.text },
  statLbl: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  list: { padding: Spacing.md, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.sm },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  studentInfo: { flex: 1 },
  name: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  plan: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  statusChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },

  metaGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.background, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  metaBox: { alignItems: 'center' },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text, marginTop: 2 },

  cardActions: { flexDirection: 'row', gap: Spacing.sm },
  genBtn: { flex: 1, backgroundColor: Colors.primary + '20', borderWidth: 1, borderColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  genBtnText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  collectBtn: { flex: 1, backgroundColor: Colors.success, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  collectBtnText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  whatsappBtn: { backgroundColor: '#25D366', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  whatsappBtnText: { color: '#ffffff', fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  modalContent: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, ...Shadows.large },
  modalTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: 4 },
  modalSubtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold, marginBottom: 4, marginTop: Spacing.sm },
  methodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  methodBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  methodBtnActive: { backgroundColor: Colors.primary + '20', borderColor: Colors.primary },
  methodText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  methodTextActive: { color: Colors.primary },
  modalActions: { flexDirection: 'row', marginTop: Spacing.lg },
});
