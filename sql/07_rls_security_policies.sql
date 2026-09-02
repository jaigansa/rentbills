-- ============================================================================
-- MODULE 07: ROW LEVEL SECURITY (RLS) & TENANT ISOLATION POLICIES
-- ============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 2. Security Function: Check if caller is Administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();

  -- If explicitly ADMIN role in profiles
  IF v_role = 'ADMIN' THEN
    RETURN TRUE;
  END IF;

  -- If no ADMIN exists anywhere in profiles, auto-promote first registered user
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'ADMIN') THEN
    UPDATE public.profiles SET role = 'ADMIN' WHERE id = auth.uid();
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. PROFILES POLICIES
CREATE POLICY "Admins full access to profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 4. OWNERS POLICIES (Landlord bank details protected)
CREATE POLICY "Admins full access to owners" ON public.owners FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view assigned owner" ON public.owners FOR SELECT TO authenticated USING (
  id IN (
    SELECT owner_id FROM public.renters 
    WHERE (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
      AND deleted_at IS NULL
  )
);

-- 5. PROPERTIES & UNITS POLICIES
CREATE POLICY "Admins full access to properties" ON public.properties FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view property" ON public.properties FOR SELECT TO authenticated USING (
  id IN (
    SELECT u.property_id FROM public.units u
    JOIN public.renters r ON r.unit_id = u.id
    WHERE (r.user_id = auth.uid() OR (r.email IS NOT NULL AND LOWER(r.email) = LOWER(auth.email())))
      AND r.deleted_at IS NULL
  )
);

CREATE POLICY "Admins full access to units" ON public.units FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view assigned unit" ON public.units FOR SELECT TO authenticated USING (
  id IN (
    SELECT unit_id FROM public.renters 
    WHERE (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
      AND deleted_at IS NULL
  )
);

-- 6. RENTERS POLICIES
CREATE POLICY "Admins full access to renters" ON public.renters FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view own lease" ON public.renters FOR SELECT TO authenticated USING (
  (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
  AND deleted_at IS NULL
);

-- 7. BILLS POLICIES
CREATE POLICY "Admins full access to bills" ON public.bills FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view own bills" ON public.bills FOR SELECT TO authenticated USING (
  renter_id IN (
    SELECT id FROM public.renters 
    WHERE (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
      AND deleted_at IS NULL
  )
  AND deleted_at IS NULL
);

-- 8. PAYMENTS POLICIES (Receipts & Proof Upload)
CREATE POLICY "Admins full access to payments" ON public.payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Tenants view own payments" ON public.payments FOR SELECT TO authenticated USING (
  renter_id IN (
    SELECT id FROM public.renters 
    WHERE (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
      AND deleted_at IS NULL
  )
  AND deleted_at IS NULL
);
CREATE POLICY "Tenants submit payment proof" ON public.payments FOR INSERT TO authenticated WITH CHECK (
  proof_status = 'PENDING' AND
  renter_id IN (
    SELECT id FROM public.renters 
    WHERE (user_id = auth.uid() OR (email IS NOT NULL AND LOWER(email) = LOWER(auth.email())))
      AND deleted_at IS NULL
  )
);

-- 9. EXPENSES, WITHDRAWALS & DOCUMENTS
CREATE POLICY "Admins full access to expenses" ON public.expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins full access to withdrawals" ON public.owner_withdrawals FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins full access to documents" ON public.documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 10. Storage Bucket Setup & Policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('proofs', 'proofs', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE 'CREATE POLICY "Authenticated upload proofs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''proofs'');';
    EXECUTE 'CREATE POLICY "Authenticated view proofs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = ''proofs'');';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;
