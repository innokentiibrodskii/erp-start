-- ============================================================================
-- Аудит-лог змін матеріалу (material_events) — "Історія" картки матеріалу
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Скрипт ідемпотентний, точна копія шаблону product_events/log_product_event()
-- (ProductView.tsx → "Історія"), застосована до таблиці materials.
--
-- Що логується: створення матеріалу, зміна назви, категорії (materials.
-- category_id), артикулу (materials.code — саме сюди потрапляє й
-- перегенерація артикулу при зміні категорії, MaterialEditorPage.tsx),
-- вартості (cost), основного постачальника (primary_supplier_id) та
-- архівації.
-- ============================================================================

create table if not exists material_events (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  actor_id uuid references users(id),
  event_type text not null check (event_type in
    ('created', 'name_changed', 'category_changed', 'code_changed', 'cost_changed', 'primary_supplier_changed', 'archived_changed')),
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists material_events_material_id_idx on material_events(material_id, occurred_at desc);

alter table material_events enable row level security;

drop policy if exists material_events_select on material_events;
create policy material_events_select on material_events for select using (
  (exists (select 1 from users u where u.id = auth.uid() and u.role = any (array['manager', 'admin', 'manager_view'])))
  and (exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = material_events.organization_id))
);


create or replace function log_material_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into material_events (material_id, organization_id, actor_id, event_type, new_value)
    values (new.id, new.organization_id, auth.uid(), 'created', jsonb_build_object('name', new.name));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'name_changed', to_jsonb(old.name), to_jsonb(new.name));
    end if;
    if new.category_id is distinct from old.category_id then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'category_changed', to_jsonb(old.category_id), to_jsonb(new.category_id));
    end if;
    if new.code is distinct from old.code then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'code_changed', to_jsonb(old.code), to_jsonb(new.code));
    end if;
    if new.cost is distinct from old.cost then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'cost_changed', to_jsonb(old.cost), to_jsonb(new.cost));
    end if;
    if new.primary_supplier_id is distinct from old.primary_supplier_id then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'primary_supplier_changed', to_jsonb(old.primary_supplier_id), to_jsonb(new.primary_supplier_id));
    end if;
    if new.archived is distinct from old.archived then
      insert into material_events (material_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'archived_changed', to_jsonb(old.archived), to_jsonb(new.archived));
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists material_events_trigger on materials;
create trigger material_events_trigger
after insert or update on materials
for each row execute function log_material_event();
