{{ config(alias='revenue_daily') }}

select
  cast(ordered_at as date) as order_date,
  count(*) as orders_count,
  count(distinct customer_id) as buyers,
  round(sum(amount_eur), 2) as revenue_eur,
  round(avg(amount_eur), 2) as avg_order_value
from {{ ref('orders') }}
where status = 'paid'
  and ordered_at is not null
group by 1
order by 1 desc
