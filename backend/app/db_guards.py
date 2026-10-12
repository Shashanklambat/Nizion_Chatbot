"""Postgres-only rules installed at startup; fail startup if security is unavailable."""
from sqlalchemy import text
from .database import engine

LOCK_PROFILE_FUNCTION = '''
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
$$
'''

def install_postgres_guards():
    if engine.dialect.name != 'postgresql':
        return  # SQLite is used only by test fixtures.
    with engine.begin() as conn:
        for table in ('users', 'phone_challenges', 'conversations', 'messages'):
            # Supabase Data API must not expose these student-private tables.
            conn.execute(text(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY'))
            conn.execute(text(f'REVOKE ALL ON TABLE public.{table} FROM anon, authenticated'))
        conn.execute(text(LOCK_PROFILE_FUNCTION))
        conn.execute(text('DROP TRIGGER IF EXISTS classwise_profile_immutable ON public.users'))
        conn.execute(text('''CREATE TRIGGER classwise_profile_immutable
                          BEFORE UPDATE ON public.users FOR EACH ROW
                          EXECUTE FUNCTION public.classwise_keep_profile_fixed()'''))
