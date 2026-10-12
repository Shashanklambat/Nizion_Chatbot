"""Supabase Postgres connection. Tests inject their own in-memory database."""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()
database_url = os.getenv('DATABASE_URL', '').strip()
if not database_url:
    raise RuntimeError('DATABASE_URL is required. Copy the Supabase connection URL into backend/.env.')
if database_url.startswith('postgres://'):
    database_url = 'postgresql+psycopg://' + database_url[len('postgres://'):]
elif database_url.startswith('postgresql://'):
    database_url = 'postgresql+psycopg://' + database_url[len('postgresql://'):]
if database_url.startswith('sqlite') and os.getenv('APP_ENV') == 'production':
    raise RuntimeError('SQLite is not supported in production. Configure Supabase PostgreSQL.')

kwargs = {'pool_pre_ping': True}
if database_url.startswith('postgresql') and ':6543/' in database_url:
    # Supabase transaction pooler: use short-lived connections.
    kwargs['poolclass'] = NullPool
if database_url.startswith('sqlite'):
    kwargs['connect_args'] = {'check_same_thread': False}
engine = create_engine(database_url, **kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    with SessionLocal() as db:
        yield db
