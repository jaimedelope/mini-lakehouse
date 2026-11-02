# Mini Lakehouse

Compact **medallion analytics lakehouse** for a data engineering portfolio:

**raw CSV extracts → Bronze (DuckDB) → dbt Silver → dbt Gold marts → explorer UI**

Complements the [streaming fraud pipeline](https://github.com/jaimedelope/streaming-fraud-pipeline) (online scoring) and [data contract scorecards](https://github.com/jaimedelope/data-quality-pipeline) (DQ/SLA). This one is about **layered analytics modeling**.

## Live demo

**[mini-lakehouse.vercel.app](https://mini-lakehouse.vercel.app)** *(or the project alias Vercel assigns)*

Static browser simulation of the medallion layers. Docker below is the real stack.

## Architecture

```text
Generator ──CSV──► bronze/landing
                      │
                      ▼
                 DuckDB bronze.*     (raw append)
                      │
                   dbt run
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
 silver.*         gold.revenue   gold.funnel
 (typed/clean)    gold.customer_ltv
                      │
                      ▼
                Dashboard :8091
```

![Architecture](docs/architecture.svg)

### Layers

| Layer | Role |
|-------|------|
| **Bronze** | Append-only landing tables (`customers`, `orders`, `events`) with `_source_file` / `_ingested_at` |
| **Silver** | dbt models: typed columns, normalized emails/status, basic quality filters |
| **Gold** | Business marts: `revenue_daily`, `funnel_daily`, `customer_ltv` |

## Quick start

```bash
docker compose up --build
```

Open [http://localhost:8091](http://localhost:8091)

Within ~20–30s you should see Bronze row counts grow, Silver tables populate after `dbt run`, and Gold marts update.

```bash
docker compose down -v
```

## Project layout

```text
generator/     # writes bronze landing CSVs
pipeline/      # DuckDB ingest + dbt run loop
dbt_project/   # silver + gold models (dbt-duckdb)
dashboard/     # FastAPI lakehouse explorer
web/           # static Vercel demo
docs/
docker-compose.yml
```

## Why it belongs on the portfolio

Shows you can design a **small but real lakehouse**: landing zone, typed silver, gold marts, dbt, and an observability-style explorer — without needing Databricks/Snowflake credits.

## Next ideas (v2)

- Partitioned Parquet bronze on object storage
- dbt tests in CI + elementary/observability
- Spark/Flink job feeding bronze instead of CSV generator
- Semantic layer / metrics API on gold
