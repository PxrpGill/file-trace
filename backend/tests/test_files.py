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


def test_bulk_move_best_effort_skips_forbidden(client, db, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    allowed_src = make_folder(client, admin_h, "AllowedSrc")
    forbidden_src = make_folder(client, admin_h, "ForbiddenSrc")
    dest = make_folder(client, admin_h, "Dest")
    grant(client, admin_h, allowed_src["id"], user.id, "write")
    grant(client, admin_h, dest["id"], user.id, "write")
    ok_file = upload(client, admin_h, allowed_src["id"], "ok.txt")
    forbidden_file = upload(client, admin_h, forbidden_src["id"], "forbidden.txt")

    response = client.post(
        "/api/files/bulk-move",
        json={"file_ids": [ok_file["id"], forbidden_file["id"]], "folder_id": dest["id"]},
        headers=alice_h,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["moved"] == [ok_file["id"]]
    assert body["skipped"] == [{"file_id": forbidden_file["id"], "reason": "forbidden"}]
    assert db.query(AuditLog).filter_by(action=AuditAction.file_move).count() == 1


def test_bulk_move_noop_not_double_counted(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    dest = make_folder(client, admin_h, "Dest")
    already_there = upload(client, admin_h, dest["id"], "already.txt")
    elsewhere_folder = make_folder(client, admin_h, "Elsewhere")
    elsewhere_file = upload(client, admin_h, elsewhere_folder["id"], "move-me.txt")

    response = client.post(
        "/api/files/bulk-move",
        json={"file_ids": [already_there["id"], elsewhere_file["id"]], "folder_id": dest["id"]},
        headers=admin_h,
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body["moved"]) == {already_there["id"], elsewhere_file["id"]}
    assert db.query(AuditLog).filter_by(action=AuditAction.file_move).count() == 1


def test_bulk_move_requires_write_on_destination(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    dest = make_folder(client, admin_h, "Dest")
    grant(client, admin_h, docs["id"], user.id, "write")
    body = upload(client, admin_h, docs["id"], "a.txt")

    response = client.post(
        "/api/files/bulk-move",
        json={"file_ids": [body["id"]], "folder_id": dest["id"]},
        headers=alice_h,
    )
    assert response.status_code == 403


def test_bulk_move_cap_exceeded_returns_422(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    dest = make_folder(client, admin_h, "Dest")
    response = client.post(
        "/api/files/bulk-move",
        json={"file_ids": list(range(1, 202)), "folder_id": dest["id"]},
        headers=admin_h,
    )
    assert response.status_code == 422


def test_bulk_delete_best_effort(client, db, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    allowed = make_folder(client, admin_h, "Allowed")
    forbidden = make_folder(client, admin_h, "Forbidden")
    grant(client, admin_h, allowed["id"], user.id, "write")
    ok_file = upload(client, admin_h, allowed["id"], "ok.txt")
    forbidden_file = upload(client, admin_h, forbidden["id"], "forbidden.txt")

    response = client.post(
        "/api/files/bulk-delete",
        json={"file_ids": [ok_file["id"], forbidden_file["id"]]},
        headers=alice_h,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["deleted"] == [ok_file["id"]]
    assert body["skipped"] == [{"file_id": forbidden_file["id"], "reason": "forbidden"}]
    assert db.query(AuditLog).filter_by(action=AuditAction.file_delete).count() == 1
    assert client.get(f"/api/files/{ok_file['id']}/download", headers=admin_h).status_code == 404
    assert client.get(
        f"/api/files/{forbidden_file['id']}/download", headers=admin_h
    ).status_code == 200


def test_bulk_delete_not_found_reason(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")
    client.delete(f"/api/files/{body['id']}", headers=admin_h)

    response = client.post(
        "/api/files/bulk-delete",
        json={"file_ids": [body["id"], 999999]},
        headers=admin_h,
    )
    assert response.status_code == 200
    skipped = {f["file_id"]: f["reason"] for f in response.json()["skipped"]}
    assert skipped == {body["id"]: "not_found", 999999: "not_found"}


def test_bulk_delete_cap_exceeded_returns_422(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    response = client.post(
        "/api/files/bulk-delete",
        json={"file_ids": list(range(1, 202))},
        headers=admin_h,
    )
    assert response.status_code == 422


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


def test_bulk_download_ticket_and_zip_contents(client, admin):
    import io
    import zipfile

    admin_h = auth_header(client, "admin", "admin-pass")
    one = make_folder(client, admin_h, "One")
    two = make_folder(client, admin_h, "Two")
    file_one = upload(client, admin_h, one["id"], "a.txt", b"content-a")
    file_two = upload(client, admin_h, two["id"], "b.txt", b"content-b")

    ticket_response = client.post(
        "/api/files/bulk-download-ticket",
        json={"file_ids": [file_one["id"], file_two["id"]]},
        headers=admin_h,
    )
    assert ticket_response.status_code == 200
    ticket_body = ticket_response.json()
    assert set(ticket_body["files"]) == {file_one["id"], file_two["id"]}
    assert ticket_body["skipped"] == []

    zip_response = client.get(
        "/api/files/bulk-download-zip", params={"ticket": ticket_body["ticket"]}
    )
    assert zip_response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(zip_response.content))
    assert set(archive.namelist()) == {"One/a.txt", "Two/b.txt"}
    assert archive.read("One/a.txt") == b"content-a"
    assert archive.read("Two/b.txt") == b"content-b"


def test_bulk_download_zip_name_collision_disambiguated(client, admin):
    import io
    import zipfile

    admin_h = auth_header(client, "admin", "admin-pass")
    docs_a = make_folder(client, admin_h, "Docs")
    archive_folder = make_folder(client, admin_h, "Archive")
    docs_b = make_folder(client, admin_h, "Docs", parent_id=archive_folder["id"])
    file_a = upload(client, admin_h, docs_a["id"], "report.txt", b"from-docs-a")
    file_b = upload(client, admin_h, docs_b["id"], "report.txt", b"from-docs-b")

    ticket_body = client.post(
        "/api/files/bulk-download-ticket",
        json={"file_ids": [file_a["id"], file_b["id"]]},
        headers=admin_h,
    ).json()
    zip_response = client.get(
        "/api/files/bulk-download-zip", params={"ticket": ticket_body["ticket"]}
    )
    archive = zipfile.ZipFile(io.BytesIO(zip_response.content))
    assert set(archive.namelist()) == {"Docs/report.txt", "Docs/report.txt (1)"}
    contents = {archive.read(name) for name in archive.namelist()}
    assert contents == {b"from-docs-a", b"from-docs-b"}


def test_bulk_download_ticket_excludes_forbidden_files(client, db, admin, user):
    import io
    import zipfile

    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    allowed = make_folder(client, admin_h, "Allowed")
    forbidden = make_folder(client, admin_h, "Forbidden")
    grant(client, admin_h, allowed["id"], user.id, "read")
    ok_file = upload(client, admin_h, allowed["id"], "ok.txt", b"ok-content")
    forbidden_file = upload(client, admin_h, forbidden["id"], "secret.txt", b"secret")

    ticket_body = client.post(
        "/api/files/bulk-download-ticket",
        json={"file_ids": [ok_file["id"], forbidden_file["id"]]},
        headers=alice_h,
    ).json()
    assert ticket_body["files"] == [ok_file["id"]]
    assert ticket_body["skipped"] == [{"file_id": forbidden_file["id"], "reason": "forbidden"}]

    zip_response = client.get(
        "/api/files/bulk-download-zip", params={"ticket": ticket_body["ticket"]}
    )
    archive = zipfile.ZipFile(io.BytesIO(zip_response.content))
    assert archive.namelist() == ["Allowed/ok.txt"]

    download_audits = db.query(AuditLog).filter_by(action=AuditAction.file_download).count()
    assert download_audits == 1


def test_bulk_download_ticket_cap_exceeded_returns_422(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    response = client.post(
        "/api/files/bulk-download-ticket",
        json={"file_ids": list(range(1, 202))},
        headers=admin_h,
    )
    assert response.status_code == 422


def test_bulk_download_zip_ticket_expired_rejected(client, admin):
    import jwt
    from datetime import datetime, timedelta, timezone

    from app.config import settings

    expired = jwt.encode(
        {
            "sub": str(admin.id),
            "aud": "bulk_download",
            "file_ids": [1],
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = client.get("/api/files/bulk-download-zip", params={"ticket": expired})
    assert response.status_code == 401
