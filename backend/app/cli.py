"""Administrative commands: python -m app.cli create-admin <username>"""

import argparse
import getpass
import sys

from app.database import Base, SessionLocal, engine
from app.models import User, UserRole
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("create-admin")
    p.add_argument("username")
    p.add_argument("--full-name", default="")
    p.add_argument("--password", help="prompted interactively when omitted")
    args = parser.parse_args()

    if args.command == "create-admin":
        password = args.password or getpass.getpass("Password: ")
        create_admin(args.username, password, args.full_name)


if __name__ == "__main__":
    main()
