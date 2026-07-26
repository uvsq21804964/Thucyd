from enum import Enum

from fastapi import HTTPException, status

from app.database import get_user_by_id


class UserRole(str, Enum):
    SUPER_ADMIN = "0"
    ADMIN = "1"
    AUDITOR = "2"


def user_role(authorize, access_token=None):
    authorize.jwt_required()
    db_user = get_user_by_id(authorize.get_jwt_subject())
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    try:
        return UserRole(str(db_user.role))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Rôle utilisateur invalide") from exc