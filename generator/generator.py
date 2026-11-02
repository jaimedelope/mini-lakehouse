"""Emit raw commerce extracts into the bronze landing zone (CSV)."""

from __future__ import annotations

import csv
import os
import random
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
INTERVAL = float(os.getenv("INTERVAL_SEC", "10"))
COUNTRIES = ["ES", "PT", "FR", "DE", "IT", "GB", "US"]
STATUSES = ["paid", "refunded", "chargeback", "paid", "paid"]
EVENTS = ["view_item", "add_to_cart", "checkout", "search", "view_item"]


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def emit() -> None:
    now = datetime.now(timezone.utc)
    s = stamp()
    customers = []
    for _ in range(random.randint(25, 40)):
        customers.append(
            {
                "customer_id": f"cus_{uuid.uuid4().hex[:10]}",
                "email": f"user{random.randint(1, 99999)}@example.com",
                "country": random.choice(COUNTRIES),
                "signup_ts": (now - timedelta(days=random.randint(1, 900))).isoformat(),
            }
        )
    ids = [c["customer_id"] for c in customers]
    orders = []
    for _ in range(random.randint(40, 70)):
        orders.append(
            {
                "order_id": f"ord_{uuid.uuid4().hex[:10]}",
                "customer_id": random.choice(ids),
                "amount_eur": f"{random.uniform(8, 420):.2f}",
                "status": random.choice(STATUSES),
                "ordered_at": (now - timedelta(minutes=random.randint(1, 240))).isoformat(),
            }
        )
    events = []
    for _ in range(random.randint(80, 140)):
        events.append(
            {
                "event_id": f"evt_{uuid.uuid4().hex[:10]}",
                "customer_id": random.choice(ids),
                "event_name": random.choice(EVENTS),
                "event_ts": (now - timedelta(minutes=random.randint(0, 180))).isoformat(),
            }
        )

    root = DATA_DIR / "bronze" / "landing"
    write_csv(root / "customers" / f"customers_{s}.csv", ["customer_id", "email", "country", "signup_ts"], customers)
    write_csv(root / "orders" / f"orders_{s}.csv", ["order_id", "customer_id", "amount_eur", "status", "ordered_at"], orders)
    write_csv(root / "events" / f"events_{s}.csv", ["event_id", "customer_id", "event_name", "event_ts"], events)
    print(f"[generator] bronze landing {s} customers={len(customers)} orders={len(orders)} events={len(events)}")


def main() -> None:
    print(f"[generator] writing bronze extracts every {INTERVAL}s → {DATA_DIR}")
    while True:
        emit()
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
