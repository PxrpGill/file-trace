"""Administrative commands: python -m app.cli create-admin <username>"""

import argparse
import getpass
import sys
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.models import AuditAction, Folder, User, UserRole
from app.services import audit
from app.services.security import hash_password


def create_admin(username: str, password: str, full_name: str = "") -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        if session.query(User).filter_by(username=username).first():
            sys.exit(f"User {username!r} already exists")
        session.add(
            User(
                username=username,
                full_name=full_name,
                password_hash=hash_password(password),
                role=UserRole.admin,
                must_change_password=False,
            )
        )
        session.commit()
    print(f"Admin {username!r} created")


def import_tree(
    source: str,
    username: str,
    folder_id: int | None,
    root_name: str | None,
    dry_run: bool,
    commit_every: int,
    io_workers: int,
) -> None:
    from app.config import settings
    from app.services.bulk_import import import_directory_tree
    from app.services.storage import LocalDiskStorage

    src = Path(source)
    if not src.is_dir():
        sys.exit(f"Source is not a directory: {src}")
    if (folder_id is None) == (root_name is None):
        sys.exit("Specify exactly one of --folder-id or --root-name")

    with SessionLocal() as db:
        user = db.query(User).filter_by(username=username).first()
        if user is None:
            sys.exit(f"User {username!r} not found")

        if folder_id is not None:
            target = db.get(Folder, folder_id)
            if target is None:
                sys.exit(f"Folder {folder_id} not found")
        else:
            target = Folder(parent_id=None, name=root_name, created_by=user.id)
            db.add(target)
            db.flush()
            audit.record(
                db,
                AuditAction.folder_create,
                user_id=user.id,
                folder_id=target.id,
                details={"name": root_name},
            )
            db.commit()

        storage = LocalDiskStorage(settings.storage_root)

        def report(stats) -> None:
            print(
                f"...  {stats.imported} перенесено, "
                f"{stats.bytes_imported / 1e9:.2f} ГБ, "
                f"{stats.skipped_existing} пропущено (уже есть)"
            )

        stats = import_directory_tree(
            db,
            storage,
            src,
            target.id,
            user,
            commit_every=commit_every,
            io_workers=io_workers,
            dry_run=dry_run,
            on_progress=report,
        )

    label = "Прогон без записи (dry-run)" if dry_run else "Готово"
    print(
        f"{label}: просканировано {stats.scanned}, перенесено {stats.imported} "
        f"({stats.bytes_imported / 1e9:.2f} ГБ), пропущено уже существующих "
        f"{stats.skipped_existing}, служебных файлов пропущено {stats.skipped_excluded}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin")
    p.add_argument("username")
    p.add_argument("--full-name", default="")
    p.add_argument("--password", help="prompted interactively when omitted")

    p2 = sub.add_parser("import-tree", help="Bulk-import a directory tree from local disk")
    p2.add_argument("source", help="Path to the source directory")
    p2.add_argument("--user", required=True, help="Username to attribute the import to")
    p2.add_argument("--folder-id", type=int, help="Existing target folder id")
    p2.add_argument("--root-name", help="Create a new root folder with this name")
    p2.add_argument("--dry-run", action="store_true", help="Scan and report, write nothing")
    p2.add_argument("--commit-every", type=int, default=200)
    p2.add_argument("--io-workers", type=int, default=4)

    args = parser.parse_args()

    if args.command == "create-admin":
        password = args.password or getpass.getpass("Password: ")
        create_admin(args.username, password, args.full_name)
    elif args.command == "import-tree":
        import_tree(
            args.source,
            args.user,
            args.folder_id,
            args.root_name,
            args.dry_run,
            args.commit_every,
            args.io_workers,
        )


if __name__ == "__main__":
    main()
