from app.models import AuditAction, AuditLog

from tests.test_auth import auth_header, login


def admin_headers(client):
    return auth_header(client, "admin", "admin-pass")


def test_admin_creates_user(client, db, admin):
    response = client.post(
        "/api/users",
        json={"username": "bob", "full_name": "Bob B", "password": "temp-pass-1"},
        headers=admin_headers(client),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "bob"
    assert body["must_change_password"] is True

    record = db.query(AuditLog).filter_by(action=AuditAction.user_create).one()
    assert record.user_id == admin.id
    assert record.target_user_id == body["id"]

    assert login(client, "bob", "temp-pass-1").status_code == 200


def test_duplicate_username_rejected(client, admin, user):
    response = client.post(
        "/api/users",
        json={"username": "alice", "password": "temp-pass-1"},
        headers=admin_headers(client),
    )
    assert response.status_code == 409


def test_admin_lists_users(client, admin, user):
    response = client.get("/api/users", headers=admin_headers(client))
    assert response.status_code == 200
    usernames = {u["username"] for u in response.json()}
    assert usernames == {"admin", "alice"}


def test_admin_blocks_user(client, db, admin, user):
    response = client.patch(
        f"/api/users/{user.id}",
        json={"is_active": False},
        headers=admin_headers(client),
    )
    assert response.status_code == 200
    assert login(client, "alice", "alice-pass").status_code == 401

    record = db.query(AuditLog).filter_by(action=AuditAction.user_update).one()
    assert record.details["changed"] == {"is_active": False}


def test_admin_resets_password(client, db, admin, user):
    response = client.post(
        f"/api/users/{user.id}/reset-password",
        json={"password": "fresh-pass-1"},
        headers=admin_headers(client),
    )
    assert response.status_code == 200
    assert login(client, "alice", "alice-pass").status_code == 401
    body = login(client, "alice", "fresh-pass-1").json()
    assert body["must_change_password"] is True

    assert (
        db.query(AuditLog).filter_by(action=AuditAction.user_password_reset).count()
        == 1
    )


def test_regular_user_cannot_manage_users(client, admin, user):
    headers = auth_header(client, "alice", "alice-pass")
    assert client.get("/api/users", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/users",
            json={"username": "eve", "password": "x-pass-123"},
            headers=headers,
        ).status_code
        == 403
    )


def test_password_change_pending_blocks_admin_endpoints(client, db, admin):
    admin.must_change_password = True
    db.commit()
    assert client.get("/api/users", headers=admin_headers(client)).status_code == 403
