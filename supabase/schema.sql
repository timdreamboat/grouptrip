-- GroupTrip schema (v2: organizer vs guest roles). Money is integer cents.
--
-- Access model — no accounts:
-- * The invite link carries the trip's share_code. Anyone with it can view
--   the trip and join (or claim a name the organizer pre-added).
-- * Joining returns a secret per-person token, kept on that person's device.
--   Every change needs the token; it identifies who is acting.
-- * The organizer is the member with is_organizer = true. Their token
--   unlocks organizer-only actions (edit trip, itinerary, people, delete).
-- * Tables have RLS on with NO policies and are revoked from anon, so the
--   public key can only use the functions below. Tokens are never returned
--   by get_trip.

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
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  token        text unique not null default replace(gen_random_uuid()::text, '-', ''),
  is_organizer boolean not null default false,
  rsvp         text not null default 'invited' check (rsvp in ('invited', 'going', 'maybe', 'declined')),
  joined_at    timestamptz,             -- null = pre-added by the organizer, not claimed yet
  venmo        text,
  created_at   timestamptz not null default now()
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
  paid_by      uuid not null references members(id) on delete cascade,
  created_by   uuid references members(id) on delete set null,
  spent_on     date,
  created_at   timestamptz not null default now()
);

-- remove_member() refuses to remove someone who is in an expense, so these
-- cascades only fire when a whole trip is deleted.
create table expense_splits (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  share_cents integer not null check (share_cents >= 0),
  primary key (expense_id, member_id)
);

create index on members (trip_id);
create index on itinerary_items (trip_id);
create index on flights (trip_id);
create index on flights (member_id);
create index on expenses (trip_id);
create index on expenses (paid_by);
create index on expenses (created_by);
create index on expense_splits (member_id);

alter table trips           enable row level security;
alter table members         enable row level security;
alter table itinerary_items enable row level security;
alter table flights         enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;

revoke all on trips, members, itinerary_items, flights, expenses, expense_splits from anon, authenticated;

-- ---------- internal helpers (not callable from the app) ----------
create function _trip(p_code text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips where share_code = p_code;
  if t is null then raise exception 'Trip not found'; end if;
  return t;
end $$;

-- The person acting: must be a joined member of this trip.
create function _actor(p_code text, p_token text) returns members
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members
  where trip_id = _trip(p_code) and token = p_token and joined_at is not null;
  if m.id is null then raise exception 'You need to join this trip first'; end if;
  return m;
end $$;

create function _organizer(p_code text, p_token text) returns members
language plpgsql stable security definer set search_path = public as $$
declare m members := _actor(p_code, p_token);
begin
  if not m.is_organizer then raise exception 'Only the organizer can do that'; end if;
  return m;
end $$;

revoke execute on function _trip(text), _actor(text, text), _organizer(text, text) from public, anon, authenticated;

-- ---------- trip ----------
create function create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text, p_organizer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t trips; m members;
begin
  insert into trips (name, destination, start_date, end_date, currency)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start, p_end, coalesce(nullif(upper(trim(p_currency)), ''), 'USD'))
  returning * into t;
  insert into members (trip_id, name, is_organizer, rsvp, joined_at)
  values (t.id, trim(p_organizer), true, 'going', now())
  returning * into m;
  return jsonb_build_object('code', t.share_code, 'memberId', m.id, 'token', m.token);
end $$;

create function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t trips; tid uuid := _trip(p_code); me members;
begin
  select * into t from trips where id = tid;
  if p_token is not null then
    select * into me from members where trip_id = tid and token = p_token and joined_at is not null;
  end if;
  return jsonb_build_object(
    'id', t.share_code, 'name', t.name, 'destination', t.destination,
    'startDate', t.start_date, 'endDate', t.end_date, 'currency', t.currency,
    'me', case when me.id is null then null
               else jsonb_build_object('id', me.id, 'isOrganizer', me.is_organizer) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', m.id, 'name', m.name, 'isOrganizer', m.is_organizer, 'rsvp', m.rsvp,
                           'joined', m.joined_at is not null, 'venmo', m.venmo)
                         order by m.is_organizer desc, m.created_at)
                         from members m where m.trip_id = tid), '[]'),
    'itinerary', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'day', i.day, 'time', i.time, 'title', i.title, 'notes', i.notes,
                             'place', i.place, 'opentableRid', i.opentable_rid, 'bookingUrl', i.booking_url)
                           order by i.day nulls last, i.time nulls first, i.created_at)
                           from itinerary_items i where i.trip_id = tid), '[]'),
    'flights', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', f.id, 'memberId', f.member_id, 'flightNumber', f.flight_number, 'date', f.flight_date,
                           'depAirport', f.dep_airport, 'depTime', f.dep_time,
                           'arrAirport', f.arr_airport, 'arrTime', f.arr_time, 'arrDate', f.arr_date)
                         order by f.created_at)
                         from flights f where f.trip_id = tid), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', e.id, 'description', e.description, 'amount', e.amount_cents,
                            'paidBy', e.paid_by, 'createdBy', e.created_by, 'spentOn', e.spent_on,
                            'splits', (select jsonb_agg(jsonb_build_object('memberId', s.member_id, 'share', s.share_cents))
                                       from expense_splits s where s.expense_id = e.id))
                          order by e.created_at desc)
                          from expenses e where e.trip_id = tid), '[]')
  );
end $$;

create function update_trip(p_code text, p_token text, p_trip jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update trips set
    name        = coalesce(nullif(trim(p_trip->>'name'), ''), name),
    destination = case when p_trip ? 'destination' then nullif(trim(p_trip->>'destination'), '') else destination end,
    start_date  = case when p_trip ? 'startDate' then nullif(p_trip->>'startDate', '')::date else start_date end,
    end_date    = case when p_trip ? 'endDate' then nullif(p_trip->>'endDate', '')::date else end_date end
  where id = o.trip_id;
end $$;

create function delete_trip(p_code text, p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  delete from trips where id = o.trip_id;
end $$;

-- ---------- people ----------
-- A new person joins through the invite link.
create function join_trip(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  insert into members (trip_id, name, rsvp, joined_at)
  values (_trip(p_code), trim(p_name), 'going', now())
  returning * into m;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

-- Someone the organizer pre-added says "that's me".
create function claim_member(p_code text, p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  update members set joined_at = now(), rsvp = 'going'
  where id = p_member and trip_id = _trip(p_code) and joined_at is null
  returning * into m;
  if m.id is null then raise exception 'That name has already been claimed. Ask the organizer for help.'; end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

create function update_me(p_code text, p_token text, p_me jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  update members set
    name  = coalesce(nullif(trim(p_me->>'name'), ''), name),
    rsvp  = case when p_me->>'rsvp' in ('going', 'maybe', 'declined') then p_me->>'rsvp' else rsvp end,
    venmo = case when p_me ? 'venmo' then nullif(regexp_replace(trim(p_me->>'venmo'), '^@', ''), '') else venmo end
  where id = a.id;
end $$;

-- Organizer pre-adds someone so their name is waiting for them.
create function invite_member(p_code text, p_token text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into members (trip_id, name) values (o.trip_id, trim(p_name)) returning id into new_id;
  return new_id;
end $$;

create function remove_member(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  if p_id = o.id then raise exception 'You can''t remove yourself as organizer'; end if;
  if exists (select 1 from expenses where paid_by = p_id)
     or exists (select 1 from expense_splits where member_id = p_id) then
    raise exception 'This person is part of an expense — remove those expenses first.';
  end if;
  delete from members where id = p_id and trip_id = o.trip_id;
end $$;

-- ---------- itinerary (organizer) ----------
create function add_item(p_code text, p_token text, p_item jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into itinerary_items (trip_id, day, time, title, notes, place, opentable_rid, booking_url)
  values (o.trip_id, nullif(p_item->>'day', '')::date, nullif(p_item->>'time', ''), trim(p_item->>'title'),
          nullif(p_item->>'notes', ''), nullif(p_item->>'place', ''),
          nullif(p_item->>'opentableRid', '')::integer, nullif(p_item->>'bookingUrl', ''))
  returning id into new_id;
  return new_id;
end $$;

create function remove_item(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  delete from itinerary_items where id = p_id and trip_id = o.trip_id;
end $$;

-- ---------- flights (your own; organizer can add for anyone) ----------
create function add_flight(p_code text, p_token text, p_flight jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); who uuid; new_id uuid;
begin
  who := coalesce(nullif(p_flight->>'memberId', '')::uuid, a.id);
  if who <> a.id and not a.is_organizer then raise exception 'You can only add your own flight'; end if;
  if not exists (select 1 from members where id = who and trip_id = a.trip_id) then raise exception 'Unknown person'; end if;
  insert into flights (trip_id, member_id, flight_number, flight_date, dep_airport, dep_time, arr_airport, arr_time, arr_date)
  values (a.trip_id, who, upper(trim(p_flight->>'flightNumber')), (p_flight->>'date')::date,
          nullif(upper(p_flight->>'depAirport'), ''), nullif(p_flight->>'depTime', ''),
          nullif(upper(p_flight->>'arrAirport'), ''), nullif(p_flight->>'arrTime', ''),
          nullif(p_flight->>'arrDate', '')::date)
  returning id into new_id;
  return new_id;
end $$;

create function remove_flight(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from flights where id = p_id and trip_id = a.trip_id and (member_id = a.id or a.is_organizer);
  if not found then raise exception 'You can only remove your own flight'; end if;
end $$;

-- ---------- expenses (anyone on the trip) ----------
-- p_splits: [{"memberId": "...", "share": 1234}, ...] — must add up to p_amount.
create function add_expense(p_code text, p_token text, p_description text, p_amount integer, p_paid_by uuid, p_splits jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  if (select coalesce(sum((s->>'share')::integer), -1) from jsonb_array_elements(p_splits) s) <> p_amount then
    raise exception 'Split shares must add up to the total';
  end if;
  if exists (
    select 1 from (select p_paid_by as mid union select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s) u
    where not exists (select 1 from members m where m.id = u.mid and m.trip_id = a.trip_id)
  ) then
    raise exception 'Unknown person in expense';
  end if;
  insert into expenses (trip_id, description, amount_cents, paid_by, created_by, spent_on)
  values (a.trip_id, trim(p_description), p_amount, p_paid_by, a.id, current_date)
  returning id into new_id;
  insert into expense_splits (expense_id, member_id, share_cents)
  select new_id, (s->>'memberId')::uuid, (s->>'share')::integer from jsonb_array_elements(p_splits) s;
  return new_id;
end $$;

create function remove_expense(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from expenses
  where id = p_id and trip_id = a.trip_id
    and (created_by = a.id or paid_by = a.id or a.is_organizer);
  if not found then raise exception 'Only the person who added or paid this expense can remove it'; end if;
end $$;

-- ======================================================================
-- v3 (2026-09-22): cover photo, map location, "good to know" notes,
-- stays, and lists. get_trip / update_trip below replace the versions above.
-- ======================================================================
alter table trips
  add column lat          double precision,
  add column lon          double precision,
  add column cover_url    text,
  add column cover_credit text,
  add column cover_link   text,
  add column notes        text check (length(notes) <= 4000);

create table stays (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references trips(id) on delete cascade,
  name           text not null check (length(name) between 1 and 200),
  address        text,
  check_in       date,
  check_in_time  text,
  check_out      date,
  check_out_time text,
  booking_url    text,
  confirmation   text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table list_items (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  text        text not null check (length(text) between 1 and 200),
  owner_id    uuid references members(id) on delete cascade,     -- set = private packing item
  claimed_by  uuid references members(id) on delete set null,    -- shared item: who's bringing it
  created_by  uuid references members(id) on delete set null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index on stays (trip_id);
create index on list_items (trip_id);
create index on list_items (owner_id);
create index on list_items (claimed_by);
create index on list_items (created_by);

alter table stays      enable row level security;
alter table list_items enable row level security;
revoke all on stays, list_items from anon, authenticated;

create or replace function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t trips; tid uuid := _trip(p_code); me members;
begin
  select * into t from trips where id = tid;
  if p_token is not null then
    select * into me from members where trip_id = tid and token = p_token and joined_at is not null;
  end if;
  return jsonb_build_object(
    'id', t.share_code, 'name', t.name, 'destination', t.destination,
    'startDate', t.start_date, 'endDate', t.end_date, 'currency', t.currency,
    'lat', t.lat, 'lon', t.lon, 'notes', t.notes,
    'cover', case when t.cover_url is null then null
                  else jsonb_build_object('url', t.cover_url, 'credit', t.cover_credit, 'link', t.cover_link) end,
    'me', case when me.id is null then null
               else jsonb_build_object('id', me.id, 'isOrganizer', me.is_organizer) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', m.id, 'name', m.name, 'isOrganizer', m.is_organizer, 'rsvp', m.rsvp,
                           'joined', m.joined_at is not null, 'venmo', m.venmo)
                         order by m.is_organizer desc, m.created_at)
                         from members m where m.trip_id = tid), '[]'),
    'itinerary', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'day', i.day, 'time', i.time, 'title', i.title, 'notes', i.notes,
                             'place', i.place, 'opentableRid', i.opentable_rid, 'bookingUrl', i.booking_url)
                           order by i.day nulls last, i.time nulls first, i.created_at)
                           from itinerary_items i where i.trip_id = tid), '[]'),
    'flights', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', f.id, 'memberId', f.member_id, 'flightNumber', f.flight_number, 'date', f.flight_date,
                           'depAirport', f.dep_airport, 'depTime', f.dep_time,
                           'arrAirport', f.arr_airport, 'arrTime', f.arr_time, 'arrDate', f.arr_date)
                         order by f.created_at)
                         from flights f where f.trip_id = tid), '[]'),
    'stays', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'name', s.name, 'address', s.address,
                         'checkIn', s.check_in, 'checkInTime', s.check_in_time,
                         'checkOut', s.check_out, 'checkOutTime', s.check_out_time,
                         'bookingUrl', s.booking_url, 'confirmation', s.confirmation, 'notes', s.notes)
                       order by s.check_in nulls last, s.created_at)
                       from stays s where s.trip_id = tid), '[]'),
    -- Shared items for everyone; private packing items only for their owner.
    'lists', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', l.id, 'text', l.text, 'personal', l.owner_id is not null,
                         'claimedBy', l.claimed_by, 'createdBy', l.created_by, 'done', l.done)
                       order by l.created_at)
                       from list_items l
                       where l.trip_id = tid and (l.owner_id is null or l.owner_id = me.id)), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', e.id, 'description', e.description, 'amount', e.amount_cents,
                            'paidBy', e.paid_by, 'createdBy', e.created_by, 'spentOn', e.spent_on,
                            'splits', (select jsonb_agg(jsonb_build_object('memberId', s.member_id, 'share', s.share_cents))
                                       from expense_splits s where s.expense_id = e.id))
                          order by e.created_at desc)
                          from expenses e where e.trip_id = tid), '[]')
  );
