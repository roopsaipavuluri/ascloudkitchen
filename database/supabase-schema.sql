create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.categories (
  id bigint primary key,
  name text not null unique,
  image_url text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  featured boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_items (
  id bigint primary key,
  category_id bigint not null references public.categories(id) on update cascade on delete restrict,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null check (price >= 0),
  discount_price numeric(10, 2) not null default 0 check (discount_price >= 0 and discount_price <= price),
  image_url text,
  veg boolean not null default true,
  ingredients jsonb not null default '[]'::jsonb,
  preparation_time integer not null default 20 check (preparation_time > 0),
  availability text not null default 'available' check (availability in ('available', 'out_of_stock')),
  featured boolean not null default false,
  stock integer not null default 0 check (stock >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_items_category_id_idx on public.food_items(category_id);
create index if not exists food_items_available_featured_idx on public.food_items(availability, featured);

create table if not exists public.catering_services (
  id bigint primary key,
  name text not null unique,
  description text not null default '',
  image_url text,
  starting_price numeric(10, 2) not null default 0 check (starting_price >= 0),
  features jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_records (
  collection text not null check (
    collection in (
      'users',
      'orders',
      'partyOrders',
      'cateringRequests',
      'contactMessages',
      'coupons',
      'notifications'
    )
  ),
  id text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create or replace function public.read_application_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.categories)
      and not exists (select 1 from public.food_items)
      and not exists (select 1 from public.catering_services)
      and not exists (select 1 from public.website_settings)
      and not exists (select 1 from public.app_records)
    then null
    else jsonb_build_object(
      'categories', coalesce((
        select jsonb_agg(
          category.details || jsonb_build_object(
            'id', category.id,
            'name', category.name,
            'image', coalesce(category.image_url, ''),
            'status', category.status,
            'featured', category.featured
          ) order by category.id
        )
        from public.categories as category
      ), '[]'::jsonb),
      'foodItems', coalesce((
        select jsonb_agg(
          food.details || jsonb_build_object(
            'id', food.id,
            'categoryId', food.category_id,
            'name', food.name,
            'description', food.description,
            'price', food.price,
            'discountPrice', food.discount_price,
            'image', coalesce(food.image_url, ''),
            'veg', food.veg,
            'ingredients', food.ingredients,
            'preparationTime', food.preparation_time,
            'availability', food.availability,
            'featured', food.featured,
            'stock', food.stock
          ) order by food.id
        )
        from public.food_items as food
      ), '[]'::jsonb),
      'services', coalesce((
        select jsonb_agg(
          service.details || jsonb_build_object(
            'id', service.id,
            'name', service.name,
            'description', service.description,
            'image', coalesce(service.image_url, ''),
            'startingPrice', service.starting_price,
            'features', service.features,
            'status', service.status
          ) order by service.id
        )
        from public.catering_services as service
      ), '[]'::jsonb),
      'paymentSettings', coalesce((
        select setting.setting_value
        from public.website_settings as setting
        where setting.setting_key = 'paymentSettings'
      ), '{}'::jsonb),
      'featuredCombo', coalesce((
        select setting.setting_value
        from public.website_settings as setting
        where setting.setting_key = 'featuredCombo'
      ), '{}'::jsonb),
      'users', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'users'), '[]'::jsonb),
      'orders', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'orders'), '[]'::jsonb),
      'partyOrders', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'partyOrders'), '[]'::jsonb),
      'cateringRequests', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'cateringRequests'), '[]'::jsonb),
      'contactMessages', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'contactMessages'), '[]'::jsonb),
      'coupons', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'coupons'), '[]'::jsonb),
      'notifications', coalesce((select jsonb_agg(saved.record order by saved.created_at, saved.id) from public.app_records as saved where saved.collection = 'notifications'), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.persist_application_state(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  collection_name text;
  collection_records jsonb;
begin
  insert into public.categories (id, name, image_url, status, featured, details)
  select
    (item->>'id')::bigint,
    item->>'name',
    nullif(item->>'image', ''),
    coalesce(item->>'status', 'active'),
    coalesce((item->>'featured')::boolean, false),
    item
  from jsonb_array_elements(coalesce(p_state->'categories', '[]'::jsonb)) as items(item)
  on conflict (id) do update set
    name = excluded.name,
    image_url = excluded.image_url,
    status = excluded.status,
    featured = excluded.featured,
    details = excluded.details;

  insert into public.food_items (
    id, category_id, name, description, price, discount_price, image_url,
    veg, ingredients, preparation_time, availability, featured, stock, details
  )
  select
    (item->>'id')::bigint,
    (item->>'categoryId')::bigint,
    item->>'name',
    coalesce(item->>'description', ''),
    (item->>'price')::numeric,
    coalesce((item->>'discountPrice')::numeric, 0),
    nullif(item->>'image', ''),
    coalesce((item->>'veg')::boolean, true),
    coalesce(item->'ingredients', '[]'::jsonb),
    coalesce((item->>'preparationTime')::integer, 20),
    coalesce(item->>'availability', 'available'),
    coalesce((item->>'featured')::boolean, false),
    coalesce((item->>'stock')::integer, 0),
    item
  from jsonb_array_elements(coalesce(p_state->'foodItems', '[]'::jsonb)) as items(item)
  on conflict (id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    discount_price = excluded.discount_price,
    image_url = excluded.image_url,
    veg = excluded.veg,
    ingredients = excluded.ingredients,
    preparation_time = excluded.preparation_time,
    availability = excluded.availability,
    featured = excluded.featured,
    stock = excluded.stock,
    details = excluded.details;

  delete from public.food_items as food
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(p_state->'foodItems', '[]'::jsonb)) as items(item)
    where (item->>'id')::bigint = food.id
  );

  delete from public.categories as category
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(p_state->'categories', '[]'::jsonb)) as items(item)
    where (item->>'id')::bigint = category.id
  );

  insert into public.catering_services (
    id, name, description, image_url, starting_price, features, status, details
  )
  select
    (item->>'id')::bigint,
    item->>'name',
    coalesce(item->>'description', ''),
    nullif(item->>'image', ''),
    coalesce((item->>'startingPrice')::numeric, 0),
    coalesce(item->'features', '[]'::jsonb),
    coalesce(item->>'status', 'active'),
    item
  from jsonb_array_elements(coalesce(p_state->'services', '[]'::jsonb)) as items(item)
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    image_url = excluded.image_url,
    starting_price = excluded.starting_price,
    features = excluded.features,
    status = excluded.status,
    details = excluded.details;

  delete from public.catering_services as service
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(p_state->'services', '[]'::jsonb)) as items(item)
    where (item->>'id')::bigint = service.id
  );

  insert into public.website_settings (setting_key, setting_value)
  values
    ('paymentSettings', coalesce(p_state->'paymentSettings', '{}'::jsonb)),
    ('featuredCombo', coalesce(p_state->'featuredCombo', '{}'::jsonb))
  on conflict (setting_key) do update set setting_value = excluded.setting_value;

  foreach collection_name in array array[
    'users', 'orders', 'partyOrders', 'cateringRequests',
    'contactMessages', 'coupons', 'notifications'
  ] loop
    collection_records := coalesce(p_state->collection_name, '[]'::jsonb);

    insert into public.app_records (collection, id, record)
    select collection_name, item->>'id', item
    from jsonb_array_elements(collection_records) as items(item)
    on conflict (collection, id) do update set record = excluded.record;

    delete from public.app_records as saved
    where saved.collection = collection_name
      and not exists (
        select 1
        from jsonb_array_elements(collection_records) as items(item)
        where item->>'id' = saved.id
      );
  end loop;
