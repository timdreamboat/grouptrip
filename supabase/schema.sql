-- GroupTrip schema. Money is integer cents.
--
-- Access model: no accounts. A trip is reached through its unguessable
-- share_code (the share link). Tables have RLS on with NO policies, so the
-- public key cannot read or write them directly. Everything goes through
-- the functions below, which require the share_code.

-- ---------- tables ----------
create table trips (
  id           uuid primary key default gen_random_uuid(),
  share_code   text unique not null default replace(gen_random_uuid()::text, '-', ''),
  name         text not null check (length(name) between 1 and 120),
  destination  text,
  start_date   date,
  end_date     date,
  currency     text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at   timestamptz not null default now()
);

create table members (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  name       text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table itinerary_items (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips(id) on delete cascade,
  day           date,
  time          text,
  title         text not null check (length(title) between 1 and 200),
  notes         text,
  place         text,     -- shown as an embedded map
  opentable_rid integer,  -- shows OpenTable's own booking screen, embedded
  booking_url   text,     -- any other booking site, opened in a new tab
  created_at    timestamptz not null default now()
);

create table flights (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trips(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  flight_number text not null,
  flight_date   date not null,
  dep_airport   text,
  dep_time      text,     -- local time at departure airport, "HH:MM"
  arr_airport   text,
  arr_time      text,     -- local time at arrival airport, "HH:MM"
  arr_date      date,     -- if it lands on a different day
  created_at    timestamptz not null default now()
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  description  text not null check (length(description) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references members(id),
  spent_on     date,
  created_at   timestamptz not null default now()
);

create table expense_splits (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id),
  share_cents integer not null check (share_cents >= 0),
  primary key (expense_id, member_id)
);

create index on members (trip_id);
create index on itinerary_items (trip_id);
create index on flights (trip_id);
create index on expenses (trip_id);
create index on expense_splits (member_id);

alter table trips           enable row level security;
alter table members         enable row level security;
alter table itinerary_items enable row level security;
alter table flights         enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;

revoke all on trips, members, itinerary_items, flights, expenses, expense_splits from anon, authenticated;

-- ---------- functions (the only way in) ----------
create function _trip(p_code text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips where share_code = p_code;
  if t is null then raise exception 'Trip not found'; end if;
  return t;
end $$;
revoke execute on function _trip(text) from public, anon, authenticated;

create function create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text)
returns text language sql security definer set search_path = public as $$
  insert into trips (name, destination, start_date, end_date, currency)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start, p_end, coalesce(nullif(upper(trim(p_currency)), ''), 'USD'))
  returning share_code;
$$;

create function get_trip(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t trips; tid uuid := _trip(p_code);
begin
  select * into t from trips where id = tid;
  return jsonb_build_object(
    'id', t.share_code, 'name', t.name, 'destination', t.destination,
    'startDate', t.start_date, 'endDate', t.end_date, 'currency', t.currency,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at)
                         from members m where m.trip_id = tid), '[]'),
    'itinerary', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'day', i.day, 'time', i.time, 'title', i.title, 'notes', i.notes,
                             'place', i.place, 'opentableRid', i.opentable_rid, 'bookingUrl', i.booking_url)
                           order by i.created_at)
                           from itinerary_items i where i.trip_id = tid), '[]'),
    'flights', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', f.id, 'memberId', f.member_id, 'flightNumber', f.flight_number, 'date', f.flight_date,
                           'depAirport', f.dep_airport, 'depTime', f.dep_time,
                           'arrAirport', f.arr_airport, 'arrTime', f.arr_time, 'arrDate', f.arr_date)
                         order by f.created_at)
                         from flights f where f.trip_id = tid), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', e.id, 'description', e.description, 'amount', e.amount_cents,
                            'paidBy', e.paid_by, 'spentOn', e.spent_on,
                            'splits', (select jsonb_agg(jsonb_build_object('memberId', s.member_id, 'share', s.share_cents))
                                       from expense_splits s where s.expense_id = e.id))
                          order by e.created_at desc)
                          from expenses e where e.trip_id = tid), '[]')
  );
end $$;

create function delete_trip(p_code text) returns void
language sql security definer set search_path = public as $$
  delete from trips where id = _trip(p_code);
$$;

create function add_member(p_code text, p_name text) returns uuid
language sql security definer set search_path = public as $$
  insert into members (trip_id, name) values (_trip(p_code), trim(p_name)) returning id;
$$;

create function remove_member(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from expenses where paid_by = p_id)
     or exists (select 1 from expense_splits where member_id = p_id) then
    raise exception 'This person is part of an expense — remove those expenses first.';
  end if;
  delete from members where id = p_id and trip_id = _trip(p_code);
end $$;

create function add_item(p_code text, p_item jsonb) returns uuid
language sql security definer set search_path = public as $$
  insert into itinerary_items (trip_id, day, time, title, notes, place, opentable_rid, booking_url)
  values (_trip(p_code), nullif(p_item->>'day', '')::date, nullif(p_item->>'time', ''), trim(p_item->>'title'),
          nullif(p_item->>'notes', ''), nullif(p_item->>'place', ''),
          nullif(p_item->>'opentableRid', '')::integer, nullif(p_item->>'bookingUrl', ''))
  returning id;
$$;

create function remove_item(p_code text, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from itinerary_items where id = p_id and trip_id = _trip(p_code);
$$;

create function add_flight(p_code text, p_flight jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid := _trip(p_code); new_id uuid;
begin
  if not exists (select 1 from members where id = (p_flight->>'memberId')::uuid and trip_id = tid) then
    raise exception 'Unknown person';
  end if;
  insert into flights (trip_id, member_id, flight_number, flight_date, dep_airport, dep_time, arr_airport, arr_time, arr_date)
  values (tid, (p_flight->>'memberId')::uuid, upper(trim(p_flight->>'flightNumber')), (p_flight->>'date')::date,
          nullif(upper(p_flight->>'depAirport'), ''), nullif(p_flight->>'depTime', ''),
          nullif(upper(p_flight->>'arrAirport'), ''), nullif(p_flight->>'arrTime', ''),
          nullif(p_flight->>'arrDate', '')::date)
  returning id into new_id;
  return new_id;
end $$;

create function remove_flight(p_code text, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from flights where id = p_id and trip_id = _trip(p_code);
$$;

-- p_splits: [{"memberId": "...", "share": 1234}, ...] — must add up to p_amount.
create function add_expense(p_code text, p_description text, p_amount integer, p_paid_by uuid, p_splits jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid := _trip(p_code); new_id uuid;
begin
  if (select coalesce(sum((s->>'share')::integer), -1) from jsonb_array_elements(p_splits) s) <> p_amount then
    raise exception 'Split shares must add up to the total';
  end if;
  if (select count(*) from members m
      where m.trip_id = tid
        and (m.id = p_paid_by or m.id in (select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s)))
     <> (select count(distinct x) from (select p_paid_by as x union select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s) u) then
    raise exception 'Unknown person in expense';
  end if;
  insert into expenses (trip_id, description, amount_cents, paid_by, spent_on)
  values (tid, trim(p_description), p_amount, p_paid_by, current_date)
  returning id into new_id;
  insert into expense_splits (expense_id, member_id, share_cents)
  select new_id, (s->>'memberId')::uuid, (s->>'share')::integer from jsonb_array_elements(p_splits) s;
  return new_id;
end $$;

create function remove_expense(p_code text, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from expenses where id = p_id and trip_id = _trip(p_code);
$$;
