"""Ingest bronze landing CSVs into DuckDB, then run dbt silver/gold models."""

from __future__ import annotations

import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DB_PATH = Path(os.getenv("DUCKDB_PATH", str(DATA_DIR / "lake.duckdb")))
INTERVAL = float(os.getenv("INTERVAL_SEC", "12"))
DBT_DIR = Path(os.getenv("DBT_PROJECT_DIR", "/dbt"))
LANDING = DATA_DIR / "bronze" / "landing"
ARCHIVE = DATA_DIR / "bronze" / "archive"


def connect() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH))
    con.execute("CREATE SCHEMA IF NOT EXISTS bronze")
    con.execute("CREATE SCHEMA IF NOT EXISTS silver")
    con.execute("CREATE SCHEMA IF NOT EXISTS gold")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS bronze.pipeline_runs (
          run_id VARCHAR,
          started_at TIMESTAMP,
          finished_at TIMESTAMP,
          files_ingested INTEGER,
          dbt_status VARCHAR,
          duration_ms DOUBLE
        )
        """
    )
    for table, cols in {
        "customers": "customer_id VARCHAR, email VARCHAR, country VARCHAR, signup_ts VARCHAR, _source_file VARCHAR, _ingested_at TIMESTAMP",
        "orders": "order_id VARCHAR, customer_id VARCHAR, amount_eur VARCHAR, status VARCHAR, ordered_at VARCHAR, _source_file VARCHAR, _ingested_at TIMESTAMP",
        "events": "event_id VARCHAR, customer_id VARCHAR, event_name VARCHAR, event_ts VARCHAR, _source_file VARCHAR, _ingested_at TIMESTAMP",
    }.items():
        con.execute(f"CREATE TABLE IF NOT EXISTS bronze.{table} ({cols})")
    return con


def ingest_dataset(con: duckdb.DuckDBPyConnection, name: str) -> int:
    src = LANDING / name
    src.mkdir(parents=True, exist_ok=True)
    dest = ARCHIVE / name
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for path in sorted(src.glob("*.csv")):
        ingested_at = datetime.now(timezone.utc).isoformat()
        con.execute(
            f"""
            INSERT INTO bronze.{name}
            SELECT *, ?, ?::TIMESTAMP
            FROM read_csv_auto(?, header=true)
            """,
            [path.name, ingested_at, str(path)],
        )
        path.replace(dest / path.name)
        count += 1
        print(f"[pipeline] ingested bronze.{name} ← {path.name}")
    return count


def run_dbt() -> str:
    cmd = [
        "dbt",
        "run",
        "--project-dir",
        str(DBT_DIR),
        "--profiles-dir",
        str(DBT_DIR),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            print(proc.stdout)
            print(proc.stderr)
            return "error"
        print("[pipeline] dbt run ok")
        return "ok"
    except FileNotFoundError:
        print("[pipeline] dbt not found")
        return "missing"


def cycle() -> None:
    started = datetime.now(timezone.utc)
    t0 = time.time()
    con = connect()
    files = 0
    for name in ("customers", "orders", "events"):
        files += ingest_dataset(con, name)
    con.close()

    # Close connection before dbt attaches the same DuckDB file
    status = run_dbt()

    finished = datetime.now(timezone.utc)
    duration_ms = round((time.time() - t0) * 1000, 2)
    con = connect()
    con.execute(
        """
        INSERT INTO bronze.pipeline_runs
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            f"run_{finished.strftime('%Y%m%d%H%M%S')}",
            started,
            finished,
            files,
            status,
            duration_ms,
        ],
    )
    con.close()
    print(f"[pipeline] cycle files={files} dbt={status} {duration_ms}ms")


def main() -> None:
    LANDING.mkdir(parents=True, exist_ok=True)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    print(f"[pipeline] lake={DB_PATH} interval={INTERVAL}s")
    while True:
        try:
            cycle()
        except Exception as exc:  # noqa: BLE001
            print(f"[pipeline] error: {exc}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
