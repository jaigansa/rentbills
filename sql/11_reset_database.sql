-- ============================================================================
-- MODULE 11: FULL DATABASE RESET & TEARDOWN SCRIPT
-- ============================================================================
-- ⚠️ WARNING: THIS SCRIPT DROPS ALL TABLES, POLICIES, TRIGGERS, AND FUNCTIONS
-- IN THE PUBLIC SCHEMA TO RESET THE DATABASE TO A CLEAN BLANK SLATE.
--
-- AFTER RUNNING THIS SCRIPT, YOU CAN RE-RUN 00_master_schema.sql TO REBUILD
-- THE ENTIRE DATABASE SCHEMA AND INITIAL ADMIN ACCOUNT FROM SCRATCH.
-- ============================================================================

DO $$
BEGIN
  -- 1. Disable session triggers for clean teardown
  SET session_replication_role = 'replica';

  -- 2. Drop all custom triggers on auth.users and public tables
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  DROP TRIGGER IF EXISTS trg_calculate_bill_amounts ON public.bills;
  DROP TRIGGER IF EXISTS trg_sync_bill_paid_amount ON public.payments;

  -- 3. Drop all custom RPC functions
  DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
  DROP FUNCTION IF EXISTS public.calculate_bill_amounts() CASCADE;
  DROP FUNCTION IF EXISTS public.sync_bill_paid_amount() CASCADE;
  DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
  DROP FUNCTION IF EXISTS public.get_login_email_for_identifier(TEXT) CASCADE;
  DROP FUNCTION IF EXISTS public.resolve_login_email(TEXT) CASCADE;
  DROP FUNCTION IF EXISTS public.admin_list_tenants_with_auth() CASCADE;
  DROP FUNCTION IF EXISTS public.admin_create_tenant_user(TEXT, TEXT, TEXT, BIGINT) CASCADE;
  DROP FUNCTION IF EXISTS public.admin_reset_tenant_password(UUID, TEXT) CASCADE;
  DROP FUNCTION IF EXISTS public.admin_delete_tenant_login(BIGINT, UUID) CASCADE;
  DROP FUNCTION IF EXISTS public.admin_toggle_tenant_login_status(BIGINT, UUID, BOOLEAN) CASCADE;
  DROP FUNCTION IF EXISTS public.tenant_link_own_lease() CASCADE;

  -- 4. Drop all application tables in public schema
  DROP TABLE IF EXISTS public.payments CASCADE;
  DROP TABLE IF EXISTS public.bills CASCADE;
  DROP TABLE IF EXISTS public.documents CASCADE;
  DROP TABLE IF EXISTS public.expenses CASCADE;
  DROP TABLE IF EXISTS public.owner_withdrawals CASCADE;
  DROP TABLE IF EXISTS public.renters CASCADE;
  DROP TABLE IF EXISTS public.units CASCADE;
  DROP TABLE IF EXISTS public.properties CASCADE;
  DROP TABLE IF EXISTS public.owners CASCADE;
  DROP TABLE IF EXISTS public.profiles CASCADE;

  -- 5. Re-enable normal database triggers
  SET session_replication_role = 'origin';

  RAISE NOTICE '✅ Database teardown complete! All public tables, triggers, and functions have been removed.';
  RAISE NOTICE '👉 Run 00_master_schema.sql now to initialize a fresh database schema.';
END $$;
