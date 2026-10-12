-- Optional manual re-application if you need to manage DB guards in SQL Editor.
-- The backend automatically installs these on PostgreSQL at startup.
-- Server connects as postgres; browser/anon/authenticated roles get NO direct access.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users, public.phone_challenges,
    public.conversations, public.messages FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.classwise_keep_profile_fixed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.grade IS DISTINCT FROM OLD.grade OR NEW.board IS DISTINCT FROM OLD.board THEN
        RAISE EXCEPTION 'Student class and board cannot be changed after registration';
    END IF;
    IF NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN
        RAISE EXCEPTION 'Verified WhatsApp number cannot be changed';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS classwise_profile_immutable ON public.users;
CREATE TRIGGER classwise_profile_immutable
BEFORE UPDATE ON public.users FOR EACH ROW
EXECUTE FUNCTION public.classwise_keep_profile_fixed();
