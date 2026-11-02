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
        return {"layers": [], "kpis": {}, "pipeline_runs": [], "gold": {}}

    def count(sql: str) -> int:
        try:
            return int(con.execute(sql).fetchone()[0])
        except Exception:  # noqa: BLE001
            return 0

    def one(sql: str, default=None):
        try:
            row = con.execute(sql).fetchone()
            return row[0] if row else default
        except Exception:  # noqa: BLE001
            return default

    layers = [
        {
            "name": "bronze",
            "title": "Bronze",
            "subtitle": "Raw landing",
            "tables": [
                {"name": "customers", "rows": count("select count(*) from bronze.customers")},
                {"name": "orders", "rows": count("select count(*) from bronze.orders")},
                {"name": "events", "rows": count("select count(*) from bronze.events")},
            ],
        },
        {
            "name": "silver",
            "title": "Silver",
            "subtitle": "dbt cleaned",
            "tables": [
                {"name": "customers", "rows": count("select count(*) from silver.customers")},
                {"name": "orders", "rows": count("select count(*) from silver.orders")},
                {"name": "events", "rows": count("select count(*) from silver.events")},
            ],
        },
        {
            "name": "gold",
            "title": "Gold",
            "subtitle": "Business marts",
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
            {
                "order_date": str(r[0]),
                "orders_count": int(r[1] or 0),
                "buyers": int(r[2] or 0),
                "revenue_eur": float(r[3] or 0),
                "avg_order_value": float(r[4] or 0),
            }
            for r in con.execute(
                """
                select order_date, orders_count, buyers, revenue_eur, avg_order_value
                from gold.revenue_daily
                order by order_date asc
                limit 30
                """
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    funnel = []
    try:
        funnel = [
            {
                "event_date": str(r[0]),
                "views": int(r[1] or 0),
                "add_to_cart": int(r[2] or 0),
                "checkouts": int(r[3] or 0),
                "searches": int(r[4] or 0),
            }
            for r in con.execute(
                """
                select event_date, views, add_to_cart, checkouts, searches
                from gold.funnel_daily
                order by event_date asc
                limit 30
                """
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
                "orders_count": int(r[2] or 0),
                "lifetime_revenue_eur": float(r[3] or 0),
            }
            for r in con.execute(
                """
                select customer_id, country, orders_count, lifetime_revenue_eur
                from gold.customer_ltv
                order by lifetime_revenue_eur desc
                limit 8
                """
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    by_country = []
    try:
        by_country = [
            {"country": r[0], "revenue_eur": float(r[1] or 0), "customers": int(r[2] or 0)}
            for r in con.execute(
                """
                select country,
                       round(sum(lifetime_revenue_eur), 2) as revenue_eur,
                       count(*) as customers
                from gold.customer_ltv
                group by 1
                order by revenue_eur desc
                limit 6
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
                limit 12
                """
            ).fetchall()
        ]
    except Exception:  # noqa: BLE001
        pass

    total_revenue = sum(r["revenue_eur"] for r in revenue)
    total_orders = sum(r["orders_count"] for r in revenue)
    total_views = sum(f["views"] for f in funnel)
    total_carts = sum(f["add_to_cart"] for f in funnel)
    total_checkouts = sum(f["checkouts"] for f in funnel)
    aov = (total_revenue / total_orders) if total_orders else 0
    view_to_cart = (100 * total_carts / total_views) if total_views else 0
    cart_to_checkout = (100 * total_checkouts / total_carts) if total_carts else 0
    view_to_checkout = (100 * total_checkouts / total_views) if total_views else 0

    paying_customers = int(one("select count(*) from gold.customer_ltv where orders_count > 0", 0) or 0)
    refund_rate = float(
        one(
            """
            select case when count(*) = 0 then 0
              else 100.0 * count(*) filter (where status = 'refunded') / count(*) end
            from silver.orders
            """,
            0,
        )
        or 0
    )
    dbt_ok = sum(1 for r in runs if r.get("dbt_status") == "ok")
    pipeline_health = round(100 * dbt_ok / len(runs), 1) if runs else 0

    # trend series for sparklines (chronological)
    revenue_trend = [round(r["revenue_eur"], 2) for r in revenue][-14:]
    orders_trend = [r["orders_count"] for r in revenue][-14:]
    checkout_trend = [f["checkouts"] for f in funnel][-14:]

    kpis = {
        "gmv_eur": round(total_revenue, 2),
        "orders": total_orders,
        "aov_eur": round(aov, 2),
        "paying_customers": paying_customers,
        "view_to_cart_pct": round(view_to_cart, 1),
        "cart_to_checkout_pct": round(cart_to_checkout, 1),
        "view_to_checkout_pct": round(view_to_checkout, 1),
        "refund_rate_pct": round(refund_rate, 1),
        "pipeline_health_pct": pipeline_health,
        "bronze_rows": sum(t["rows"] for t in layers[0]["tables"]),
        "silver_rows": sum(t["rows"] for t in layers[1]["tables"]),
        "revenue_trend": revenue_trend,
        "orders_trend": orders_trend,
        "checkout_trend": checkout_trend,
    }

    con.close()
    return {
        "layers": layers,
        "kpis": kpis,
        "pipeline_runs": runs,
        "gold": {
            "revenue_daily": list(reversed(revenue[-14:])),
            "funnel_daily": list(reversed(funnel[-14:])),
            "customer_ltv": top_customers,
            "revenue_by_country": by_country,
        },
    }
