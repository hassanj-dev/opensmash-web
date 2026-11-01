export type UserRole = 'super_admin' | 'gym_owner' | 'manager' | 'receptionist'
export type GymStatus = 'active' | 'suspended' | 'pending' | 'inactive'
export type GenderType = 'male' | 'female' | 'other'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_wallet'

// audit_log.details is JSONB in the live database (not TEXT)
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// What ordinary staff may read from the gyms table.
// license_key, device_id and last_seen_at are hidden by column grants (02_hide_license_key.sql).
export interface PublicGym {
  id: string
  name: string
  owner_email: string
  owner_name: string
  phone: string | null
  address: string | null
  currency: string
  status: GymStatus
  expires_at: string | null
  created_at: string
  updated_at: string
  suspended_at: string | null
  suspended_reason: string | null
}

// Everything, only for super admin (admin_list_gyms()) and the owner's my_license_key()
export interface AdminGym extends PublicGym {
  license_key: string | null
  device_id: string | null
  last_seen_at: string | null
}

// Old name kept so existing imports keep compiling; use PublicGym / AdminGym in new code
export type Gym = PublicGym

export interface User {
  id: string
  // super_admin has no gym
  gym_id: string | null
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  must_change_password: boolean
  avatar_url: string | null
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
  phone: string | null
  email: string | null
  gender: GenderType | null
  address: string | null
  date_of_birth: string | null
  join_date: string
  plan_id: string | null
  expiry_date: string | null
  notes: string | null
  is_active: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  gym_id: string
  member_id: string
  plan_id: string | null
  receipt_no: string
  amount: number
  payment_method: PaymentMethod
  paid_at: string
  note: string | null
  recorded_by: string | null
  // Soft delete: only the gym owner (or super admin) may set it
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  gym_id: string
  member_id: string
  check_in: string
  check_out: string | null
  // Soft delete: set instead of removing the row so the desktop app can sync it
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  gym_id: string
  category: string
  amount: number
  spent_on: string
  note: string | null
  recorded_by: string | null
  // Soft delete: set instead of removing the row so the desktop app can sync it
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  gym_id: string | null
  user_id: string | null
  action: string
  details: Json | null
  ip_address: string | null
  user_agent: string | null
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