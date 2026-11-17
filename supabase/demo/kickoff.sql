-- Demo event for the business pitch: "Acme Sales Kickoff 2027", a PRIVATE
-- business trip in Scottsdale (Feb 9–11, 2027). Safe to run again at any time:
-- it deletes the event and builds it fresh (use it to reset the demo after
-- people have clicked around, or to move the dates — change d0 below).
--   Organizer:  @demo-planner   (Jordan Lee)      PIN 246810
--   Attendee:   @demo-attendee  (Alex Morgan)     PIN 246810
--   Share code: de3005a1e5c1c0ff2027ac3e00000001  (stable, so links keep working)
-- The app opens it in one tap from #/demo/attendee and #/demo/organizer
-- (linked from app/business.html).
do $$
declare
  d0 date := date '2027-02-09';                      -- day 1 (a Tuesday)
  code text := 'de3005a1e5c1c0ff2027ac3e00000001';
  t uuid; ids uuid[] := '{}'; id1 uuid; st uuid; p uuid; o uuid; i int;
  names text[] := array[
    'Jordan Lee', 'Alex Morgan', 'Morgan Reyes', 'Priya Nair', 'Daniel Okafor',
    'Sofia Marin', 'Ethan Brooks', 'Hannah Kim', 'Marcus Webb', 'Layla Haddad', 'Tom Becker',
    'Nina Petrova', 'Chris Yamada', 'Olivia Grant', 'Ben Foster', 'Zara Ali', 'Luke Jensen', 'Maya Torres',
    'Raj Patel', 'Emily Chen', 'Diego Santos', 'Grace Liu', 'Sam O''Neil', 'Iris Novak',
    'Kevin Park', 'Ana Costa', 'Will Turner', 'Jade Thompson'];   -- last four: added by the organizer, not joined yet
  ent uuid[]; mid uuid[]; se uuid[]; lead uuid[];
  fl text[][] := array[
    ['2', 'AA 1532', 'DFW', '09:05', '10:45', 'AA 2247', '15:20', '18:40'],
    ['3', 'UA 2086', 'ORD', '08:10', '11:05', 'UA 1941', '14:45', '19:20'],
    ['4', 'DL 1187', 'ATL', '09:30', '11:40', 'DL 2210', '15:05', '21:10'],
    ['5', 'WN 1423', 'DEN', '10:15', '12:05', 'WN 2330', '14:10', '16:55'],
    ['6', 'AS 642',  'SEA', '07:40', '11:25', 'AS 643',  '16:00', '18:05'],
    ['7', 'AA 1532', 'DFW', '09:05', '10:45', 'AA 2247', '15:20', '18:40'],
    ['8', 'UA 2086', 'ORD', '08:10', '11:05', 'UA 1941', '14:45', '19:20'],
    ['12', 'B6 437', 'JFK', '07:15', '11:10', 'B6 438',  '13:40', '21:25'],
    ['13', 'WN 884', 'SFO', '10:50', '13:45', 'WN 1719', '15:30', '16:35'],
    ['14', 'DL 1187', 'ATL', '09:30', '11:40', 'DL 2210', '15:05', '21:10'],
    ['19', 'AS 642', 'SEA', '07:40', '11:25', 'AS 643',  '16:00', '18:05'],
    ['20', 'WN 884', 'SFO', '10:50', '13:45', 'WN 1719', '15:30', '16:35'],
    ['21', 'AA 2901', 'MIA', '07:00', '10:20', 'AA 1206', '14:30', '21:35'],
    ['22', 'UA 2086', 'ORD', '08:10', '11:05', 'UA 1941', '14:45', '19:20']];
