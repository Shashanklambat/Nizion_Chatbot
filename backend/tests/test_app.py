from unittest.mock import AsyncMock
from datetime import timedelta
from app import main
from app.ai import build_system_prompt
from app.models import PhoneChallenge, User, utcnow
from app.otp import code_digest
from .conftest import register, verified_ticket


def test_health(client):
    assert client.get('/api/health').json()['status']=='ok'


def test_register_login_profile_and_fixed_academics(client):
    assert client.get('/api/me').status_code == 401
    headers=register(client)
    me=client.get('/api/me',headers=headers).json()
    assert me['grade']==3 and me['board']=='CBSE' and me['whatsapp_verified']
    assert me['email']=='student1@example.com'
    assert client.post('/api/auth/login',json={'username':'student1','password':'wrong'}).status_code==401
    assert client.post('/api/auth/login',json={'username':'STUDENT1','password':'securepass123'}).status_code==200
    assert client.patch('/api/me',headers=headers,json={'grade':12}).status_code==422
    assert client.patch('/api/me',headers=headers,json={'board':'ICSE'}).status_code==422
    assert client.patch('/api/me',headers=headers,json={'whatsapp_number':'+919888888888'}).status_code==422
    changed=client.patch('/api/me',headers=headers,json={'language':'Hindi','full_name':'New Student'})
    assert changed.status_code==200
    assert changed.json()['grade']==3 and changed.json()['board']=='CBSE'
    assert changed.json()['language']=='Hindi'


def test_registration_requires_real_verified_ticket(client):
    payload={'username':'nobody','full_name':'Test Student','email':'nobody@example.com',
        'whatsapp_number':'+919876543212','verification_ticket':'fake_verification_ticket',
        'password':'password123','grade':3,'board':'CBSE','guardian_permission':True}
    assert client.post('/api/auth/register',json=payload).status_code==403
    payload['verification_ticket']=verified_ticket(client,'+919876543212')
    assert client.post('/api/auth/register',json=payload).status_code==201
    assert client.post('/api/auth/register',json=payload).status_code==403  # Ticket cannot be replayed.


def test_wrong_code_and_expired_or_reused_code(client):
    phone='+919111111111'
    with client.testing_session() as session:
        session.add(PhoneChallenge(phone=phone,code_hash=code_digest(phone,'123456'),
            sent_at=utcnow(), expires_at=utcnow()+timedelta(minutes=10),window_started_at=utcnow()))
        session.commit()
    for _ in range(5):
        assert client.post('/api/auth/whatsapp/check',json={'whatsapp_number':phone,'code':'000000'}).status_code==400
    assert client.post('/api/auth/whatsapp/check',json={'whatsapp_number':phone,'code':'123456'}).status_code==400


def test_send_requires_provider_config(client, monkeypatch):
    for name in ['META_WA_ACCESS_TOKEN','META_WA_PHONE_NUMBER_ID','META_WA_OTP_TEMPLATE']:
        monkeypatch.delenv(name,raising=False)
    response=client.post('/api/auth/whatsapp/start',json={'whatsapp_number':'+919000000000'})
    assert response.status_code==503
    with client.testing_session() as session:
        assert session.query(PhoneChallenge).count()==0


def test_send_and_check_real_flow_via_mocked_provider(client,monkeypatch):
    provider=AsyncMock(return_value=None)
    monkeypatch.setattr(main,'send_whatsapp_code',provider)
    phone='+919888888880'
    sent=client.post('/api/auth/whatsapp/start',json={'whatsapp_number':phone})
    assert sent.status_code==200
    assert provider.await_args.args[0]==phone
    assert len(provider.await_args.args[1])==6
    assert client.post('/api/auth/whatsapp/start',json={'whatsapp_number':phone}).status_code==429
    correct=provider.await_args.args[1]
    check=client.post('/api/auth/whatsapp/check',json={'whatsapp_number':phone,'code':correct})
    assert check.status_code==200
    assert client.post('/api/auth/whatsapp/check',json={'whatsapp_number':phone,'code':correct}).status_code==400


def test_unique_email_and_whatsapp(client):
    register(client,'student_a',3)
    another=verified_ticket(client,'+919123450001')
    same_email=client.post('/api/auth/register',json={
        'username':'other','full_name':'Another Student','email':'student_a@example.com',
        'whatsapp_number':'+919123450001','verification_ticket':another,
        'password':'securepass123','grade':3,'board':'ICSE','guardian_permission':True})
    assert same_email.status_code==409


