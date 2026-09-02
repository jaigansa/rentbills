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
  v_email TEXT;
  v_clean TEXT;
  v_digits TEXT;
BEGIN
  v_clean := TRIM(p_identifier);
  IF v_clean IS NULL OR v_clean = '' THEN
    RETURN NULL;
  END IF;

  IF v_clean LIKE '%@%' THEN
    RETURN LOWER(v_clean);
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE LOWER(username) = LOWER(v_clean) LIMIT 1;
  IF v_email IS NOT NULL AND v_email != '' THEN
    RETURN LOWER(v_email);
  END IF;

  v_digits := REGEXP_REPLACE(v_clean, '[^0-9]', '', 'g');
  IF LENGTH(v_digits) >= 7 THEN
    SELECT email INTO v_email FROM public.renters 
    WHERE REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g') LIKE '%' || v_digits || '%'
      AND email IS NOT NULL AND email != '' 
      AND deleted_at IS NULL
    ORDER BY is_active DESC, updated_at DESC
    LIMIT 1;
    
    IF v_email IS NOT NULL AND v_email != '' THEN
      RETURN LOWER(v_email);
    END IF;
  END IF;

  SELECT email INTO v_email FROM public.renters
  WHERE LOWER(name) = LOWER(v_clean)
    AND email IS NOT NULL AND email != ''
    AND deleted_at IS NULL
  ORDER BY is_active DESC, updated_at DESC
  LIMIT 1;
  
  IF v_email IS NOT NULL AND v_email != '' THEN
    RETURN LOWER(v_email);
  END IF;

  RETURN NULL;
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
  is_disabled BOOLEAN
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
    COALESCE(prof.is_disabled, u_auth.banned_until > NOW(), FALSE) AS is_disabled
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
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
  v_username TEXT;
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

  v_username := COALESCE(NULLIF(TRIM(p_username), ''), SPLIT_PART(p_email, '@', 1));
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = p_email;
  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        confirmed_at = COALESCE(confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = v_user_id;

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_user_id, v_username, p_email, 'TENANT')
    ON CONFLICT (id) DO UPDATE SET
      role = 'TENANT',
      username = COALESCE(EXCLUDED.username, public.profiles.username),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      updated_at = NOW();
  ELSE
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', p_email, v_encrypted_pw, NOW(), NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'TENANT', 'username', v_username),
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
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = NOW()
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthenticated');
  END IF;

  SELECT email INTO v_prof_email FROM public.profiles WHERE id = v_uid;
  v_digits := REGEXP_REPLACE(COALESCE(v_email, ''), '[^0-9]', '', 'g');

  UPDATE public.renters
  SET user_id = v_uid, updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      user_id = v_uid
      OR (v_email IS NOT NULL AND v_email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(v_email)))
      OR (v_prof_email IS NOT NULL AND v_prof_email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(v_prof_email)))
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
GRANT EXECUTE ON FUNCTION public.admin_reset_tenant_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_tenant_login(BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_tenant_login_status(BIGINT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_link_own_lease() TO authenticated;
