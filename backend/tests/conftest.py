import os
# Only unit tests use SQLite; production requires a Supabase PostgreSQL URL.
os.environ['APP_ENV'] = 'test'
os.environ['DATABASE_URL'] = 'sqlite://'

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base, get_db
from app.main import app
from app.models import PhoneChallenge, utcnow
from app.otp import code_digest
from datetime import timedelta

@pytest.fixture
def client():
    test_engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=test_engine)
    session_factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    def db_override():
        with session_factory() as session:
            yield session
    app.dependency_overrides[get_db] = db_override
    with TestClient(app) as test_client:
        test_client.testing_session = session_factory
        yield test_client
    app.dependency_overrides.clear()
    test_engine.dispose()


def verified_ticket(client, number='+919876543210'):
    # Create test-only challenge; never bypass verification in application routes.
    with client.testing_session() as session:
        challenge = PhoneChallenge(phone=number, code_hash=code_digest(number, '123456'),
            sent_at=utcnow(), expires_at=utcnow()+timedelta(minutes=10), window_started_at=utcnow())
        session.add(challenge); session.commit()
    verified = client.post('/api/auth/whatsapp/check', json={'whatsapp_number':number, 'code':'123456'})
    assert verified.status_code == 200, verified.text
    return verified.json()['verification_ticket']


def register(client, username='student1', grade=3, number=None):
    number = number or '+919' + str(100000000 + len(username)*10000 + grade).zfill(9)
    ticket = verified_ticket(client, number)
    r = client.post('/api/auth/register', json={
        'username':username, 'full_name':'Test Student', 'email':f'{username}@example.com',
        'whatsapp_number':number, 'verification_ticket':ticket, 'password':'securepass123',
        'grade':grade,'board':'CBSE','language':'English','guardian_permission':True,
    })
    assert r.status_code == 201, r.text
    return {'Authorization':f'Bearer {r.json()["access_token"]}'}
