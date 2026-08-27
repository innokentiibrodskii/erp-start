-- ============================================================================
-- Статуси й версії специфікації продукту (матеріали + операції)
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Ідемпотентний скрипт, кожна команда в один рядок (крім тіл функцій).
--
-- Що робить: додає режим редагування специфікації (products.specification_editing —
-- "чернетка") — доки він вимкнений, редагувати product_materials/product_operations
-- не можна (заборона і на рівні БД, не лише в інтерфейсі). Версія специфікації
-- (product_specifications) з'являється лише при "Зберегти" — зі знімком
-- матеріалів/операцій на той момент (product_specification_materials/_operations).
-- product_specification_events — аудит-лог "хто й коли" почав редагування /
-- зберіг версію / версія стала закритою. Наявний лог product_material_events
-- (з минулої сесії) отримує посилання на версію, у межах якої відбулись зміни.
--
-- ВАЖЛИВО: після виконання всі вже наявні специфікації продуктів стають
-- read-only (specification_editing = false за замовчуванням), поки хтось не
-- натисне "Редагувати" на сторінці специфікації — це очікувано.
-- ============================================================================


alter table products add column if not exists specification_editing boolean not null default false;
alter table products add column if not exists specification_restore_source_id uuid;


create table if not exists product_specifications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  version_number int not null,
  status text not null check (status in ('active', 'closed')),
  restored_from_id uuid references product_specifications(id),
  created_by uuid references users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  status_changed_by uuid references users(id),
  status_changed_at timestamptz,
  unique (product_id, version_number)
);


alter table products drop constraint if exists products_specification_restore_source_id_fkey;
alter table products add constraint products_specification_restore_source_id_fkey foreign key (specification_restore_source_id) references product_specifications(id);


create index if not exists product_specifications_product_id_idx on product_specifications(product_id);


create table if not exists product_specification_materials (
  id uuid primary key default gen_random_uuid(),
  specification_id uuid not null references product_specifications(id) on delete cascade,
  material_id uuid not null,
  qty numeric not null,
  unit_id uuid references units(id),
  operation_id uuid
);


create index if not exists product_specification_materials_spec_id_idx on product_specification_materials(specification_id);


create table if not exists product_specification_operations (
  id uuid primary key default gen_random_uuid(),
  specification_id uuid not null references product_specifications(id) on delete cascade,
  operation_id uuid not null,
  task_name text,
  duration_minutes numeric,
  cost numeric
);


create index if not exists product_specification_operations_spec_id_idx on product_specification_operations(specification_id);


create table if not exists product_specification_events (
  id uuid primary key default gen_random_uuid(),
  specification_id uuid references product_specifications(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);


alter table product_specification_events drop constraint if exists product_specification_events_event_type_check;
alter table product_specification_events add constraint product_specification_events_event_type_check check (event_type in ('draft_started', 'version_saved', 'status_changed'));


create index if not exists product_specification_events_product_id_idx on product_specification_events(product_id);


alter table product_material_events add column if not exists specification_id uuid references product_specifications(id);


-- Дозволяємо клієнту (при "Зберегти") проставити specification_id на вже
-- записаних тригером подіях цієї чернетки — єдине легітимне клієнтське
-- редагування product_material_events, решта полів як і раніше пише лише
-- SECURITY DEFINER тригер.
drop policy if exists product_material_events_update on product_material_events;
create policy product_material_events_update on product_material_events for update using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_material_events.organization_id)
);


-- RLS — той самий шаблон, що product_material_events: видно лише manager/admin
-- своєї організації; product_specifications можна ще й insert/update (створення
-- версії, закриття попередньої) — робить це клієнт від імені менеджера, тому
-- потрібні відповідні policy, а не лише SECURITY DEFINER тригер.
-- ---------------------------------------------------------------------------

alter table product_specifications enable row level security;
alter table product_specification_materials enable row level security;
alter table product_specification_operations enable row level security;
alter table product_specification_events enable row level security;


