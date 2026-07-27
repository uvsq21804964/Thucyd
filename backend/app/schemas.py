from datetime import datetime
from typing import List, Literal, Union

from pydantic import BaseModel, ConfigDict, EmailStr, Field, constr, field_validator, model_validator


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


class DisplayCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_ref: int = Field(ge=1)
    operator: Literal["eq", "neq", "lt", "lte", "gt", "gte", "in", "not_in", "answered", "unanswered"]
    value: float | list[float] | None = None

    @model_validator(mode="after")
    def validate_value(self):
        if self.operator in {"answered", "unanswered"}:
            if self.value is not None:
                raise ValueError("value doit être omise avec answered ou unanswered")
        elif self.operator in {"in", "not_in"}:
            if not isinstance(self.value, list) or not self.value:
                raise ValueError("value doit être une liste non vide avec in ou not_in")
        elif isinstance(self.value, list) or self.value is None:
            raise ValueError("value doit être un nombre pour cet opérateur")
        values = self.value if isinstance(self.value, list) else [self.value]
        if any(value is not None and not 0 <= value <= 4 for value in values):
            raise ValueError("les valeurs de condition doivent être comprises entre 0 et 4")
        return self


class AuditQuestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    ref: int = Field(ge=1)
    category: str = Field(alias="catégorie", min_length=1, max_length=150)
    chantier: str = Field(min_length=1, max_length=250)
    question: str = Field(min_length=1, max_length=2000)
    comment: None = None
    numeric_mark: None = Field(default=None, alias="note numérique")
    marking_guide: list[str] = Field(alias="aide à la notation", max_length=30)
    display_if: DisplayCondition | None = None

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
        positions = {question.ref: index for index, question in enumerate(value)}
        for index, question in enumerate(value):
            if question.display_if is None:
                continue
            source_position = positions.get(question.display_if.question_ref)
            if source_position is None:
                raise ValueError("chaque condition doit référencer une question existante")
            if source_position >= index:
                raise ValueError("une condition doit référencer une question placée plus tôt")
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