end $$;

create or replace function update_trip(p_code text, p_token text, p_trip jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update trips set
    name         = coalesce(nullif(trim(p_trip->>'name'), ''), name),
    destination  = case when p_trip ? 'destination' then nullif(trim(p_trip->>'destination'), '') else destination end,
    start_date   = case when p_trip ? 'startDate' then nullif(p_trip->>'startDate', '')::date else start_date end,
    end_date     = case when p_trip ? 'endDate' then nullif(p_trip->>'endDate', '')::date else end_date end,
    lat          = case when p_trip ? 'lat' then (p_trip->>'lat')::double precision else lat end,
    lon          = case when p_trip ? 'lon' then (p_trip->>'lon')::double precision else lon end,
    notes        = case when p_trip ? 'notes' then nullif(trim(p_trip->>'notes'), '') else notes end,
    cover_url    = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'url', '') else cover_url end,
    cover_credit = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'credit', '') else cover_credit end,
    cover_link   = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'link', '') else cover_link end
  where id = o.trip_id;
end $$;

-- ---------- stays (organizer) ----------
create function add_stay(p_code text, p_token text, p_stay jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into stays (trip_id, name, address, check_in, check_in_time, check_out, check_out_time, booking_url, confirmation, notes)
  values (o.trip_id, trim(p_stay->>'name'), nullif(trim(p_stay->>'address'), ''),
          nullif(p_stay->>'checkIn', '')::date, nullif(p_stay->>'checkInTime', ''),
          nullif(p_stay->>'checkOut', '')::date, nullif(p_stay->>'checkOutTime', ''),
          nullif(trim(p_stay->>'bookingUrl'), ''), nullif(trim(p_stay->>'confirmation'), ''), nullif(trim(p_stay->>'notes'), ''))
  returning id into new_id;
  return new_id;
end $$;

create function remove_stay(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  delete from stays where id = p_id and trip_id = o.trip_id;
end $$;

-- ---------- lists (anyone on the trip) ----------
create function add_list_item(p_code text, p_token text, p_text text, p_personal boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  insert into list_items (trip_id, text, owner_id, created_by)
  values (a.trip_id, trim(p_text), case when p_personal then a.id end, a.id)
  returning id into new_id;
  return new_id;
end $$;

-- p_change: {"done": true|false} and/or {"claim": true|false} (claim = I'm bringing it)
create function update_list_item(p_code text, p_token text, p_id uuid, p_change jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); l list_items;
begin
  select * into l from list_items where id = p_id and trip_id = a.trip_id;
  if l.id is null or (l.owner_id is not null and l.owner_id <> a.id) then raise exception 'Item not found'; end if;
  if l.owner_id is null and p_change ? 'claim' and l.claimed_by is not null and l.claimed_by <> a.id
     and not a.is_organizer then
    raise exception 'Someone else is already bringing that';
  end if;
  update list_items set
    done       = case when p_change ? 'done' then (p_change->>'done')::boolean else done end,
    claimed_by = case when p_change ? 'claim' and l.owner_id is null
                      then case when (p_change->>'claim')::boolean then a.id else null end
                      else claimed_by end
  where id = l.id;
end $$;

create function remove_list_item(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from list_items
  where id = p_id and trip_id = a.trip_id
    and (owner_id = a.id or (owner_id is null and (created_by = a.id or a.is_organizer)));
  if not found then raise exception 'Only the person who added it can remove it'; end if;
end $$;

-- ======================================================================
-- v4 (2026-09-22): polls and the shared photo album.
-- NOTE: the get_trip below is the CURRENT trip builder (up to date through v11);
-- in v11 it is renamed to _get_trip_all and wrapped by a new get_trip.
-- plpgsql only checks table names when it runs, so defining it here is fine.
-- get_trip below replaces the earlier versions (adds polls + photos).
-- ======================================================================
create table polls (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  question   text not null check (length(question) between 1 and 200),
  kind       text not null default 'text' check (kind in ('text', 'date')),
  multi      boolean not null default true,      -- can people pick more than one?
  allow_add  boolean not null default true,      -- can anyone add options?
  closed     boolean not null default false,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table poll_options (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references polls(id) on delete cascade,
  label      text not null check (length(label) between 1 and 200),
  start_date date,   -- date polls: a proposed trip window
  end_date   date,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table poll_votes (
  option_id  uuid not null references poll_options(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, member_id)
);

-- Photo files live in the public 'trip-photos' bucket, under the trip's internal id.
create table photos (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  path        text not null,
  thumb_path  text not null,
  width       integer,
  height      integer,
  uploaded_by uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index on polls (trip_id);
create index on polls (created_by);
create index on poll_options (poll_id);
create index on poll_options (created_by);
create index on poll_votes (member_id);
create index on photos (trip_id);
create index on photos (uploaded_by);

alter table polls        enable row level security;
alter table poll_options enable row level security;
alter table poll_votes   enable row level security;
alter table photos       enable row level security;
revoke all on polls, poll_options, poll_votes, photos from anon, authenticated;

-- Public bucket: readable by URL (unguessable paths under the trip's internal
-- id — never the share code). Uploads only via signed URLs issued by the
-- 'photos' Edge Function after it checks the person is on the trip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', true, 10485760, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t trips; tid uuid := _trip(p_code); me members;
begin
  select * into t from trips where id = tid;
  if p_token is not null then
    select * into me from members where trip_id = tid and token = p_token and joined_at is not null;
  end if;
  return jsonb_build_object(
    'id', t.share_code, 'name', t.name, 'destination', t.destination, 'kind', t.kind,
    'startDate', t.start_date, 'endDate', t.end_date, 'currency', t.currency,
    'lat', t.lat, 'lon', t.lon, 'notes', t.notes,
    'cover', case when t.cover_url is null then null
                  else jsonb_build_object('url', t.cover_url, 'credit', t.cover_credit, 'link', t.cover_link) end,
    'me', case when me.id is null then null
               else jsonb_build_object('id', me.id, 'isOrganizer', me.is_organizer) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', m.id, 'name', m.name, 'isOrganizer', m.is_organizer, 'rsvp', m.rsvp,
                           'joined', m.joined_at is not null, 'venmo', m.venmo)
                         order by m.is_organizer desc, m.created_at)
                         from members m where m.trip_id = tid), '[]'),
    'itinerary', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', i.id, 'day', i.day, 'time', i.time, 'title', i.title, 'notes', i.notes,
                             'place', i.place, 'opentableRid', i.opentable_rid, 'bookingUrl', i.booking_url,
                             'lat', i.lat, 'lon', i.lon)
                           order by i.day nulls last, i.time nulls first, i.created_at)
                           from itinerary_items i where i.trip_id = tid), '[]'),
    'flights', coalesce((select jsonb_agg(jsonb_build_object(
                           'id', f.id, 'memberId', f.member_id, 'flightNumber', f.flight_number, 'date', f.flight_date,
                           'depAirport', f.dep_airport, 'depTime', f.dep_time,
                           'arrAirport', f.arr_airport, 'arrTime', f.arr_time, 'arrDate', f.arr_date)
                         order by f.created_at)
                         from flights f where f.trip_id = tid), '[]'),
    'stays', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'name', s.name, 'address', s.address,
                         'checkIn', s.check_in, 'checkInTime', s.check_in_time,
                         'checkOut', s.check_out, 'checkOutTime', s.check_out_time,
                         'bookingUrl', s.booking_url, 'confirmation', s.confirmation, 'notes', s.notes,
                         'lat', s.lat, 'lon', s.lon,
                         'guests', coalesce((select jsonb_agg(g.member_id) from stay_guests g where g.stay_id = s.id), '[]'))
                       order by s.check_in nulls last, s.created_at)
                       from stays s where s.trip_id = tid), '[]'),
    'lists', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', l.id, 'text', l.text, 'personal', l.owner_id is not null,
                         'claimedBy', l.claimed_by, 'createdBy', l.created_by, 'done', l.done)
                       order by l.created_at)
                       from list_items l
                       where l.trip_id = tid and (l.owner_id is null or l.owner_id = me.id)), '[]'),
    'polls', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', p.id, 'question', p.question, 'kind', p.kind, 'multi', p.multi,
                         'allowAdd', p.allow_add, 'closed', p.closed, 'createdBy', p.created_by, 'createdAt', p.created_at,
                         'options', coalesce((select jsonb_agg(jsonb_build_object(
                                      'id', o.id, 'label', o.label, 'startDate', o.start_date, 'endDate', o.end_date,
                                      'votes', coalesce((select jsonb_agg(v.member_id order by v.created_at)
                                                         from poll_votes v where v.option_id = o.id), '[]'))
                                    order by o.start_date nulls last, o.created_at)
                                    from poll_options o where o.poll_id = p.id), '[]'))
                       order by p.closed, p.created_at desc)
                       from polls p where p.trip_id = tid), '[]'),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
                          'id', ph.id, 'path', ph.path, 'thumbPath', ph.thumb_path, 'width', ph.width, 'height', ph.height,
                          'uploadedBy', ph.uploaded_by, 'createdAt', ph.created_at)
                        order by ph.created_at desc)
                        from photos ph where ph.trip_id = tid), '[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', e.id, 'description', e.description, 'amount', e.amount_cents,
                            'paidBy', e.paid_by, 'createdBy', e.created_by, 'spentOn', e.spent_on,
                            'originalCents', e.original_cents, 'originalCurrency', e.original_currency, 'rate', e.rate,
                            'splitMode', e.split_mode, 'receiptPath', e.receipt_path, 'receiptThumb', e.receipt_thumb,
                            'category', e.category, 'companyPaid', e.company_paid, 'reimbursed', e.reimbursed,
                            'splits', (select jsonb_agg(jsonb_build_object('memberId', s.member_id, 'share', s.share_cents, 'weight', s.weight))
                                       from expense_splits s where s.expense_id = e.id))
                          order by e.spent_on desc nulls last, e.created_at desc)
                          from expenses e where e.trip_id = tid), '[]'),
    'settlements', coalesce((select jsonb_agg(jsonb_build_object(
                               'id', x.id, 'from', x.from_member, 'to', x.to_member, 'amount', x.amount_cents,
                               'createdBy', x.created_by, 'createdAt', x.created_at)
                             order by x.created_at desc)
                             from settlements x where x.trip_id = tid), '[]')
  );
