DROP INDEX IF EXISTS payment_transactions_one_paid_or_approved_cpf;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_one_paid_cpf
  ON public.payment_transactions (cpf)
  WHERE status = 'COMPLETED' OR paid_at IS NOT NULL;
