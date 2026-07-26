from enum import Enum

from fastapi import Depends

from app.database import get_user_by_id
from app.oauth2 import AuthJWT


class UserRole(str, Enum):
    SUPER_ADMIN = "0"
    ADMIN = "1"
    AUDITOR = "2"


def get_user_role(Authorize: AuthJWT = Depends()):
    Authorize.jwt_required()
    user = get_user_by_id(Authorize.get_jwt_subject())
    return UserRole(str(user.role)) if user else None