begin
  perform set_config('grouptrip.quiet', 'on', true);
  delete from trips where share_code = code;

  insert into trips (share_code, name, destination, start_date, end_date, currency, kind, privacy, lat, lon, notes,
                     cover_url, cover_credit, cover_link)
  values (code, 'Acme Sales Kickoff 2027', 'Scottsdale, Arizona', d0, d0 + 2, 'USD', 'business', 'private', 33.4942, -111.9261,
    E'Event Wi-Fi: AcmeSKO / closeit2027\nDress: business casual · jeans fine for Topgolf\nShuttles to the airport leave the lobby Thursday at 12:30, 1:30 and 2:30\nQuestions on site: Jordan Lee (events) — text is fastest',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Scottsdale%2C%20Arizona%20%28cropped%29.jpg?width=1280',
    'Photo via Wikimedia Commons', 'https://commons.wikimedia.org/wiki/File:Scottsdale,_Arizona_(cropped).jpg')
  returning id into t;

  -- People. The first 24 have joined; the organizer added the last four by name.
  for i in 1 .. array_length(names, 1) loop
    insert into members (trip_id, name, is_organizer, rsvp, joined_at, username, created_at)
    values (t, names[i], i = 1,
            case when i <= 24 then 'going' else 'invited' end,
            case when i <= 24 then now() - interval '9 days' + i * interval '3 hours' end,
            case i when 1 then 'demo-planner' when 2 then 'demo-attendee' end,
            now() - interval '12 days' + i * interval '1 minute')
    returning id into id1;
    ids := ids || id1;
  end loop;
  lead := array[ids[1], ids[3], ids[4], ids[5]];
  ent  := array[ids[2], ids[4]] || ids[6:11];
  mid  := array[ids[5]] || ids[12:18];
  se   := ids[19:24];

  -- The two demo sign-ins (same PIN as the other demo usernames).
  insert into usernames (username, pin_hash, demo)
  values ('demo-planner', extensions.crypt('246810', extensions.gen_salt('bf', 8)), true),
         ('demo-attendee', extensions.crypt('246810', extensions.gen_salt('bf', 8)), true)
  on conflict (username) do update set demo = true, failed = 0, locked_until = null;

  -- Where everyone's staying.
  insert into stays (trip_id, name, address, check_in, check_in_time, check_out, check_out_time, confirmation, notes, lat, lon, everyone)
  values (t, 'Grand Hyatt Scottsdale Resort', '7500 East Doubletree Ranch Road, Scottsdale, AZ 85258', d0, '15:00', d0 + 2, '11:00',
          'ACME-SKO27', 'Room block under "Acme Sales Kickoff". Breakfast included, 6:30–9:30 at SWB.', 33.5668929, -111.9182576, true)
  returning id into st;
  insert into stay_guests (stay_id, member_id) select st, unnest(ids[1:24]);

  -- The agenda: sessions for everyone, breakouts and dinners for the people in them.
  insert into itinerary_items (trip_id, day, time, title, place, notes, lat, lon, for_members, booking_url) values
    (t, d0,     '15:00', 'Registration & badge pickup', 'Grand Hyatt Scottsdale Resort · Arizona Ballroom foyer', 'Pick up your badge and welcome kit', 33.5668929, -111.9182576, '{}', null),
    (t, d0,     '17:30', 'Welcome reception', 'Grand Hyatt Scottsdale Resort · Lower Pool Terrace', 'Drinks and small plates. Partners welcome.', 33.5668929, -111.9182576, '{}', null),
    (t, d0,     '19:30', 'Leadership dinner', 'The Mission, 3815 North Brown Avenue, Scottsdale', 'Private room under Acme. Cars leave the lobby at 7:00.', 33.4918413, -111.9244011, lead, 'https://www.themissionaz.com'),
    (t, d0 + 1, '08:30', 'Opening keynote: The Year Ahead', 'Arizona Ballroom', 'Doors at 8:15. Coffee outside the ballroom.', 33.5668929, -111.9182576, '{}', null),
    (t, d0 + 1, '10:30', 'Breakout: Enterprise pipeline review', 'Vaquero Ballroom A', 'Bring your top five open deals', 33.5668929, -111.9182576, ent, null),
    (t, d0 + 1, '10:30', 'Breakout: Mid-market playbook', 'Vaquero Ballroom B', 'New pricing and packaging walkthrough', 33.5668929, -111.9182576, mid, null),
    (t, d0 + 1, '10:30', 'Breakout: Demo workshop', 'Sonwai Room', 'Laptops needed. New demo environment logins at the door.', 33.5668929, -111.9182576, se, null),
    (t, d0 + 1, '12:30', 'Lunch', 'Lower Pool Terrace', null, 33.5668929, -111.9182576, '{}', null),
    (t, d0 + 1, '14:00', 'Product roadmap & customer panel', 'Arizona Ballroom', null, 33.5668929, -111.9182576, '{}', null),
    (t, d0 + 1, '16:30', 'Team outing: Topgolf', 'Topgolf, 9500 Talking Stick Way, Scottsdale', 'Buses leave the lobby at 4:10. Teams are posted on the bus.', 33.5406, -111.8756, '{}', 'https://topgolf.com/us/scottsdale/'),
    (t, d0 + 1, '19:30', 'Awards dinner', 'Arizona Ballroom', 'Pick your entrée in Polls by Friday', 33.5668929, -111.9182576, '{}', null),
    (t, d0 + 2, '09:00', 'Territory planning', 'Vaquero Ballroom A', 'Enterprise and mid-market together', 33.5668929, -111.9182576, ent || mid, null),
    (t, d0 + 2, '09:00', 'Certification lab', 'Sonwai Room', null, 33.5668929, -111.9182576, se, null),
    (t, d0 + 2, '11:30', 'Closing session', 'Arizona Ballroom', 'Check out of your room before this — bags can stay with the bell desk', 33.5668929, -111.9182576, '{}', null);

  -- Flights into Phoenix (day 1) and home (day 3) for half the group.
  for i in 1 .. array_length(fl, 1) loop
    insert into flights (trip_id, member_id, flight_number, flight_date, dep_airport, dep_time, arr_airport, arr_time)
    values (t, ids[fl[i][1]::int], replace(fl[i][2], ' ', ''), d0, fl[i][3], fl[i][4], 'PHX', fl[i][5]),
           (t, ids[fl[i][1]::int], replace(fl[i][6], ' ', ''), d0 + 2, 'PHX', fl[i][7], fl[i][3], fl[i][8]);
  end loop;

  -- Expenses: the company card pays the big items; people log their own for reimbursement.
  insert into expenses (trip_id, description, amount_cents, paid_by, created_by, spent_on, split_mode, category, company_paid, reimbursed) values
    (t, 'Ballroom AV package',        485000, ids[1], ids[1], d0 - 30, 'equal', 'other',     true,  false),
    (t, 'Topgolf bays + buses',       362000, ids[1], ids[1], d0 - 21, 'equal', 'other',     true,  false),
    (t, 'Awards dinner deposit',      600000, ids[1], ids[1], d0 - 14, 'equal', 'meals',     true,  false),
    (t, 'Flight DFW–PHX round trip',   41260, ids[2], ids[2], d0 - 25, 'equal', 'travel',    false, true),
    (t, 'Lyft to DFW',                  3840, ids[2], ids[2], d0,      'equal', 'transport', false, false),
    (t, 'Flight ORD–PHX round trip',   48900, ids[3], ids[3], d0 - 24, 'equal', 'travel',    false, true),
    (t, 'Flight SEA–PHX round trip',   36650, ids[6], ids[6], d0 - 20, 'equal', 'travel',    false, false),
    (t, 'Flight JFK–PHX round trip',   52310, ids[12], ids[12], d0 - 19, 'equal', 'travel',  false, false),
    (t, 'Client gift for panel guest',  8600, ids[4], ids[4], d0 - 3,  'equal', 'other',     false, false);
  insert into expense_splits (expense_id, member_id, share_cents)
    select e.id, e.paid_by, e.amount_cents from expenses e where e.trip_id = t;

  -- A poll in progress, and what to bring.
  insert into polls (trip_id, question, kind, multi, allow_add, created_by) values (t, 'Awards dinner — pick your entrée', 'text', false, false, ids[1]) returning id into p;
  insert into poll_options (poll_id, label, created_by) values (p, 'Beef tenderloin', ids[1]) returning id into o;
  insert into poll_votes (option_id, member_id) select o, unnest(array[ids[3], ids[5], ids[7], ids[9], ids[13], ids[15], ids[19], ids[21]]);
  insert into poll_options (poll_id, label, created_by) values (p, 'Roasted salmon', ids[1]) returning id into o;
  insert into poll_votes (option_id, member_id) select o, unnest(array[ids[4], ids[6], ids[8], ids[12], ids[20], ids[22]]);
  insert into poll_options (poll_id, label, created_by) values (p, 'Mushroom risotto (vegetarian)', ids[1]) returning id into o;
  insert into poll_votes (option_id, member_id) select o, unnest(array[ids[10], ids[14], ids[23]]);

  insert into list_items (trip_id, text, created_by, claimed_by) values
    (t, 'Laptop + charger (demo workshop)', ids[1], null),
    (t, 'Team jerseys for Topgolf', ids[1], ids[4]),
    (t, 'Award trophies', ids[1], ids[1]),
    (t, 'Printed territory maps', ids[1], ids[5]);

  -- Seeding fired the usual "someone joined / new plan" alerts; nobody needs them.
  delete from notifications where trip_id = t;
end $$;
