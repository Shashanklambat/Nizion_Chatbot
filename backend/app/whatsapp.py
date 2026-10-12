"""Real WhatsApp authentication messages sent with Meta Cloud API.

There is intentionally no fake, no-op, or 'accept any code' fallback.
An approved AUTHENTICATION/COPY_CODE WhatsApp template is required.
"""
import os
import httpx
from fastapi import HTTPException

async def send_whatsapp_code(phone: str, code: str) -> None:
    token = os.getenv('META_WA_ACCESS_TOKEN', '').strip()
    phone_id = os.getenv('META_WA_PHONE_NUMBER_ID', '').strip()
    template = os.getenv('META_WA_OTP_TEMPLATE', '').strip()
    locale = os.getenv('META_WA_TEMPLATE_LANG', 'en_US').strip()
    version = os.getenv('META_GRAPH_VERSION', 'v23.0').strip()
    if not (token and phone_id and template and version.startswith('v')):
        raise HTTPException(status_code=503, detail='WhatsApp verification is not configured by the site administrator.')
    body = {
        'messaging_product': 'whatsapp',
        'to': phone.lstrip('+'),
        'type': 'template',
        'template': {
            'name': template,
            'language': {'code': locale},
            'components': [
                {'type': 'body', 'parameters': [{'type': 'text', 'text': code}]},
                {'type': 'button', 'sub_type': 'url', 'index': '0', 'parameters': [{'type': 'text', 'text': code}]},
            ],
        },
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f'https://graph.facebook.com/{version}/{phone_id}/messages',
                headers={'Authorization': f'Bearer {token}'}, json=body,
            )
        response.raise_for_status()
        if not response.json().get('messages'):
            raise HTTPException(status_code=502, detail='WhatsApp did not accept the verification request.')
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail='WhatsApp could not send a code. Check sender and approved template settings.') from None
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail='Could not reach WhatsApp. Please retry.') from None
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail='Unexpected WhatsApp provider response.') from None
