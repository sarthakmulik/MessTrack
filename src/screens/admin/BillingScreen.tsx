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
  plan_name: string;
  rate_per_day: number;
  days_present_this_month: number;
  total_due: number;
  existing_invoice_id: string | null;
  invoice_status: string | null;
}

export default function BillingScreen() {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<StudentBillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);

  // Payment Modal State
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<StudentBillingRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Current billing period: 1st of this month to today
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date();

  const periodStartStr = periodStart.toISOString().split('T')[0];
  const periodEndStr = periodEnd.toISOString().split('T')[0];

  const fetchBilling = useCallback(async () => {
    if (!tenantId) return;
    try {
      // Get all students with active subscriptions
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, name, email, subscriptions(*, plan:subscription_plans(name, price, days_included, duration_days))')
        .eq('tenant_id', tenantId)
        .order('name');

      if (sErr) throw sErr;

      const result: StudentBillingRow[] = [];

      for (const s of (students || []) as any[]) {
        const activeSub = (s.subscriptions || []).find(
          (sub: any) => sub.status === 'active',
        );
        if (!activeSub) continue;

        const plan = activeSub.plan;
        const ratePerDay = plan ? plan.price / plan.days_included : 0;

        // Count attendance this month
        const { count: daysPresent } = await supabase
          .from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', s.id)
          .eq('status', 'present')
          .gte('scanned_at', periodStart.toISOString())
          .lte('scanned_at', periodEnd.toISOString());

        // Check for existing invoice this period
        const { data: existingInvoice } = await supabase
          .from('invoices')
          .select('id, status')
          .eq('student_id', s.id)
          .eq('tenant_id', tenantId)
          .eq('period_start', periodStartStr)
          .maybeSingle();

        result.push({
          student_id: s.id,
          student_name: s.name,
          student_email: s.email,
          plan_name: plan?.name ?? 'Unknown',
          rate_per_day: ratePerDay,
          days_present_this_month: daysPresent ?? 0,
          total_due: (daysPresent ?? 0) * ratePerDay,
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
  }, [tenantId, periodStart, periodEnd, periodStartStr]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  const generateInvoice = async (row: StudentBillingRow) => {
    if (!tenantId) return;
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
    setPaymentAmount(row.total_due.toString());
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
      const { error } = await supabase.from('payments').insert({
        invoice_id: selectedInvoice.existing_invoice_id,
        student_id: selectedInvoice.student_id,
        tenant_id: tenantId,
        amount: amount,
        method: paymentMethod,
        notes: paymentNotes,
        logged_by: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) throw error;
      
      Alert.alert('Success', 'Payment recorded successfully!');
      setPaymentModalVisible(false);
      await fetchBilling();

      // Ask if they want to send a receipt
      Alert.alert(
        'Send Receipt?',
        'Would you like to send a payment receipt via WhatsApp?',
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Yes, Send Receipt', 
            onPress: () => shareReceiptViaWhatsApp(selectedInvoice, amount)
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const generateAllInvoices = async () => {
    Alert.alert(
      'Generate All Invoices',
      `Generate invoices for all ${rows.filter((r) => !r.existing_invoice_id).length} students without an invoice this month?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate All',
          onPress: async () => {
            setGeneratingAll(true);
            for (const row of rows.filter((r) => !r.existing_invoice_id)) {
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
    const message =
      `*MessTrack Invoice 🧾*\n` +
      `Student: ${row.student_name}\n` +
      `Period: ${periodLabel}\n` +
      `Plan: ${row.plan_name}\n` +
      `Days Present: ${row.days_present_this_month}\n` +
      `Rate/Day: ₹${row.rate_per_day.toFixed(0)}\n` +
      `*Total Due: ₹${row.total_due.toFixed(0)}*\n\n` +
      `Please make your payment at the earliest. Thank you! 🙏`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp not found', 'Please install WhatsApp to use this feature.');
    });
  };

  const shareReceiptViaWhatsApp = (row: StudentBillingRow, amountPaid: number) => {
    const message =
      `*Payment Receipt ✅*\n` +
      `Student: ${row.student_name}\n` +
      `Amount Received: ₹${amountPaid.toFixed(0)}\n` +
      `Method: ${paymentMethod.toUpperCase()}\n` +
      `Thank you for your payment! 🙏`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp not found', 'Please install WhatsApp to use this feature.');
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
          meal_sessions ( meal_type, session_date ),
          students ( name, email, phone )
        `)
        .eq('tenant_id', tenantId)
        .gte('scanned_at', periodStart.toISOString())
        .lte('scanned_at', periodEnd.toISOString())
        .order('scanned_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert('No Data', 'No attendance records found for this month.');
        return;
      }

      let csvStr = 'Date,Time,Student Name,Email,Phone,Meal Type,Status\n';
      data.forEach((row: any) => {
        const date = new Date(row.scanned_at);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        const student = row.students || {};
        const session = row.meal_sessions || {};
        
        const safeName = `"${(student.name || '').replace(/"/g, '""')}"`;
        const safeEmail = `"${(student.email || '').replace(/"/g, '""')}"`;
        const safePhone = `"${(student.phone || '').replace(/"/g, '""')}"`;
        
        csvStr += `${dateStr},${timeStr},${safeName},${safeEmail},${safePhone},${session.meal_type},${row.status}\n`;
      });

      const fileName = `Attendance_${periodStartStr}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, csvStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Download Monthly Attendance Report',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalDue = rows.reduce((sum, r) => sum + (r.existing_invoice_id ? 0 : r.total_due), 0);
  const invoiceCount = rows.filter((r) => r.existing_invoice_id).length;

  const statusColor = (s: string | null) => {
    if (s === 'paid') return Colors.success;
    if (s === 'overdue') return Colors.error;
    if (s === 'sent') return Colors.warning;
    return Colors.textMuted;
  };

  const renderRow = ({ item }: { item: StudentBillingRow }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.student_name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.student_name}</Text>
          <Text style={styles.email} numberOfLines={1}>{item.student_email}</Text>
          <Text style={styles.plan}>📋 {item.plan_name}</Text>
        </View>
        <View style={styles.amountBox}>
          <Text style={styles.amount}>₹{item.total_due.toFixed(0)}</Text>
          <Text style={styles.amountSub}>{item.days_present_this_month} days × ₹{item.rate_per_day.toFixed(0)}</Text>
        </View>
      </View>

      {item.existing_invoice_id ? (
        <View style={styles.invoicedRow}>
          <View style={[styles.invoicedBadge, { borderColor: statusColor(item.invoice_status) }]}>
            <Text style={[styles.invoicedText, { color: statusColor(item.invoice_status) }]}>
              Invoice {item.invoice_status?.toUpperCase()}
            </Text>
          </View>
          {item.invoice_status !== 'paid' && (
            <TouchableOpacity
              style={styles.collectBtn}
              onPress={() => openPaymentModal(item)}
            >
              <Text style={styles.collectBtnText}>💰 Collect</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={() => shareViaWhatsApp(item)}
          >
            <Text style={styles.whatsappBtnText}>📲</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.invoicedRow}>
          <TouchableOpacity
            style={[styles.generateBtn, { flex: 1 }]}
            onPress={() => generateInvoice(item)}
            disabled={generatingId === item.student_id}
          >
            {generatingId === item.student_id ? (
              <ActivityIndicator color={Colors.text} size="small" />
            ) : (
              <Text style={styles.generateBtnText}>🧾 Generate Invoice</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={() => shareViaWhatsApp(item)}
          >
            <Text style={styles.whatsappBtnText}>📲</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );


  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{rows.length}</Text>
          <Text style={styles.summaryLabel}>Students</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: Colors.warning }]}>₹{totalDue.toFixed(0)}</Text>
          <Text style={styles.summaryLabel}>Pending Collection</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>{invoiceCount}</Text>
          <Text style={styles.summaryLabel}>Invoiced</Text>
        </View>
      </View>

      {/* Period label */}
      <View style={styles.periodBar}>
        <Text style={styles.periodText}>
          📅 Billing Period: {periodStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {periodEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      </View>

      {/* Action Bar */}
      <View style={styles.periodBar}>
        <TouchableOpacity
          style={[styles.generateAllBtn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}
          onPress={exportCSV}
        >
          <Text style={[styles.generateAllText, { color: Colors.text }]}>📥 Export CSV</Text>
        </TouchableOpacity>

        {rows.some((r) => !r.existing_invoice_id) && (
          <TouchableOpacity
            style={styles.generateAllBtn}
            onPress={generateAllInvoices}
            disabled={generatingAll}
          >
            {generatingAll ? (
              <ActivityIndicator color={Colors.text} size="small" />
            ) : (
              <Text style={styles.generateAllText}>Generate All Invoices</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.student_id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBilling(); }} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyText}>No active subscriptions</Text>
            </View>
          }
        />
      )}

      {/* Payment Collection Modal */}
      <Modal visible={paymentModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Collect Payment</Text>
            <Text style={styles.modalSubtitle}>Student: {selectedInvoice?.student_name}</Text>
            
            <Input
              label="Amount Received (₹)"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.methodRow}>
              {['cash', 'upi', 'bank_transfer'].map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[styles.methodBtn, paymentMethod === method && styles.methodBtnActive]}
                  onPress={() => setPaymentMethod(method as any)}
                >
                  <Text style={[styles.methodText, paymentMethod === method && styles.methodTextActive]}>
                    {method.toUpperCase().replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Notes (Optional)"
              value={paymentNotes}
              onChangeText={setPaymentNotes}
              placeholder="e.g. Cleared pending dues"
            />
            
            <View style={styles.modalActions}>
              <Button 
                title="Cancel" 
                variant="outline" 
                style={{ flex: 1, marginRight: Spacing.sm }} 
                onPress={() => setPaymentModalVisible(false)} 
              />
              <Button 
                title="Save Payment" 
                style={{ flex: 1, marginLeft: Spacing.sm }} 
                onPress={submitPayment} 
                isLoading={submittingPayment} 
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
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    ...Shadows.soft,
    marginBottom: Spacing.sm,
  },
  summaryCard: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  periodText: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1 },
  generateAllBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    minWidth: 90,
    alignItems: 'center',
  },
  generateAllText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: Spacing.md, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    ...Shadows.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  email: { fontSize: FontSize.xs, color: Colors.textMuted },
  plan: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  amountBox: { alignItems: 'flex-end' },
  amount: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.text },
  amountSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  generateBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  generateBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  invoicedBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  invoicedText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  invoicedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappBtnText: { color: '#ffffff', fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  collectBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  empty: { alignItems: 'center', paddingTop: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.lg, color: Colors.textMuted },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  modalContent: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, ...Shadows.large },
  modalTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: Spacing.xs },
  modalSubtitle: { color: Colors.textSecondary, fontSize: FontSize.md, marginBottom: Spacing.lg },
  label: { color: Colors.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginBottom: Spacing.sm },
  methodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  methodBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  methodBtnActive: { backgroundColor: Colors.primary + '33', borderColor: Colors.primary },
  methodText: { color: Colors.text, fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  methodTextActive: { color: Colors.primary },
  modalActions: { flexDirection: 'row', marginTop: Spacing.md },
});
