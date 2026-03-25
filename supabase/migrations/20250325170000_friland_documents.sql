-- JSON-dokumenter: oversigt, kontingent, forbrug m.m. (Vercel — read-only data/)
CREATE TABLE IF NOT EXISTS public.friland_documents (
  doc_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.friland_documents IS 'Nøgle/værdi JSON — adgang via service role fra Friland-server';

CREATE INDEX IF NOT EXISTS friland_documents_updated_at_idx ON public.friland_documents (updated_at);
