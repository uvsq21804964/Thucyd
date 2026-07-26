from datetime import timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select

from app import outils, schemas
from app.database import SessionLocal, UserModel, get_user_by_email, get_user_by_id, session_scope
from app.get_user_role import UserRole, user_role
from app.oauth2 import AuthJWT
from app.settings import settings

user = APIRouter()
ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.ADMIN}


def public_user(document: UserModel):
    return {
        "id": str(document.id),
        "name": document.name,
        "email": document.email,
        "role": document.role,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
    }


@user.post("/login")
async def login(payload: schemas.LoginUserSchema, response: Response, Authorize: AuthJWT = Depends()):
    db_user = get_user_by_email(payload.email)
    if db_user is None or not outils.verify_password(payload.password, db_user.password):
        raise HTTPException(status_code=401, detail="E-mail ou mot de passe incorrect.")
    subject = str(db_user.id)
    access_token = Authorize.create_access_token(subject, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRES_IN))
    refresh_token = Authorize.create_refresh_token(subject, timedelta(minutes=settings.REFRESH_TOKEN_EXPIRES_IN))
    cookie_options = {"path": "/", "httponly": True, "secure": settings.COOKIE_SECURE, "samesite": "lax"}
    response.set_cookie("access_token", access_token, max_age=settings.ACCESS_TOKEN_EXPIRES_IN * 60, **cookie_options)
    response.set_cookie("refresh_token", refresh_token, max_age=settings.REFRESH_TOKEN_EXPIRES_IN * 60, **cookie_options)
    return {"status": "success", "user": public_user(db_user)}


@user.get("/auth/me")
async def current_user(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    user_role(Authorize, access_token)
    document = get_user_by_id(Authorize.get_jwt_subject())
    if document is None:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable.")
    return {"authenticated": True, "user": public_user(document)}


@user.post("/admin/create-account", status_code=status.HTTP_201_CREATED)
async def create_account(payload: schemas.CreateUserSchema, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    if user_role(Authorize, access_token) not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Accès interdit.")
    if payload.password != payload.passwordConfirm:
        raise HTTPException(status_code=400, detail="Les mots de passe sont différents.")
    email = payload.email.lower()
    with session_scope() as session:
        if session.scalar(select(UserModel).where(UserModel.email == email)):
            raise HTTPException(status_code=409, detail="Le compte existe déjà.")
        if session.scalar(select(UserModel).where(UserModel.name == payload.name)):
            raise HTTPException(status_code=409, detail="Ce nom d'utilisateur existe déjà.")
        document = UserModel(name=payload.name, email=email, password=outils.hash_password(payload.password), role=payload.role)
        session.add(document)
        session.flush()
        result = public_user(document)
    return {"status": "success", "user": result}


@user.get("/users/options")
async def user_options(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    user_role(Authorize, access_token)
    with SessionLocal() as session:
        users = session.scalars(select(UserModel).order_by(UserModel.name)).all()
        return {"users": [{"id": str(item.id), "name": item.name, "email": item.email} for item in users]}


@user.get("/admin/accounts")
async def show_accounts(Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    if user_role(Authorize, access_token) not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Accès interdit.")
    with SessionLocal() as session:
        users = session.scalars(select(UserModel).order_by(UserModel.created_at.desc())).all()
        return {"status": "success", "users": [public_user(item) for item in users]}


@user.delete("/admin/delete")
async def delete_user(username: str, Authorize: AuthJWT = Depends(), access_token: str = Cookie(None)):
    if user_role(Authorize, access_token) != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Accès interdit.")
    current_id = Authorize.get_jwt_subject()
    with session_scope() as session:
        target = session.scalar(select(UserModel).where(UserModel.name == username))
        if target is None:
            raise HTTPException(status_code=404, detail="Utilisateur introuvable.")
        if str(target.id) == current_id or target.role == 0:
            raise HTTPException(status_code=400, detail="Ce compte ne peut pas être supprimé.")
        session.delete(target)
    return {"message": "Utilisateur supprimé."}


@user.post("/disconnect")
async def disconnect(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Vous avez été déconnecté."}