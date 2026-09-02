-- ============================================================================
-- MODULE 14: MULTI-ROLE EXPANSION (STAFF & AUDITOR ROLES)
-- ============================================================================

-- 1. Expand Role Check Constraint on public.profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ADMIN', 'TENANT', 'STAFF', 'AUDITOR'));

-- 2. Pure Helper Functions for New Roles
CREATE OR REPLACE FUNCTION public.is_auditor()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role = 'AUDITOR', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role = 'STAFF', FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. AUDITOR ROLE RLS POLICIES (Read-Only Access Across All Application Tables)
DROP POLICY IF EXISTS "Auditors view properties" ON public.properties;
CREATE POLICY "Auditors view properties" ON public.properties FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view units" ON public.units;
CREATE POLICY "Auditors view units" ON public.units FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view renters" ON public.renters;
CREATE POLICY "Auditors view renters" ON public.renters FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view owners" ON public.owners;
CREATE POLICY "Auditors view owners" ON public.owners FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view bills" ON public.bills;
CREATE POLICY "Auditors view bills" ON public.bills FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view payments" ON public.payments;
CREATE POLICY "Auditors view payments" ON public.payments FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view expenses" ON public.expenses;
CREATE POLICY "Auditors view expenses" ON public.expenses FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view owner_withdrawals" ON public.owner_withdrawals;
CREATE POLICY "Auditors view owner_withdrawals" ON public.owner_withdrawals FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view documents" ON public.documents;
CREATE POLICY "Auditors view documents" ON public.documents FOR SELECT TO authenticated USING (public.is_auditor());

DROP POLICY IF EXISTS "Auditors view maintenance_tasks" ON public.maintenance_tasks;
CREATE POLICY "Auditors view maintenance_tasks" ON public.maintenance_tasks FOR SELECT TO authenticated USING (public.is_auditor());

-- 4. STAFF ROLE RLS POLICIES (Work Orders View & Update Access)
DROP POLICY IF EXISTS "Staff view properties" ON public.properties;
CREATE POLICY "Staff view properties" ON public.properties FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff view units" ON public.units;
CREATE POLICY "Staff view units" ON public.units FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff view renters" ON public.renters;
CREATE POLICY "Staff view renters" ON public.renters FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff view maintenance_tasks" ON public.maintenance_tasks;
CREATE POLICY "Staff view maintenance_tasks" ON public.maintenance_tasks FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Staff update maintenance_tasks" ON public.maintenance_tasks;
CREATE POLICY "Staff update maintenance_tasks" ON public.maintenance_tasks FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 5. RPC Functions for Staff and Auditor Account Creation
CREATE OR REPLACE FUNCTION public.admin_create_staff_user(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT DEFAULT 'Technician'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can create staff accounts.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmed_at = COALESCE(confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_user_id;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, p_username, p_email, 'STAFF')
    ON CONFLICT (id) DO UPDATE SET role = 'STAFF', username = EXCLUDED.username;
  ELSE
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', p_email, v_encrypted_pw, NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'STAFF', 'username', p_username),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email),
        'email', p_email, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, p_username, p_email, 'STAFF')
    ON CONFLICT (id) DO UPDATE SET role = 'STAFF';
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_auditor_user(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT DEFAULT 'Auditor'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can create auditor accounts.';
  END IF;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmed_at = COALESCE(confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_user_id;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, p_username, p_email, 'AUDITOR')
    ON CONFLICT (id) DO UPDATE SET role = 'AUDITOR', username = EXCLUDED.username;
  ELSE
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', p_email, v_encrypted_pw, NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'AUDITOR', 'username', p_username),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email),
        'email', p_email, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, p_username, p_email, 'AUDITOR')
    ON CONFLICT (id) DO UPDATE SET role = 'AUDITOR';
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$$;

-- 6. Provision Default Auditor & Staff Seed Accounts
DO $$
DECLARE
  v_staff_id UUID := '00000000-0000-0000-0000-000000000002';
  v_staff_email TEXT := 'staff@rentbill.com';
  v_auditor_id UUID := '00000000-0000-0000-0000-000000000003';
  v_auditor_email TEXT := 'auditor@rentbill.com';
BEGIN
  -- Provision Staff Account
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_staff_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_staff_id, '00000000-0000-0000-0000-000000000000', v_staff_email,
      extensions.crypt('Staff@123', extensions.gen_salt('bf')),
      NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'STAFF', 'username', 'Maintenance Staff'),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_staff_id, jsonb_build_object('sub', v_staff_id::text, 'email', v_staff_email),
        'email', v_staff_email, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_staff_id, 'Maintenance Staff', v_staff_email, 'STAFF')
    ON CONFLICT (id) DO UPDATE SET role = 'STAFF';
  END IF;

  -- Provision Auditor Account
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_auditor_email) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_auditor_id, '00000000-0000-0000-0000-000000000000', v_auditor_email,
      extensions.crypt('Auditor@123', extensions.gen_salt('bf')),
      NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'AUDITOR', 'username', 'Financial Auditor'),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_auditor_id, jsonb_build_object('sub', v_auditor_id::text, 'email', v_auditor_email),
        'email', v_auditor_email, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_auditor_id, 'Financial Auditor', v_auditor_email, 'AUDITOR')
    ON CONFLICT (id) DO UPDATE SET role = 'AUDITOR';
  END IF;
END $$;

-- 7. Grants
GRANT EXECUTE ON FUNCTION public.is_auditor() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_staff_user(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_auditor_user(TEXT, TEXT, TEXT) TO authenticated;
