"""HTTP API for registration, profiles, conversations, and AI responses."""
import os
import json
import secrets
from datetime import timedelta, timezone
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .ai import generate_answer, stream_answer
from .database import Base, engine, get_db
from .db_guards import install_postgres_guards
from .models import Conversation, Message, PhoneChallenge, User, utcnow
from .schemas import (
    AnswerResponse, ConversationDetail, ConversationRead, LoginRequest,
    ProfileUpdate, QuestionRequest, RegisterRequest, TokenResponse, UserRead,
    StartOtpRequest, CheckOtpRequest, CheckOtpResponse,
)
from .security import create_token, current_user, hash_password, verify_password
from .otp import new_code, code_digest, matches_code, create_ticket, decode_ticket
from .whatsapp import send_whatsapp_code
from .settings import whatsapp_otp_enabled


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # For the MVP only. Add Alembic migrations before schema changes in production.
    Base.metadata.create_all(bind=engine)
    install_postgres_guards()
    yield


app = FastAPI(title="StudyMate API", version="0.1.0", lifespan=lifespan)
origins = [item.strip() for item in os.getenv(
    "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "classwise-api"}


@app.get("/api/config")
def public_config(response: Response):
    # Public feature flag only; do not expose credentials or internal configuration.
    response.headers["Cache-Control"] = "no-store"
    return {"whatsapp_otp_enabled": whatsapp_otp_enabled()}


def aware(value):
    """SQLite used in unit tests can return naive timestamps."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@app.post("/api/auth/whatsapp/start")
async def start_whatsapp(data: StartOtpRequest, db: Session = Depends(get_db)):
    if not whatsapp_otp_enabled():
        raise HTTPException(status_code=409, detail="WhatsApp verification is currently disabled")
    phone = data.whatsapp_number
    if db.scalar(select(User.id).where(User.whatsapp_number == phone)):
        raise HTTPException(status_code=409, detail="This WhatsApp number already has an account")
    now = utcnow()
    challenge = db.scalar(select(PhoneChallenge).where(PhoneChallenge.phone == phone).with_for_update())
    if challenge:
        if now - aware(challenge.sent_at) < timedelta(seconds=60):
            raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another code")
        if now - aware(challenge.window_started_at) < timedelta(days=1):
            if challenge.send_count >= 5:
                raise HTTPException(status_code=429, detail="Too many codes requested for this number today")
            challenge.send_count += 1
        else:
            challenge.send_count = 1
            challenge.window_started_at = now
    code = new_code()
    # Never pretend code was sent. If Meta rejects the message, no new challenge is saved.
    await send_whatsapp_code(phone, code)
    if challenge is None:
        challenge = PhoneChallenge(phone=phone, code_hash=code_digest(phone, code),
                                   sent_at=now, expires_at=now + timedelta(minutes=10),
                                   window_started_at=now, send_count=1)
        db.add(challenge)
    else:
        challenge.code_hash = code_digest(phone, code)
        challenge.sent_at = now
        challenge.expires_at = now + timedelta(minutes=10)
        challenge.attempts = 0
        challenge.verified_at = None
        challenge.used_at = None
    db.commit()
    return {'message': 'Verification code requested on WhatsApp. It expires in 10 minutes.'}


@app.post("/api/auth/whatsapp/check", response_model=CheckOtpResponse)
def check_whatsapp(data: CheckOtpRequest, db: Session = Depends(get_db)):
    if not whatsapp_otp_enabled():
        raise HTTPException(status_code=409, detail="WhatsApp verification is currently disabled")
    challenge = db.scalar(select(PhoneChallenge).where(
        PhoneChallenge.phone == data.whatsapp_number).with_for_update())
    now = utcnow()
    if (not challenge or challenge.used_at or now > aware(challenge.expires_at)
            or challenge.attempts >= 5):
        raise HTTPException(status_code=400, detail="Verification expired or unavailable. Request a new code.")
    if challenge.verified_at:
        raise HTTPException(status_code=400, detail="Already verified. Complete registration or request a new code.")
    challenge.attempts += 1
    if not matches_code(challenge.phone, data.code, challenge.code_hash):
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect verification code")
    challenge.verified_at = now
    db.commit()
    return {'verification_ticket': create_ticket(challenge.id, challenge.phone),
            'message': 'WhatsApp number verified. Complete your registration.'}


@app.post("/api/auth/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if not data.guardian_permission:
        raise HTTPException(status_code=400, detail="Parent/guardian permission is required for student use")
    require_otp = whatsapp_otp_enabled()
    challenge = None
    if require_otp:
        if not data.verification_ticket:
            raise HTTPException(status_code=403, detail="Verify your WhatsApp number before signing up")
        challenge_id = decode_ticket(data.verification_ticket, data.whatsapp_number)
        challenge = db.scalar(select(PhoneChallenge).where(
            PhoneChallenge.id == challenge_id,
            PhoneChallenge.phone == data.whatsapp_number,
        ).with_for_update())
        if not challenge or not challenge.verified_at or challenge.used_at:
            raise HTTPException(status_code=403, detail="A fresh WhatsApp verification is required")
    user = User(
        username=data.username.strip().lower() if data.username else f"student_{secrets.token_hex(10)}",
        full_name=data.full_name.strip(),
        email=str(data.email).lower(),
        whatsapp_number=data.whatsapp_number,
        # Never mark an unverified test phone as verified.
        whatsapp_verified=require_otp,
        grade=data.grade,
        board=data.board,
        language=data.language,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    if challenge is not None:
        challenge.used_at = utcnow()  # Consume ticket in the user creation transaction.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username, email or WhatsApp number is already registered") from None
    db.refresh(user)
    return {'access_token': create_token(user.id), 'student': user}


@app.post("/api/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    username = data.username.strip().lower()
    user = db.scalar(select(User).where(or_(User.username == username, User.email == username)))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return {"access_token": create_token(user.id), "student": user}


@app.get("/api/me", response_model=UserRead)
def me(student: User = Depends(current_user)):
    return student


@app.patch("/api/me", response_model=UserRead)
def update_profile(
    changes: ProfileUpdate,
    student: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    for key, value in changes.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(student, key, value.strip() if key == "full_name" else value)
    db.commit()
    db.refresh(student)
    return student


@app.get("/api/conversations", response_model=list[ConversationRead])
def list_conversations(student: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Conversation)
        .where(Conversation.user_id == student.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    ).all()


@app.post("/api/conversations", response_model=ConversationRead, status_code=201)
def create_conversation(student: User = Depends(current_user), db: Session = Depends(get_db)):
    conversation = Conversation(user_id=student.id, title="New chat")
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def owned_conversation(conversation_id: int, student: User, db: Session) -> Conversation:
    conversation = db.scalar(select(Conversation).where(
        Conversation.id == conversation_id, Conversation.user_id == student.id
    ))
    if conversation is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    student: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    conversation = db.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.user_id == student.id)
        .options(selectinload(Conversation.messages))
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: int,
    student: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    conversation = owned_conversation(conversation_id, student, db)
    db.delete(conversation)
    db.commit()


@app.post("/api/conversations/{conversation_id}/messages", response_model=AnswerResponse, status_code=201)
async def ask_question(
    conversation_id: int,
    data: QuestionRequest,
    student: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    conversation = owned_conversation(conversation_id, student, db)
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question cannot be blank")

    previous = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.id.desc()).limit(12)
    ).all()
    history = [{"role": item.role, "content": item.content} for item in reversed(previous)]
    # Generate first: failed Groq requests do not leave half-complete conversations.
    answer = await generate_answer(student, history, question)

    user_message = Message(conversation_id=conversation.id, role="user", content=question)
    assistant_message = Message(conversation_id=conversation.id, role="assistant", content=answer)
    db.add_all([user_message, assistant_message])
    if conversation.title == "New chat":
        conversation.title = question[:65] + ("…" if len(question) > 65 else "")
    conversation.updated_at = utcnow()
    db.commit()
    db.refresh(user_message)
    db.refresh(assistant_message)
    db.refresh(conversation)
    return {
        "conversation": conversation,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }


@app.post("/api/conversations/{conversation_id}/stream")
async def ask_question_stream(
    conversation_id: int,
    data: QuestionRequest,
    student: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Stream answer fragments as NDJSON. Save messages only after successful completion.

    Existing /messages endpoint is retained for older clients and tests.
    """
    conversation = owned_conversation(conversation_id, student, db)
    question = data.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question cannot be blank")
    previous = db.scalars(
        select(Message).where(Message.conversation_id == conversation.id)
        .order_by(Message.id.desc()).limit(12)
    ).all()
    history = [{"role": item.role, "content": item.content} for item in reversed(previous)]

    async def produce():
        parts = []
        try:
            async for chunk in stream_answer(student, history, question):
                parts.append(chunk)
                yield json.dumps({"type": "delta", "text": chunk}) + "\n"
            answer = "".join(parts).strip()
            if not answer:
                raise HTTPException(status_code=502, detail="The AI returned an empty answer. Please retry.")
            user_message = Message(conversation_id=conversation.id, role="user", content=question)
            assistant_message = Message(conversation_id=conversation.id, role="assistant", content=answer)
            db.add_all([user_message, assistant_message])
            if conversation.title == "New chat":
                conversation.title = question[:65] + ("…" if len(question) > 65 else "")
            conversation.updated_at = utcnow()
            db.commit()
            db.refresh(user_message)
            db.refresh(assistant_message)
            yield json.dumps({"type": "done", "user_message": jsonable_encoder(user_message),
                              "assistant_message": jsonable_encoder(assistant_message)}) + "\n"
        except HTTPException as exc:
            db.rollback()
            yield json.dumps({"type": "error", "message": exc.detail}) + "\n"
        except Exception:
            db.rollback()
            yield json.dumps({"type": "error", "message": "Unable to finish the answer. Please try again."}) + "\n"

    return StreamingResponse(produce(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache, no-transform",
                                      "X-Accel-Buffering": "no"})
