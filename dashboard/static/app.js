async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function money(n) {
  return `€${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function renderLayers(layers) {
  const el = document.getElementById("layers");
  el.innerHTML = (layers || [])
    .map(
      (l) => `<article class="layer ${l.name}">
        <h2>${l.title}</h2>
        <p>${l.subtitle}</p>
        <ul>${(l.tables || [])
          .map((t) => `<li><span class="mono">${t.name}</span><strong>${t.rows}</strong></li>`)
          .join("")}</ul>
      </article>`
    )
    .join("");
}

function table(headers, rows) {
  if (!rows.length) return `<p class="empty">No rows yet</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

async function tick() {
  try {
    const data = await fetchJson("/api/layers");
    document.getElementById("bronzeRows").textContent = data.summary.bronze_rows ?? 0;
    document.getElementById("silverRows").textContent = data.summary.silver_rows ?? 0;
    document.getElementById("goldTables").textContent = data.summary.gold_tables ?? 0;
    document.getElementById("revenue").textContent = money(data.summary.revenue_eur);
    renderLayers(data.layers);

    const revenue = data.gold?.revenue_daily || [];
    document.getElementById("revenueTable").innerHTML = table(
      ["Date", "Orders", "Buyers", "Revenue", "AOV"],
      revenue.map(
        (r) => `<tr><td class="mono">${r.order_date}</td><td>${r.orders_count}</td><td>${r.buyers}</td><td>${money(r.revenue_eur)}</td><td>${money(r.avg_order_value)}</td></tr>`
      )
    );

    const ltv = data.gold?.customer_ltv || [];
    document.getElementById("ltvTable").innerHTML = table(
      ["Customer", "Country", "Orders", "LTV"],
      ltv.map(
        (r) => `<tr><td class="mono">${r.customer_id}</td><td>${r.country}</td><td>${r.orders_count}</td><td>${money(r.lifetime_revenue_eur)}</td></tr>`
      )
    );

    const funnel = data.gold?.funnel_daily || [];
    document.getElementById("funnelTable").innerHTML = table(
      ["Date", "Views", "Cart", "Checkout", "Search"],
      funnel.map(
        (r) => `<tr><td class="mono">${r.event_date}</td><td>${r.views}</td><td>${r.add_to_cart}</td><td>${r.checkouts}</td><td>${r.searches}</td></tr>`
      )
    );

    const runs = data.pipeline_runs || [];
    document.getElementById("runsTable").innerHTML = table(
      ["Run", "Files", "dbt", "ms"],
      runs.map(
        (r) => `<tr><td class="mono">${r.run_id}</td><td>${r.files_ingested}</td><td>${r.dbt_status}</td><td>${r.duration_ms}</td></tr>`
      )
    );

    const status = document.getElementById("status");
    status.textContent = runs.length ? "pipeline live · duckdb + dbt" : "waiting for first pipeline cycle…";
    status.classList.toggle("live", runs.length > 0);
  } catch (err) {
    document.getElementById("status").textContent = "disconnected";
    console.error(err);
  }
}

tick();
setInterval(tick, 4000);
