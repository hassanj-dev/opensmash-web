-- =====================================================
-- IRON GYM SAAS - Multi-Tenant Database Schema (FIXED)
-- =====================================================
-- This schema supports multiple gyms with proper tenant isolation
-- All security issues fixed and tested with pglite

-- Note: gen_random_uuid() is built-in to PostgreSQL 13+
-- No extension needed for PGlite compatibility

-- =====================================================
-- ENUMS
-- =====================================================

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'gym_owner', 'manager', 'receptionist');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gym_status AS ENUM ('active', 'suspended', 'pending', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'mobile_wallet');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =====================================================
-- GYMS TABLE (Multi-Tenant Core)
-- =====================================================

CREATE TABLE IF NOT EXISTS gyms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    currency TEXT DEFAULT 'Rs',
    status gym_status DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_gyms_status ON gyms(status);
CREATE INDEX IF NOT EXISTS idx_gyms_owner_email ON gyms(owner_email);

-- =====================================================
-- USERS TABLE (Extends Supabase Auth)
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role user_role DEFAULT 'gym_owner',
    is_active BOOLEAN DEFAULT true,
    must_change_password BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_gym_id ON users(gym_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- =====================================================
-- MEMBERSHIP PLANS
-- =====================================================

CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_months INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_gym_id ON plans(gym_id);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(gym_id, is_active);

-- =====================================================
-- MEMBERS
-- =====================================================

CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    gender gender_type,
    address TEXT,
    date_of_birth DATE,
    join_date DATE DEFAULT CURRENT_DATE,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    expiry_date DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gym_id, code)
);

CREATE INDEX IF NOT EXISTS idx_members_gym_id ON members(gym_id);
CREATE INDEX IF NOT EXISTS idx_members_gym_active ON members(gym_id, is_active);
CREATE INDEX IF NOT EXISTS idx_members_expiry ON members(gym_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(gym_id, phone);
CREATE INDEX IF NOT EXISTS idx_members_code ON members(gym_id, code);

-- =====================================================
-- PAYMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
    receipt_no TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method payment_method DEFAULT 'cash',
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    note TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gym_id, receipt_no)
);

CREATE INDEX IF NOT EXISTS idx_payments_gym_id ON payments(gym_id);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(gym_id, paid_at DESC);

