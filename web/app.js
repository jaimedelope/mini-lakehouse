/** In-browser simulation of commerce KPIs from a medallion lakehouse. */

const state = {
  bronze: { customers: 420, orders: 1180, events: 8420 },
  silver: { customers: 402, orders: 1109, events: 8160 },
  revenue: [],
  funnel: [],
  ltv: [],
  countries: [],
  runs: [],
};

function money(n, digits = 0) {
  return `€${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function pct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function sparkline(values, color = "currentColor") {
  if (!values?.length) return "";
  const w = 160;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * (w - 2) + 1;
      const y = h - 3 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const area = `1,${h - 1} ${pts} ${w - 1},${h - 1}`;
  return `<svg class="kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="${area}" fill="${color}" opacity="0.12"></polygon>
    <polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"></polyline>
  </svg>`;
}

function table(headers, rows) {
  if (!rows.length) return `<p class="empty">Waiting for gold data…</p>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

function seedHistory() {
  const countries = ["ES", "FR", "DE", "US", "GB", "IT"];
  const today = new Date();
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const orders = 28 + Math.floor(Math.random() * 36);
    const revenue = Math.round(1200 + Math.random() * 2800 + i * 40);
    state.revenue.push({
      order_date: day,
      orders_count: orders,
      buyers: Math.floor(orders * (0.65 + Math.random() * 0.2)),
      revenue_eur: revenue,
      avg_order_value: Math.round((revenue / orders) * 100) / 100,
    });
    const views = 280 + Math.floor(Math.random() * 220);
    const carts = Math.floor(views * (0.28 + Math.random() * 0.12));
    const checkouts = Math.floor(carts * (0.38 + Math.random() * 0.18));
    state.funnel.push({
      event_date: day,
      views,
      add_to_cart: carts,
      checkouts,
      searches: 60 + Math.floor(Math.random() * 90),
    });
  }
  state.ltv = Array.from({ length: 8 }, (_, i) => ({
    customer_id: `cus_${(0xa100 + i).toString(16)}`,
    country: countries[i % countries.length],
    orders_count: 2 + Math.floor(Math.random() * 9),
    lifetime_revenue_eur: Math.round(120 + Math.random() * 1400),
  })).sort((a, b) => b.lifetime_revenue_eur - a.lifetime_revenue_eur);

  state.countries = countries.slice(0, 5).map((c, i) => ({
    country: c,
    revenue_eur: Math.round(4200 - i * 620 + Math.random() * 400),
    customers: 40 + Math.floor(Math.random() * 60),
  }));

  for (let i = 0; i < 6; i += 1) {
    state.runs.push({
      run_id: `run_${String(202603210800 + i).padStart(14, "0")}`,
      files_ingested: 3,
      dbt_status: i === 4 ? "ok" : "ok",
      duration_ms: +(380 + Math.random() * 720).toFixed(1),
    });
  }
}

function kpisFromState() {
  const totalRevenue = state.revenue.reduce((a, r) => a + r.revenue_eur, 0);
  const totalOrders = state.revenue.reduce((a, r) => a + r.orders_count, 0);
  const views = state.funnel.reduce((a, f) => a + f.views, 0);
  const carts = state.funnel.reduce((a, f) => a + f.add_to_cart, 0);
  const checkouts = state.funnel.reduce((a, f) => a + f.checkouts, 0);
  return {
    gmv_eur: totalRevenue,
    orders: totalOrders,
    aov_eur: totalOrders ? totalRevenue / totalOrders : 0,
    paying_customers: state.ltv.filter((c) => c.orders_count > 0).length,
    view_to_cart_pct: views ? (100 * carts) / views : 0,
    cart_to_checkout_pct: carts ? (100 * checkouts) / carts : 0,
    view_to_checkout_pct: views ? (100 * checkouts) / views : 0,
    refund_rate_pct: 1.8 + Math.random() * 0.6,
    pipeline_health_pct: 100,
    revenue_trend: state.revenue.map((r) => r.revenue_eur),
    orders_trend: state.revenue.map((r) => r.orders_count),
    checkout_trend: state.funnel.map((f) => f.checkouts),
  };
}

