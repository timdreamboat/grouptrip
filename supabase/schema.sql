-- GroupTrip schema (planned for v1 — not connected yet).
-- Money is integer cents. Access model for v1: a trip is reached via its
-- unguessable share_code; RLS policies get added when we wire this up.

create extension if not exists pgcrypto;

create table trips (
  id           uuid primary key default gen_random_uuid(),
  share_code   text unique not null default encode(gen_random_bytes(9), 'base64'),
  name         text not null,
  destination  text,
  start_date   date,
  end_date     date,
  currency     text not null default 'USD',
  created_at   timestamptz not null default now()
);

create table members (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table itinerary_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references trips(id) on delete cascade,
  day        date,
  time       text,
  title      text not null,
  notes      text,
  created_at timestamptz not null default now()
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  description  text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references members(id),
  spent_on     date,
  created_at   timestamptz not null default now()
);

-- One row per person an expense is split between.
create table expense_splits (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references members(id),
  share_cents integer not null,
  primary key (expense_id, member_id)
);

alter table trips           enable row level security;
alter table members         enable row level security;
alter table itinerary_items enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
