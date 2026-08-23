-- ============================================================================
-- Зарплатний період, аудит-лог завдань, пріоритет і дедлайн
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Скрипт написаний ідемпотентно (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS
-- перед CREATE) — повторний запуск безпечний і нічого не зламає.
--
-- Що робить:
--   1) organizations: + два поля правила зарплатного періоду ("з X по Y число")
--   2) assignments:   + priority, + due_date
--   3) payroll_period_closures: таблиця фактів закриття періоду (тільки адмін,
--      тільки вперед, без можливості "відкрити назад")
--   4) assignment_events: аудит-лог по кожному завданню (хто/коли що змінив)
--   5) тригер аудиту — пише assignment_events автоматично на insert/update
--   6) тригер блокування — розширює наявне правило "редагувати завершене
--      завдання можна лише в день завершення": тепер додатково дозволяє
--      редагувати duration_minutes/cost ще й в останній день зарплатного
--      періоду (день Y), і назавжди забороняє, якщо період закрито вручну.
--   7) assignments.product_id/operation_id стають необов'язковими — завдання
--      можна створити без продукту й прив'язати пізніше (логується).
-- ============================================================================


-- ── 1. Правило зарплатного періоду (на organizations, той самий патерн,
--       що вже є для material_cost_currency) ──────────────────────────────

alter table organizations add column if not exists payroll_open_from_day smallint;
alter table organizations add column if not exists payroll_open_to_day smallint;

alter table organizations drop constraint if exists organizations_payroll_period_check;
alter table organizations
  add constraint organizations_payroll_period_check check (
    (payroll_open_from_day is null and payroll_open_to_day is null)
    or (
      payroll_open_from_day between 1 and 31
      and payroll_open_to_day between 1 and 31
      and payroll_open_from_day <= payroll_open_to_day
    )
  );


-- ── 2. Нові поля завдання ──────────────────────────────────────────────────

alter table assignments add column if not exists priority text not null default 'medium';
alter table assignments add column if not exists due_date date;

alter table assignments drop constraint if exists assignments_priority_check;
alter table assignments
  add constraint assignments_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));


-- ── 3. Закриття зарплатних періодів ─────────────────────────────────────────
-- Рядок з'являється лише в момент закриття (немає рядка = період ще не
-- закрито). Без update/delete policy — закриття остаточне навіть для адміна.

create table if not exists payroll_period_closures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  closed_by uuid not null references users(id),
  closed_at timestamptz not null default now(),
  unique (organization_id, period_year, period_month)
);

alter table payroll_period_closures enable row level security;

drop policy if exists payroll_period_closures_select on payroll_period_closures;
create policy payroll_period_closures_select on payroll_period_closures
  for select
  using (
    organization_id in (select organization_id from user_organizations where user_id = auth.uid())
  );

drop policy if exists payroll_period_closures_insert on payroll_period_closures;
create policy payroll_period_closures_insert on payroll_period_closures
  for insert
  with check (
    closed_by = auth.uid()
    and organization_id in (select organization_id from user_organizations where user_id = auth.uid())
    and exists (select 1 from users where id = auth.uid() and role = 'admin')
  );


-- ── 4. Аудит-лог завдань ─────────────────────────────────────────────────

create table if not exists assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references users(id),
  event_type text not null check (event_type in (
    'created', 'status_changed', 'duration_changed', 'cost_changed',
    'priority_changed', 'due_date_changed', 'product_changed'
  )),
  old_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);

-- Якщо таблиця вже існувала з попереднього запуску скрипта — оновлюємо
-- обмеження event_type, щоб дозволити новий тип 'product_changed'.
alter table assignment_events drop constraint if exists assignment_events_event_type_check;
alter table assignment_events add constraint assignment_events_event_type_check
  check (event_type in (
    'created', 'status_changed', 'duration_changed', 'cost_changed',
    'priority_changed', 'due_date_changed', 'product_changed'
  ));

create index if not exists assignment_events_assignment_id_idx on assignment_events(assignment_id);

alter table assignment_events enable row level security;

-- Видимість дзеркалить видимість самих assignments: виконавець бачить події
-- своїх завдань, менеджер/адмін — усіх.
drop policy if exists assignment_events_select on assignment_events;
create policy assignment_events_select on assignment_events
  for select
  using (
    exists (
      select 1 from assignments a
      where a.id = assignment_events.assignment_id
        and (
          a.assignee_id = auth.uid()
          or exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
        )
    )
  );

-- Немає insert/update/delete policy для звичайних ролей — пише лише
-- SECURITY DEFINER функція нижче (від імені власника, в обхід RLS).