function renderKpis(k) {
  const cards = [
    {
      label: "Gross merchandise value",
      value: money(k.gmv_eur),
      meta: `${k.orders || 0} paid orders`,
      tone: "tone-cyan",
      spark: k.revenue_trend,
      color: "#5eead4",
    },
    {
      label: "Average order value",
      value: money(k.aov_eur, 2),
      meta: `${k.paying_customers || 0} paying customers`,
      tone: "tone-violet",
      spark: k.orders_trend,
      color: "#a5b4fc",
    },
    {
      label: "View → checkout",
      value: pct(k.view_to_checkout_pct),
      meta: `Cart ${pct(k.view_to_cart_pct)} · Checkout ${pct(k.cart_to_checkout_pct)}`,
      tone: "tone-good",
      spark: k.checkout_trend,
      color: "#34d399",
    },
    {
      label: "Pipeline health",
      value: pct(k.pipeline_health_pct),
      meta: `Refund rate ${pct(k.refund_rate_pct)}`,
      tone: "tone-gold",
      spark: null,
      color: "#fbbf24",
    },
  ];
  document.getElementById("kpiGrid").innerHTML = cards
    .map(
      (c) => `<article class="kpi ${c.tone}">
        <span class="kpi-label">${c.label}</span>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-meta">${c.meta}</div>
        ${c.spark ? sparkline(c.spark, c.color) : ""}
      </article>`
    )
    .join("");
}

function renderRevenueBars() {
  const series = state.revenue.slice(-10);
  const max = Math.max(...series.map((r) => r.revenue_eur), 1);
  document.getElementById("revenueBars").innerHTML = series
    .map((r) => {
      const h = Math.max(8, Math.round((r.revenue_eur / max) * 120));
      const label = String(r.order_date).slice(5);
      return `<div class="col" title="${r.order_date}: ${money(r.revenue_eur)}"><b style="height:${h}px"></b><em>${label}</em></div>`;
    })
    .join("");
}

function renderFunnel(k) {
  const latest = state.funnel[state.funnel.length - 1] || {};
  const steps = [
    { name: "Product views", n: latest.views || 0 },
    { name: "Add to cart", n: latest.add_to_cart || 0 },
    { name: "Checkouts", n: latest.checkouts || 0 },
  ];
  const max = Math.max(...steps.map((s) => s.n), 1);
  document.getElementById("funnelSteps").innerHTML = steps
    .map(
      (s) => `<div class="funnel-step">
        <span>${s.name}</span>
        <div class="bar"><i style="width:${Math.round((s.n / max) * 100)}%"></i></div>
        <strong>${s.n}</strong>
      </div>`
    )
    .join("");
}

function renderLayers() {
  const layers = [
    {
      name: "bronze",
      title: "Bronze",
      subtitle: "Raw landing",
      tables: Object.entries(state.bronze).map(([name, rows]) => ({ name, rows })),
    },
    {
      name: "silver",
      title: "Silver",
      subtitle: "dbt cleaned",
      tables: Object.entries(state.silver).map(([name, rows]) => ({ name, rows })),
    },
    {
      name: "gold",
      title: "Gold",
      subtitle: "Business marts",
      tables: [
        { name: "revenue_daily", rows: state.revenue.length },
        { name: "funnel_daily", rows: state.funnel.length },
        { name: "customer_ltv", rows: state.ltv.length },
      ],
    },
  ];
  document.getElementById("layers").innerHTML = layers
    .map(
      (l) => `<article class="layer ${l.name}">
        <h3>${l.title}</h3>
        <p>${l.subtitle}</p>
        <ul>${l.tables
          .map((t) => `<li><span class="mono">${t.name}</span><strong>${t.rows.toLocaleString()}</strong></li>`)
          .join("")}</ul>
      </article>`
    )
    .join("");
}

function renderCountries() {
  const max = Math.max(...state.countries.map((r) => r.revenue_eur), 1);
  document.getElementById("countryBars").innerHTML = state.countries
    .map(
      (r) => `<div class="country-row">
        <strong>${r.country}</strong>
        <div class="bar"><i style="width:${Math.round((r.revenue_eur / max) * 100)}%"></i></div>
        <span>${money(r.revenue_eur)}</span>
      </div>`
    )
    .join("");
}

