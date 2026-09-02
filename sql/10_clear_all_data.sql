-- ============================================================================
-- MODULE 10: CLEAR ALL BUSINESS DATA & RESET SEQUENCES
-- ============================================================================
-- Safe cleanup script: Clears all properties, units, tenants, bills, payments,
-- expenses, and documents, while keeping the database tables and Admin user account.
-- ============================================================================

DO $$
BEGIN
  -- 1. Disable triggers temporarily for clean cascade truncate
  SET session_replication_role = 'replica';

  -- 2. Truncate all business data tables and reset identity IDs to 1
  TRUNCATE TABLE public.payments RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.bills RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.documents RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.expenses RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.owner_withdrawals RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.renters RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.units RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.properties RESTART IDENTITY CASCADE;
  TRUNCATE TABLE public.owners RESTART IDENTITY CASCADE;

  -- 3. Delete tenant auth logins (keeps ADMIN user intact)
  DELETE FROM auth.identities 
  WHERE user_id IN (
    SELECT id FROM public.profiles WHERE role != 'ADMIN'
  );

  DELETE FROM auth.users 
  WHERE id IN (
    SELECT id FROM public.profiles WHERE role != 'ADMIN'
  );

  DELETE FROM public.profiles WHERE role != 'ADMIN';

  -- 4. Re-enable normal database triggers
  SET session_replication_role = 'origin';

  RAISE NOTICE '✅ All business records cleared successfully! Admin user preserved.';
END $$;
