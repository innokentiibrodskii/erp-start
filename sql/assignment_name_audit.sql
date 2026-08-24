-- ============================================================================
-- Аудит зміни назви завдання (assignment_events: 'name_changed')
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Скрипт ідемпотентний, кожна команда в один рядок (крім тіла функції) —
-- той самий стиль, що й у попередніх міграціях цієї серії.
--
-- Що робить: дозволяє новий тип події 'name_changed' і додає його
-- логування в тригер log_assignment_event() — редагування назви завдання
-- (сторінка "Завдання" → "Дані для менеджера") тепер теж потрапляє в
-- "Історію" завдання.
-- ============================================================================


alter table assignment_events drop constraint if exists assignment_events_event_type_check;
alter table assignment_events add constraint assignment_events_event_type_check check (event_type in ('created', 'status_changed', 'duration_changed', 'cost_changed', 'priority_changed', 'due_date_changed', 'product_changed', 'planned_duration_changed', 'name_changed'));


create or replace function log_assignment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into assignment_events (assignment_id, organization_id, actor_id, event_type, new_value)
    values (new.id, new.organization_id, auth.uid(), 'created', to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'status_changed', to_jsonb(old.status), to_jsonb(new.status));
    end if;
    if new.duration_minutes is distinct from old.duration_minutes then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'duration_changed', to_jsonb(old.duration_minutes), to_jsonb(new.duration_minutes));
    end if;
    if new.cost is distinct from old.cost then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'cost_changed', to_jsonb(old.cost), to_jsonb(new.cost));
    end if;
    if new.priority is distinct from old.priority then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'priority_changed', to_jsonb(old.priority), to_jsonb(new.priority));
    end if;
    if new.due_date is distinct from old.due_date then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'due_date_changed', to_jsonb(old.due_date), to_jsonb(new.due_date));
    end if;
    if new.product_id is distinct from old.product_id or new.operation_id is distinct from old.operation_id then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'product_changed', jsonb_build_object('product_id', old.product_id, 'operation_id', old.operation_id), jsonb_build_object('product_id', new.product_id, 'operation_id', new.operation_id));
    end if;
    if new.planned_duration_minutes is distinct from old.planned_duration_minutes then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'planned_duration_changed', to_jsonb(old.planned_duration_minutes), to_jsonb(new.planned_duration_minutes));
    end if;
    if new.name is distinct from old.name then
      insert into assignment_events (assignment_id, organization_id, actor_id, event_type, old_value, new_value)
      values (new.id, new.organization_id, auth.uid(), 'name_changed', to_jsonb(old.name), to_jsonb(new.name));
    end if;
    return new;
  end if;

  return null;
end;
$$;
