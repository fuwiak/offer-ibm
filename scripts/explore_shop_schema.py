#!/usr/bin/env python3
"""Сводка колонок каталога Shop-Script для enrich (читает .env)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:
    import pymysql
except ImportError:
    print("Установите pymysql: bash scripts/setup_db_inspect.sh", file=sys.stderr)
    sys.exit(1)


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    import os

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def get_connection():
    import os

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
    )

TABLES = [
    "shop_product",
    "shop_category",
    "shop_product_params",
    "shop_product_features",
    "shop_feature",
    "shop_feature_values_varchar",
    "site_domain",
]


def main() -> int:
    load_env()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for table in TABLES:
                print(f"\n=== {table} ===")
                cur.execute(f"DESCRIBE `{table}`")
                for row in cur.fetchall():
                    print(
                        f"  {row.get('Field') or row.get('FIELD')}: "
                        f"{row.get('Type') or row.get('TYPE')}"
                    )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
