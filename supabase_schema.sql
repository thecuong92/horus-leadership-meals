-- ============================================================================
-- HORUS LEADERSHIP MEALS — PostgreSQL / Supabase Schema (v1.0)
-- ============================================================================

-- 1. Bảng lưu trữ trạng thái đồng bộ Cloud nhanh (Dành cho Web App Sync)
CREATE TABLE IF NOT EXISTS public.horus_app_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    state_json JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    last_commit_message TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Các bảng quan hệ chuẩn theo Mục 8 PRD (Horus_Leadership_Meals_PRD_v1.0.md)
CREATE TABLE IF NOT EXISTS public.members (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    member_type TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (member_type IN ('EMPLOYEE', 'GUEST')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.programs (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    schedule_desc TEXT,
    reimbursement_policy_pct INTEGER NOT NULL DEFAULT 100,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.program_memberships (
    id TEXT PRIMARY KEY,
    program_id TEXT NOT NULL REFERENCES public.programs(id),
    member_id TEXT NOT NULL REFERENCES public.members(id),
    start_date DATE NOT NULL,
    end_date DATE,
    CONSTRAINT chk_membership_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.meal_sessions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    program_id TEXT NOT NULL REFERENCES public.programs(id),
    occurred_at TIMESTAMPTZ NOT NULL,
    venue TEXT NOT NULL,
    total_paid_vnd BIGINT NOT NULL CHECK (total_paid_vnd >= 0),
    payer_member_id TEXT NOT NULL REFERENCES public.members(id),
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOIDED')),
    allocation_method TEXT NOT NULL DEFAULT 'EQUAL' CHECK (allocation_method IN ('EQUAL', 'MANUAL', 'WEIGHTED')),
    has_invoice BOOLEAN NOT NULL DEFAULT FALSE,
    rejection_reason TEXT,
    created_by TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.meal_attendance (
    meal_id TEXT NOT NULL REFERENCES public.meal_sessions(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES public.members(id),
    attended BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (meal_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.meal_cost_allocations (
    meal_id TEXT NOT NULL REFERENCES public.meal_sessions(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES public.members(id),
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd >= 0),
    weight NUMERIC(10, 2) DEFAULT 1,
    allocation_method TEXT NOT NULL DEFAULT 'EQUAL',
    PRIMARY KEY (meal_id, member_id)
);

CREATE TABLE IF NOT EXISTS public.meal_attachments (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL REFERENCES public.meal_sessions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('PAYMENT_PROOF', 'INVOICE')),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    data_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reimbursement_batches (
    id TEXT PRIMARY KEY,
    batch_code TEXT UNIQUE NOT NULL,
    payer_member_id TEXT NOT NULL REFERENCES public.members(id),
    status TEXT NOT NULL,
    note TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reimbursement_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES public.reimbursement_batches(id) ON DELETE CASCADE,
    meal_id TEXT NOT NULL REFERENCES public.meal_sessions(id),
    claimed_amount_vnd BIGINT NOT NULL CHECK (claimed_amount_vnd > 0),
    UNIQUE (batch_id, meal_id)
);

CREATE TABLE IF NOT EXISTS public.reimbursement_payments (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES public.reimbursement_batches(id) ON DELETE CASCADE,
    payer_member_id TEXT NOT NULL REFERENCES public.members(id),
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    paid_at TIMESTAMPTZ NOT NULL,
    reference TEXT NOT NULL,
    note TEXT,
    confirmed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    actor_role TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL,
    before_json JSONB,
    after_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_occurred_at ON public.meal_sessions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_meals_program_id ON public.meal_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_meals_payer_id ON public.meal_sessions(payer_member_id);
CREATE INDEX IF NOT EXISTS idx_meals_status ON public.meal_sessions(status);
