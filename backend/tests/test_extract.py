import io
import pathlib
import shutil
import zipfile

import pytest

from app.models import AuditAction, AuditLog, File, Folder

from tests.test_auth import auth_header
from tests.test_files import upload
from tests.test_folders import grant, make_folder


def make_zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def test_extract_zip_creates_tree_and_audits(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"report.txt": b"hello", "img/photo.png": b"binary"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["files"] == 2

    bundle_folder = db.query(Folder).filter_by(parent_id=root["id"], name="bundle").one()
    img_folder = db.query(Folder).filter_by(parent_id=bundle_folder.id, name="img").one()
    assert db.query(File).filter_by(folder_id=bundle_folder.id, name="report.txt").count() == 1
    assert db.query(File).filter_by(folder_id=img_folder.id, name="photo.png").count() == 1

    extract_record = db.query(AuditLog).filter_by(action=AuditAction.file_extract).one()
    assert extract_record.file_id == body["id"]
    assert extract_record.details["files"] == 2
    assert extract_record.details["name"] == "bundle.zip"
    assert extract_record.details["total_size"] == 11


def test_extract_reuses_existing_destination_folder(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    make_folder(client, admin_h, "bundle", parent_id=root["id"])
    archive_bytes = make_zip_bytes({"a.txt": b"1"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200
    assert db.query(Folder).filter_by(parent_id=root["id"], name="bundle").count() == 1


def test_extract_conflict_creates_new_version(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    bundle = make_folder(client, admin_h, "bundle", parent_id=root["id"])
    upload(client, admin_h, bundle["id"], "a.txt", b"old")
    archive_bytes = make_zip_bytes({"a.txt": b"new-content"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    client.post(f"/api/files/{body['id']}/extract", headers=admin_h)

    file = db.query(File).filter_by(folder_id=bundle["id"], name="a.txt").one()
    assert file.current_version.version_no == 2
    assert db.query(AuditLog).filter_by(action=AuditAction.file_new_version).count() == 1


def test_extract_rejects_zip_slip(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"../evil.txt": b"x"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400
    assert db.query(Folder).filter_by(parent_id=root["id"]).count() == 0


def test_extract_rejects_too_many_entries(client, db, admin, monkeypatch):
    import app.services.archive as archive_module

    monkeypatch.setattr(archive_module, "MAX_ENTRY_COUNT", 1)
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    archive_bytes = make_zip_bytes({"a.txt": b"1", "b.txt": b"2"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 413
    assert db.query(Folder).filter_by(parent_id=root["id"]).count() == 0


def test_extract_requires_write(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    root = make_folder(client, admin_h, "Root")
    grant(client, admin_h, root["id"], user.id, "read")
    archive_bytes = make_zip_bytes({"a.txt": b"1"})
    body = upload(client, admin_h, root["id"], "bundle.zip", archive_bytes)

    response = client.post(f"/api/files/{body['id']}/extract", headers=alice_h)
    assert response.status_code == 403


def test_extract_rejects_unsupported_extension(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "plain.txt", b"not an archive")

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400


def test_extract_rejects_corrupt_archive(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "broken.zip", b"not actually a zip file")

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 400


@pytest.mark.skipif(
    shutil.which("unrar") is None and shutil.which("unar") is None,
    reason="no unrar/unar binary available in this environment",
)
def test_extract_rar_archive(client, db, admin):
    fixture = pathlib.Path(__file__).parent / "fixtures" / "sample.rar"
    if not fixture.exists():
        pytest.skip("tests/fixtures/sample.rar not present (see Step 6 note)")
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "sample.rar", fixture.read_bytes())

    response = client.post(f"/api/files/{body['id']}/extract", headers=admin_h)
    assert response.status_code == 200
