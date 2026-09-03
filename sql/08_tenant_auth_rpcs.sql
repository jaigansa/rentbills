-- ============================================================================
-- MODULE 08: TENANT AUTHENTICATION & ADMIN RPC FUNCTIONS
-- ============================================================================

-- 1. Resolve user identifier (email, mobile, username) for universal login
DROP FUNCTION IF EXISTS public.get_login_email_for_identifier(TEXT);
DROP FUNCTION IF EXISTS public.resolve_login_email(TEXT);

CREATE OR REPLACE FUNCTION public.get_login_email_for_identifier(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clean TEXT := TRIM(COALESCE(p_identifier, ''));
  v_email TEXT;
  v_digits TEXT;
BEGIN
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Direct match in auth.users or renters by email
  IF v_clean LIKE '%@%' THEN
    SELECT email INTO v_email FROM auth.users WHERE LOWER(email) = LOWER(v_clean) LIMIT 1;
    IF v_email IS NOT NULL THEN RETURN LOWER(v_email); END IF;

    SELECT email INTO v_email FROM public.renters 
    WHERE LOWER(email) = LOWER(v_clean) AND deleted_at IS NULL
    ORDER BY is_active DESC LIMIT 1;
    IF v_email IS NOT NULL AND v_email LIKE '%@%' THEN RETURN LOWER(v_email); END IF;

    -- Check if inverted: mobile_number column holds the email
    SELECT mobile_number INTO v_email FROM public.renters 
    WHERE LOWER(mobile_number) = LOWER(v_clean) AND deleted_at IS NULL
    ORDER BY is_active DESC LIMIT 1;
    IF v_email IS NOT NULL AND v_email LIKE '%@%' THEN RETURN LOWER(v_email); END IF;
  END IF;

  -- 2. Digits match for mobile number
  v_digits := REGEXP_REPLACE(v_clean, '[^0-9]', '', 'g');
  IF LENGTH(v_digits) >= 10 THEN
    v_digits := RIGHT(v_digits, 10);
  END IF;

  IF LENGTH(v_digits) >= 7 THEN
    -- Match in auth.users by email containing digits or mobile metadata
    SELECT email INTO v_email FROM auth.users 
    WHERE (REGEXP_REPLACE(email, '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' OR raw_user_meta_data->>'mobile' LIKE '%' || v_digits || '%')
    LIMIT 1;
    IF v_email IS NOT NULL THEN RETURN LOWER(v_email); END IF;

    -- Match in renters table by mobile_number or email digits
    SELECT 
      CASE 
        WHEN email LIKE '%@%' THEN email 
        WHEN mobile_number LIKE '%@%' THEN mobile_number 
        ELSE NULL 
      END INTO v_email
    FROM public.renters 
    WHERE (REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g') LIKE '%' || v_digits || '%' OR REGEXP_REPLACE(email, '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
      AND deleted_at IS NULL
    ORDER BY is_active DESC LIMIT 1;
    
    IF v_email IS NOT NULL AND v_email LIKE '%@%' THEN RETURN LOWER(v_email); END IF;

    -- Fallback check for generated local email
    SELECT email INTO v_email FROM auth.users 
    WHERE LOWER(email) = LOWER('tenant_' || v_digits || '@rentbill.local') LIMIT 1;
    IF v_email IS NOT NULL THEN RETURN LOWER(v_email); END IF;
  END IF;

  -- 3. Match in profiles by username or renters by name
  SELECT u.email INTO v_email FROM auth.users u
  JOIN public.profiles p ON u.id = p.id
  WHERE LOWER(p.username) = LOWER(v_clean) LIMIT 1;
  IF v_email IS NOT NULL THEN RETURN LOWER(v_email); END IF;

  SELECT 
    CASE 
      WHEN email LIKE '%@%' THEN email 
      WHEN mobile_number LIKE '%@%' THEN mobile_number 
      ELSE NULL 
    END INTO v_email
  FROM public.renters 
  WHERE LOWER(name) = LOWER(v_clean) AND deleted_at IS NULL
  ORDER BY is_active DESC LIMIT 1;
  
  IF v_email IS NOT NULL AND v_email LIKE '%@%' THEN RETURN LOWER(v_email); END IF;

  RETURN CASE WHEN v_clean LIKE '%@%' THEN LOWER(v_clean) ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.get_login_email_for_identifier(p_identifier);
END;
$$;

-- 2. Admin: List all tenants with login account status
DROP FUNCTION IF EXISTS public.admin_list_tenants_with_auth();
CREATE OR REPLACE FUNCTION public.admin_list_tenants_with_auth()
RETURNS TABLE (
  renter_id BIGINT,
  renter_name TEXT,
  mobile_number TEXT,
  email TEXT,
  unit_name TEXT,
  property_name TEXT,
  user_id UUID,
  has_auth_account BOOLEAN,
  last_sign_in_at TIMESTAMPTZ,
  is_active BOOLEAN,
  is_disabled BOOLEAN,
  assigned_password TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can view tenant credentials.';
  END IF;

  RETURN QUERY
  SELECT 
    r.id AS renter_id,
    r.name AS renter_name,
    CASE 
      WHEN r.mobile_number LIKE '%@%' AND (r.email IS NULL OR r.email NOT LIKE '%@%') THEN r.email
      ELSE r.mobile_number 
    END AS mobile_number,
    CASE 
      WHEN r.mobile_number LIKE '%@%' AND (r.email IS NULL OR r.email NOT LIKE '%@%') THEN r.mobile_number
      ELSE r.email 
    END AS email,
    u.unit_name,
    p.name AS property_name,
    r.user_id,
    (u_auth.id IS NOT NULL) AS has_auth_account,
    u_auth.last_sign_in_at,
    r.is_active,
    COALESCE(prof.is_disabled, u_auth.banned_until > NOW(), FALSE) AS is_disabled,
    COALESCE(u_auth.raw_user_meta_data->>'assigned_password', NULL) AS assigned_password
  FROM public.renters r
  LEFT JOIN public.units u ON r.unit_id = u.id
  LEFT JOIN public.properties p ON u.property_id = p.id
  LEFT JOIN auth.users u_auth ON (r.user_id = u_auth.id OR (r.email IS NOT NULL AND LOWER(r.email) = LOWER(u_auth.email)))
  LEFT JOIN public.profiles prof ON u_auth.id = prof.id
  WHERE r.deleted_at IS NULL
  ORDER BY r.is_active DESC, r.name ASC;
END;
$$;

-- 3. Admin: Create or update a tenant login with password (No SMTP needed)
DROP FUNCTION IF EXISTS public.admin_create_tenant_user(TEXT, TEXT, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.admin_create_tenant_user(TEXT, TEXT, TEXT, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_tenant_user(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT DEFAULT NULL,
  p_renter_id BIGINT DEFAULT NULL,
  p_mobile TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
  v_username TEXT;
  v_clean_mobile TEXT;
  v_renter_mobile TEXT;
  v_renter_uid UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can manage tenant accounts.';
  END IF;

  p_email := LOWER(TRIM(p_email));
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'A valid email address is required.';
  END IF;

  IF LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  v_clean_mobile := REGEXP_REPLACE(COALESCE(p_mobile, ''), '[^0-9]', '', 'g');
  IF LENGTH(v_clean_mobile) >= 10 THEN
    v_clean_mobile := RIGHT(v_clean_mobile, 10);
  END IF;

  -- Check renters table for linked user_id or mobile number if p_renter_id is provided
  IF p_renter_id IS NOT NULL THEN
    SELECT user_id, mobile_number INTO v_renter_uid, v_renter_mobile
    FROM public.renters WHERE id = p_renter_id;
    
    IF v_renter_uid IS NOT NULL THEN
      v_user_id := v_renter_uid;
    END IF;

    IF v_clean_mobile IS NULL OR v_clean_mobile = '' THEN
      v_clean_mobile := REGEXP_REPLACE(COALESCE(v_renter_mobile, ''), '[^0-9]', '', 'g');
      IF LENGTH(v_clean_mobile) >= 10 THEN
        v_clean_mobile := RIGHT(v_clean_mobile, 10);
      END IF;
    END IF;
  END IF;

  v_username := COALESCE(NULLIF(TRIM(p_username), ''), SPLIT_PART(p_email, '@', 1));

  -- 1. Search by email if not found yet
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = p_email LIMIT 1;
  END IF;

  -- 2. Search by mobile number if not found yet
  IF v_user_id IS NULL AND LENGTH(v_clean_mobile) >= 7 THEN
    SELECT id INTO v_user_id FROM auth.users 
    WHERE (REGEXP_REPLACE(email, '[^0-9]', '', 'g') LIKE '%' || v_clean_mobile || '%' OR raw_user_meta_data->>'mobile' LIKE '%' || v_clean_mobile || '%')
    LIMIT 1;
  END IF;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email = LOWER(p_email),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmed_at = COALESCE(confirmed_at, NOW()),
        banned_until = NULL,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'role', 'TENANT',
          'username', v_username,
          'mobile', COALESCE(NULLIF(v_clean_mobile, ''), raw_user_meta_data->>'mobile'),
          'renter_id', COALESCE(p_renter_id, (raw_user_meta_data->>'renter_id')::bigint),
          'assigned_password', p_password
        ),
        updated_at = NOW()
    WHERE id = v_user_id;

    BEGIN
      UPDATE auth.identities
      SET provider_id = LOWER(p_email),
          identity_data = jsonb_build_object('sub', v_user_id::text, 'email', LOWER(p_email)),
          updated_at = NOW()
      WHERE user_id = v_user_id AND provider = 'email';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role, is_disabled)
    VALUES (v_user_id, v_username, LOWER(p_email), 'TENANT', FALSE)
    ON CONFLICT (id) DO UPDATE SET
      role = 'TENANT',
      username = COALESCE(EXCLUDED.username, public.profiles.username),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      is_disabled = FALSE,
      updated_at = NOW();
  ELSE
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', p_email, v_encrypted_pw, NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'TENANT', 'username', v_username, 'mobile', v_clean_mobile, 'renter_id', p_renter_id, 'assigned_password', p_password),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', p_email),
        'email', p_email, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, v_username, p_email, 'TENANT')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = 'TENANT';
  END IF;

  IF p_renter_id IS NOT NULL THEN
    UPDATE public.renters
    SET user_id = v_user_id, email = p_email, updated_at = NOW()
    WHERE id = p_renter_id;
  ELSE
    UPDATE public.renters
    SET user_id = v_user_id, updated_at = NOW()
    WHERE LOWER(email) = p_email AND deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', p_email, 'username', v_username);
END;
$$;

-- Overloaded 4-parameter variant for backwards compatibility with legacy API callers
CREATE OR REPLACE FUNCTION public.admin_create_tenant_user(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT DEFAULT NULL,
  p_renter_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  RETURN public.admin_create_tenant_user(p_email, p_password, p_username, p_renter_id, NULL);
END;
$$;

-- Direct Admin Tenant Password Update RPC
DROP FUNCTION IF EXISTS public.admin_update_tenant_user_password(BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.admin_update_tenant_user_password(BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_tenant_user_password(
  p_renter_id BIGINT,
  p_new_password TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_renter_email TEXT;
  v_renter_mobile TEXT;
  v_clean_mobile TEXT;
  v_target_email TEXT;
  v_encrypted_pw TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can reset tenant passwords.';
  END IF;

  IF LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  SELECT user_id, email, mobile_number INTO v_user_id, v_renter_email, v_renter_mobile
  FROM public.renters WHERE id = p_renter_id;

  IF p_email IS NOT NULL AND p_email LIKE '%@%' THEN
    v_target_email := LOWER(TRIM(p_email));
  ELSIF v_renter_email IS NOT NULL AND v_renter_email LIKE '%@%' THEN
    v_target_email := LOWER(TRIM(v_renter_email));
  END IF;

  v_clean_mobile := REGEXP_REPLACE(COALESCE(v_renter_mobile, ''), '[^0-9]', '', 'g');
  IF LENGTH(v_clean_mobile) >= 10 THEN
    v_clean_mobile := RIGHT(v_clean_mobile, 10);
  END IF;

  IF v_target_email IS NULL AND LENGTH(v_clean_mobile) >= 10 THEN
    v_target_email := 'tenant_' || v_clean_mobile || '@rentbill.local';
  END IF;

  IF v_user_id IS NULL AND v_target_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = v_target_email LIMIT 1;
  END IF;

  IF v_user_id IS NULL AND LENGTH(v_clean_mobile) >= 7 THEN
    SELECT id INTO v_user_id FROM auth.users 
    WHERE (REGEXP_REPLACE(email, '[^0-9]', '', 'g') LIKE '%' || v_clean_mobile || '%' OR raw_user_meta_data->>'mobile' LIKE '%' || v_clean_mobile || '%')
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No auth account found for tenant.');
  END IF;

  BEGIN
    v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      v_encrypted_pw := public.crypt(p_new_password, public.gen_salt('bf', 10));
    EXCEPTION WHEN OTHERS THEN
      v_encrypted_pw := crypt(p_new_password, gen_salt('bf', 10));
    END;
  END;

  UPDATE auth.users
  SET encrypted_password = v_encrypted_pw,
      email = COALESCE(v_target_email, email),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmed_at = COALESCE(confirmed_at, NOW()),
      banned_until = NULL,
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', 'TENANT',
        'mobile', COALESCE(NULLIF(v_clean_mobile, ''), raw_user_meta_data->>'mobile'),
        'renter_id', p_renter_id,
        'assigned_password', p_new_password
      ),
      updated_at = NOW()
  WHERE id = v_user_id;

  BEGIN
    UPDATE auth.identities
    SET provider_id = COALESCE(v_target_email, provider_id),
        identity_data = jsonb_build_object('sub', v_user_id::text, 'email', COALESCE(v_target_email, provider_id)),
        updated_at = NOW()
    WHERE user_id = v_user_id AND provider = 'email';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE public.profiles
  SET is_disabled = FALSE, email = COALESCE(v_target_email, email), updated_at = NOW()
  WHERE id = v_user_id;

  UPDATE public.renters
  SET user_id = v_user_id, email = COALESCE(v_target_email, email), updated_at = NOW()
  WHERE id = p_renter_id;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', v_target_email);
END;
$$;

-- 4. Admin: Reset tenant password directly
DROP FUNCTION IF EXISTS public.admin_reset_tenant_password(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_reset_tenant_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can reset passwords.';
  END IF;

  IF LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      banned_until = NULL,
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'assigned_password', p_new_password
      ),
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE public.profiles
  SET is_disabled = FALSE, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Password updated successfully');
END;
$$;

-- 5. Admin: Delete / Revoke tenant portal login account
DROP FUNCTION IF EXISTS public.admin_delete_tenant_login(BIGINT, UUID);
CREATE OR REPLACE FUNCTION public.admin_delete_tenant_login(
  p_renter_id BIGINT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := p_user_id;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can delete tenant login accounts.';
  END IF;

  IF v_uid IS NULL AND p_renter_id IS NOT NULL THEN
    SELECT user_id INTO v_uid FROM public.renters WHERE id = p_renter_id;
  END IF;

  IF p_renter_id IS NOT NULL THEN
    UPDATE public.renters
    SET user_id = NULL, updated_at = NOW()
    WHERE id = p_renter_id;
  END IF;

  IF v_uid IS NOT NULL THEN
    -- Nullify foreign key references across business tables before deletion
    UPDATE public.renters SET user_id = NULL WHERE user_id = v_uid;
    UPDATE public.bills SET voided_by = NULL WHERE voided_by = v_uid;
    UPDATE public.payments SET verified_by = NULL WHERE verified_by = v_uid;
    UPDATE public.payments SET reversed_by = NULL WHERE reversed_by = v_uid;
    UPDATE public.expenses SET created_by = NULL WHERE created_by = v_uid;
    UPDATE public.owner_withdrawals SET created_by = NULL WHERE created_by = v_uid;
    UPDATE public.documents SET created_by = NULL WHERE created_by = v_uid;

    -- Delete auth identities & session data
    BEGIN
      DELETE FROM auth.mfa_amr_claims WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = v_uid);
      DELETE FROM auth.mfa_factors WHERE user_id = v_uid;
      DELETE FROM auth.sessions WHERE user_id = v_uid;
      DELETE FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = v_uid);
      DELETE FROM auth.identities WHERE user_id = v_uid;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    DELETE FROM public.profiles WHERE id = v_uid;

    BEGIN
      DELETE FROM auth.users WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Tenant login account deleted successfully');
END;
$$;

-- 6. Admin: Toggle tenant login access
DROP FUNCTION IF EXISTS public.admin_toggle_tenant_login_status(BIGINT, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_toggle_tenant_login_status(
  p_renter_id BIGINT,
  p_user_id UUID DEFAULT NULL,
  p_disabled BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := p_user_id;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can toggle tenant login status.';
  END IF;

  IF v_uid IS NULL AND p_renter_id IS NOT NULL THEN
    SELECT user_id INTO v_uid FROM public.renters WHERE id = p_renter_id;
  END IF;

  IF v_uid IS NOT NULL THEN
    UPDATE public.profiles
    SET is_disabled = p_disabled, updated_at = NOW()
    WHERE id = v_uid;

    IF p_disabled THEN
      UPDATE auth.users SET banned_until = '2099-01-01 00:00:00+00' WHERE id = v_uid;
    ELSE
      UPDATE auth.users SET banned_until = NULL WHERE id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'is_disabled', p_disabled);
END;
$$;

-- 7. Auto-link tenant own lease upon login
DROP FUNCTION IF EXISTS public.tenant_link_own_lease();
CREATE OR REPLACE FUNCTION public.tenant_link_own_lease()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := auth.email();
  v_digits TEXT;
  v_prof_email TEXT;
  v_meta_renter_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthenticated');
  END IF;

  SELECT email INTO v_prof_email FROM public.profiles WHERE id = v_uid;
  BEGIN
    SELECT (raw_user_meta_data->>'renter_id')::BIGINT INTO v_meta_renter_id FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_meta_renter_id := NULL;
  END;

  v_digits := REGEXP_REPLACE(COALESCE(v_email, ''), '[^0-9]', '', 'g');

  UPDATE public.renters
  SET user_id = v_uid, updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      user_id = v_uid
      OR (v_meta_renter_id IS NOT NULL AND id = v_meta_renter_id)
      OR (v_email IS NOT NULL AND v_email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(v_email)))
      OR (v_prof_email IS NOT NULL AND v_prof_email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(v_prof_email)))
      OR (v_email IS NOT NULL AND v_email != '' AND LOWER(TRIM(mobile_number)) = LOWER(TRIM(v_email)))
      OR (LENGTH(v_digits) >= 7 AND REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g') LIKE '%' || v_digits || '%')
    );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. Execution Grants
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_login_email_for_identifier(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_tenants_with_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant_user(TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_tenant_user(TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_tenant_user_password(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_tenant_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tenant_login(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_tenant_login_status(BIGINT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_link_own_lease() TO authenticated;
