/** In-browser simulation of the medallion mini-lakehouse. */

const state = {
  bronze: { customers: 0, orders: 0, events: 0 },
  silver: { customers: 0, orders: 0, events: 0 },
  revenue: [],
  funnel: [],
  ltv: [],
  runs: [],
};

function money(n) {
  return `€${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function table(headers, rowsHtml) {
  if (!rowsHtml.length) return `<p class="empty">No rows yet</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml.join("")}</tbody></table>`;
}

function render() {
  const layers = [
    {
      name: "bronze",
      title: "Bronze",
      subtitle: "Raw landing tables",
      tables: Object.entries(state.bronze).map(([name, rows]) => ({ name, rows })),
    },
    {
      name: "silver",
      title: "Silver",
      subtitle: "dbt cleaned / typed",
      tables: Object.entries(state.silver).map(([name, rows]) => ({ name, rows })),
    },
    {
      name: "gold",
      title: "Gold",
      subtitle: "Business aggregates",
      tables: [
        { name: "revenue_daily", rows: state.revenue.length },
        { name: "funnel_daily", rows: state.funnel.length },
        { name: "customer_ltv", rows: state.ltv.length },
      ],
    },
  ];
  document.getElementById("layers").innerHTML = layers
    .map(
      (l) => `<article class="layer ${l.name}"><h2>${l.title}</h2><p>${l.subtitle}</p>
      <ul>${l.tables.map((t) => `<li><span class="mono">${t.name}</span><strong>${t.rows}</strong></li>`).join("")}</ul></article>`
    )
    .join("");

  document.getElementById("bronzeRows").textContent = Object.values(state.bronze).reduce((a, b) => a + b, 0);
  document.getElementById("silverRows").textContent = Object.values(state.silver).reduce((a, b) => a + b, 0);
  document.getElementById("revenue").textContent = money(state.revenue.reduce((a, r) => a + r.revenue_eur, 0));

  document.getElementById("revenueTable").innerHTML = table(
    ["Date", "Orders", "Buyers", "Revenue", "AOV"],
    state.revenue.map(
      (r) => `<tr><td class="mono">${r.order_date}</td><td>${r.orders_count}</td><td>${r.buyers}</td><td>${money(r.revenue_eur)}</td><td>${money(r.avg_order_value)}</td></tr>`
    )
  );
  document.getElementById("ltvTable").innerHTML = table(
    ["Customer", "Country", "Orders", "LTV"],
    state.ltv.map(
      (r) => `<tr><td class="mono">${r.customer_id}</td><td>${r.country}</td><td>${r.orders_count}</td><td>${money(r.lifetime_revenue_eur)}</td></tr>`
    )
  );
  document.getElementById("funnelTable").innerHTML = table(
    ["Date", "Views", "Cart", "Checkout", "Search"],
    state.funnel.map(
      (r) => `<tr><td class="mono">${r.event_date}</td><td>${r.views}</td><td>${r.add_to_cart}</td><td>${r.checkouts}</td><td>${r.searches}</td></tr>`
    )
  );
  document.getElementById("runsTable").innerHTML = table(
    ["Run", "Files", "dbt", "ms"],
    state.runs.map(
      (r) => `<tr><td class="mono">${r.run_id}</td><td>${r.files_ingested}</td><td>${r.dbt_status}</td><td>${r.duration_ms}</td></tr>`
    )
  );
}

function tick() {
  const addC = 25 + Math.floor(Math.random() * 16);
  const addO = 40 + Math.floor(Math.random() * 30);
  const addE = 80 + Math.floor(Math.random() * 50);
  state.bronze.customers += addC;
  state.bronze.orders += addO;
  state.bronze.events += addE;
  // silver slightly less after cleaning
  state.silver.customers += Math.floor(addC * 0.96);
  state.silver.orders += Math.floor(addO * 0.94);
  state.silver.events += Math.floor(addE * 0.97);

  const day = new Date().toISOString().slice(0, 10);
  const revenue = Math.round(800 + Math.random() * 2400);
  const orders = 20 + Math.floor(Math.random() * 40);
  state.revenue.unshift({
    order_date: day,
    orders_count: orders,
    buyers: Math.floor(orders * 0.7),
    revenue_eur: revenue,
    avg_order_value: Math.round(revenue / orders),
  });
  state.revenue = state.revenue.slice(0, 10);

  state.funnel.unshift({
    event_date: day,
    views: 200 + Math.floor(Math.random() * 300),
    add_to_cart: 80 + Math.floor(Math.random() * 100),
    checkouts: 30 + Math.floor(Math.random() * 40),
    searches: 50 + Math.floor(Math.random() * 80),
  });
  state.funnel = state.funnel.slice(0, 10);

  const countries = ["ES", "FR", "DE", "US", "GB"];
  state.ltv = Array.from({ length: 8 }, (_, i) => ({
    customer_id: `cus_${(1000 + i).toString(16)}`,
    country: countries[i % countries.length],
    orders_count: 1 + Math.floor(Math.random() * 8),
    lifetime_revenue_eur: Math.round(40 + Math.random() * 900),
  })).sort((a, b) => b.lifetime_revenue_eur - a.lifetime_revenue_eur);

  state.runs.unshift({
    run_id: `run_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
    files_ingested: 3,
    dbt_status: "ok",
    duration_ms: +(400 + Math.random() * 900).toFixed(1),
  });
  state.runs = state.runs.slice(0, 12);
  render();
}

tick();
setInterval(tick, 3500);
