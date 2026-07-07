import io
import pathlib
import shutil

import pytest

from app.models import AuditAction, AuditLog, FileVersion

from tests.test_auth import auth_header
from tests.test_files import setup_folder, upload
from tests.test_folders import grant, make_folder


def test_preview_image_streams_inline_and_audits(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "photo.jpg", b"fake-image-bytes")

    response = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["content-disposition"].startswith("inline")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.content == b"fake-image-bytes"

    record = db.query(AuditLog).filter_by(action=AuditAction.file_preview).one()
    assert record.file_id == body["id"]
    assert record.details["kind"] == "image"


def test_preview_pdf_streams_as_is(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "doc.pdf", b"%PDF-1.4 fake")

    response = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == b"%PDF-1.4 fake"


def test_preview_rejects_disallowed_extension(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "payload.exe", b"<script>evil()</script>")

    response = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert response.status_code == 415


def test_preview_rejects_svg(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "image.svg", b"<svg onload=alert(1)></svg>")

    response = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert response.status_code == 415


def test_preview_requires_read_access(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    root = make_folder(client, admin_h, "Root")
    body = upload(client, admin_h, root["id"], "photo.jpg", b"data")

    denied = client.get(f"/api/files/{body['id']}/preview", headers=alice_h)
    assert denied.status_code == 403

    grant(client, admin_h, root["id"], user.id, "read")
    allowed = client.get(f"/api/files/{body['id']}/preview", headers=alice_h)
    assert allowed.status_code == 200


def test_preview_video_range_request_returns_206(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "clip.mp4", b"0123456789")

    response = client.get(
        f"/api/files/{body['id']}/preview", headers={**admin_h, "Range": "bytes=2-5"}
    )
    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["content-type"] == "video/mp4"
    assert response.content == b"2345"


def test_preview_video_range_beyond_size_returns_416(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "clip.mp4", b"0123456789")

    response = client.get(
        f"/api/files/{body['id']}/preview", headers={**admin_h, "Range": "bytes=999-"}
    )
    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */10"


def test_preview_audits_once_across_initial_and_seek(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "clip.mp4", b"0123456789")

    client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    client.get(f"/api/files/{body['id']}/preview", headers={**admin_h, "Range": "bytes=5-8"})

    assert db.query(AuditLog).filter_by(action=AuditAction.file_preview).count() == 1


def test_preview_ticket_scoping(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "clip.mp4", b"data")

    download_ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    denied = client.get(f"/api/files/{body['id']}/preview?ticket={download_ticket}")
    assert denied.status_code == 401

    preview_ticket = client.post("/api/auth/preview-ticket", headers=admin_h).json()["ticket"]
    allowed = client.get(f"/api/files/{body['id']}/preview?ticket={preview_ticket}")
    assert allowed.status_code == 200

    denied_download = client.get(f"/api/files/{body['id']}/download?ticket={preview_ticket}")
    assert denied_download.status_code == 401


def test_preview_office_tool_unavailable_returns_503(client, admin, monkeypatch):
    import app.services.preview as preview_module

    monkeypatch.setattr(preview_module.shutil, "which", lambda name: None)
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "report.docx", b"fake docx bytes")

    response = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert response.status_code == 503


@pytest.mark.skipif(
    shutil.which("soffice") is None, reason="no soffice binary available in this environment"
)
def test_preview_office_converts_and_caches(client, db, admin, monkeypatch):
    fixture = pathlib.Path(__file__).parent / "fixtures" / "sample.docx"
    if not fixture.exists():
        pytest.skip("tests/fixtures/sample.docx not present")

    import app.api.files as files_module

    calls = []
    original = files_module.convert_office_to_pdf

    def spy(*args, **kwargs):
        calls.append(1)
        return original(*args, **kwargs)

    monkeypatch.setattr(files_module, "convert_office_to_pdf", spy)

    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "sample.docx", fixture.read_bytes())

    first = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert first.status_code == 200, first.text
    assert first.headers["content-type"] == "application/pdf"

    second = client.get(f"/api/files/{body['id']}/preview", headers=admin_h)
    assert second.status_code == 200
    assert len(calls) == 1

    version = db.query(FileVersion).filter_by(file_id=body["id"]).one()
    assert version.preview_key is not None
    assert version.preview_size is not None


def test_purge_deletes_cached_preview_blob(client, db, admin, tmp_path):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "photo.jpg", b"data")

    from app.services.storage import LocalDiskStorage

    storage = LocalDiskStorage(tmp_path / "blobs")
    blob = storage.save(io.BytesIO(b"%PDF-fake"))
    preview_path = (tmp_path / "blobs") / blob.key[:2] / blob.key
    assert preview_path.exists()

    version = db.query(FileVersion).filter_by(file_id=body["id"]).one()
    version.preview_key = blob.key
    version.preview_size = blob.size
    db.commit()

    assert client.delete(f"/api/files/{body['id']}", headers=admin_h).status_code == 200
    assert client.delete(f"/api/files/{body['id']}/purge", headers=admin_h).status_code == 200

    assert not preview_path.exists()
