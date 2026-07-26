def userEntity(user) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "password": user.password,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": user.role,
    }


def userResponseEntity(user) -> dict:
    result = userEntity(user)
    result.pop("password", None)
    return result


def embeddedUserResponse(user) -> dict:
    return {"id": str(user.id), "name": user.name, "email": user.email}


def userListEntity(users) -> list:
    return [userEntity(user) for user in users]