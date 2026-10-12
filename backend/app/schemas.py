"""Public API request/response validation."""
from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Username = Annotated[str, StringConstraints(min_length=3, max_length=32, pattern=r'^[A-Za-z0-9_]+$')]
Phone = Annotated[str, StringConstraints(pattern=r'^\+[1-9]\d{7,14}$', min_length=9, max_length=16)]
Board = Literal['CBSE', 'ICSE', 'State Board', 'Other']
Language = Literal['English', 'Hindi']

class StartOtpRequest(BaseModel):
    whatsapp_number: Phone

class CheckOtpRequest(BaseModel):
    whatsapp_number: Phone
    code: str = Field(pattern=r'^\d{6}$')

class CheckOtpResponse(BaseModel):
    verification_ticket: str
    message: str

class RegisterRequest(BaseModel):
    username: Username
    full_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    whatsapp_number: Phone
    # Optional in the request schema, but required by the backend when OTP is enabled.
    verification_ticket: str | None = Field(default=None, min_length=10, max_length=2000)
    password: str = Field(min_length=8, max_length=128)
    grade: int = Field(ge=1, le=12)
    board: Board
    language: Language = 'English'
    guardian_permission: bool

    @field_validator('full_name')
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError('Name must contain at least two letters')
        return value

class LoginRequest(BaseModel):
    username: str
    password: str

class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: EmailStr
    whatsapp_number: str
    whatsapp_verified: bool
    grade: int
    board: str
    language: str

class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')  # Grade, board, email and phone cannot be changed here.
    full_name: str | None = Field(default=None, min_length=2, max_length=80)
    language: Language | None = None

    @field_validator('full_name')
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    student: UserRead

class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: Literal['user', 'assistant']
    content: str
    created_at: datetime

class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

class ConversationDetail(ConversationRead):
    messages: list[MessageRead]

class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

class AnswerResponse(BaseModel):
    conversation: ConversationRead
    user_message: MessageRead
    assistant_message: MessageRead
