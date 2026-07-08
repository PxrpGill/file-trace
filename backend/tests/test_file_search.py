from app.models import AuditLog

from tests.test_auth import auth_header
from tests.test_files import upload
from tests.test_folders import grant, make_folder


def test_search_finds_file_case_insensitive_partial_match(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Docs")
    body = upload(client, admin_h, docs["id"], "Report.PDF")

    response = client.get("/api/files/search", params={"q": "report"}, headers=admin_h)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["id"] == body["id"]
    assert results[0]["folder_id"] == docs["id"]
    assert results[0]["folder_name"] == "Docs"
    assert results[0]["name"] == "Report.PDF"


def test_search_excludes_folders_without_access(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    visible = make_folder(client, admin_h, "Docs")
    hidden = make_folder(client, admin_h, "Secret")
    grant(client, admin_h, visible["id"], user.id, "read")
    upload(client, admin_h, visible["id"], "plan.txt")
    upload(client, admin_h, hidden["id"], "plan.txt")

    response = client.get("/api/files/search", params={"q": "plan"}, headers=alice_h)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["folder_id"] == visible["id"]


def test_search_result_reflects_permission_level(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    readonly = make_folder(client, admin_h, "Docs")
    writable = make_folder(client, admin_h, "Shared")
    grant(client, admin_h, readonly["id"], user.id, "read")
    grant(client, admin_h, writable["id"], user.id, "write")
    upload(client, admin_h, readonly["id"], "plan-read.txt")
    upload(client, admin_h, writable["id"], "plan-write.txt")

    response = client.get("/api/files/search", params={"q": "plan"}, headers=alice_h)
    results = {r["folder_id"]: r["level"] for r in response.json()}
    assert results[readonly["id"]] == "read"
    assert results[writable["id"]] == "write"


def test_search_excludes_deleted_files(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Docs")
    body = upload(client, admin_h, docs["id"], "x.txt")

    assert client.delete(f"/api/files/{body['id']}", headers=admin_h).status_code == 200

    response = client.get("/api/files/search", params={"q": "x"}, headers=admin_h)
    assert response.json() == []


def test_search_respects_limit(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Docs")
    for name in ["match1.txt", "match2.txt", "match3.txt"]:
        upload(client, admin_h, docs["id"], name)

    response = client.get(
        "/api/files/search", params={"q": "match", "limit": 2}, headers=admin_h
    )
    assert len(response.json()) == 2


def test_search_short_query_returns_empty_list(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    response = client.get("/api/files/search", params={"q": "a"}, headers=admin_h)
    assert response.status_code == 200
    assert response.json() == []


def test_search_requires_authentication(client):
    response = client.get("/api/files/search", params={"q": "report"})
    assert response.status_code == 401


def test_search_is_not_audited(client, db, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Docs")
    upload(client, admin_h, docs["id"], "a.txt")
    upload(client, admin_h, docs["id"], "b.txt")

    count_before = db.query(AuditLog).count()
    client.get("/api/files/search", params={"q": "a"}, headers=admin_h)
    client.get("/api/files/search", params={"q": "b"}, headers=admin_h)
    assert db.query(AuditLog).count() == count_before


def test_search_admin_sees_all_folders(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    one = make_folder(client, admin_h, "One")
    two = make_folder(client, admin_h, "Two")
    upload(client, admin_h, one["id"], "shared-name.txt")
    upload(client, admin_h, two["id"], "shared-name.txt")

    response = client.get(
        "/api/files/search", params={"q": "shared-name"}, headers=admin_h
    )
    results = response.json()
    assert {r["folder_id"] for r in results} == {one["id"], two["id"]}


def test_search_finds_folder_case_insensitive_partial_match(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Reports")
    make_folder(client, admin_h, "Archive", parent_id=root["id"])

    response = client.get("/api/files/search", params={"q": "report"}, headers=admin_h)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["type"] == "folder"
    assert results[0]["id"] == root["id"]
    assert results[0]["name"] == "Reports"
    assert results[0]["parent_id"] is None
    assert results[0]["parent_name"] is None


def test_search_folder_includes_parent_name(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    root = make_folder(client, admin_h, "Projects")
    child = make_folder(client, admin_h, "Alpha", parent_id=root["id"])

    response = client.get("/api/files/search", params={"q": "alpha"}, headers=admin_h)
    results = response.json()
    assert len(results) == 1
    assert results[0]["id"] == child["id"]
    assert results[0]["parent_id"] == root["id"]
    assert results[0]["parent_name"] == "Projects"


def test_search_excludes_folder_results_without_access(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    visible = make_folder(client, admin_h, "Visible-Plan")
    hidden = make_folder(client, admin_h, "Hidden-Plan")
    grant(client, admin_h, visible["id"], user.id, "read")

    response = client.get("/api/files/search", params={"q": "plan"}, headers=alice_h)
    results = response.json()
    assert {r["id"] for r in results if r["type"] == "folder"} == {visible["id"]}
    assert hidden["id"] not in {r["id"] for r in results}


def test_search_folder_result_reflects_permission_level(client, admin, user):
    admin_h = auth_header(client, "admin", "admin-pass")
    alice_h = auth_header(client, "alice", "alice-pass")
    readonly = make_folder(client, admin_h, "Plan-Read")
    writable = make_folder(client, admin_h, "Plan-Write")
    grant(client, admin_h, readonly["id"], user.id, "read")
    grant(client, admin_h, writable["id"], user.id, "write")

    response = client.get("/api/files/search", params={"q": "plan"}, headers=alice_h)
    results = {r["id"]: r["level"] for r in response.json() if r["type"] == "folder"}
    assert results[readonly["id"]] == "read"
    assert results[writable["id"]] == "write"


def test_search_returns_combined_files_and_folders(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Match-Docs")
    upload(client, admin_h, docs["id"], "match-report.txt")

    response = client.get("/api/files/search", params={"q": "match"}, headers=admin_h)
    results = response.json()
    types = {r["type"] for r in results}
    assert types == {"file", "folder"}
    assert len(results) == 2


def test_search_limit_applies_across_files_and_folders(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = make_folder(client, admin_h, "Match-One")
    make_folder(client, admin_h, "Match-Two")
    upload(client, admin_h, docs["id"], "match-three.txt")

    response = client.get(
        "/api/files/search", params={"q": "match", "limit": 2}, headers=admin_h
    )
    assert len(response.json()) == 2
