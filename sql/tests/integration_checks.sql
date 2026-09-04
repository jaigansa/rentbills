-- ============================================================================
-- 🧪 RentBill Pro — LIVE SQL INTEGRATION TESTS (run in Supabase SQL Editor)
-- Verify critical financial triggers against your real database.
-- Safe to run: wraps everything in a transaction and rolls back, so NO data is modified.
-- ============================================================================

BEGIN;

-- 4) Trigger behavior: bill status auto-calc on a throwaway renter (rolled back)
DO $$
DECLARE
  v_renter BIGINT;
  v_bill   BIGINT;
BEGIN
  INSERT INTO public.renters (name, mobile_number, base_rent)
  VALUES ('__TEST__ Tenant', '9999999999', 100000)
  RETURNING id INTO v_renter;

  INSERT INTO public.bills (renter_id, billing_period, gross_amount, net_amount, paid_amount, status)
  VALUES (v_renter, '2099-01', 100000, 100000, 0, 'UNPAID')
  RETURNING id INTO v_bill;

  -- paid_amount 0 -> should be UNPAID
  IF (SELECT status FROM public.bills WHERE id = v_bill) <> 'UNPAID' THEN
    RAISE EXCEPTION 'expected UNPAID for zero paid bill';
  END IF;

  UPDATE public.bills SET paid_amount = 100000 WHERE id = v_bill;

  -- paid == net -> should auto-flip to PAID
  IF (SELECT status FROM public.bills WHERE id = v_bill) <> 'PAID' THEN
    RAISE EXCEPTION 'expected PAID after full payment';
  END IF;

  UPDATE public.bills SET paid_amount = 40000 WHERE id = v_bill;

  IF (SELECT status FROM public.bills WHERE id = v_bill) <> 'PARTIAL' THEN
    RAISE EXCEPTION 'expected PARTIAL after partial payment';
  END IF;

  RAISE NOTICE '✅ Bill status trigger derives UNPAID/PAID/PARTIAL correctly';
END $$;

-- 5) sync_bill_paid_amount updates paid_amount from live payments (rolled back)
DO $$
DECLARE
  v_pay BIGINT;
BEGIN
  INSERT INTO public.payments (bill_id, renter_id, amount, proof_status)
  SELECT b.id, b.renter_id, 25000, 'VERIFIED'
  FROM public.bills b
  WHERE b.billing_period = '2099-01' LIMIT 1
  RETURNING id INTO v_pay;

  IF (SELECT paid_amount FROM public.bills WHERE id = (
        SELECT bill_id FROM public.payments WHERE id = v_pay
      )) <> 25000 OR (
      SELECT paid_amount FROM public.bills WHERE id = (
        SELECT bill_id FROM public.payments WHERE id = v_pay
      )) = 0 THEN
    RAISE EXCEPTION 'sync_bill_paid_amount did not reflect the payment';
  END IF;

  RAISE NOTICE '✅ sync_bill_paid_amount trigger reflects live payments';
END $$;

ROLLBACK;

RAISE NOTICE '🎉 All live SQL integrity tests passed (transaction rolled back — no data changed).';
