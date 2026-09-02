-- ============================================================================
-- MODULE 06: PERFORMANCE INDEXES (FAST FILTERING & SOFT DELETES)
-- ============================================================================

-- Soft Delete Filter Indexes
CREATE INDEX IF NOT EXISTS idx_properties_deleted ON public.properties(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_deleted ON public.units(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_renters_deleted ON public.renters(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bills_deleted ON public.bills(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted ON public.payments(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON public.expenses(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawals_deleted ON public.owner_withdrawals(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON public.documents(deleted_at) WHERE deleted_at IS NULL;

-- Business Foreign Key & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_renters_unit ON public.renters(unit_id);
CREATE INDEX IF NOT EXISTS idx_renters_owner ON public.renters(owner_id);
CREATE INDEX IF NOT EXISTS idx_renters_user_id ON public.renters(user_id);
CREATE INDEX IF NOT EXISTS idx_renters_mobile ON public.renters(mobile_number);
CREATE INDEX IF NOT EXISTS idx_renters_email ON public.renters(email);

CREATE INDEX IF NOT EXISTS idx_bills_renter ON public.bills(renter_id);
CREATE INDEX IF NOT EXISTS idx_bills_billing_period ON public.bills(billing_period);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);

CREATE INDEX IF NOT EXISTS idx_payments_bill ON public.payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_renter ON public.payments(renter_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
