#!/usr/bin/env python3
"""Просмотр структуры и примеров данных в MySQL из .env."""

from __future__ import annotations

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
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=15,
        read_timeout=30,
    )


def truncate(value, max_len: int = 120):
    if value is None:
        return "NULL"
    text = str(value).replace("\n", "\\n")
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text


def print_table_schema(cursor, db_name: str, table_name: str) -> None:
    cursor.execute(
        """
        SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ORDINAL_POSITION
        """,
        (db_name, table_name),
    )
    columns = cursor.fetchall()
    print("  Колонки:")
    for col in columns:
        key = f" [{col['COLUMN_KEY']}]" if col["COLUMN_KEY"] else ""
        nullable = "NULL" if col["IS_NULLABLE"] == "YES" else "NOT NULL"
        default = f" default={col['COLUMN_DEFAULT']}" if col["COLUMN_DEFAULT"] is not None else ""
        print(
            f"    - {col['COLUMN_NAME']}: {col['COLUMN_TYPE']} {nullable}{key}{default}"
        )


def print_sample_rows(cursor, table_name: str, limit: int = 5) -> None:
    cursor.execute(f"SELECT COUNT(*) AS cnt FROM `{table_name}`")
    total = cursor.fetchone()["cnt"]
    print(f"  Строк: {total}")

    if total == 0:
        print("  (пусто)")
        return

    cursor.execute(f"SELECT * FROM `{table_name}` LIMIT %s", (limit,))
    rows = cursor.fetchall()
    print(f"  Примеры (до {limit} строк):")
    for i, row in enumerate(rows, 1):
        print(f"    [{i}]")
        for key, value in row.items():
            print(f"      {key}: {truncate(value)}")


def main() -> int:
    load_env()
    db_name = os.environ.get("DB_NAME", "")
    sample_limit = int(os.environ.get("DB_INSPECT_SAMPLE_ROWS", "5"))

    print(
        f"Подключение к MySQL: "
        f"{os.environ.get('DB_HOST')}:{os.environ.get('DB_PORT')}/{db_name}"
    )
    print("-" * 60)

    try:
        conn = get_connection()
    except pymysql.MySQLError as exc:
        print(f"Ошибка подключения: {exc}", file=sys.stderr)
        print(
            "Проверьте: доступность хоста, порт, VPN/фаервол, whitelist IP.",
            file=sys.stderr,
        )
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT table_name, table_rows
                FROM information_schema.tables
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                (db_name,),
            )
            tables = cursor.fetchall()

            if not tables:
                print("Таблицы не найдены.")
                return 0

            print(f"Найдено таблиц: {len(tables)}\n")

            for table in tables:
                name = table.get("table_name") or table.get("TABLE_NAME")
                approx_rows = table.get("table_rows") or table.get("TABLE_ROWS")
                header = f"=== {name} ==="
                if approx_rows is not None:
                    header += f" (~{approx_rows} строк по статистике InnoDB)"
                print(header)
                print_table_schema(cursor, db_name, name)
                print_sample_rows(cursor, name, limit=sample_limit)
                print()
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
