// ============================================================
// MessTrack — Database Types
// ============================================================

export type UserRole = 'super_admin' | 'mess_admin' | 'student';

export interface Profile {
  id: string;
  role: UserRole;
  tenant_id: string | null;
  name: string;
  email: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  owner_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  meal_types: string[];
  is_active: boolean;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tenant_id: string;
  name: string;
  duration_days: number;
  price: number;
  days_included: number;
  meal_types: string[];
  is_active: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string | null;
  gender: 'male' | 'female' | 'other' | null;
  photo_url: string | null;
  email: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  student_id: string;
  plan_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
  amount_paid: number;
  created_at: string;
}

export interface MealSession {
  id: string;
  tenant_id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  session_date: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'active' | 'ended';
  created_at: string;
}

export interface QRToken {
  id: string;
  meal_session_id: string;
  token: string;
  issued_at: string;
  expires_at: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  meal_session_id: string;
  tenant_id: string;
  qr_token_id: string | null;
  scanned_at: string;
  geo_lat: number | null;
  geo_lng: number | null;
  photo_audit_url: string | null;
  status: 'present' | 'absent' | 'leave';
  synced_offline: boolean;
}

export interface AttendanceAdjustment {
  id: string;
  attendance_record_id: string;
  adjusted_by_admin_id: string;
  reason: string;
  action: 'mark_present' | 'mark_absent' | 'mark_leave' | 'override';
  created_at: string;
}

export interface Invoice {
  id: string;
  student_id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  days_present: number;
  rate_per_day: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  generated_at: string;
}

// Offline scan queue item stored in AsyncStorage
export interface OfflineScanQueueItem {
  id: string; // local UUID
  token: string;
  scanned_at: string;
  geo_lat: number | null;
  geo_lng: number | null;
  retries: number;
  created_at: string;
}
