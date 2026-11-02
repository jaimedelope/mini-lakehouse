{{ config(alias='funnel_daily') }}

select
  cast(event_ts as date) as event_date,
  count(*) filter (where event_name = 'view_item') as views,
  count(*) filter (where event_name = 'add_to_cart') as add_to_cart,
  count(*) filter (where event_name = 'checkout') as checkouts,
  count(*) filter (where event_name = 'search') as searches
from {{ ref('events') }}
where event_ts is not null
group by 1
order by 1 desc
