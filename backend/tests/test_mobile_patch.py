"""Regression coverage for mobile signup and streaming answers."""
import json
from fastapi import HTTPException
from app import main
from .conftest import register, verified_ticket


def test_register_by_email_only(client):
    phone = '+919888801234'
    ticket = verified_ticket(client, phone)
    result = client.post('/api/auth/register', json={
        'full_name': 'First Student', 'email': 'emailonly@example.com',
        'whatsapp_number': phone, 'verification_ticket': ticket,
        'password': 'securepass123', 'grade': 9, 'board': 'CBSE',
        'guardian_permission': True,
    })
    assert result.status_code == 201, result.text
    assert result.json()['student']['username'].startswith('student_')
    response = client.post('/api/auth/login', json={
        'username': 'EMAILONLY@EXAMPLE.COM', 'password': 'securepass123',
    })
    assert response.status_code == 200
    assert response.json()['student']['email'] == 'emailonly@example.com'
    assert client.patch('/api/me', headers={'Authorization': f"Bearer {result.json()['access_token']}"},
                        json={'grade': 11}).status_code == 422


def test_streaming_saves_exactly_one_pair(client, monkeypatch):
    headers = register(client, 'streamer', grade=8)
    cid = client.post('/api/conversations', headers=headers).json()['id']

    async def fake_stream(student, history, question):
        assert student.grade == 8
        assert question == 'Explain fractions'
        yield 'Fractions: '
        yield '$$\\frac{1}{2}$$'

    monkeypatch.setattr(main, 'stream_answer', fake_stream)
    response = client.post(f'/api/conversations/{cid}/stream', headers=headers,
                           json={'question': 'Explain fractions'})
    assert response.status_code == 200
    lines = [json.loads(line) for line in response.text.splitlines() if line.strip()]
    assert [line['type'] for line in lines] == ['delta', 'delta', 'done']
    assert lines[-1]['assistant_message']['content'] == 'Fractions: $$\\frac{1}{2}$$'
    messages = client.get(f'/api/conversations/{cid}', headers=headers).json()['messages']
    assert len(messages) == 2 and messages[1]['content'] == lines[-1]['assistant_message']['content']


def test_streaming_error_does_not_save_half_answer(client, monkeypatch):
    headers = register(client, 'streamfail', grade=8)
    cid = client.post('/api/conversations', headers=headers).json()['id']

    async def failure(student, history, question):
        yield 'Only partial'
        raise HTTPException(status_code=502, detail='Service interrupted')

    monkeypatch.setattr(main, 'stream_answer', failure)
    response = client.post(f'/api/conversations/{cid}/stream', headers=headers,
                           json={'question': 'Explain fractions'})
    assert response.status_code == 200
    assert json.loads(response.text.splitlines()[-1]) == {
        'type': 'error', 'message': 'Service interrupted',
    }
    assert client.get(f'/api/conversations/{cid}', headers=headers).json()['messages'] == []