def test_conversation_and_isolation(client, monkeypatch):
    ai=AsyncMock(return_value='## Gravity\n\nGravity pulls us down.\n\n- Example: a ball falls.')
    monkeypatch.setattr(main,'generate_answer',ai)
    student_a=register(client,'student_a',3)
    student_b=register(client,'student_b',12)
    r=client.post('/api/conversations',headers=student_a)
    assert r.status_code==201
    cid=r.json()['id']
    assert client.get(f'/api/conversations/{cid}',headers=student_b).status_code==404
    assert client.delete(f'/api/conversations/{cid}',headers=student_b).status_code==404
    assert client.post(f'/api/conversations/{cid}/messages',headers=student_b,json={'question':'Gravity?'}).status_code==404
    reply=client.post(f'/api/conversations/{cid}/messages',headers=student_a,json={'question':'Gravity?'})
    assert reply.status_code==201
    assert reply.json()['assistant_message']['content'].startswith('## Gravity')
    assert [m['role'] for m in client.get(f'/api/conversations/{cid}',headers=student_a).json()['messages']]==['user','assistant']
    assert ai.call_args.args[0].grade==3
    assert client.delete(f'/api/conversations/{cid}',headers=student_a).status_code==204


def test_missing_groq_does_not_save_message(client,monkeypatch):
    monkeypatch.delenv('GROQ_API_KEY',raising=False)
    headers=register(client)
    cid=client.post('/api/conversations',headers=headers).json()['id']
    result=client.post(f'/api/conversations/{cid}/messages',headers=headers,json={'question':'Gravity?'})
    assert result.status_code==503
    assert client.get(f'/api/conversations/{cid}',headers=headers).json()['messages']==[]


def test_grade_prompts_are_formatted_and_personalized():
    pupil=User(full_name='S',username='x',grade=3,board='CBSE',language='English',password_hash='unused')
    a=build_system_prompt(pupil)
    pupil.grade=12
    b=build_system_prompt(pupil)
    assert 'Class 3' in a and 'Class 12' in b and a!=b
    assert 'Markdown' in b and 'LaTeX' in b
    assert 'NOT given any textbook' in b


def test_otp_toggle_defaults_to_on_and_can_be_disabled(client, monkeypatch):
    monkeypatch.delenv('WHATSAPP_OTP_ENABLED', raising=False)
    assert client.get('/api/config').json() == {'whatsapp_otp_enabled': True}
    assert client.get('/api/config').headers.get('cache-control') == 'no-store'
    monkeypatch.setenv('WHATSAPP_OTP_ENABLED', 'false')
    assert client.get('/api/config').json() == {'whatsapp_otp_enabled': False}


def test_disabled_otp_allows_signup_without_ticket_but_does_not_fake_verification(client, monkeypatch):
    monkeypatch.setenv('WHATSAPP_OTP_ENABLED', 'false')
    payload = {'username':'temp_user','full_name':'Temporary Student',
        'email':'temporary@example.com','whatsapp_number':'+919999999981',
        'password':'securepass123','grade':6,'board':'CBSE',
        'language':'English','guardian_permission':True}
    r = client.post('/api/auth/register', json=payload)
    assert r.status_code == 201, r.text
    assert r.json()['student']['whatsapp_verified'] is False
    assert r.json()['student']['whatsapp_number'] == payload['whatsapp_number']
    token = {'Authorization':f"Bearer {r.json()['access_token']}"}
    assert client.get('/api/me',headers=token).json()['whatsapp_verified'] is False
    assert client.patch('/api/me',headers=token,json={'board':'ICSE'}).status_code == 422
    assert client.patch('/api/me',headers=token,json={'grade':8}).status_code == 422
    assert client.post('/api/auth/login',json={'username':'temp_user','password':'securepass123'}).status_code == 200


def test_switching_otp_back_on_requires_real_verification(client, monkeypatch):
    payload = {'username':'second_temp','full_name':'Another Student',
        'email':'another_temp@example.com','whatsapp_number':'+919999999982',
        'password':'securepass123','grade':4,'board':'ICSE',
        'language':'English','guardian_permission':True}
    monkeypatch.setenv('WHATSAPP_OTP_ENABLED', 'false')
    assert client.post('/api/auth/whatsapp/start',json={'whatsapp_number':payload['whatsapp_number']}).status_code == 409
    assert client.post('/api/auth/whatsapp/check',json={'whatsapp_number':payload['whatsapp_number'],'code':'123456'}).status_code == 409
    monkeypatch.setenv('WHATSAPP_OTP_ENABLED', 'true')
    assert client.post('/api/auth/register',json=payload).status_code == 403
    payload['verification_ticket'] = verified_ticket(client, payload['whatsapp_number'])
    response = client.post('/api/auth/register',json=payload)
    assert response.status_code == 201, response.text
    assert response.json()['student']['whatsapp_verified'] is True


def test_misspelled_switch_never_disables_security(client, monkeypatch):
    monkeypatch.setenv('WHATSAPP_OTP_ENABLED', 'flase')
    from app.settings import whatsapp_otp_enabled
    import pytest
    with pytest.raises(RuntimeError, match='true or false'):
        whatsapp_otp_enabled()
