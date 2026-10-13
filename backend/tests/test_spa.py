"""Unit checks for the one-service frontend router (no npm/build needed)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.spa import SPAStaticFiles


def test_spa_serves_root_and_internal_routes(tmp_path):
    (tmp_path / 'index.html').write_text('<html>StudyMate website</html>')
    (tmp_path / 'logo.svg').write_text('<svg></svg>')
    site = FastAPI()
    @site.get('/api/health')
    def health():
        return {'status': 'ok'}
    site.mount('/', SPAStaticFiles(directory=str(tmp_path), html=True))
    with TestClient(site) as client:
        assert client.get('/').status_code == 200
        assert client.get('/student/history').text == '<html>StudyMate website</html>'
        assert client.get('/logo.svg').text == '<svg></svg>'
        assert client.get('/api/health').json() == {'status': 'ok'}
        assert client.get('/api/unrecognized').status_code == 404
        assert client.get('/assets/missing.js').status_code == 404
        assert client.post('/student/history').status_code in (404, 405)
