from app.models import AuditAction, AuditLog


def login(client, username, password):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


def auth_header(client, username, password):
    token = login(client, username, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_success_returns_token(client, admin):
    response = login(client, "admin", "admin-pass")
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["must_change_password"] is False


def test_login_writes_audit_record(client, db, admin):
    login(client, "admin", "admin-pass")
    record = db.query(AuditLog).filter_by(action=AuditAction.login).one()
    assert record.user_id == admin.id
    assert record.ip is not None


def test_login_wrong_password_rejected_and_audited(client, db, admin):
    response = login(client, "admin", "wrong")
    assert response.status_code == 401
    record = db.query(AuditLog).filter_by(action=AuditAction.login_failed).one()
    assert record.details["username"] == "admin"


def test_login_unknown_user_rejected(client, db):
    response = login(client, "ghost", "whatever")
    assert response.status_code == 401
    assert db.query(AuditLog).filter_by(action=AuditAction.login_failed).count() == 1


def test_login_inactive_user_rejected(client, db, user):
    user.is_active = False
    db.commit()
    assert login(client, "alice", "alice-pass").status_code == 401


def test_me_returns_current_user(client, admin):
    headers = auth_header(client, "admin", "admin-pass")
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["username"] == "admin"
    assert response.json()["role"] == "admin"


def test_me_without_token_rejected(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_with_garbage_token_rejected(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer junk"})
    assert response.status_code == 401


def test_change_password_clears_flag_and_rotates_password(client, db, user):
    user.must_change_password = True
    db.commit()

    body = login(client, "alice", "alice-pass").json()
    assert body["must_change_password"] is True

    headers = {"Authorization": f"Bearer {body['access_token']}"}
    response = client.post(
        "/api/auth/change-password",
        json={"old_password": "alice-pass", "new_password": "new-pass-123"},
        headers=headers,
    )
    assert response.status_code == 200

    assert login(client, "alice", "alice-pass").status_code == 401
    assert login(client, "alice", "new-pass-123").json()["must_change_password"] is False


def test_change_password_requires_correct_old_password(client, user):
    headers = auth_header(client, "alice", "alice-pass")
    response = client.post(
        "/api/auth/change-password",
        json={"old_password": "wrong", "new_password": "new-pass-123"},
        headers=headers,
    )
    assert response.status_code == 400
