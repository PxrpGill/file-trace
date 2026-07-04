from tests.test_auth import auth_header
from tests.test_files import setup_folder, upload
from tests.test_folders import grant, make_folder


def test_file_history_visible_with_read(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")
    grant(client, admin_h, docs["id"], user.id, "read")
    client.get(f"/api/files/{body['id']}/download", headers=alice_h)

    history = client.get(f"/api/files/{body['id']}/audit", headers=alice_h)
    assert history.status_code == 200
    actions = [e["action"] for e in history.json()]
    assert actions == ["file_download", "file_upload"]
    by_action = {e["action"]: e for e in history.json()}
    assert by_action["file_upload"]["username"] == "admin"
    assert by_action["file_download"]["username"] == "alice"


def test_file_history_requires_read(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")
    assert client.get(f"/api/files/{body['id']}/audit", headers=alice_h).status_code == 403


def test_admin_journal_with_filters(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    docs = setup_folder(client, admin_h)
    grant(client, admin_h, docs["id"], user.id, "write")
    body = upload(client, alice_h, docs["id"], "a.txt")
    client.get(f"/api/files/{body['id']}/download", headers=admin_h)

    all_entries = client.get("/api/audit", headers=admin_h).json()
    assert all_entries["total"] >= 4  # logins, folder_create, grant, upload, download

    downloads = client.get(
        "/api/audit", params={"action": "file_download"}, headers=admin_h
    ).json()
    assert downloads["total"] == 1
    assert downloads["items"][0]["username"] == "admin"

    alice_only = client.get(
        "/api/audit", params={"user_id": user.id}, headers=admin_h
    ).json()
    assert {e["username"] for e in alice_only["items"]} == {"alice"}

    by_file = client.get(
        "/api/audit", params={"file_id": body["id"]}, headers=admin_h
    ).json()
    assert {e["action"] for e in by_file["items"]} == {"file_upload", "file_download"}


def test_admin_journal_pagination(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    for i in range(5):
        make_folder(client, admin_h, f"F{i}")
    page = client.get(
        "/api/audit",
        params={"action": "folder_create", "limit": 2, "offset": 0},
        headers=admin_h,
    ).json()
    assert page["total"] == 5
    assert len(page["items"]) == 2
    # newest first
    assert page["items"][0]["details"]["name"] == "F4"


def test_journal_admin_only(client, user):
    alice_h = auth_header(client, "alice", "alice-pass")
    assert client.get("/api/audit", headers=alice_h).status_code == 403
    assert client.get("/api/audit/export.csv", headers=alice_h).status_code == 403


def test_csv_export(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    make_folder(client, admin_h, "Docs")
    response = client.get("/api/audit/export.csv", headers=admin_h)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.strip().splitlines()
    assert lines[0].startswith("id,created_at,username,action")
    assert any("folder_create" in line for line in lines[1:])
