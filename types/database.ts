export type UserRole = 'super_admin' | 'gym_owner' | 'manager' | 'receptionist'
export type GymStatus = 'active' | 'suspended' | 'pending' | 'inactive'
export type GenderType = 'male' | 'female' | 'other'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_wallet'

// audit_log.details is JSONB in the live database (not TEXT)
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Gym {
  id: string
  name: string
  owner_email: string
  owner_name: string
  phone?: string
  address?: string
  currency: string
  status: GymStatus
  expires_at?: string | null
  license_key?: string | null
  device_id?: string | null
  last_seen_at?: string | null
  created_at: string
  updated_at: string
  suspended_at?: string
  suspended_reason?: string
}

export interface User {
  id: string
  gym_id: string
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
}

// Plans are never hard-deleted: "remove" sets is_active = false
export interface Plan {
  id: string
  gym_id: string
  name: string
  duration_months: number
  price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Member {
  id: string
  gym_id: string
  code: string
  name: string
  phone?: string
  email?: string
  gender?: GenderType
  address?: string
  date_of_birth?: string
  join_date: string
  plan_id?: string
  expiry_date?: string
  notes?: string
  is_active: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  gym_id: string
  member_id: string
  plan_id?: string
  receipt_no: string
  amount: number
  payment_method: PaymentMethod
  paid_at: string
  note?: string
  recorded_by?: string
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  gym_id: string
  member_id: string
  check_in: string
  check_out?: string | null
  // Soft delete: set instead of removing the row so the desktop app can sync it
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  gym_id: string
  category: string
  amount: number
  spent_on: string
  note?: string
  recorded_by?: string
  // Soft delete: set instead of removing the row so the desktop app can sync it
  deleted_at?: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  gym_id?: string
  user_id?: string
  action: string
  details?: Json | null
  ip_address?: string
  user_agent?: string
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  activeMembers: number
  expiredMembers: number
  visitsToday: number
  insideNow: number
  revenueThisMonth: number
  expensesThisMonth: number
  expiringIn7Days: number
}

// Results of the database functions (see phase1 SQL)
export interface RenewMemberResult {
  payment_id: string
  receipt_no: string
  expiry_date: string
}

export interface CreateMemberResult {
  member_id: string
  code: string
  receipt_no: string | null
  expiry_date: string | null
}

export interface MemberStats {
  total: number
  active: number
  expired: number
  expiring_7d: number
}

export interface PaymentsSummary {
  total: number
  count: number
}