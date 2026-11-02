{{ config(alias='customers') }}

select
  customer_id,
  lower(trim(email)) as email,
  upper(country) as country,
  try_cast(signup_ts as timestamp) as signup_ts,
  _source_file,
  _ingested_at
from {{ source('bronze', 'customers') }}
where customer_id is not null
  and email is not null
  and length(trim(email)) > 3