end $$;

-- ---------- poll actions (anyone on the trip) ----------
-- p_poll: {question, kind, multi, allowAdd, options: [{label, startDate, endDate}]}
create function create_poll(p_code text, p_token text, p_poll jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  if jsonb_array_length(coalesce(p_poll->'options', '[]')) < 2 then raise exception 'Add at least two options'; end if;
  insert into polls (trip_id, question, kind, multi, allow_add, created_by)
  values (a.trip_id, trim(p_poll->>'question'), coalesce(p_poll->>'kind', 'text'),
          coalesce((p_poll->>'multi')::boolean, true), coalesce((p_poll->>'allowAdd')::boolean, true), a.id)
  returning id into new_id;
  insert into poll_options (poll_id, label, start_date, end_date, created_by)
  select new_id, trim(o->>'label'), nullif(o->>'startDate', '')::date, nullif(o->>'endDate', '')::date, a.id
  from jsonb_array_elements(p_poll->'options') o
  where length(trim(o->>'label')) > 0;
  return new_id;
end $$;

create function add_poll_option(p_code text, p_token text, p_poll uuid, p_option jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); p polls; new_id uuid;
begin
  select * into p from polls where id = p_poll and trip_id = a.trip_id;
  if p.id is null then raise exception 'Poll not found'; end if;
  if p.closed then raise exception 'This poll is closed'; end if;
  if not p.allow_add and p.created_by is distinct from a.id and not a.is_organizer then
    raise exception 'Only the person who made this poll can add options';
  end if;
  insert into poll_options (poll_id, label, start_date, end_date, created_by)
  values (p.id, trim(p_option->>'label'), nullif(p_option->>'startDate', '')::date, nullif(p_option->>'endDate', '')::date, a.id)
  returning id into new_id;
  return new_id;
end $$;

create function set_vote(p_code text, p_token text, p_option uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); p polls;
begin
  select pl.* into p from polls pl join poll_options o on o.poll_id = pl.id
  where o.id = p_option and pl.trip_id = a.trip_id;
  if p.id is null then raise exception 'Poll not found'; end if;
  if p.closed then raise exception 'This poll is closed'; end if;
  if p_on then
    if not p.multi then
      delete from poll_votes v using poll_options o
      where v.option_id = o.id and o.poll_id = p.id and v.member_id = a.id;
    end if;
    insert into poll_votes (option_id, member_id) values (p_option, a.id) on conflict do nothing;
  else
    delete from poll_votes where option_id = p_option and member_id = a.id;
  end if;
end $$;

create function close_poll(p_code text, p_token text, p_poll uuid, p_closed boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  update polls set closed = p_closed
  where id = p_poll and trip_id = a.trip_id and (created_by = a.id or a.is_organizer);
  if not found then raise exception 'Only the person who made this poll can close it'; end if;
end $$;

create function remove_poll(p_code text, p_token text, p_poll uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from polls where id = p_poll and trip_id = a.trip_id and (created_by = a.id or a.is_organizer);
  if not found then raise exception 'Only the person who made this poll can delete it'; end if;
end $$;

-- ---------- photos ----------
-- Used by the 'photos' Edge Function: confirms the person is on the trip and
-- returns the trip's internal id (the storage folder).
create function photo_folder(p_code text, p_token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  return a.trip_id;
end $$;

-- Organizer-only: the folder to empty before the trip is deleted.
create function photo_folder_to_purge(p_code text, p_token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  return o.trip_id;
end $$;

create function add_photo(p_code text, p_token text, p_photo jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  if not (p_photo->>'path' like a.trip_id::text || '/%' and p_photo->>'thumbPath' like a.trip_id::text || '/%') then
    raise exception 'Photo is not in this trip''s album';
  end if;
  insert into photos (trip_id, path, thumb_path, width, height, uploaded_by)
  values (a.trip_id, p_photo->>'path', p_photo->>'thumbPath',
          nullif(p_photo->>'width', '')::integer, nullif(p_photo->>'height', '')::integer, a.id)
  returning id into new_id;
  return new_id;
end $$;

-- Returns the file paths so the Edge Function can delete the files.
create function remove_photo(p_code text, p_token text, p_photo uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); ph photos;
begin
  delete from photos where id = p_photo and trip_id = a.trip_id and (uploaded_by = a.id or a.is_organizer)
  returning * into ph;
  if ph.id is null then raise exception 'Only the person who added this photo can remove it'; end if;
  return jsonb_build_object('path', ph.path, 'thumbPath', ph.thumb_path);
end $$;

-- ======================================================================
-- v5 (2026-09-22): map pins for plans. get_trip's itinerary now also
-- returns 'lat' and 'lon' for each plan (same function as v4 otherwise).
-- ======================================================================
alter table itinerary_items
  add column lat double precision,
  add column lon double precision;

-- add_item now also takes the place's map position (found when the plan is added).
create or replace function add_item(p_code text, p_token text, p_item jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into itinerary_items (trip_id, day, time, title, notes, place, opentable_rid, booking_url, lat, lon)
  values (o.trip_id, nullif(p_item->>'day', '')::date, nullif(p_item->>'time', ''), trim(p_item->>'title'),
          nullif(p_item->>'notes', ''), nullif(p_item->>'place', ''),
          nullif(p_item->>'opentableRid', '')::integer, nullif(p_item->>'bookingUrl', ''),
          nullif(p_item->>'lat', '')::double precision, nullif(p_item->>'lon', '')::double precision)
  returning id into new_id;
  return new_id;
end $$;

-- Organizer's device pins older plans that were added before maps existed.
create function set_item_location(p_code text, p_token text, p_id uuid, p_lat double precision, p_lon double precision)
returns void language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update itinerary_items set lat = p_lat, lon = p_lon where id = p_id and trip_id = o.trip_id;
end $$;
-- (get_trip in the v4 section above includes each plan's lat/lon — run this file top to bottom.)

-- ======================================================================
-- v6 (2026-09-22): notifications (web push + email), "email me my link",
-- and a 15-minute pg_cron job (reminders; also keeps the free project awake).
-- ======================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table members
  add column email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column email_notify boolean not null default false,
  add column link_sent_at timestamptz;
create index on members (trip_id, lower(email));

-- Server-only settings. NEVER commit real values — this repo is public.
create table app_secrets (key text primary key, value text not null);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;
-- insert into app_secrets (key, value) values
--   ('vapid_public',  '<public key — also in app/config.js PUSH_PUBLIC_KEY>'),
--   ('vapid_private', '<private key — generate a new pair if lost>'),
--   ('notify_secret', '<random string>'),
--   ('site_url',      'https://timdreamboat.github.io/grouptrip/'),
--   ('functions_url', 'https://<project-ref>.supabase.co/functions/v1');

-- One device can follow several trips, so an endpoint may appear once per member.
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_member_endpoint_key unique (member_id, endpoint)
);
create index on push_subscriptions (member_id);
create index on push_subscriptions (endpoint);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- Outbox: triggers add rows; the 'notify' Edge Function delivers them.
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  recipients uuid[] not null,
  title      text not null,
  body       text,
  tab        text,                 -- which screen the notification opens
  dedupe_key text unique,          -- reminders: one per trip per day
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index on notifications (trip_id);
create index on notifications (created_at) where sent_at is null;
alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;

create function _poke_notify() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := (select value from app_secrets where key = 'functions_url') || '/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-notify-secret', (select value from app_secrets where key = 'notify_secret')),
    body := '{}'::jsonb);
end $$;

create function _notify(p_trip uuid, p_to uuid[], p_title text, p_body text, p_tab text, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(array_length(p_to, 1), 0) = 0 then return; end if;
  insert into notifications (trip_id, recipients, title, body, tab, dedupe_key)
  values (p_trip, p_to, left(p_title, 120), left(p_body, 240), p_tab, p_dedupe)
  on conflict (dedupe_key) do nothing;
  perform _poke_notify();
end $$;

create function _joined(p_trip uuid, p_except uuid default null, p_non_org boolean default false) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from members
  where trip_id = p_trip and joined_at is not null and id is distinct from p_except and (not p_non_org or not is_organizer);
$$;

create function _money(p_cents integer, p_currency text) returns text
language sql immutable as $$
  select case when p_currency = 'USD' then '$' || to_char(p_cents / 100.0, 'FM999,999,990.00')
              else to_char(p_cents / 100.0, 'FM999,999,990.00') || ' ' || p_currency end;
$$;

create function _when(p_day date, p_time text) returns text
language sql immutable as $$
  select concat_ws(' · ', to_char(p_day, 'Dy, Mon FMDD'),
                   case when p_time ~ '^\d\d:\d\d$' then to_char(p_time::time, 'FMHH12:MI AM') end);
$$;

create function _on_poll() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify(new.trip_id, _joined(new.trip_id, new.created_by),
    coalesce((select name from members where id = new.created_by), 'Someone') || ' started a poll',
    new.question, 'polls');
  return null;
end $$;
create trigger notify_poll after insert on polls for each row execute function _on_poll();

create function _on_plan() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform _notify(new.trip_id, _joined(new.trip_id, null, true),
    'New plan: ' || new.title, concat_ws(' · ', _when(new.day, new.time), new.place), 'plan');
  return null;
end $$;
create trigger notify_plan after insert on itinerary_items for each row execute function _on_plan();

create function _on_join() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.joined_at is not null and not new.is_organizer and (tg_op = 'INSERT' or old.joined_at is null) then
    perform _notify(new.trip_id,
      (select coalesce(array_agg(id), '{}') from members where trip_id = new.trip_id and is_organizer),
      new.name || ' joined ' || (select name from trips where id = new.trip_id),
      'They can add their flight and vote on plans now.', 'people');
  end if;
  return null;
end $$;
create trigger notify_join after insert or update of joined_at on members for each row execute function _on_join();

create function _on_split() returns trigger language plpgsql security definer set search_path = public as $$
declare e expenses; payer text; cur text;
begin
  select * into e from expenses where id = new.expense_id;
  if new.member_id = e.paid_by or new.share_cents = 0 then return null; end if;
  select name into payer from members where id = e.paid_by;
  select currency into cur from trips where id = e.trip_id;
  perform _notify(e.trip_id, array[new.member_id],
    payer || ' added ' || e.description, 'Your share: ' || _money(new.share_cents, cur), 'money');
  return null;
end $$;
create trigger notify_split after insert on expense_splits for each row execute function _on_split();

create function _on_dates() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.start_date is not null and (new.start_date, new.end_date) is distinct from (old.start_date, old.end_date) then
    perform _notify(new.id, _joined(new.id, null, true),
      'Trip dates set: ' || to_char(new.start_date, 'Mon FMDD') ||
        case when new.end_date is not null and new.end_date <> new.start_date then ' – ' || to_char(new.end_date, 'Mon FMDD') else '' end,
      new.name, 'home');
  end if;
  return null;
end $$;
create trigger notify_dates after update of start_date, end_date on trips for each row execute function _on_dates();

create function _on_flight() returns trigger language plpgsql security definer set search_path = public as $$
declare who members;
begin
  select * into who from members where id = new.member_id;
  if who.is_organizer then return null; end if;
  perform _notify(new.trip_id,
    (select coalesce(array_agg(id), '{}') from members where trip_id = new.trip_id and is_organizer),
    who.name || ' added a flight',
    concat_ws(' · ', new.flight_number, case when new.arr_airport is not null then 'lands ' || new.arr_airport end,
      _when(coalesce(new.arr_date, new.flight_date), new.arr_time)), 'travel');
  return null;
end $$;
create trigger notify_flight after insert on flights for each row execute function _on_flight();

-- 8am at the destination (time zone estimated from longitude; US Eastern if
-- unknown): the day before the trip, and each morning of the trip.
create function enqueue_reminders() returns void language plpgsql security definer set search_path = public as $$
declare t trips; local_ts timestamp; d date; plans text; n int;
begin
  for t in select * from trips where start_date is not null
                               and current_date between start_date - 2 and coalesce(end_date, start_date) + 1 loop
    local_ts := (now() at time zone 'UTC') + make_interval(hours => coalesce(round(t.lon / 15)::int, -5));
    if extract(hour from local_ts) <> 8 or extract(minute from local_ts) >= 15 then continue; end if;
    d := local_ts::date;
    select count(*), string_agg(concat_ws(' ', case when time ~ '^\d\d:\d\d$' then to_char(time::time, 'FMHH12:MI AM') end, title), ' · ' order by time nulls first)
      into n, plans from itinerary_items where trip_id = t.id and day = d;
    if d = t.start_date - 1 then
      perform _notify(t.id, _joined(t.id), 'Tomorrow: ' || t.name,
        coalesce((select count(*) from members where trip_id = t.id and rsvp = 'going')::text || ' going', '') ||
        coalesce(' · first up: ' || (select title from itinerary_items where trip_id = t.id and day >= t.start_date
                                      order by day, time nulls first limit 1), ''),
        'home', 'rem:' || t.id || ':' || d);
    elsif d between t.start_date and coalesce(t.end_date, t.start_date) then
      perform _notify(t.id, _joined(t.id),
        'Today' || coalesce(' in ' || t.destination, '') || case when n > 0 then ': ' || n || ' plan' || case when n = 1 then '' else 's' end else '' end,
        coalesce(plans, 'Nothing planned — enjoy the free day!'), 'plan', 'rem:' || t.id || ':' || d);
    end if;
  end loop;
end $$;

select cron.schedule('grouptrip-notify', '*/15 * * * *', $$ select enqueue_reminders(); select _poke_notify(); $$);

-- Service role only (Edge Functions).
create function claim_notifications() returns jsonb language plpgsql security definer set search_path = public as $$
declare site text := (select value from app_secrets where key = 'site_url'); out jsonb;
begin
  with c as (
    update notifications set sent_at = now()
    where id in (select id from notifications where sent_at is null and created_at > now() - interval '1 day'
                 order by created_at limit 100 for update skip locked)
    returning *)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'title', c.title, 'body', c.body, 'tripName', t.name,
    'url', site || '#/t/' || t.share_code || '/' || coalesce(c.tab, 'home'),
    'subs', coalesce((select jsonb_agg(distinct jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                      from push_subscriptions s where s.member_id = any(c.recipients)), '[]'),
    'emails', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name,
                          'link', site || '#/me/' || t.share_code || '/' || m.token))
                        from members m where m.id = any(c.recipients) and m.email_notify and m.email is not null), '[]'))), '[]')
  into out
  from c join trips t on t.id = c.trip_id;
  return out;