-- ── 5. Тригер аудиту: пише assignment_events на insert/update assignments ──

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
      values (new.id, new.organization_id, auth.uid(), 'product_changed',
        jsonb_build_object('product_id', old.product_id, 'operation_id', old.operation_id),
        jsonb_build_object('product_id', new.product_id, 'operation_id', new.operation_id));
    end if;
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists assignment_events_insert_trg on assignments;
create trigger assignment_events_insert_trg
  after insert on assignments
  for each row execute function log_assignment_event();

drop trigger if exists assignment_events_update_trg on assignments;
create trigger assignment_events_update_trg
  after update on assignments
  for each row execute function log_assignment_event();


-- ── 6. Правило блокування редагування завершеного завдання ─────────────────
--
-- ПРИМІТКА: у застосунку вже є тригер із такою самою назвою й задокументованою
-- поведінкою ("редагувати можна лише в день завершення"), але я не маю доступу
-- до його точного визначення (лише anon-ключ, без прав на читання схеми).
-- Нижче я його повністю перевизначаю (CREATE OR REPLACE + DROP/CREATE TRIGGER),
-- тож стара версія функції/тригера гарантовано заміниться цією. Якщо після
-- запуску в Database → Triggers на таблиці assignments лишився ще один
-- тригер із подібною назвою (дублікат) — видали його вручну через дашборд.

drop trigger if exists assignments_lock_after_completion on assignments;
drop trigger if exists assignments_lock_after_completion_trg on assignments;
drop trigger if exists trg_assignments_lock_after_completion on assignments;

create or replace function assignments_lock_after_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
  v_completed_day date;
  v_period_end_day date;
  v_open_to_day smallint;
  v_closed boolean;
begin
  -- Обмеження стосується лише рядка, який ВЖЕ був 'done' до цього update.
  if old.status is distinct from 'done' then
    return new;
  end if;

  v_today := (now() at time zone 'Europe/Kyiv')::date;
  v_completed_day := (old.completed_at at time zone 'Europe/Kyiv')::date;

  select payroll_open_to_day into v_open_to_day
  from organizations where id = old.organization_id;

  v_closed := exists (
    select 1 from payroll_period_closures
    where organization_id = old.organization_id
      and period_year = extract(year from v_completed_day)::int
      and period_month = extract(month from v_completed_day)::int
  );

  -- День Y для місяця завершення (клемп на останній реальний день місяця,
  -- якщо задане число більше, ніж днів у конкретному місяці).
  if v_open_to_day is not null then
    v_period_end_day := least(
      (date_trunc('month', v_completed_day) + interval '1 month' - interval '1 day')::date,
      (date_trunc('month', v_completed_day) + ((v_open_to_day - 1) * interval '1 day'))::date
    );
  end if;

  -- Статус — без змін від наявної поведінки: лише в день завершення.
  if new.status is distinct from old.status then
    if v_closed or v_today <> v_completed_day then
      raise exception 'Завершене завдання можна редагувати лише в день завершення'
        using errcode = '22023';
    end if;
  end if;

  -- Час і вартість — день завершення, АБО останній день зарплатного періоду
  -- (якщо він налаштований), і період ще не закритий вручну.
  if new.duration_minutes is distinct from old.duration_minutes
     or new.cost is distinct from old.cost then
    if v_closed then
      raise exception 'Зарплатний період закрито — час і вартість завдання більше не редагуються'
        using errcode = '22023';
    end if;
    if v_today <> v_completed_day and (v_open_to_day is null or v_today <> v_period_end_day) then
      raise exception 'Час і вартість завершеного завдання можна редагувати лише в день завершення або в останній день зарплатного періоду'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger assignments_lock_after_completion_trg
  before update on assignments
  for each row execute function assignments_lock_after_completion();


-- ── 7. Завдання без продукту — прив'язку можна додати пізніше ──────────────
-- Зміна product_id/operation_id логується як подія 'product_changed' у
-- assignment_events (тригер вище).

alter table assignments alter column product_id drop not null;
alter table assignments alter column operation_id drop not null;


-- ============================================================================
-- Перевірка після запуску (необов'язково, просто щоб побачити, що все на місці):
--
--   select column_name from information_schema.columns
--   where table_name in ('organizations','assignments') and column_name in
--     ('payroll_open_from_day','payroll_open_to_day','priority','due_date');
--
--   select trigger_name, event_manipulation from information_schema.triggers
--   where event_object_table = 'assignments';
-- ============================================================================
