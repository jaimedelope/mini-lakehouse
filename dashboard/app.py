"""Medallion lakehouse explorer over DuckDB gold/silver/bronze."""

from __future__ import annotations

import os
from pathlib import Path

import duckdb
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

DUCKDB_PATH = Path(os.getenv("DUCKDB_PATH", "./data/lake.duckdb"))

app = FastAPI(title="Mini Lakehouse")
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


def connect() -> duckdb.DuckDBPyConnection:
    if not DUCKDB_PATH.exists():
        raise HTTPException(status_code=503, detail="lake.duckdb not ready yet")
    return duckdb.connect(str(DUCKDB_PATH), read_only=True)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(static_dir / "index.html")


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    return FileResponse(static_dir / "favicon.svg", media_type="image/svg+xml")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "db_exists": DUCKDB_PATH.exists()}


@app.get("/api/layers")
def layers() -> dict:
    try:
        con = connect()
    except HTTPException:
        return {"layers": [], "summary": {}, "pipeline_runs": [], "gold": {}}

    def count(sql: str) -> int:
        try:
            return int(con.execute(sql).fetchone()[0])
        except Exception:  # noqa: BLE001
            return 0

    layers = [
        {
            "name": "bronze",
            "title": "Bronze",
            "subtitle": "Raw landing tables",
            "tables": [
                {"name": "customers", "rows": count("select count(*) from bronze.customers")},
                {"name": "orders", "rows": count("select count(*) from bronze.orders")},
                {"name": "events", "rows": count("select count(*) from bronze.events")},
            ],
        },
        {
            "name": "silver",
            "title": "Silver",
            "subtitle": "dbt cleaned / typed",
            "tables": [
                {"name": "customers", "rows": count("select count(*) from silver.customers")},
                {"name": "orders", "rows": count("select count(*) from silver.orders")},
                {"name": "events", "rows": count("select count(*) from silver.events")},
            ],
        },
        {
            "name": "gold",
            "title": "Gold",
            "subtitle": "Business aggregates",
            "tables": [
                {"name": "revenue_daily", "rows": count("select count(*) from gold.revenue_daily")},
                {"name": "funnel_daily", "rows": count("select count(*) from gold.funnel_daily")},
                {"name": "customer_ltv", "rows": count("select count(*) from gold.customer_ltv")},
            ],
        },
    ]

    revenue = []
    try:
        revenue = [
            {"order_date": str(r[0]), "orders_count": r[1], "buyers": r[2], "revenue_eur": r[3], "avg_order_value": r[4]}
            for r in con.execute(
                "select order_date, orders_count, buyers, revenue_eur, avg_order_value from gold.revenue_daily order by order_date desc limit 14"
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    funnel = []
    try:
        funnel = [
            {"event_date": str(r[0]), "views": r[1], "add_to_cart": r[2], "checkouts": r[3], "searches": r[4]}
            for r in con.execute(
                "select event_date, views, add_to_cart, checkouts, searches from gold.funnel_daily order by event_date desc limit 14"
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    top_customers = []
    try:
        top_customers = [
            {
                "customer_id": r[0],
                "country": r[1],
                "orders_count": r[2],
                "lifetime_revenue_eur": r[3],
            }
            for r in con.execute(
                """
                select customer_id, country, orders_count, lifetime_revenue_eur
                from gold.customer_ltv
                order by lifetime_revenue_eur desc
                limit 10
                """
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    runs = []
    try:
        runs = [
            {
                "run_id": r[0],
                "started_at": str(r[1]),
                "finished_at": str(r[2]),
                "files_ingested": r[3],
                "dbt_status": r[4],
                "duration_ms": r[5],
            }
            for r in con.execute(
                """
                select run_id, started_at, finished_at, files_ingested, dbt_status, duration_ms
                from bronze.pipeline_runs
                order by finished_at desc
                limit 15
                """
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    summary = {
        "bronze_rows": sum(t["rows"] for t in layers[0]["tables"]),
        "silver_rows": sum(t["rows"] for t in layers[1]["tables"]),
        "gold_tables": len(layers[2]["tables"]),
        "revenue_eur": round(sum(r["revenue_eur"] or 0 for r in revenue), 2),
    }
    con.close()
    return {
        "layers": layers,
        "summary": summary,
        "pipeline_runs": runs,
        "gold": {"revenue_daily": revenue, "funnel_daily": funnel, "customer_ltv": top_customers},
    }
