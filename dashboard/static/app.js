async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

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

function renderRevenueBars(series) {
  const el = document.getElementById("revenueBars");
  if (!series?.length) {
    el.innerHTML = `<p class="empty">No revenue days yet</p>`;
    return;
  }
  const max = Math.max(...series.map((r) => r.revenue_eur), 1);
  el.innerHTML = series
    .slice()
    .reverse()
    .slice(-10)
    .map((r) => {
      const h = Math.max(8, Math.round((r.revenue_eur / max) * 120));
      const label = String(r.order_date).slice(5);
      return `<div class="col" title="${r.order_date}: ${money(r.revenue_eur)}"><b style="height:${h}px"></b><em>${label}</em></div>`;
    })
    .join("");
}

function renderFunnel(k, funnel) {
  const latest = funnel?.[0];
  const views = latest?.views ?? Math.round((k.view_to_checkout_pct || 1) * 10);
  const carts = latest?.add_to_cart ?? Math.round(views * ((k.view_to_cart_pct || 30) / 100));
  const checkouts = latest?.checkouts ?? Math.round(views * ((k.view_to_checkout_pct || 10) / 100));
  const steps = [
    { name: "Product views", n: views },
    { name: "Add to cart", n: carts },
    { name: "Checkouts", n: checkouts },
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

function renderLayers(layers) {
  document.getElementById("layers").innerHTML = (layers || [])
    .map(
      (l) => `<article class="layer ${l.name}">
        <h3>${l.title}</h3>
        <p>${l.subtitle}</p>
        <ul>${(l.tables || [])
          .map((t) => `<li><span class="mono">${t.name}</span><strong>${t.rows.toLocaleString()}</strong></li>`)
          .join("")}</ul>
      </article>`
    )
    .join("");
}

function renderCountries(rows) {
  const el = document.getElementById("countryBars");
  if (!rows?.length) {
    el.innerHTML = `<p class="empty">No country split yet</p>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.revenue_eur), 1);
  el.innerHTML = rows
    .map(
      (r) => `<div class="country-row">
        <strong>${r.country}</strong>
        <div class="bar"><i style="width:${Math.round((r.revenue_eur / max) * 100)}%"></i></div>
        <span>${money(r.revenue_eur)}</span>
      </div>`
    )
    .join("");
}

async function tick() {
  try {
    const data = await fetchJson("/api/layers");
    const k = data.kpis || {};
    renderKpis(k);
    renderRevenueBars(data.gold?.revenue_daily || []);
    renderFunnel(k, data.gold?.funnel_daily || []);
    renderLayers(data.layers || []);
    renderCountries(data.gold?.revenue_by_country || []);

    const ltv = data.gold?.customer_ltv || [];
    document.getElementById("ltvTable").innerHTML = table(
      ["Customer", "Country", "Orders", "LTV"],
      ltv.map(
        (r) => `<tr>
          <td class="mono">${r.customer_id}</td>
          <td>${r.country}</td>
          <td>${r.orders_count}</td>
          <td><strong>${money(r.lifetime_revenue_eur)}</strong></td>
        </tr>`
      )
    );

    const revenue = data.gold?.revenue_daily || [];
    document.getElementById("revenueTable").innerHTML = table(
      ["Date", "Orders", "Buyers", "Revenue", "AOV"],
      revenue.map(
        (r) => `<tr>
          <td class="mono">${r.order_date}</td>
          <td>${r.orders_count}</td>
          <td>${r.buyers}</td>
          <td>${money(r.revenue_eur)}</td>
          <td>${money(r.avg_order_value, 2)}</td>
        </tr>`
      )
    );

    const runs = data.pipeline_runs || [];
    document.getElementById("runsTable").innerHTML = table(
      ["Run", "Files", "dbt", "Latency"],
      runs.map(
        (r) => `<tr>
          <td class="mono">${r.run_id}</td>
          <td>${r.files_ingested}</td>
          <td><span class="pill ${r.dbt_status === "ok" ? "ok" : "bad"}">${r.dbt_status}</span></td>
          <td>${r.duration_ms} ms</td>
        </tr>`
      )
    );

    const status = document.getElementById("status");
    status.textContent = (k.gmv_eur || 0) > 0 ? "live · gold marts ready" : "warming up pipeline…";
    status.classList.toggle("live", (k.gmv_eur || 0) > 0 || runs.length > 0);
  } catch (err) {
    document.getElementById("status").textContent = "disconnected";
    console.error(err);
  }
}

tick();
setInterval(tick, 4000);
