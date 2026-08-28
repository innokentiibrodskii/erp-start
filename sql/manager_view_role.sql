-- ============================================================================
-- Нова роль "Менеджер перегляд" (manager_view)
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
--
-- Що робить: додає значення 'manager_view' у дозволені ролі users.role
-- (якщо там є CHECK-обмеження — назва вгадана за конвенцією, якщо помилиться,
-- напишіть мені точну назву обмеження, я підправлю) і додає ДОДАТКОВИЙ
-- (не замінює наявний) SELECT-policy на assignments — "менеджер перегляд"
-- бачить лише завдання, які сам створив (для когось чи для себе) або які
-- призначені йому, а не всі завдання організації, як повний менеджер.
--
-- Доступ до сторінок (Продукти — лише перегляд, без Специфікації; Завдання;
-- Довідники; Налаштування — без Матеріалів/Дашбордів/Працівників) керується
-- на клієнті (Shell.tsx) — тут лише база.
-- ============================================================================


alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'manager', 'manager_view', 'performer'));


-- Додатковий (не замінює наявний) SELECT-policy для assignments — RLS-політики
-- в Postgres об'єднуються через OR, тож наявна видимість для admin/manager/
-- performer лишається без змін, ця лише додає видимість для manager_view.
drop policy if exists assignments_select_manager_view on assignments;
create policy assignments_select_manager_view on assignments for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'manager_view')
  and (assignee_id = auth.uid() or assigned_by = auth.uid())
);


-- Додатковий INSERT-policy — інакше наявна політика (перевірено живо: падає
-- "42501 row-level security policy") не дозволяє manager_view створити
-- завдання для КОГОСЬ ІНШОГО (лише для себе). Дозволяємо, коли сам
-- manager_view і сам є автором (assigned_by) — той самий принцип, що вже є
-- для повного менеджера.
drop policy if exists assignments_insert_manager_view on assignments;
create policy assignments_insert_manager_view on assignments for insert with check (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'manager_view')
  and assigned_by = auth.uid()
);


-- Додатковий UPDATE-policy — щоб manager_view міг далі керувати (статус,
-- час, продукт, дедлайн тощо) завданнями, які сам створив для когось іншого,
-- не лише своїми.
drop policy if exists assignments_update_manager_view on assignments;
create policy assignments_update_manager_view on assignments for update using (
  exists (select 1 from users u where u.id = auth.uid() and u.role = 'manager_view')
  and (assignee_id = auth.uid() or assigned_by = auth.uid())
);


-- ============================================================================
-- Аудит-лог змін продукту (хто й що змінив: назва/опис/категорія/статус)
-- ============================================================================
-- "Менеджер перегляд" отримав право створювати/редагувати продукт — тому всі
-- зміни продукту тепер логуються, той самий шаблон, що й
-- product_material_events (sql/product_material_events.sql).

create table if not exists product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);


alter table product_events drop constraint if exists product_events_event_type_check;
alter table product_events add constraint product_events_event_type_check check (event_type in ('created', 'name_changed', 'description_changed', 'category_changed', 'status_changed'));


create index if not exists product_events_product_id_idx on product_events(product_id);


alter table product_events enable row level security;


-- Видно менеджеру/адміну/"менеджеру перегляд" своєї організації.
drop policy if exists product_events_select on product_events;
create policy product_events_select on product_events for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin', 'manager_view'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_events.organization_id)
);


-- Немає insert/update/delete policy для звичайних ролей — пише лише
-- SECURITY DEFINER функція нижче, в обхід RLS.
create or replace function log_product_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into product_events (product_id, organization_id, actor_id, event_type, new_value)
    values (new.id, new.organization_id, auth.uid(), 'created', jsonb_build_object('name', new.name));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      insert into product_events (product_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'name_changed', to_jsonb(old.name), to_jsonb(new.name));
    end if;
    if new.description is distinct from old.description then
      insert into product_events (product_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'description_changed', to_jsonb(old.description), to_jsonb(new.description));
    end if;
    if new.category_id is distinct from old.category_id then
      insert into product_events (product_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'category_changed', to_jsonb(old.category_id), to_jsonb(new.category_id));
    end if;
    if new.status_id is distinct from old.status_id then
      insert into product_events (product_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'status_changed', to_jsonb(old.status_id), to_jsonb(new.status_id));
    end if;
    return new;
  end if;

  return null;
end;
$$;


drop trigger if exists product_events_insert_trg on products;
create trigger product_events_insert_trg after insert on products for each row execute function log_product_event();
drop trigger if exists product_events_update_trg on products;
create trigger product_events_update_trg after update on products for each row execute function log_product_event();
