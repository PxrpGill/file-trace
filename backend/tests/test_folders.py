from app.models import AuditAction, AuditLog

from tests.test_auth import auth_header


def make_folder(client, headers, name, parent_id=None):
    response = client.post(
        "/api/folders", json={"name": name, "parent_id": parent_id}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def grant(client, headers, folder_id, user_id, level):
    response = client.post(
        "/api/permissions",
        json={"folder_id": folder_id, "user_id": user_id, "level": level},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_admin_creates_root_folder_with_audit(client, db, admin):
    headers = auth_header(client, "admin", "admin-pass")
    folder = make_folder(client, headers, "Docs")
    record = db.query(AuditLog).filter_by(action=AuditAction.folder_create).one()
    assert record.folder_id == folder["id"]
    assert record.user_id == admin.id


def test_regular_user_cannot_create_root_folder(client, user):
    headers = auth_header(client, "alice", "alice-pass")
    response = client.post("/api/folders", json={"name": "Mine"}, headers=headers)
    assert response.status_code == 403


def test_grant_gives_visibility_in_tree(client, db, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")

    docs = make_folder(client, admin_h, "Docs")
    make_folder(client, admin_h, "Secret")

    assert client.get("/api/folders/tree", headers=alice_h).json() == []

    grant(client, admin_h, docs["id"], user.id, "read")
    tree = client.get("/api/folders/tree", headers=alice_h).json()
    assert [node["name"] for node in tree] == ["Docs"]
    assert db.query(AuditLog).filter_by(action=AuditAction.permission_grant).count() == 1


def test_write_allows_subfolder_creation_read_does_not(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = make_folder(client, admin_h, "Docs")
    reports = make_folder(client, admin_h, "Reports")

    grant(client, admin_h, docs["id"], user.id, "write")
    grant(client, admin_h, reports["id"], user.id, "read")

    assert (
        client.post(
            "/api/folders",
            json={"name": "Sub", "parent_id": docs["id"]},
            headers=alice_h,
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/folders",
            json={"name": "Sub", "parent_id": reports["id"]},
            headers=alice_h,
        ).status_code
        == 403
    )


def test_permission_applies_to_subtree_nearest_wins(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    root = make_folder(client, admin_h, "Root")
    child = make_folder(client, admin_h, "Child", parent_id=root["id"])
    grandchild = make_folder(client, admin_h, "Grand", parent_id=child["id"])

    grant(client, admin_h, root["id"], user.id, "read")
    grant(client, admin_h, child["id"], user.id, "write")

    # write from Child applies down to Grand, read at Root does not allow creating
    assert (
        client.post(
            "/api/folders",
            json={"name": "X", "parent_id": grandchild["id"]},
            headers=alice_h,
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/folders",
            json={"name": "X", "parent_id": root["id"]},
            headers=alice_h,
        ).status_code
        == 403
    )


def test_rename_folder_audited(client, db, admin):
    headers = auth_header(client, "admin", "admin-pass")
    folder = make_folder(client, headers, "Old")
    response = client.patch(
        f"/api/folders/{folder['id']}", json={"name": "New"}, headers=headers
    )
    assert response.status_code == 200
    record = db.query(AuditLog).filter_by(action=AuditAction.folder_rename).one()
    assert record.details == {"old_name": "Old", "new_name": "New"}


def test_delete_empty_folder_ok_nonempty_rejected(client, db, admin):
    headers = auth_header(client, "admin", "admin-pass")
    parent = make_folder(client, headers, "Parent")
    make_folder(client, headers, "Child", parent_id=parent["id"])

    assert client.delete(f"/api/folders/{parent['id']}", headers=headers).status_code == 409

    child_id = client.get("/api/folders/tree", headers=headers).json()[0]["children"][0]["id"]
    assert client.delete(f"/api/folders/{child_id}", headers=headers).status_code == 200
    assert db.query(AuditLog).filter_by(action=AuditAction.folder_delete).count() == 1


def test_revoke_removes_access(client, db, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = make_folder(client, admin_h, "Docs")
    permission = grant(client, admin_h, docs["id"], user.id, "read")

    response = client.delete(f"/api/permissions/{permission['id']}", headers=admin_h)
    assert response.status_code == 200
    assert client.get("/api/folders/tree", headers=alice_h).json() == []
    assert db.query(AuditLog).filter_by(action=AuditAction.permission_revoke).count() == 1


def test_regular_user_cannot_manage_permissions(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = make_folder(client, admin_h, "Docs")
    response = client.post(
        "/api/permissions",
        json={"folder_id": docs["id"], "user_id": user.id, "level": "write"},
        headers=alice_h,
    )
    assert response.status_code == 403
