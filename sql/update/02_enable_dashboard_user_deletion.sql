-- ============================================================================
-- RentBill Pro — Enable Supabase Dashboard User Deletion
-- Fixes: "Database error deleting user" in Supabase Authentication > Users
-- ============================================================================

-- 1. Ensure foreign key constraints on referencing tables use ON DELETE SET NULL
DO $$
BEGIN
  -- renters.user_id
  ALTER TABLE public.renters DROP CONSTRAINT IF EXISTS renters_user_id_fkey;
  ALTER TABLE public.renters ADD CONSTRAINT renters_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- bills.voided_by
  ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_voided_by_fkey;
  ALTER TABLE public.bills ADD CONSTRAINT bills_voided_by_fkey 
    FOREIGN KEY (voided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- payments.verified_by
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_verified_by_fkey;
  ALTER TABLE public.payments ADD CONSTRAINT payments_verified_by_fkey 
    FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- payments.reversed_by
  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_reversed_by_fkey;
  ALTER TABLE public.payments ADD CONSTRAINT payments_reversed_by_fkey 
    FOREIGN KEY (reversed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- expenses.created_by
  ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- owner_withdrawals.created_by
  ALTER TABLE public.owner_withdrawals DROP CONSTRAINT IF EXISTS owner_withdrawals_created_by_fkey;
  ALTER TABLE public.owner_withdrawals ADD CONSTRAINT owner_withdrawals_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- documents.created_by
  ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
  ALTER TABLE public.documents ADD CONSTRAINT documents_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

  -- maintenance_tasks.reported_by
  ALTER TABLE public.maintenance_tasks DROP CONSTRAINT IF EXISTS maintenance_tasks_reported_by_fkey;
  ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_reported_by_fkey 
    FOREIGN KEY (reported_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Trigger on public.profiles BEFORE DELETE:
--    Automatically unlinks any references before profile row removal.
CREATE OR REPLACE FUNCTION public.handle_profile_before_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.renters SET user_id = NULL WHERE user_id = OLD.id;
  UPDATE public.bills SET voided_by = NULL WHERE voided_by = OLD.id;
  UPDATE public.payments SET verified_by = NULL WHERE verified_by = OLD.id;
  UPDATE public.payments SET reversed_by = NULL WHERE reversed_by = OLD.id;
  UPDATE public.expenses SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.owner_withdrawals SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.documents SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.maintenance_tasks SET reported_by = NULL WHERE reported_by = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_profile_before_delete ON public.profiles;
CREATE TRIGGER trg_handle_profile_before_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_before_delete();

-- 3. Trigger on auth.users BEFORE DELETE:
--    Runs whenever an admin clicks "Delete user" in Supabase Dashboard (Authentication > Users)
--    or deletes via Supabase Auth Admin API. Unlinks references and storage objects.
CREATE OR REPLACE FUNCTION public.handle_auth_user_before_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Unlink all business table references
  UPDATE public.renters SET user_id = NULL WHERE user_id = OLD.id;
  UPDATE public.bills SET voided_by = NULL WHERE voided_by = OLD.id;
  UPDATE public.payments SET verified_by = NULL WHERE verified_by = OLD.id;
  UPDATE public.payments SET reversed_by = NULL WHERE reversed_by = OLD.id;
  UPDATE public.expenses SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.owner_withdrawals SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.documents SET created_by = NULL WHERE created_by = OLD.id;
  UPDATE public.maintenance_tasks SET reported_by = NULL WHERE reported_by = OLD.id;

  -- Reassign storage object ownership if user uploaded payment proof or documents
  BEGIN
    UPDATE storage.objects SET owner = NULL WHERE owner = OLD.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Delete corresponding profile from public.profiles
  DELETE FROM public.profiles WHERE id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_before_delete();
