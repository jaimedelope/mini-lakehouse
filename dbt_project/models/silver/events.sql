{{ config(alias='events') }}

select
  event_id,
  customer_id,
  lower(event_name) as event_name,
  try_cast(event_ts as timestamp) as event_ts,
  _source_file,
  _ingested_at
from {{ source('bronze', 'events') }}
where event_id is not null
  and event_name is not null