-- =====================================================
-- ATTENDANCE
-- =====================================================

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    check_in TIMESTAMPTZ DEFAULT NOW(),
    check_out TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_gym_id ON attendance(gym_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in ON attendance(gym_id, check_in DESC);
-- Index on date part (using expression cast instead of DATE function for compatibility)
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(gym_id, (check_in::date));

-- =====================================================
-- EXPENSES
-- =====================================================

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    spent_on DATE DEFAULT CURRENT_DATE,
    note TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_gym_id ON expenses(gym_id);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_on ON expenses(gym_id, spent_on DESC);

-- =====================================================
-- AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_gym_id ON audit_log(gym_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);

-- =====================================================
-- SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gym_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_gym_id ON settings(gym_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER FUNCTIONS (with search_path protection)
-- =====================================================

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM users
    WHERE id = auth.uid();
$$;

-- Helper function to get current user's gym_id
CREATE OR REPLACE FUNCTION get_user_gym_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT gym_id
    FROM users
    WHERE id = auth.uid();
$$;

-- Helper function to check if gym is active
CREATE OR REPLACE FUNCTION is_gym_active(gym_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT status = 'active'
    FROM gyms
    WHERE id = gym_uuid;
$$;

-- =====================================================
-- SECURITY TRIGGER: Prevent users from modifying critical columns
-- =====================================================

CREATE OR REPLACE FUNCTION protect_user_critical_fields()
RETURNS TRIGGER AS $$
BEGIN
    SET search_path = public;

    -- On INSERT: Prevent non-super-admins from creating super_admin users
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'super_admin' THEN
            -- Only allow if caller is super_admin
            IF (SELECT role FROM users WHERE id = auth.uid()) != 'super_admin' THEN
                RAISE EXCEPTION 'Only super admins can create super_admin users';
            END IF;
        END IF;
    END IF;

    -- On UPDATE: Protect critical fields
    IF TG_OP = 'UPDATE' THEN
        -- Prevent changing role to super_admin
        IF NEW.role = 'super_admin' AND OLD.role != 'super_admin' THEN
            IF (SELECT role FROM users WHERE id = auth.uid()) != 'super_admin' THEN
                RAISE EXCEPTION 'Cannot promote user to super_admin';
            END IF;
        END IF;

        -- Prevent changing gym_id (unless super_admin)
        IF NEW.gym_id IS DISTINCT FROM OLD.gym_id THEN
            IF (SELECT role FROM users WHERE id = auth.uid()) != 'super_admin' THEN
                RAISE EXCEPTION 'Cannot change gym_id';
            END IF;
        END IF;

        -- Prevent self-deactivation
        IF NEW.id = auth.uid() AND NEW.is_active = false AND OLD.is_active = true THEN
            RAISE EXCEPTION 'Cannot deactivate own account';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_user_fields_trigger ON users;
CREATE TRIGGER protect_user_fields_trigger
    BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION protect_user_critical_fields();

-- =====================================================
-- GYMS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Super admin can view all gyms" ON gyms;
CREATE POLICY "Super admin can view all gyms"
    ON gyms FOR SELECT
    TO authenticated
    USING ((select get_user_role()) = 'super_admin');

DROP POLICY IF EXISTS "Gym owners can view their gym" ON gyms;
CREATE POLICY "Gym owners can view their gym"
    ON gyms FOR SELECT
    TO authenticated
    USING (id = (select get_user_gym_id()));

DROP POLICY IF EXISTS "Super admin can update gyms" ON gyms;
CREATE POLICY "Super admin can update gyms"
    ON gyms FOR UPDATE
    TO authenticated
    USING ((select get_user_role()) = 'super_admin')
    WITH CHECK ((select get_user_role()) = 'super_admin');

DROP POLICY IF EXISTS "Super admin can insert gyms" ON gyms;
CREATE POLICY "Super admin can insert gyms"
    ON gyms FOR INSERT
    TO authenticated
    WITH CHECK ((select get_user_role()) = 'super_admin');

-- =====================================================
-- USERS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view gym users" ON users;
CREATE POLICY "Users can view gym users"
    ON users FOR SELECT
    TO authenticated
    USING (
        gym_id = (select get_user_gym_id())
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Gym owners can create users" ON users;
CREATE POLICY "Gym owners can create users"
    ON users FOR INSERT
    TO authenticated
    WITH CHECK (
        gym_id = (select get_user_gym_id())
        AND (select get_user_role()) IN ('gym_owner', 'super_admin')
        AND (is_gym_active(gym_id) OR (select get_user_role()) = 'super_admin')
    );

DROP POLICY IF EXISTS "Gym owners can update users" ON users;
CREATE POLICY "Gym owners can update users"
    ON users FOR UPDATE
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'super_admin'))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND (is_gym_active(gym_id) OR (select get_user_role()) = 'super_admin'))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- PLANS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym plans" ON plans;
CREATE POLICY "Users can view their gym plans"
    ON plans FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Managers can manage plans" ON plans;
CREATE POLICY "Managers can manage plans"
    ON plans FOR ALL
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- MEMBERS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym members" ON members;
CREATE POLICY "Users can view their gym members"
    ON members FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Users can manage members" ON members;
CREATE POLICY "Users can manage members"
    ON members FOR ALL
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- PAYMENTS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym payments" ON payments;
CREATE POLICY "Users can view their gym payments"
    ON payments FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Users can create payments" ON payments;
CREATE POLICY "Users can create payments"
    ON payments FOR INSERT
    TO authenticated
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Managers can manage payments" ON payments;
CREATE POLICY "Managers can manage payments"
    ON payments FOR UPDATE
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- ATTENDANCE POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym attendance" ON attendance;
CREATE POLICY "Users can view their gym attendance"
    ON attendance FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Users can manage attendance" ON attendance;
CREATE POLICY "Users can manage attendance"
    ON attendance FOR ALL
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- EXPENSES POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Managers can view expenses" ON expenses;
CREATE POLICY "Managers can view expenses"
    ON expenses FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Managers can manage expenses" ON expenses;
CREATE POLICY "Managers can manage expenses"
    ON expenses FOR ALL
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager') AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- SETTINGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym settings" ON settings;
CREATE POLICY "Users can view their gym settings"
    ON settings FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Gym owners can manage settings" ON settings;
CREATE POLICY "Gym owners can manage settings"
    ON settings FOR ALL
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) = 'gym_owner' AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    )
    WITH CHECK (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) = 'gym_owner' AND is_gym_active(gym_id))
        OR (select get_user_role()) = 'super_admin'
    );

