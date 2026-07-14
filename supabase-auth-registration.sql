-- Apply once in the Stylee App Supabase SQL Editor.
-- Keeps username registration in Supabase Auth without any client/model-service
-- service-role key. Safe to rerun.

CREATE OR REPLACE FUNCTION public.handle_new_stylee_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_username TEXT;
BEGIN
  requested_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  INSERT INTO public.users (user_id, username, nickname)
  VALUES (NEW.id, requested_username, requested_username)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_stylee_user();

-- Dashboard setting required for username@users.stylee.app virtual addresses:
-- Authentication > Providers > Email > Confirm email = OFF.
