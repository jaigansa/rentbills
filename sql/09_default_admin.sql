-- ============================================================================
-- MODULE 09: DEFAULT ADMIN USER PROVISIONING (CUSTOMIZABLE)
-- ============================================================================
-- Default Email:    admin@rentbill.com
-- Default Password: Admin@123
-- ============================================================================

DO $$
DECLARE
  v_admin_id UUID := gen_random_uuid();
  v_admin_email TEXT := 'admin@rentbill.com'; -- Change to your preferred admin email
  v_admin_password TEXT := 'Admin@123';    -- Change to your preferred admin password
  v_encrypted_pw TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(v_admin_email)) THEN
    v_encrypted_pw := extensions.crypt(v_admin_password, extensions.gen_salt('bf'));

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', v_admin_email, v_encrypted_pw, NOW(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('role', 'ADMIN', 'username', 'Admin'),
      NOW(), NOW(), 'authenticated', 'authenticated'
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, v_admin_id, jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email),
      'email', v_admin_email, NOW(), NOW(), NOW()
    );

    INSERT INTO public.profiles (id, username, email, role)
    VALUES (v_admin_id, 'Admin', v_admin_email, 'ADMIN')
    ON CONFLICT (id) DO UPDATE SET role = 'ADMIN';
    
    RAISE NOTICE '✅ Default Admin User created: %', v_admin_email;
  ELSE
    UPDATE public.profiles
    SET role = 'ADMIN'
    WHERE LOWER(email) = LOWER(v_admin_email);

    RAISE NOTICE 'ℹ️ User % already exists, ensured role is ADMIN.', v_admin_email;
  END IF;
END $$;