end;
$$;

revoke all on function public.persist_application_state(jsonb) from public, anon, authenticated;
grant execute on function public.persist_application_state(jsonb) to service_role;
revoke all on function public.read_application_state() from public, anon, authenticated;
grant execute on function public.read_application_state() to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists food_items_set_updated_at on public.food_items;
create trigger food_items_set_updated_at before update on public.food_items
for each row execute function public.set_updated_at();

drop trigger if exists catering_services_set_updated_at on public.catering_services;
create trigger catering_services_set_updated_at before update on public.catering_services
for each row execute function public.set_updated_at();

drop trigger if exists website_settings_set_updated_at on public.website_settings;
create trigger website_settings_set_updated_at before update on public.website_settings
for each row execute function public.set_updated_at();

drop trigger if exists app_records_set_updated_at on public.app_records;
create trigger app_records_set_updated_at before update on public.app_records
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.food_items enable row level security;
alter table public.catering_services enable row level security;
alter table public.website_settings enable row level security;
alter table public.app_records enable row level security;

revoke all on public.categories, public.food_items, public.catering_services,
  public.website_settings, public.app_records from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cloud-kitchen-assets',
  'cloud-kitchen-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Cloud Kitchen images are publicly readable" on storage.objects;
create policy "Cloud Kitchen images are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'cloud-kitchen-assets');
