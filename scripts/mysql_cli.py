#!/usr/bin/env python3
"""Интерактивный MySQL CLI через pymysql.

Обход ошибки mysql-client 9.x:
  Authentication plugin 'mysql_native_password' cannot be loaded
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import pymysql
except ImportError:
    print(
        "Не установлен pymysql. Запустите: bash scripts/setup_db_inspect.sh",
        file=sys.stderr,
    )
    sys.exit(1)


def load_env() -> None:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def get_connection():
    load_env()
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", ""),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", ""),
        charset="utf8mb4",
        connect_timeout=15,
        read_timeout=300,
    )


def format_rows(columns, rows) -> None:
    if not rows:
        print("Empty set")
        return

    widths = [len(str(col)) for col in columns]
    str_rows = []
    for row in rows:
        values = ["" if v is None else str(v) for v in row]
        str_rows.append(values)
        for i, value in enumerate(values):
            widths[i] = max(widths[i], len(value))

    sep = "  ".join("-" * w for w in widths)
    header = "  ".join(str(col).ljust(widths[i]) for i, col in enumerate(columns))
    print(header)
    print(sep)
    for values in str_rows:
        print("  ".join(values[i].ljust(widths[i]) for i in range(len(values))))
    print(f"{len(rows)} row(s)")


def run_query(cursor, sql: str) -> None:
    sql = sql.strip()
    if not sql:
        return

    statements = [part.strip() for part in sql.split(";") if part.strip()]
    for statement in statements:
        cursor.execute(statement)
        if cursor.description:
            columns = [col[0] for col in cursor.description]
            format_rows(columns, cursor.fetchall())
        else:
            print(f"Query OK, {cursor.rowcount} row(s) affected")


def run_interactive(cursor) -> None:
    load_env()
    print(
        f"Connected to {os.environ.get('DB_HOST')}:{os.environ.get('DB_PORT')}/"
        f"{os.environ.get('DB_NAME')}"
    )
    print("Введите SQL. Команды: exit, quit, \\q")

    buffer = ""
    prompt = "mysql> "
    while True:
        try:
            line = input(prompt)
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not buffer and line.strip().lower() in {"exit", "quit", "\\q"}:
            break

        buffer = f"{buffer} {line}".strip() if buffer else line
        if not buffer.endswith(";"):
            prompt = "    -> "
            continue

        sql = buffer.rstrip(";").strip()
        buffer = ""
        prompt = "mysql> "
        try:
            run_query(cursor, sql)
        except pymysql.MySQLError as exc:
            print(f"ERROR {exc.args[0]}: {exc.args[1] if len(exc.args) > 1 else exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="MySQL CLI через pymysql")
    parser.add_argument("-e", "--execute", help="Выполнить один SQL-запрос")
    args = parser.parse_args()

    try:
        conn = get_connection()
    except pymysql.MySQLError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        with conn.cursor() as cursor:
            if args.execute:
                run_query(cursor, args.execute)
            else:
                run_interactive(cursor)
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