drop policy if exists product_specifications_select on product_specifications;
create policy product_specifications_select on product_specifications for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_specifications.organization_id)
);
drop policy if exists product_specifications_insert on product_specifications;
create policy product_specifications_insert on product_specifications for insert with check (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_specifications.organization_id)
);
drop policy if exists product_specifications_update on product_specifications;
create policy product_specifications_update on product_specifications for update using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_specifications.organization_id)
);


drop policy if exists product_specification_materials_select on product_specification_materials;
create policy product_specification_materials_select on product_specification_materials for select using (
  exists (select 1 from product_specifications ps where ps.id = product_specification_materials.specification_id and exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin')) and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = ps.organization_id))
);
drop policy if exists product_specification_materials_insert on product_specification_materials;
create policy product_specification_materials_insert on product_specification_materials for insert with check (
  exists (select 1 from product_specifications ps where ps.id = product_specification_materials.specification_id and exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin')) and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = ps.organization_id))
);


drop policy if exists product_specification_operations_select on product_specification_operations;
create policy product_specification_operations_select on product_specification_operations for select using (
  exists (select 1 from product_specifications ps where ps.id = product_specification_operations.specification_id and exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin')) and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = ps.organization_id))
);
drop policy if exists product_specification_operations_insert on product_specification_operations;
create policy product_specification_operations_insert on product_specification_operations for insert with check (
  exists (select 1 from product_specifications ps where ps.id = product_specification_operations.specification_id and exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin')) and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = ps.organization_id))
);


drop policy if exists product_specification_events_select on product_specification_events;
create policy product_specification_events_select on product_specification_events for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_specification_events.organization_id)
);
-- Немає insert/update/delete policy для product_specification_events для звичайних
-- ролей — пише лише SECURITY DEFINER тригер нижче, в обхід RLS.


-- Тригери — аудит "хто і коли" ------------------------------------------------

create or replace function log_specification_draft_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.specification_editing = false and new.specification_editing = true then
    insert into product_specification_events (product_id, organization_id, actor_id, event_type)
    values (new.id, new.organization_id, auth.uid(), 'draft_started');
  end if;
  return new;
end;
$$;

drop trigger if exists product_specification_draft_started_trg on products;
create trigger product_specification_draft_started_trg after update on products for each row execute function log_specification_draft_started();


create or replace function log_specification_version_saved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into product_specification_events (specification_id, product_id, organization_id, actor_id, event_type, new_value)
  values (new.id, new.product_id, new.organization_id, auth.uid(), 'version_saved', jsonb_build_object('version_number', new.version_number));
  return new;
end;
$$;

drop trigger if exists product_specification_version_saved_trg on product_specifications;
create trigger product_specification_version_saved_trg after insert on product_specifications for each row execute function log_specification_version_saved();


create or replace function log_specification_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_by := auth.uid();
    new.status_changed_at := now();
    insert into product_specification_events (specification_id, product_id, organization_id, actor_id, event_type, old_value, new_value)
    values (new.id, new.product_id, new.organization_id, auth.uid(), 'status_changed', to_jsonb(old.status), to_jsonb(new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists product_specification_status_changed_trg on product_specifications;
create trigger product_specification_status_changed_trg before update on product_specifications for each row execute function log_specification_status_changed();


-- Реальна заборона редагування product_materials/product_operations, поки
-- специфікація не в режимі "Редагувати" (не лише приховані кнопки в UI) --------

create or replace function check_specification_editable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_editing boolean;
begin
  v_product_id := coalesce(new.product_id, old.product_id);
  select specification_editing into v_editing from products where id = v_product_id;
  if v_editing is not true then
    raise exception 'Специфікацію заблоковано. Натисніть «Редагувати», щоб внести зміни.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_materials_lock_trg on product_materials;
create trigger product_materials_lock_trg before insert or update or delete on product_materials for each row execute function check_specification_editable();

drop trigger if exists product_operations_lock_trg on product_operations;
create trigger product_operations_lock_trg before insert or update or delete on product_operations for each row execute function check_specification_editable();
