-- ============================================================================
-- Аудит-лог специфікації матеріалів продукту (хто й що змінив)
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Скрипт ідемпотентний, кожна команда в один рядок (крім тіла функції) —
-- той самий стиль, що й у sql/payroll_period_and_task_tracking.sql
-- (assignment_events).
--
-- Що робить: створює product_material_events + тригер на product_materials
-- (insert/update/delete), який автоматично пише туди, хто й коли додав
-- матеріал, змінив кількість/операцію або видалив рядок специфікації.
-- Сторінка "Специфікація Матеріали" (SpecificationPage.tsx) читає цю
-- таблицю у вкладці "Історія".
-- ============================================================================


create table if not exists product_material_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  material_id uuid not null,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  event_type text not null,
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);


alter table product_material_events drop constraint if exists product_material_events_event_type_check;
alter table product_material_events add constraint product_material_events_event_type_check check (event_type in ('added', 'qty_changed', 'operation_changed', 'removed'));


create index if not exists product_material_events_product_id_idx on product_material_events(product_id);


alter table product_material_events enable row level security;


-- Видно лише менеджеру/адміну своєї організації — те саме коло, що й має
-- доступ до сторінки "Специфікація Матеріали" (Shell.tsx: сторінка "Продукти"
-- відкрита лише isManager).
drop policy if exists product_material_events_select on product_material_events;
create policy product_material_events_select on product_material_events for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_material_events.organization_id)
);


-- Немає insert/update/delete policy для звичайних ролей — пише лише
-- SECURITY DEFINER функція нижче (в обхід RLS).


create or replace function log_product_material_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into product_material_events (product_id, material_id, organization_id, actor_id, event_type, new_value)
    values (new.product_id, new.material_id, new.organization_id, auth.uid(), 'added', jsonb_build_object('qty', new.qty, 'operation_id', new.operation_id));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.qty is distinct from old.qty then
      insert into product_material_events (product_id, material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.product_id, new.material_id, new.organization_id, auth.uid(), 'qty_changed', to_jsonb(old.qty), to_jsonb(new.qty));
    end if;
    if new.operation_id is distinct from old.operation_id then
      insert into product_material_events (product_id, material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.product_id, new.material_id, new.organization_id, auth.uid(), 'operation_changed', to_jsonb(old.operation_id), to_jsonb(new.operation_id));
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into product_material_events (product_id, material_id, organization_id, actor_id, event_type, old_value)
    values (old.product_id, old.material_id, old.organization_id, auth.uid(), 'removed', jsonb_build_object('qty', old.qty, 'operation_id', old.operation_id));
    return old;
  end if;

  return null;
end;
$$;


drop trigger if exists product_material_events_insert_trg on product_materials;
create trigger product_material_events_insert_trg after insert on product_materials for each row execute function log_product_material_event();
drop trigger if exists product_material_events_update_trg on product_materials;
create trigger product_material_events_update_trg after update on product_materials for each row execute function log_product_material_event();
drop trigger if exists product_material_events_delete_trg on product_materials;
create trigger product_material_events_delete_trg after delete on product_materials for each row execute function log_product_material_event();
