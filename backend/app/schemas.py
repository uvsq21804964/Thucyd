from datetime import datetime
from typing import List, Union

from pydantic import BaseModel, ConfigDict, EmailStr, Field, constr, field_validator


class UserBaseSchema(BaseModel):
    name: str
    email: str
    role: int
    created_at: Union[datetime, None] = None
    updated_at: Union[datetime, None] = None

    class Config:
        from_attributes = True


class CreateUserSchema(UserBaseSchema):
    password: constr(min_length=8)
    passwordConfirm: str


class LoginUserSchema(BaseModel):
    email: EmailStr
    password: constr(min_length=8)


class UserResponseSchema(UserBaseSchema):
    id: str
    pass


class UserResponse(BaseModel):
    status: str
    user: UserResponseSchema


class FilteredUserResponse(UserBaseSchema):
    id: str


class question(BaseModel):
    questionid: str
    content: str


class AuditQuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ref: int = Field(ge=1)
    category: str = Field(alias="catégorie", min_length=1, max_length=150)
    chantier: str = Field(min_length=1, max_length=250)
    question: str = Field(min_length=1, max_length=2000)
    comment: None = None
    numeric_mark: None = Field(default=None, alias="note numérique")
    marking_guide: list[str] = Field(alias="aide à la notation", max_length=30)

    @field_validator("category", "chantier", "question")
    @classmethod
    def strip_required_text(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("ce champ ne peut pas être vide")
        return value

    @field_validator("marking_guide")
    @classmethod
    def validate_marking_guide(cls, value: list[str]):
        if any(not item.strip() or len(item) > 1000 for item in value):
            raise ValueError("chaque aide doit être un texte non vide de 1 000 caractères maximum")
        return [item.strip() for item in value]


class audits(BaseModel):
    company_name: str
    chef_auditeurs: str
    list_auditeurs: list[str]
    description: str
    questionnaire: list[AuditQuestionInput] | None = Field(default=None, min_length=1, max_length=1000)

    @field_validator("questionnaire")
    @classmethod
    def unique_question_refs(cls, value):
        if value is None:
            return value
        refs = [question.ref for question in value]
        if len(refs) != len(set(refs)):
            raise ValueError("chaque question doit avoir une référence unique")
        return value


class setmark(BaseModel):
    id: str
    qst_ref: int
    mark: float = Field(ge=0, le=4)


class answer(BaseModel):
    mark: float = Field(ge=0, le=4)
    comment: str = Field(default="", max_length=1000)

class comment(BaseModel):
    id: str
    qst_ref: int
    comment: str


class description(BaseModel):
    id: str
    qst_ref: int
    description: str


class auditor(BaseModel):
    id: str
    auditor: str


class chef(BaseModel):
    id: str
    chef: str


class audit(BaseModel):
    id: str


class cate(BaseModel):
    id: str
    categorie: str


class AddMembersRequest(BaseModel):
    auditsid: str
    members: List[str]


class Question(BaseModel):
    ref: str
    score: float
    commentaire: str
    question_str: str
    chantier: str
    categorie: str
    aide_note: list[str]
