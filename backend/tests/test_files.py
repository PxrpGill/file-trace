import hashlib

from app.models import AuditAction, AuditLog

from tests.test_auth import auth_header
from tests.test_folders import grant, make_folder


def upload(client, headers, folder_id, name, content=b"data", expect=201):
    response = client.post(
        f"/api/folders/{folder_id}/files",
        files={"upload": (name, content)},
        headers=headers,
    )
    assert response.status_code == expect, response.text
    return response.json()


def setup_folder(client, admin_h):
    return make_folder(client, admin_h, "Docs")


def test_upload_creates_file_with_version_and_audit(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "report.pdf", b"pdf-bytes")

    assert body["name"] == "report.pdf"
    version = body["current_version"]
    assert version["version_no"] == 1
    assert version["size"] == len(b"pdf-bytes")
    assert version["sha256"] == hashlib.sha256(b"pdf-bytes").hexdigest()

    record = db.query(AuditLog).filter_by(action=AuditAction.file_upload).one()
    assert record.file_id == body["id"]
    assert record.folder_id == docs["id"]


def test_upload_requires_write(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    grant(client, admin_h, docs["id"], user.id, "read")
    response = client.post(
        f"/api/folders/{docs['id']}/files",
        files={"upload": ("a.txt", b"x")},
        headers=alice_h,
    )
    assert response.status_code == 403


def test_duplicate_name_in_folder_rejected(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    upload(client, admin_h, docs["id"], "a.txt")
    upload(client, admin_h, docs["id"], "a.txt", expect=409)


def test_download_returns_content_and_audits(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt", b"file-content")

    response = client.get(f"/api/files/{body['id']}/download", headers=admin_h)
    assert response.status_code == 200
    assert response.content == b"file-content"
    assert "a.txt" in response.headers["content-disposition"]

    record = db.query(AuditLog).filter_by(action=AuditAction.file_download).one()
    assert record.file_id == body["id"]
    assert record.file_version_id == body["current_version"]["id"]


def test_listing_and_download_require_read(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")

    assert client.get(f"/api/folders/{docs['id']}/files", headers=alice_h).status_code == 403
    assert client.get(f"/api/files/{body['id']}/download", headers=alice_h).status_code == 403


def test_new_version_increments_and_audits(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt", b"v1")

    response = client.post(
        f"/api/files/{body['id']}/versions",
        files={"upload": ("a.txt", b"v2-content")},
        headers=admin_h,
    )
    assert response.status_code == 201
    assert response.json()["current_version"]["version_no"] == 2

    download = client.get(f"/api/files/{body['id']}/download", headers=admin_h)
    assert download.content == b"v2-content"

    versions = client.get(f"/api/files/{body['id']}/versions", headers=admin_h).json()
    assert [v["version_no"] for v in versions] == [1, 2]

    assert db.query(AuditLog).filter_by(action=AuditAction.file_new_version).count() == 1


def test_download_specific_old_version(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt", b"v1")
    client.post(
        f"/api/files/{body['id']}/versions",
        files={"upload": ("a.txt", b"v2")},
        headers=admin_h,
    )
    v1_id = client.get(f"/api/files/{body['id']}/versions", headers=admin_h).json()[0]["id"]
    response = client.get(
        f"/api/files/{body['id']}/download",
        params={"version_id": v1_id},
        headers=admin_h,
    )
    assert response.content == b"v1"


def test_rename_and_move_audited(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    archive = make_folder(client, admin_h, "Archive")
    body = upload(client, admin_h, docs["id"], "a.txt")

    response = client.patch(
        f"/api/files/{body['id']}", json={"name": "b.txt"}, headers=admin_h
    )
    assert response.status_code == 200
    rename = db.query(AuditLog).filter_by(action=AuditAction.file_rename).one()
    assert rename.details == {"old_name": "a.txt", "new_name": "b.txt"}

    response = client.patch(
        f"/api/files/{body['id']}", json={"folder_id": archive["id"]}, headers=admin_h
    )
    assert response.status_code == 200
    move = db.query(AuditLog).filter_by(action=AuditAction.file_move).one()
    assert move.details["to_folder_id"] == archive["id"]


def test_move_requires_write_on_target(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    archive = make_folder(client, admin_h, "Archive")
    grant(client, admin_h, docs["id"], user.id, "write")
    body = upload(client, admin_h, docs["id"], "a.txt")

    response = client.patch(
        f"/api/files/{body['id']}", json={"folder_id": archive["id"]}, headers=alice_h
    )
    assert response.status_code == 403


def test_soft_delete_restore_flow(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")

    assert client.delete(f"/api/files/{body['id']}", headers=admin_h).status_code == 200
    assert client.get(f"/api/folders/{docs['id']}/files", headers=admin_h).json() == []
    assert client.get(f"/api/files/{body['id']}/download", headers=admin_h).status_code == 404
    assert db.query(AuditLog).filter_by(action=AuditAction.file_delete).count() == 1

    trash = client.get("/api/files/trash", headers=admin_h).json()
    assert [f["name"] for f in trash] == ["a.txt"]

    assert client.post(f"/api/files/{body['id']}/restore", headers=admin_h).status_code == 200
    assert [f["name"] for f in client.get(f"/api/folders/{docs['id']}/files", headers=admin_h).json()] == ["a.txt"]
    assert db.query(AuditLog).filter_by(action=AuditAction.file_restore).count() == 1


def test_trash_and_restore_admin_only(client, admin, user):
    alice_h = auth_header(client, "alice", "alice-pass")
    assert client.get("/api/files/trash", headers=alice_h).status_code == 403


def test_purge_removes_permanently(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")
    client.delete(f"/api/files/{body['id']}", headers=admin_h)

    assert client.delete(f"/api/files/{body['id']}/purge", headers=admin_h).status_code == 200
    assert client.get("/api/files/trash", headers=admin_h).json() == []
    assert db.query(AuditLog).filter_by(action=AuditAction.file_purge).count() == 1
    # download after purge is impossible
    assert client.get(f"/api/files/{body['id']}/download", headers=admin_h).status_code == 404


def test_download_with_ticket_instead_of_header(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt", b"file-content")

    ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    response = client.get(f"/api/files/{body['id']}/download?ticket={ticket}")
    assert response.status_code == 200
    assert response.content == b"file-content"


def test_download_with_expired_ticket_rejected(client, admin):
    import jwt
    from datetime import datetime, timedelta, timezone

    from app.config import settings

    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")

    expired = jwt.encode(
        {
            "sub": str(admin.id),
            "aud": "download",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = client.get(f"/api/files/{body['id']}/download?ticket={expired}")
    assert response.status_code == 401


def test_download_ticket_cannot_be_used_as_bearer_token(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    upload(client, admin_h, docs["id"], "a.txt")

    ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {ticket}"})
    assert response.status_code == 401
