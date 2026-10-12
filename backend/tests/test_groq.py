import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException

from app.ai import GROQ_CHAT_URL, generate_answer
from app.models import User


def sample_user(grade=3):
    return User(username="tester", full_name="Sample Student", grade=grade,
                board="CBSE", language="English", password_hash="none")


def test_http_request_is_class_aware_and_keeps_api_key_server_side(monkeypatch):
    sent = []

    def fake_response(request):
        sent.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Gravity pulls things down."}}]})

    original_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        return original_client(transport=httpx.MockTransport(fake_response), *args, **kwargs)

    monkeypatch.setenv("GROQ_API_KEY", "testing-secret")
    monkeypatch.setattr("app.ai.httpx.AsyncClient", mock_client)
    result = asyncio.run(generate_answer(sample_user(3), [], "What is gravity?"))
    assert result == "Gravity pulls things down."
    assert str(sent[0].url) == GROQ_CHAT_URL
    assert sent[0].headers["Authorization"] == "Bearer testing-secret"
    body = json.loads(sent[0].content)
    assert "Class 3" in body["messages"][0]["content"]
    assert body["messages"][-1] == {"role": "user", "content": "What is gravity?"}


def test_groq_rate_limit_returns_clear_error(monkeypatch):
    original_client = httpx.AsyncClient

    def mock_client(*args, **kwargs):
        transport = httpx.MockTransport(lambda request: httpx.Response(429, json={"error": "limited"}))
        return original_client(transport=transport, *args, **kwargs)

    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setattr("app.ai.httpx.AsyncClient", mock_client)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_answer(sample_user(), [], "Hello"))
    assert exc_info.value.status_code == 429
