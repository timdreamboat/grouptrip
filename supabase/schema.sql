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