function render() {
  const k = kpisFromState();
  renderKpis(k);
  renderRevenueBars();
  renderFunnel(k);
  renderLayers();
  renderCountries();

  document.getElementById("ltvTable").innerHTML = table(
    ["Customer", "Country", "Orders", "LTV"],
    state.ltv.map(
      (r) => `<tr>
        <td class="mono">${r.customer_id}</td>
        <td>${r.country}</td>
        <td>${r.orders_count}</td>
        <td><strong>${money(r.lifetime_revenue_eur)}</strong></td>
      </tr>`
    )
  );

  document.getElementById("revenueTable").innerHTML = table(
    ["Date", "Orders", "Buyers", "Revenue", "AOV"],
    [...state.revenue]
      .reverse()
      .slice(0, 10)
      .map(
        (r) => `<tr>
          <td class="mono">${r.order_date}</td>
          <td>${r.orders_count}</td>
          <td>${r.buyers}</td>
          <td>${money(r.revenue_eur)}</td>
          <td>${money(r.avg_order_value, 2)}</td>
        </tr>`
      )
  );

  document.getElementById("runsTable").innerHTML = table(
    ["Run", "Files", "dbt", "Latency"],
    state.runs.map(
      (r) => `<tr>
        <td class="mono">${r.run_id}</td>
        <td>${r.files_ingested}</td>
        <td><span class="pill ${r.dbt_status === "ok" ? "ok" : "bad"}">${r.dbt_status}</span></td>
        <td>${r.duration_ms} ms</td>
      </tr>`
    )
  );
}

function tick() {
  const addC = 8 + Math.floor(Math.random() * 12);
  const addO = 14 + Math.floor(Math.random() * 20);
  const addE = 40 + Math.floor(Math.random() * 35);
  state.bronze.customers += addC;
  state.bronze.orders += addO;
  state.bronze.events += addE;
  state.silver.customers += Math.floor(addC * 0.96);
  state.silver.orders += Math.floor(addO * 0.94);
  state.silver.events += Math.floor(addE * 0.97);

  const day = new Date().toISOString().slice(0, 10);
  const last = state.revenue[state.revenue.length - 1];
  const orders = 30 + Math.floor(Math.random() * 35);
  const revenue = Math.round(1400 + Math.random() * 2600);
  if (last && last.order_date === day) {
    last.orders_count += Math.floor(orders * 0.15);
    last.revenue_eur += Math.round(revenue * 0.12);
    last.buyers += Math.floor(orders * 0.1);
    last.avg_order_value = Math.round((last.revenue_eur / last.orders_count) * 100) / 100;
  } else {
    state.revenue.push({
      order_date: day,
      orders_count: orders,
      buyers: Math.floor(orders * 0.72),
      revenue_eur: revenue,
      avg_order_value: Math.round((revenue / orders) * 100) / 100,
    });
    state.revenue = state.revenue.slice(-14);
  }

  const fLast = state.funnel[state.funnel.length - 1];
  if (fLast && fLast.event_date === day) {
    fLast.views += 12 + Math.floor(Math.random() * 20);
    fLast.add_to_cart += 4 + Math.floor(Math.random() * 8);
    fLast.checkouts += 2 + Math.floor(Math.random() * 5);
  }

  state.ltv = state.ltv
    .map((c) => ({
      ...c,
      lifetime_revenue_eur: c.lifetime_revenue_eur + Math.round(Math.random() * 40),
    }))
    .sort((a, b) => b.lifetime_revenue_eur - a.lifetime_revenue_eur);

  state.countries = state.countries
    .map((c) => ({ ...c, revenue_eur: c.revenue_eur + Math.round(Math.random() * 80) }))
    .sort((a, b) => b.revenue_eur - a.revenue_eur);

  state.runs.unshift({
    run_id: `run_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
    files_ingested: 3,
    dbt_status: "ok",
    duration_ms: +(400 + Math.random() * 900).toFixed(1),
  });
  state.runs = state.runs.slice(0, 12);
  render();
}

seedHistory();
render();
setInterval(tick, 3500);
