{{ config(alias='customer_ltv') }}

select
  c.customer_id,
  c.country,
  c.email,
  count(o.order_id) as orders_count,
  round(coalesce(sum(case when o.status = 'paid' then o.amount_eur end), 0), 2) as lifetime_revenue_eur,
  min(o.ordered_at) as first_order_at,
  max(o.ordered_at) as last_order_at
from {{ ref('customers') }} c
left join {{ ref('orders') }} o on c.customer_id = o.customer_id
group by 1, 2, 3