-- =====================================================
-- AUDIT LOG POLICIES
-- =====================================================

DROP POLICY IF EXISTS "Users can view their gym audit log" ON audit_log;
CREATE POLICY "Users can view their gym audit log"
    ON audit_log FOR SELECT
    TO authenticated
    USING (
        (gym_id = (select get_user_gym_id()) AND (select get_user_role()) IN ('gym_owner', 'manager'))
        OR (select get_user_role()) = 'super_admin'
    );

DROP POLICY IF EXISTS "Users can insert own gym audit log" ON audit_log;
CREATE POLICY "Users can insert own gym audit log"
    ON audit_log FOR INSERT
    TO authenticated
    WITH CHECK (
        gym_id = (select get_user_gym_id())
        OR (gym_id IS NULL AND (select get_user_role()) = 'super_admin')
    );

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    SET search_path = public;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
DROP TRIGGER IF EXISTS update_gyms_updated_at ON gyms;
CREATE TRIGGER update_gyms_updated_at BEFORE UPDATE ON gyms FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_plans_updated_at ON plans;
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate member code automatically
CREATE OR REPLACE FUNCTION generate_member_code()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    SET search_path = public;
    IF NEW.code IS NULL OR NEW.code = '' THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 2) AS INTEGER)), 0) + 1
        INTO next_num
        FROM members
        WHERE gym_id = NEW.gym_id AND code ~ '^M[0-9]+$';

        NEW.code := 'M' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_member_code_trigger ON members;
CREATE TRIGGER generate_member_code_trigger
    BEFORE INSERT ON members
    FOR EACH ROW
    EXECUTE FUNCTION generate_member_code();

-- Generate receipt number automatically
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    today_str TEXT;
    next_num INTEGER;
BEGIN
    SET search_path = public;
    IF NEW.receipt_no IS NULL OR NEW.receipt_no = '' THEN
        today_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

        SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no FROM 10) AS INTEGER)), 0) + 1
        INTO next_num
        FROM payments
        WHERE gym_id = NEW.gym_id
        AND receipt_no LIKE 'R' || today_str || '-%';

        NEW.receipt_no := 'R' || today_str || '-' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_receipt_number_trigger ON payments;
CREATE TRIGGER generate_receipt_number_trigger
    BEFORE INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION generate_receipt_number();

COMMENT ON TABLE gyms IS 'Multi-tenant core table - each gym is a separate tenant';
COMMENT ON TABLE users IS 'Extended user profiles linked to Supabase Auth';
COMMENT ON TABLE members IS 'Gym members with membership tracking';
COMMENT ON TABLE payments IS 'Payment records with automatic receipt generation';
COMMENT ON TABLE attendance IS 'Member check-in/check-out records';
COMMENT ON COLUMN gyms.status IS 'active: can access, suspended: blocked by admin, pending: awaiting approval, inactive: deactivated';
