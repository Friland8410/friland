-- Login-brugere og bogholder-indstillinger (påkrævet på Vercel: skrivebeskyttet filsystem)
-- Kør i Supabase SQL Editor eller: supabase db push

CREATE TABLE IF NOT EXISTS public.friland_users (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'bogholder', 'user'))
);

CREATE TABLE IF NOT EXISTS public.friland_app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bookkeeper_email TEXT NOT NULL DEFAULT ''
);

COMMENT ON TABLE public.friland_users IS 'Friland web-login (bcrypt) — adgang kun via service role fra server';
COMMENT ON TABLE public.friland_app_settings IS 'Én række (id=1): bogholder-email';

INSERT INTO public.friland_app_settings (id, bookkeeper_email)
VALUES (1, '')
ON CONFLICT (id) DO NOTHING;
