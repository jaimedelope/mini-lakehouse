{{ config(alias='orders') }}

select
  order_id,
  customer_id,
  try_cast(amount_eur as double) as amount_eur,
  lower(status) as status,
  try_cast(ordered_at as timestamp) as ordered_at,
  _source_file,
  _ingested_at
from {{ source('bronze', 'orders') }}
where order_id is not null
  and try_cast(amount_eur as double) > 0
