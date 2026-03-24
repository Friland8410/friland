-- e-conomic → Supabase: kontoplan og posteringer (egen saldobalance)
-- Kør i Supabase SQL Editor eller via CLI: supabase db push

CREATE TABLE IF NOT EXISTS public.accounts (
  id BIGSERIAL PRIMARY KEY,
  account_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posteringer: economic_self = e-conomic entry.self (stabil nøgle til upsert)
CREATE TABLE IF NOT EXISTS public.entries (
  id BIGSERIAL PRIMARY KEY,
  economic_self TEXT NOT NULL UNIQUE,
  account_number INTEGER NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  entry_date DATE NOT NULL,
  accounting_year_id TEXT,
  CONSTRAINT fk_entries_account FOREIGN KEY (account_number) REFERENCES public.accounts (account_number) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS entries_entry_date_idx ON public.entries (entry_date);
CREATE INDEX IF NOT EXISTS entries_account_number_idx ON public.entries (account_number);

COMMENT ON TABLE public.accounts IS 'Kontoplan synkroniseret fra e-conomic GET /accounts';
COMMENT ON TABLE public.entries IS 'Bogførte linjer fra e-conomic GET /accounting-years/:id/entries';
COMMENT ON COLUMN public.entries.amount IS 'Positiv = debet, negativ = kredit (amountInBaseCurrency/amount fra e-conomic)';
COMMENT ON COLUMN public.entries.entry_date IS 'Dato YYYY-MM-DD som i e-conomic';

-- Saldobalance: alle konti med sum (periode via NULL = hele tabellen)
CREATE OR REPLACE FUNCTION public.get_ledger_balance (
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  account_number INTEGER,
  name TEXT,
  balance NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    a.account_number,
    a.name,
    COALESCE(SUM(e.amount), 0)::NUMERIC(18, 2) AS balance
  FROM public.accounts a
  LEFT JOIN public.entries e
    ON e.account_number = a.account_number
    AND (p_from_date IS NULL OR e.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR e.entry_date <= p_to_date)
  GROUP BY a.account_number, a.name
  ORDER BY a.account_number;
$$;

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read accounts" ON public.accounts;
CREATE POLICY "Allow public read accounts" ON public.accounts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public read entries" ON public.entries;
CREATE POLICY "Allow public read entries" ON public.entries FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.accounts TO anon, authenticated;
GRANT SELECT ON public.entries TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ledger_balance (DATE, DATE) TO anon, authenticated, service_role;
