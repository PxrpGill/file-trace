from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import AdminUser, DbDep, client_ip
from app.models import AuditAction, User
from app.schemas.auth import UserOut
from app.schemas.users import PasswordReset, UserCreate, UserUpdate
from app.services import audit
from app.services.security import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _get_user_or_404(db: DbDep, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserOut])
def list_users(db: DbDep, _: AdminUser) -> list[User]:
    return db.query(User).order_by(User.username).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate, db: DbDep, admin: AdminUser, request: Request
) -> User:
    if db.query(User).filter_by(username=body.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username already taken"
        )
    user = User(
        username=body.username,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=body.role,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    audit.record(
        db,
        AuditAction.user_create,
        user_id=admin.id,
        target_user_id=user.id,
        ip=client_ip(request),
        details={"username": user.username, "role": user.role.value},
    )
    db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, body: UserUpdate, db: DbDep, admin: AdminUser, request: Request
) -> User:
    user = _get_user_or_404(db, user_id)
    changed = body.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(user, field, value)
    audit.record(
        db,
        AuditAction.user_update,
        user_id=admin.id,
        target_user_id=user.id,
        ip=client_ip(request),
        details={"changed": {k: getattr(user, k) for k in changed}},
    )
    db.commit()
    return user


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int, body: PasswordReset, db: DbDep, admin: AdminUser, request: Request
) -> dict:
    user = _get_user_or_404(db, user_id)
    user.password_hash = hash_password(body.password)
    user.must_change_password = True
    audit.record(
        db,
        AuditAction.user_password_reset,
        user_id=admin.id,
        target_user_id=user.id,
        ip=client_ip(request),
    )
    db.commit()
    return {"status": "ok"}
