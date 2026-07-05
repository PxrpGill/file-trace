from fastapi import APIRouter, HTTPException, Request, status

from app.api.deps import ActiveUser, CurrentUser, DbDep, client_ip
from app.models import AuditAction, User
from app.schemas.auth import (
    ChangePasswordRequest,
    DownloadTicketResponse,
    LoginRequest,
    LoginResponse,
    UserOut,
)
from app.services import audit
from app.services.security import (
    create_access_token,
    create_download_ticket,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: DbDep, request: Request) -> LoginResponse:
    ip = client_ip(request)
    user = db.query(User).filter_by(username=body.username).first()
    if (
        user is None
        or not user.is_active
        or not verify_password(body.password, user.password_hash)
    ):
        audit.record(
            db,
            AuditAction.login_failed,
            user_id=user.id if user else None,
            ip=ip,
            details={"username": body.username},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    audit.record(db, AuditAction.login, user_id=user.id, ip=ip)
    db.commit()
    return LoginResponse(
        access_token=create_access_token(user.id),
        must_change_password=user.must_change_password,
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/download-ticket", response_model=DownloadTicketResponse)
def download_ticket(user: ActiveUser) -> DownloadTicketResponse:
    return DownloadTicketResponse(ticket=create_download_ticket(user.id))


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest, user: CurrentUser, db: DbDep, request: Request
) -> dict:
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect"
        )
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    audit.record(
        db,
        AuditAction.user_update,
        user_id=user.id,
        target_user_id=user.id,
        ip=client_ip(request),
        details={"changed": ["password"]},
    )
    db.commit()
    return {"status": "ok"}
