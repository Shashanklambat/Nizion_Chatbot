"""Additional compatibility check for the mobile sign-in page."""
from tests.conftest import register


def test_login_using_email_address(client):
    register(client, username='test_email_login', grade=8)
    response = client.post('/api/auth/login', json={
        'username': 'TEST_EMAIL_LOGIN@EXAMPLE.COM',
        'password': 'securepass123',
    })
    assert response.status_code == 200
    assert response.json()['student']['username'] == 'test_email_login'
