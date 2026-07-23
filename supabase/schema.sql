-- Kitchen OS - Ego Foods database schema and seed data

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'biryani',
  price_full numeric,
  price_half numeric,
  portion_full_grams integer,
  portion_half_grams integer,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  current_stock numeric default 0,
  low_stock_threshold numeric not null,
  created_at timestamptz default now()
);

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_items(id),
  ingredient_id uuid references ingredients(id),
  quantity_per_kg numeric not null,
  unit text not null
);

create table if not exists batch_logs (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid references menu_items(id),
  date date not null default current_date,
  kg_cooked numeric not null,
  kg_sold numeric default 0,
  kg_wasted numeric generated always as (kg_cooked - kg_sold) stored,
  estimated_waste_cost numeric default 0,
  logged_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  items jsonb not null,
  total_amount numeric not null,
  status text default 'new',
  payment_screenshot_url text,
  payment_confirmed boolean default false,
  pickup_code text not null,
  pickup_otp text,
  source text default 'whatsapp',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  description text not null,
  ingredient_id uuid references ingredients(id),
  quantity numeric,
  unit text,
  amount numeric not null,
  date date default current_date,
  logged_at timestamptz default now()
);

create table if not exists dinein_sales (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  note text,
  date date default current_date,
  logged_at timestamptz default now()
);

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  google_maps_url text,
  upi_id text,
  is_open boolean default true,
  closed_message text,
  whatsapp_access_token_override text,
  created_at timestamptz default now()
);

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  is_active boolean default true
);

insert into menu_items (name, category, price_full, price_half, portion_full_grams, portion_half_grams)
select 'Fry Piece Biryani', 'biryani', 180, 110, 400, 200
where not exists (select 1 from menu_items where name = 'Fry Piece Biryani');

insert into ingredients (name, unit, current_stock, low_stock_threshold)
select * from (values
  ('Basmati Rice',        'kg',  10.0,  2.0),
  ('Chicken Fry Pieces',  'kg',  5.0,   1.0),
  ('Oil',                 'ml',  2000,  500),
  ('Onions',              'kg',  3.0,   0.5),
  ('Tomatoes',            'kg',  2.0,   0.5),
  ('Ginger Garlic Paste', 'kg',  0.5,   0.1),
  ('Biryani Masala',      'kg',  0.3,   0.05),
  ('Curd',                'kg',  1.0,   0.2),
  ('Salt and Spices',     'kg',  0.5,   0.1)
) as seed(name, unit, current_stock, low_stock_threshold)
where not exists (select 1 from ingredients where ingredients.name = seed.name);

insert into recipes (menu_item_id, ingredient_id, quantity_per_kg, unit)
select
  (select id from menu_items where name = 'Fry Piece Biryani'),
  id,
  case name
    when 'Basmati Rice'        then 0.600
    when 'Chicken Fry Pieces'  then 0.400
    when 'Oil'                 then 80
    when 'Onions'              then 0.150
    when 'Tomatoes'            then 0.100
    when 'Ginger Garlic Paste' then 0.030
    when 'Biryani Masala'      then 0.020
    when 'Curd'                then 0.050
    when 'Salt and Spices'     then 0.010
  end,
  unit
from ingredients
where not exists (
  select 1
  from recipes
  where recipes.menu_item_id = (select id from menu_items where name = 'Fry Piece Biryani')
    and recipes.ingredient_id = ingredients.id
);