end $$;

create function drop_push_endpoints(p_endpoints text[]) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = any(p_endpoints);
$$;

-- "Email me my link": by token (You screen) or by email (locked out). One per person per 2 minutes.
create function link_request(p_code text, p_token text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t trips; m members;
begin
  select * into t from trips where share_code = p_code;
  if t.id is null then return null; end if;
  if p_token is not null then
    select * into m from members where trip_id = t.id and token = p_token and joined_at is not null;
  else
    select * into m from members where trip_id = t.id and lower(email) = lower(trim(p_email)) and joined_at is not null
    order by created_at limit 1;
  end if;
  if m.id is null or m.email is null or (m.link_sent_at is not null and m.link_sent_at > now() - interval '2 minutes') then
    return null;
  end if;
  update members set link_sent_at = now() where id = m.id;
  return jsonb_build_object('email', m.email, 'name', m.name, 'tripName', t.name,
    'link', (select value from app_secrets where key = 'site_url') || '#/me/' || t.share_code || '/' || m.token);
end $$;

create function app_secret(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from app_secrets where key = p_key;
$$;

revoke execute on function _poke_notify(), _notify(uuid, uuid[], text, text, text, text), _joined(uuid, uuid, boolean),
  enqueue_reminders(), claim_notifications(), drop_push_endpoints(text[]), link_request(text, text, text), app_secret(text)
  from public, anon, authenticated;
grant execute on function claim_notifications(), drop_push_endpoints(text[]), link_request(text, text, text), app_secret(text)
  to service_role;

-- For the app.
create function save_push(p_code text, p_token text, p_sub jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  insert into push_subscriptions (member_id, endpoint, p256dh, auth)
  values (a.id, p_sub->>'endpoint', p_sub->'keys'->>'p256dh', p_sub->'keys'->>'auth')
  on conflict (member_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create function remove_push(p_code text, p_token text, p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from push_subscriptions where endpoint = p_endpoint and member_id = a.id;
end $$;

create function get_me(p_code text, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  return jsonb_build_object('email', a.email, 'emailNotify', a.email_notify,
    'pushEndpoints', coalesce((select jsonb_agg(endpoint) from push_subscriptions where member_id = a.id), '[]'));
end $$;

create or replace function update_me(p_code text, p_token text, p_me jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  update members set
    name  = coalesce(nullif(trim(p_me->>'name'), ''), name),
    rsvp  = case when p_me->>'rsvp' in ('going', 'maybe', 'declined') then p_me->>'rsvp' else rsvp end,
    venmo = case when p_me ? 'venmo' then nullif(regexp_replace(trim(p_me->>'venmo'), '^@', ''), '') else venmo end,
    email = case when p_me ? 'email' then nullif(lower(trim(p_me->>'email')), '') else email end,
    email_notify = case when p_me ? 'emailNotify' then coalesce((p_me->>'emailNotify')::boolean, false) else email_notify end
  where id = a.id;
end $$;

-- ======================================================================
-- v7 (2026-09-22): editing, and "let them back in".
-- ======================================================================
create function update_item(p_code text, p_token text, p_id uuid, p_item jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update itinerary_items set
    day = nullif(p_item->>'day', '')::date, time = nullif(p_item->>'time', ''), title = trim(p_item->>'title'),
    notes = nullif(p_item->>'notes', ''), place = nullif(p_item->>'place', ''),
    opentable_rid = nullif(p_item->>'opentableRid', '')::integer, booking_url = nullif(p_item->>'bookingUrl', ''),
    lat = nullif(p_item->>'lat', '')::double precision, lon = nullif(p_item->>'lon', '')::double precision
  where id = p_id and trip_id = o.trip_id;
  if not found then raise exception 'Plan not found'; end if;
end $$;

create function update_flight(p_code text, p_token text, p_id uuid, p_flight jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); f flights; who uuid;
begin
  select * into f from flights where id = p_id and trip_id = a.trip_id;
  if f.id is null or (f.member_id <> a.id and not a.is_organizer) then raise exception 'You can only edit your own flight'; end if;
  who := coalesce(nullif(p_flight->>'memberId', '')::uuid, f.member_id);
  if who <> f.member_id and not a.is_organizer then raise exception 'You can only edit your own flight'; end if;
  if not exists (select 1 from members where id = who and trip_id = a.trip_id) then raise exception 'Unknown person'; end if;
  update flights set
    member_id = who, flight_number = upper(trim(p_flight->>'flightNumber')), flight_date = (p_flight->>'date')::date,
    dep_airport = nullif(upper(p_flight->>'depAirport'), ''), dep_time = nullif(p_flight->>'depTime', ''),
    arr_airport = nullif(upper(p_flight->>'arrAirport'), ''), arr_time = nullif(p_flight->>'arrTime', ''),
    arr_date = nullif(p_flight->>'arrDate', '')::date
  where id = f.id;
end $$;

create function update_stay(p_code text, p_token text, p_id uuid, p_stay jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update stays set
    name = trim(p_stay->>'name'), address = nullif(trim(p_stay->>'address'), ''),
    check_in = nullif(p_stay->>'checkIn', '')::date, check_in_time = nullif(p_stay->>'checkInTime', ''),
    check_out = nullif(p_stay->>'checkOut', '')::date, check_out_time = nullif(p_stay->>'checkOutTime', ''),
    booking_url = nullif(trim(p_stay->>'bookingUrl'), ''), confirmation = nullif(trim(p_stay->>'confirmation'), ''),
    notes = nullif(trim(p_stay->>'notes'), '')
  where id = p_id and trip_id = o.trip_id;
  if not found then raise exception 'Place not found'; end if;
end $$;

-- Editing an expense replaces its splits without re-announcing it.
create or replace function _on_split() returns trigger language plpgsql security definer set search_path = public as $$
declare e expenses; payer text; cur text;
begin
  if current_setting('grouptrip.quiet', true) = 'on' then return null; end if;
  select * into e from expenses where id = new.expense_id;
  if new.member_id = e.paid_by or new.share_cents = 0 then return null; end if;
  select name into payer from members where id = e.paid_by;
  select currency into cur from trips where id = e.trip_id;
  perform _notify(e.trip_id, array[new.member_id],
    payer || ' added ' || e.description, 'Your share: ' || _money(new.share_cents, cur), 'money');
  return null;
end $$;

create function update_expense(p_code text, p_token text, p_id uuid, p_description text, p_amount integer, p_paid_by uuid, p_splits jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); e expenses;
begin
  select * into e from expenses where id = p_id and trip_id = a.trip_id;
  if e.id is null or not (e.created_by = a.id or e.paid_by = a.id or a.is_organizer) then
    raise exception 'Only the person who added or paid this expense can edit it';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if (select coalesce(sum((s->>'share')::integer), -1) from jsonb_array_elements(p_splits) s) <> p_amount then
    raise exception 'Split shares must add up to the total';
  end if;
  if exists (
    select 1 from (select p_paid_by as mid union select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s) u
    where not exists (select 1 from members m where m.id = u.mid and m.trip_id = a.trip_id)
  ) then raise exception 'Unknown person in expense'; end if;
  update expenses set description = trim(p_description), amount_cents = p_amount, paid_by = p_paid_by where id = e.id;
  perform set_config('grouptrip.quiet', 'on', true);
  delete from expense_splits where expense_id = e.id;
  insert into expense_splits (expense_id, member_id, share_cents)
  select e.id, (s->>'memberId')::uuid, (s->>'share')::integer from jsonb_array_elements(p_splits) s;
  perform set_config('grouptrip.quiet', 'off', true);
end $$;

create function update_poll(p_code text, p_token text, p_poll uuid, p_question text) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  update polls set question = trim(p_question)
  where id = p_poll and trip_id = a.trip_id and (created_by = a.id or a.is_organizer);
  if not found then raise exception 'Only the person who made this poll can edit it'; end if;
end $$;

create function remove_poll_option(p_code text, p_token text, p_option uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); p polls; o poll_options;
begin
  select * into o from poll_options where id = p_option;
  select * into p from polls where id = o.poll_id and trip_id = a.trip_id;
  if p.id is null then raise exception 'Option not found'; end if;
  if not (p.created_by = a.id or a.is_organizer or o.created_by = a.id) then
    raise exception 'Only the person who made this poll can remove options';
  end if;
  if (select count(*) from poll_options where poll_id = p.id) <= 2 then raise exception 'A poll needs at least two options'; end if;
  delete from poll_options where id = o.id;
end $$;

-- Organizer resets a person's spot: old link stops working, old device stops
-- getting notifications, and their name waits on the invite page. Their
-- flights, expenses and votes stay.
create function reset_member(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  if p_id = o.id then raise exception 'Use your private link to move to a new device'; end if;
  update members set token = replace(gen_random_uuid()::text, '-', ''), joined_at = null
  where id = p_id and trip_id = o.trip_id and joined_at is not null;
  if not found then raise exception 'They haven''t joined yet — just send them the invite link'; end if;
  delete from push_subscriptions where member_id = p_id;
end $$;

-- Coming back keeps their RSVP (only first-timers default to going).
create or replace function claim_member(p_code text, p_member uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  update members set joined_at = now(), rsvp = case when rsvp = 'invited' then 'going' else rsvp end
  where id = p_member and trip_id = _trip(p_code) and joined_at is null
  returning * into m;
  if m.id is null then raise exception 'That name has already been claimed. Ask the organizer for help.'; end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

-- ======================================================================
-- v8 (2026-09-22): where we're staying goes on the map.
-- (get_trip in the v4 section includes each stay's lat/lon — run this file top to bottom.)
-- ======================================================================
alter table stays add column lat double precision, add column lon double precision;

create or replace function add_stay(p_code text, p_token text, p_stay jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into stays (trip_id, name, address, check_in, check_in_time, check_out, check_out_time, booking_url, confirmation, notes, lat, lon)
  values (o.trip_id, trim(p_stay->>'name'), nullif(trim(p_stay->>'address'), ''),
          nullif(p_stay->>'checkIn', '')::date, nullif(p_stay->>'checkInTime', ''),
          nullif(p_stay->>'checkOut', '')::date, nullif(p_stay->>'checkOutTime', ''),
          nullif(trim(p_stay->>'bookingUrl'), ''), nullif(trim(p_stay->>'confirmation'), ''), nullif(trim(p_stay->>'notes'), ''),
          nullif(p_stay->>'lat', '')::double precision, nullif(p_stay->>'lon', '')::double precision)
  returning id into new_id;
  return new_id;
end $$;

create or replace function update_stay(p_code text, p_token text, p_id uuid, p_stay jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update stays set
    name = trim(p_stay->>'name'), address = nullif(trim(p_stay->>'address'), ''),
    check_in = nullif(p_stay->>'checkIn', '')::date, check_in_time = nullif(p_stay->>'checkInTime', ''),
    check_out = nullif(p_stay->>'checkOut', '')::date, check_out_time = nullif(p_stay->>'checkOutTime', ''),
    booking_url = nullif(trim(p_stay->>'bookingUrl'), ''), confirmation = nullif(trim(p_stay->>'confirmation'), ''),
    notes = nullif(trim(p_stay->>'notes'), ''),
    lat = nullif(p_stay->>'lat', '')::double precision, lon = nullif(p_stay->>'lon', '')::double precision
  where id = p_id and trip_id = o.trip_id;
  if not found then raise exception 'Place not found'; end if;
end $$;

create function set_stay_location(p_code text, p_token text, p_id uuid, p_lat double precision, p_lon double precision)
returns void language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update stays set lat = p_lat, lon = p_lon where id = p_id and trip_id = o.trip_id;
end $$;

-- ======================================================================
-- v9 (2026-09-22): who's staying where. get_trip's stays also return
-- 'guests' (member ids) — see the v4 get_trip, which is kept current.
-- ======================================================================
create table stay_guests (
  stay_id   uuid not null references stays(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (stay_id, member_id)
);
create index on stay_guests (member_id);
alter table stay_guests enable row level security;
revoke all on stay_guests from anon, authenticated;

create function _set_stay_guests(p_trip uuid, p_stay uuid, p_guests jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' then return; end if;
  delete from stay_guests where stay_id = p_stay;
  insert into stay_guests (stay_id, member_id)
  select p_stay, m.id from members m
  where m.trip_id = p_trip and m.id in (select (g #>> '{}')::uuid from jsonb_array_elements(p_guests) g)
  on conflict do nothing;
end $$;
revoke execute on function _set_stay_guests(uuid, uuid, jsonb) from public, anon, authenticated;

-- add_stay / update_stay (v8) now end with: perform _set_stay_guests(o.trip_id, <stay id>, p_stay->'guests');
create or replace function add_stay(p_code text, p_token text, p_stay jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); new_id uuid;
begin
  insert into stays (trip_id, name, address, check_in, check_in_time, check_out, check_out_time, booking_url, confirmation, notes, lat, lon)
  values (o.trip_id, trim(p_stay->>'name'), nullif(trim(p_stay->>'address'), ''),
          nullif(p_stay->>'checkIn', '')::date, nullif(p_stay->>'checkInTime', ''),
          nullif(p_stay->>'checkOut', '')::date, nullif(p_stay->>'checkOutTime', ''),
          nullif(trim(p_stay->>'bookingUrl'), ''), nullif(trim(p_stay->>'confirmation'), ''), nullif(trim(p_stay->>'notes'), ''),
          nullif(p_stay->>'lat', '')::double precision, nullif(p_stay->>'lon', '')::double precision)
  returning id into new_id;
  perform _set_stay_guests(o.trip_id, new_id, p_stay->'guests');
  return new_id;
end $$;

create or replace function update_stay(p_code text, p_token text, p_id uuid, p_stay jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update stays set
    name = trim(p_stay->>'name'), address = nullif(trim(p_stay->>'address'), ''),
    check_in = nullif(p_stay->>'checkIn', '')::date, check_in_time = nullif(p_stay->>'checkInTime', ''),
    check_out = nullif(p_stay->>'checkOut', '')::date, check_out_time = nullif(p_stay->>'checkOutTime', ''),
    booking_url = nullif(trim(p_stay->>'bookingUrl'), ''), confirmation = nullif(trim(p_stay->>'confirmation'), ''),
    notes = nullif(trim(p_stay->>'notes'), ''),
    lat = nullif(p_stay->>'lat', '')::double precision, lon = nullif(p_stay->>'lon', '')::double precision
  where id = p_id and trip_id = o.trip_id;
  if not found then raise exception 'Place not found'; end if;
  perform _set_stay_guests(o.trip_id, p_id, p_stay->'guests');
end $$;

-- Anyone can say "I'm staying here" (or not).
create function set_my_stay(p_code text, p_token text, p_stay uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  if not exists (select 1 from stays where id = p_stay and trip_id = a.trip_id) then raise exception 'Place not found'; end if;
  if p_on then
    insert into stay_guests (stay_id, member_id) values (p_stay, a.id) on conflict do nothing;
  else
    delete from stay_guests where stay_id = p_stay and member_id = a.id;
  end if;
end $$;

-- ======================================================================
-- v10 (2026-09-22): money upgrades — uneven splits, other currencies,
-- receipt photos, and "mark as paid". get_trip's expenses also return
-- originalCents, originalCurrency, rate, splitMode, receiptPath, receiptThumb
-- and each split's weight; get_trip also returns 'settlements'
-- (see the v4 get_trip, kept current).
-- ======================================================================
alter table expenses
  add column original_cents    integer,
  add column original_currency text check (original_currency is null or original_currency ~ '^[A-Z]{3}$'),
  add column rate              numeric,
  add column split_mode        text not null default 'equal' check (split_mode in ('equal', 'amounts', 'shares')),
  add column receipt_path      text,
  add column receipt_thumb     text;
alter table expense_splits add column weight numeric;  -- shares mode: 2 = a couple; amounts mode: entered cents

create table settlements (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  from_member  uuid not null references members(id) on delete cascade,
  to_member    uuid not null references members(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  created_by   uuid references members(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_member <> to_member)
);
create index on settlements (trip_id);
create index on settlements (from_member);
create index on settlements (to_member);
create index on settlements (created_by);
alter table settlements enable row level security;
revoke all on settlements from anon, authenticated;

create function _expense_extras(p_trip uuid, p_id uuid, p_extra jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_extra is null then return; end if;
  if coalesce(p_extra->>'receiptPath', '') <> '' and not (p_extra->>'receiptPath' like p_trip::text || '/%'
     and coalesce(p_extra->>'receiptThumb', '') like p_trip::text || '/%') then
    raise exception 'Receipt is not in this trip''s folder';
  end if;
  update expenses set
    original_cents    = nullif(p_extra->>'originalCents', '')::integer,
    original_currency = nullif(upper(p_extra->>'originalCurrency'), ''),
    rate              = nullif(p_extra->>'rate', '')::numeric,
    split_mode        = coalesce(nullif(p_extra->>'splitMode', ''), 'equal'),
    receipt_path      = case when p_extra ? 'receiptPath' then nullif(p_extra->>'receiptPath', '') else receipt_path end,
    receipt_thumb     = case when p_extra ? 'receiptPath' then nullif(p_extra->>'receiptThumb', '') else receipt_thumb end,
    spent_on          = case when p_extra->>'spentOn' ~ '^\d{4}-\d{2}-\d{2}$' then (p_extra->>'spentOn')::date else spent_on end
  where id = p_id;
end $$;
revoke execute on function _expense_extras(uuid, uuid, jsonb) from public, anon, authenticated;

drop function add_expense(text, text, text, integer, uuid, jsonb);
create function add_expense(p_code text, p_token text, p_description text, p_amount integer, p_paid_by uuid, p_splits jsonb, p_extra jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  if (select coalesce(sum((s->>'share')::integer), -1) from jsonb_array_elements(p_splits) s) <> p_amount then
    raise exception 'Split shares must add up to the total';
  end if;
  if exists (
    select 1 from (select p_paid_by as mid union select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s) u
    where not exists (select 1 from members m where m.id = u.mid and m.trip_id = a.trip_id)
  ) then raise exception 'Unknown person in expense'; end if;
  insert into expenses (trip_id, description, amount_cents, paid_by, created_by, spent_on)
  values (a.trip_id, trim(p_description), p_amount, p_paid_by, a.id, current_date)
  returning id into new_id;
  perform _expense_extras(a.trip_id, new_id, p_extra);
  insert into expense_splits (expense_id, member_id, share_cents, weight)
  select new_id, (s->>'memberId')::uuid, (s->>'share')::integer, nullif(s->>'weight', '')::numeric
  from jsonb_array_elements(p_splits) s;
  return new_id;
end $$;

drop function update_expense(text, text, uuid, text, integer, uuid, jsonb);
create function update_expense(p_code text, p_token text, p_id uuid, p_description text, p_amount integer, p_paid_by uuid, p_splits jsonb, p_extra jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); e expenses;
begin
  select * into e from expenses where id = p_id and trip_id = a.trip_id;
  if e.id is null or not (e.created_by = a.id or e.paid_by = a.id or a.is_organizer) then
    raise exception 'Only the person who added or paid this expense can edit it';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if (select coalesce(sum((s->>'share')::integer), -1) from jsonb_array_elements(p_splits) s) <> p_amount then
    raise exception 'Split shares must add up to the total';
  end if;
  if exists (
    select 1 from (select p_paid_by as mid union select (s->>'memberId')::uuid from jsonb_array_elements(p_splits) s) u
    where not exists (select 1 from members m where m.id = u.mid and m.trip_id = a.trip_id)
  ) then raise exception 'Unknown person in expense'; end if;
  update expenses set description = trim(p_description), amount_cents = p_amount, paid_by = p_paid_by where id = e.id;
  perform _expense_extras(a.trip_id, e.id, p_extra);
  perform set_config('grouptrip.quiet', 'on', true);
  delete from expense_splits where expense_id = e.id;
  insert into expense_splits (expense_id, member_id, share_cents, weight)
  select e.id, (s->>'memberId')::uuid, (s->>'share')::integer, nullif(s->>'weight', '')::numeric
  from jsonb_array_elements(p_splits) s;
  perform set_config('grouptrip.quiet', 'off', true);
end $$;

create function add_settlement(p_code text, p_token text, p_from uuid, p_to uuid, p_amount integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token); new_id uuid;
begin
  if a.id not in (p_from, p_to) and not a.is_organizer then raise exception 'Only the people involved can mark this paid'; end if;
  if (select count(*) from members where id in (p_from, p_to) and trip_id = a.trip_id) <> 2 then raise exception 'Unknown person'; end if;
  insert into settlements (trip_id, from_member, to_member, amount_cents, created_by)
  values (a.trip_id, p_from, p_to, p_amount, a.id) returning id into new_id;
  return new_id;
end $$;

create function remove_settlement(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a members := _actor(p_code, p_token);
begin
  delete from settlements where id = p_id and trip_id = a.trip_id
    and (created_by = a.id or a.id in (from_member, to_member) or a.is_organizer);
  if not found then raise exception 'Only the people involved can undo this payment'; end if;
end $$;

create function _on_settlement() returns trigger language plpgsql security definer set search_path = public as $$
declare cur text := (select currency from trips where id = new.trip_id);
begin
  if new.created_by = new.to_member then
    perform _notify(new.trip_id, array[new.from_member],
      (select name from members where id = new.to_member) || ' marked your payment as received',
      _money(new.amount_cents, cur) || ' — you''re settled up with them.', 'money');
  else
    perform _notify(new.trip_id, array[new.to_member],
      (select name from members where id = new.from_member) || ' paid you ' || _money(new.amount_cents, cur),
      'Marked as paid in GroupTrip.', 'money');
  end if;
  return null;
end $$;
create trigger notify_settlement after insert on settlements for each row execute function _on_settlement();

-- ======================================================================
-- v11 (2026-09-22): trip types (friends / family / business).
-- Business trips: expenses are reimbursed (category, company card,
-- reimbursed flag), not split; non-organizers only receive their own.
-- get_trip is now a wrapper around _get_trip_all (the v4 function, renamed;
-- it also returns 'kind' and each expense's category/companyPaid/reimbursed,
-- and orders expenses by spent_on desc). Change trip contents in _get_trip_all.
-- ======================================================================
alter table trips add column kind text not null default 'friends' check (kind in ('friends', 'family', 'business'));
alter table expenses
  add column category     text check (category is null or category in ('travel', 'lodging', 'meals', 'transport', 'entertainment', 'supplies', 'other')),
  add column company_paid boolean not null default false,
  add column reimbursed   boolean not null default false;

drop function create_trip(text, text, date, date, text, text);
create function create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text, p_organizer text, p_kind text default 'friends')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t trips; m members;
begin
  insert into trips (name, destination, start_date, end_date, currency, kind)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start, p_end, coalesce(nullif(upper(trim(p_currency)), ''), 'USD'),
          case when p_kind in ('friends', 'family', 'business') then p_kind else 'friends' end)
  returning * into t;
  insert into members (trip_id, name, is_organizer, rsvp, joined_at)
  values (t.id, trim(p_organizer), true, 'going', now())
  returning * into m;
  return jsonb_build_object('code', t.share_code, 'memberId', m.id, 'token', m.token);
end $$;

-- update_trip also accepts 'kind'; _expense_extras also sets category and
-- company_paid (same shape as before, two more lines each).
create or replace function update_trip(p_code text, p_token text, p_trip jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  update trips set
    name         = coalesce(nullif(trim(p_trip->>'name'), ''), name),
    destination  = case when p_trip ? 'destination' then nullif(trim(p_trip->>'destination'), '') else destination end,
    start_date   = case when p_trip ? 'startDate' then nullif(p_trip->>'startDate', '')::date else start_date end,
    end_date     = case when p_trip ? 'endDate' then nullif(p_trip->>'endDate', '')::date else end_date end,
    lat          = case when p_trip ? 'lat' then (p_trip->>'lat')::double precision else lat end,
    lon          = case when p_trip ? 'lon' then (p_trip->>'lon')::double precision else lon end,
    notes        = case when p_trip ? 'notes' then nullif(trim(p_trip->>'notes'), '') else notes end,
    cover_url    = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'url', '') else cover_url end,
    cover_credit = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'credit', '') else cover_credit end,
    cover_link   = case when p_trip ? 'cover' then nullif(p_trip->'cover'->>'link', '') else cover_link end,
    kind         = case when p_trip->>'kind' in ('friends', 'family', 'business') then p_trip->>'kind' else kind end
  where id = o.trip_id;
end $$;

create or replace function _expense_extras(p_trip uuid, p_id uuid, p_extra jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_extra is null then return; end if;
  if coalesce(p_extra->>'receiptPath', '') <> '' and not (p_extra->>'receiptPath' like p_trip::text || '/%'
     and coalesce(p_extra->>'receiptThumb', '') like p_trip::text || '/%') then
    raise exception 'Receipt is not in this trip''s folder';
  end if;
  update expenses set
    original_cents    = nullif(p_extra->>'originalCents', '')::integer,
    original_currency = nullif(upper(p_extra->>'originalCurrency'), ''),
    rate              = nullif(p_extra->>'rate', '')::numeric,
    split_mode        = coalesce(nullif(p_extra->>'splitMode', ''), 'equal'),
    receipt_path      = case when p_extra ? 'receiptPath' then nullif(p_extra->>'receiptPath', '') else receipt_path end,
    receipt_thumb     = case when p_extra ? 'receiptPath' then nullif(p_extra->>'receiptThumb', '') else receipt_thumb end,
    spent_on          = case when p_extra->>'spentOn' ~ '^\d{4}-\d{2}-\d{2}$' then (p_extra->>'spentOn')::date else spent_on end,
    category          = case when p_extra ? 'category' then nullif(p_extra->>'category', '') else category end,
    company_paid      = case when p_extra ? 'companyPaid' then coalesce((p_extra->>'companyPaid')::boolean, false) else company_paid end
  where id = p_id;
end $$;
revoke execute on function _expense_extras(uuid, uuid, jsonb) from public, anon, authenticated;

create function set_reimbursed(p_code text, p_token text, p_ids uuid[], p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token); n int; who uuid; total int; cur text;
begin
  update expenses set reimbursed = p_done
  where id = any(p_ids) and trip_id = o.trip_id and not company_paid and reimbursed <> p_done;
  get diagnostics n = row_count;
  if p_done and n > 0 then
    select currency into cur from trips where id = o.trip_id;
    for who, total in select paid_by, sum(amount_cents)::int from expenses
                      where id = any(p_ids) and trip_id = o.trip_id and not company_paid and paid_by <> o.id group by paid_by loop
      perform _notify(o.trip_id, array[who], 'You''ve been reimbursed ' || _money(total, cur),
        (select name from trips where id = o.trip_id), 'money');
    end loop;
  end if;
end $$;

create function _on_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare t trips; org uuid;
begin
  select * into t from trips where id = new.trip_id;
  if t.kind <> 'business' then return null; end if;
  select id into org from members where trip_id = t.id and is_organizer;
  if org is null or new.created_by = org then return null; end if;
  perform _notify(t.id, array[org],
    coalesce((select name from members where id = new.created_by), 'Someone') || ' submitted ' || _money(new.amount_cents, t.currency),
    new.description, 'money');
  return null;
end $$;
create trigger notify_expense after insert on expenses for each row execute function _on_expense();

alter function get_trip(text, text) rename to _get_trip_all;
revoke execute on function _get_trip_all(text, text) from public, anon, authenticated;

create function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb := _get_trip_all(p_code, p_token); me jsonb := j->'me';
begin
  if j->>'kind' = 'business' and coalesce((me->>'isOrganizer')::boolean, false) = false then
    j := jsonb_set(j, '{expenses}', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(j->'expenses') e
      where jsonb_typeof(me) = 'object' and (e->>'paidBy' = me->>'id' or e->>'createdBy' = me->>'id')), '[]'));
  end if;
  return j;
end $$;


-- ============ v7: accounts (owner, 2026-09-23) ============
-- (Applied with `delete from trips;` first — the owner reset all data before launch.)
-- Organizers must have an account (Supabase Auth: Google, Apple, email code,
-- then optionally a passkey). Invited people choose: join with an account, or
-- as a guest (name + email, no code — their seat token lives on that device).
-- A seat linked to an account only works for that account, so a copied link or
-- a shared device can't act as an organizer. Signing in later with the same
-- email picks up your guest seats. Admins (by email) see every trip.

alter table members add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists members_trip_user on members (trip_id, user_id) where user_id is not null;
create index if not exists members_user on members (user_id);
create index if not exists members_email on members (lower(email));

create table if not exists admins (email text primary key);
alter table admins enable row level security;
insert into admins (email) values ('timmdonlon@gmail.com') on conflict do nothing;

-- The signed-in account's email (only emails the sign-in service has verified).
create or replace function _my_email() returns text
language sql stable as $$ select nullif(lower(auth.jwt()->>'email'), '') $$;

create or replace function _is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from admins where lower(email) = _my_email());
$$;

create or replace function _need_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  return auth.uid();
end $$;

create or replace function _clean_email(p_email text) returns text
language plpgsql immutable as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
  return e;
end $$;

-- A seat token works only for the account the seat belongs to. Guest seats
-- (no account) work with the token alone, like before.
create or replace function _actor(p_code text, p_token text) returns members
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members
  where trip_id = _trip(p_code) and token = p_token and joined_at is not null;
  if m.id is null then raise exception 'You need to join this trip first'; end if;
  if m.user_id is not null and m.user_id is distinct from auth.uid() then
    raise exception 'This trip belongs to a different account. Sign in as yourself.';
  end if;
  return m;
end $$;

create or replace function create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text,
  p_organizer text, p_kind text default 'friends') returns jsonb
language plpgsql security definer set search_path = public as $$
declare t trips; m members; u uuid := _need_user();
begin
  insert into trips (name, destination, start_date, end_date, currency, kind)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start, p_end, coalesce(nullif(upper(trim(p_currency)), ''), 'USD'),
          case when p_kind in ('friends', 'family', 'business') then p_kind else 'friends' end)
  returning * into t;
  insert into members (trip_id, name, is_organizer, rsvp, joined_at, user_id, email)
  values (t.id, trim(p_organizer), true, 'going', now(), u, _my_email())
  returning * into m;
  return jsonb_build_object('code', t.share_code, 'memberId', m.id, 'token', m.token);
end $$;

-- Join as yourself (signed in) or as a guest (email required, no account).
-- Signed in and already on the trip? You get your seat back.
drop function if exists join_trip(text, text);
create or replace function join_trip(p_code text, p_name text, p_email text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; u uuid := auth.uid(); t uuid := _trip(p_code);
  e text := case when auth.uid() is not null then _my_email() else _clean_email(p_email) end;
begin
  if u is not null then select * into m from members where trip_id = t and user_id = u; end if;
  if m.id is null then
    insert into members (trip_id, name, rsvp, joined_at, user_id, email)
    values (t, trim(p_name), 'going', now(), u, e)
    returning * into m;
  end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

drop function if exists claim_member(text, uuid);
create or replace function claim_member(p_code text, p_member uuid, p_email text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; u uuid := auth.uid(); t uuid := _trip(p_code);
  e text := case when auth.uid() is not null then _my_email() else _clean_email(p_email) end;
begin
  if u is not null then
    select * into m from members where trip_id = t and user_id = u;
    if m.id is not null then return jsonb_build_object('memberId', m.id, 'token', m.token); end if;
  end if;
  update members set joined_at = now(), user_id = u, email = coalesce(e, email),
    rsvp = case when rsvp = 'invited' then 'going' else rsvp end
  where id = p_member and trip_id = t and joined_at is null
  returning * into m;
  if m.id is null then raise exception 'That name has already been claimed. Ask the organizer for help.'; end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

-- "Let back in": new token, un-joined and unlinked, so the real person can tap
-- their name again (as a guest or with their own account).
create or replace function reset_member(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  if p_id = o.id then raise exception 'You''re the organizer — just sign in on your new device'; end if;
  update members set token = replace(gen_random_uuid()::text, '-', ''), joined_at = null, user_id = null
  where id = p_id and trip_id = o.trip_id and joined_at is not null;
  if not found then raise exception 'They haven''t joined yet — just send them the invite link'; end if;
  delete from push_subscriptions where member_id = p_id;
end $$;

-- The signed-in person's trips (with their seat tokens) for any device. Guest
-- seats joined with this same email are picked up and linked to the account.
create or replace function my_trips() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := _need_user(); e text := _my_email();
begin
  if e is not null then
    update members m set user_id = u
    where m.user_id is null and m.joined_at is not null and lower(m.email) = e
      and not exists (select 1 from members x where x.trip_id = m.trip_id and x.user_id = u)
      and m.id = (select min(y.id::text)::uuid from members y
                  where y.trip_id = m.trip_id and y.user_id is null and y.joined_at is not null and lower(y.email) = e);
  end if;
  return jsonb_build_object(
    'isAdmin', _is_admin(),
    'email', e,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.share_code, 'token', m.token, 'name', t.name, 'destination', t.destination,
        'startDate', t.start_date, 'endDate', t.end_date, 'kind', t.kind, 'cover', t.cover_url,
        'role', case when m.is_organizer then 'organizer' else 'guest' end, 'myName', m.name,
        'going', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name) order by g.created_at), '[]')
                  from members g where g.trip_id = t.id and g.rsvp = 'going'))
        order by t.start_date nulls last, t.created_at)
      from members m join trips t on t.id = m.trip_id
      where m.user_id = u and m.joined_at is not null), '[]'));
end $$;

-- Admin: every trip, who organizes it and how many are in.
create or replace function admin_trips() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _is_admin() then raise exception 'Admins only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.share_code, 'name', t.name, 'destination', t.destination, 'kind', t.kind,
      'startDate', t.start_date, 'endDate', t.end_date, 'createdAt', t.created_at, 'cover', t.cover_url,
      'organizer', (select o.name from members o where o.trip_id = t.id and o.is_organizer limit 1),
      'organizerEmail', (select o.email from members o where o.trip_id = t.id and o.is_organizer limit 1),
      'people', (select count(*) from members p where p.trip_id = t.id and p.joined_at is not null),
      'guests', (select count(*) from members p where p.trip_id = t.id and p.joined_at is not null and p.user_id is null),
      'expenses', (select count(*) from expenses e where e.trip_id = t.id),
      'spent', (select coalesce(sum(e.amount_cents), 0) from expenses e where e.trip_id = t.id),
      'currency', t.currency)
      order by t.created_at desc)
    from trips t), '[]');
end $$;

-- Admins see a trip's people with emails (read-only overview).
create or replace function admin_trip_people(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not _is_admin() then raise exception 'Admins only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', m.name, 'email', m.email, 'isOrganizer', m.is_organizer,
      'rsvp', m.rsvp, 'joined', m.joined_at is not null, 'account', m.user_id is not null) order by m.is_organizer desc, m.created_at)
    from members m where m.trip_id = _trip(p_code)), '[]');
end $$;

-- Admins see business-trip expenses for everyone (like the organizer).
create or replace function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb := _get_trip_all(p_code, p_token); me jsonb := j->'me';
begin
  if j->>'kind' = 'business' and coalesce((me->>'isOrganizer')::boolean, false) = false and not _is_admin() then
    j := jsonb_set(j, '{expenses}', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(j->'expenses') e
      where jsonb_typeof(me) = 'object' and (e->>'paidBy' = me->>'id' or e->>'createdBy' = me->>'id')), '[]'));
  end if;
  return j || jsonb_build_object('viewerIsAdmin', _is_admin());
end $$;

-- The trip view only counts you as "me" if the seat is yours.
do $$
declare def text := pg_get_functiondef('public._get_trip_all(text,text)'::regprocedure);
begin
  def := replace(def,
    'select * into me from members where trip_id = tid and token = p_token and joined_at is not null;',
    'select * into me from members where trip_id = tid and token = p_token and joined_at is not null
      and (user_id is null or user_id = auth.uid());');
  if def not like '%user_id = auth.uid()%' then raise exception '_get_trip_all patch did not apply'; end if;
  execute def;
end $$;

-- Helpers aren't callable from the outside.
revoke execute on function _is_admin(), _need_user(), _my_email(), _clean_email(text) from public, anon, authenticated;


-- ============ v8: usernames instead of sign-in (owner, 2026-09-24) ============
-- "Remove login and just do username, tied to each trip the user has."
-- No accounts: a person picks a username; every seat (member) they create or
-- join carries it, and typing the same username on any device brings back all
-- their trips (with their seat tokens). There is no password, so anyone who
-- types a username acts as that person — the owner's choice. Seat tokens still
-- guard every change. The admin page (which relied on sign-in) is removed.

alter table members add column if not exists username text
  check (username is null or username ~ '^[a-z0-9_.-]{3,30}$');
create unique index if not exists members_trip_username on members (trip_id, username) where username is not null;
create index if not exists members_username on members (username);

create or replace function _clean_username(p_username text) returns text
language plpgsql immutable as $$
declare u text := regexp_replace(lower(trim(coalesce(p_username, ''))), '^@', '');
begin
  if u !~ '^[a-z0-9_.-]{3,30}$' then
    raise exception 'Usernames are 3–30 letters or numbers (dots, dashes and underscores are fine)';
  end if;
  return u;
end $$;

-- A seat's token is all it takes to act (no account check any more).
create or replace function _actor(p_code text, p_token text) returns members
language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  select * into m from members
  where trip_id = _trip(p_code) and token = p_token and joined_at is not null;
  if m.id is null then raise exception 'You need to join this trip first'; end if;
  return m;
end $$;

drop function if exists create_trip(text, text, date, date, text, text, text);
create function create_trip(p_name text, p_destination text, p_start date, p_end date, p_currency text,
  p_organizer text, p_kind text, p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t trips; m members; u text := _clean_username(p_username);
begin
  insert into trips (name, destination, start_date, end_date, currency, kind)
  values (trim(p_name), nullif(trim(p_destination), ''), p_start, p_end, coalesce(nullif(upper(trim(p_currency)), ''), 'USD'),
          case when p_kind in ('friends', 'family', 'business') then p_kind else 'friends' end)
  returning * into t;
  insert into members (trip_id, name, is_organizer, rsvp, joined_at, username)
  values (t.id, trim(p_organizer), true, 'going', now(), u)
  returning * into m;
  return jsonb_build_object('code', t.share_code, 'memberId', m.id, 'token', m.token);
end $$;

-- Join with your username. Already on this trip under it? You get your seat back.
drop function if exists join_trip(text, text, text);
create function join_trip(p_code text, p_name text, p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; u text := _clean_username(p_username); t uuid := _trip(p_code);
begin
  select * into m from members where trip_id = t and username = u;
  if m.id is null then
    insert into members (trip_id, name, rsvp, joined_at, username)
    values (t, trim(p_name), 'going', now(), u)
    returning * into m;
  elsif m.joined_at is null then
    update members set joined_at = now() where id = m.id returning * into m;
  end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

drop function if exists claim_member(text, uuid, text);
create function claim_member(p_code text, p_member uuid, p_username text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m members; u text := _clean_username(p_username); t uuid := _trip(p_code);
begin
  select * into m from members where trip_id = t and username = u and joined_at is not null;
  if m.id is not null then return jsonb_build_object('memberId', m.id, 'token', m.token); end if;
  update members set joined_at = now(), username = u,
    rsvp = case when rsvp = 'invited' then 'going' else rsvp end
  where id = p_member and trip_id = t and joined_at is null
  returning * into m;
  if m.id is null then raise exception 'That name has already been claimed. Ask the organizer for help.'; end if;
  return jsonb_build_object('memberId', m.id, 'token', m.token);
end $$;

-- "Let back in": new token, un-joined and username cleared, so the real person
-- can tap their name again with their own username.
create or replace function reset_member(p_code text, p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o members := _organizer(p_code, p_token);
begin
  if p_id = o.id then raise exception 'You''re the organizer — just enter your username on your new device'; end if;
  update members set token = replace(gen_random_uuid()::text, '-', ''), joined_at = null, username = null, user_id = null
  where id = p_id and trip_id = o.trip_id and joined_at is not null;
  if not found then raise exception 'They haven''t joined yet — just send them the invite link'; end if;
  delete from push_subscriptions where member_id = p_id;
end $$;

-- A username's trips (with seat tokens) for any device. p_seats = seats this
-- device already holds ([{code, token}]) with no username yet: they're tied to
-- this username first (skipped if it already has a seat on that trip).
drop function if exists my_trips();
create function my_trips(p_username text, p_seats jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u text := _clean_username(p_username); s jsonb;
begin
  for s in select * from jsonb_array_elements(case when jsonb_typeof(p_seats) = 'array' then p_seats else '[]' end) loop
    update members m set username = u
    where m.trip_id = (select id from trips where share_code = s->>'code')
      and m.token = s->>'token' and m.username is null and m.joined_at is not null
      and not exists (select 1 from members x where x.trip_id = m.trip_id and x.username = u);
  end loop;
  return jsonb_build_object(
    'username', u,
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.share_code, 'token', m.token, 'name', t.name, 'destination', t.destination,
        'startDate', t.start_date, 'endDate', t.end_date, 'kind', t.kind, 'cover', t.cover_url,
        'role', case when m.is_organizer then 'organizer' else 'guest' end, 'myName', m.name,
        'going', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name) order by g.created_at), '[]')
                  from members g where g.trip_id = t.id and g.rsvp = 'going'))
        order by t.start_date nulls last, t.created_at)
      from members m join trips t on t.id = m.trip_id
      where m.username = u and m.joined_at is not null), '[]'));
end $$;

-- Business trips: non-organizers see only their own expenses (no admin override now).
create or replace function get_trip(p_code text, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb := _get_trip_all(p_code, p_token); me jsonb := j->'me';
begin
  if j->>'kind' = 'business' and coalesce((me->>'isOrganizer')::boolean, false) = false then
    j := jsonb_set(j, '{expenses}', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(j->'expenses') e
      where jsonb_typeof(me) = 'object' and (e->>'paidBy' = me->>'id' or e->>'createdBy' = me->>'id')), '[]'));
  end if;
  return j;
end $$;

-- The trip view counts you as "me" by seat token alone again.
do $$
declare def text := pg_get_functiondef('public._get_trip_all(text,text)'::regprocedure);
begin
  def := replace(def, E'\n      and (user_id is null or user_id = auth.uid())', '');
  if def like '%auth.uid()%' then raise exception '_get_trip_all patch did not apply'; end if;
  execute def;
end $$;

-- Sign-in and admin pieces are gone.
drop function if exists admin_trips();
drop function if exists admin_trip_people(text);
drop function if exists _is_admin();
drop function if exists _need_user();
drop function if exists _my_email();
drop function if exists _clean_email(text);
drop table if exists admins;
update members set user_id = null where user_id is not null;

revoke execute on function _clean_username(text) from public, anon, authenticated;
