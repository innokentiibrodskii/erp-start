-- ============================================================================
-- Фіксація собівартості продукції (Дашборди → "Собівартість продукції")
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
--
-- Що робить: користувач натискає "Зафіксувати" на сторінці собівартості —
-- система записує знімок ("фіксацію") поточної собівартості кожного
-- показаного продукту разом з курсом/валютою прорахунку й датою на момент
-- фіксації. Одна фіксація = одна дія користувача = один рядок у
-- product_cost_lock_batches ("хто, коли, яким курсом/валютою") + по одному
-- рядку в product_cost_locks на кожен продукт ("скільки саме на той момент").
-- Записи незмінні (лише insert/select, без update/delete) — це історичний
-- знімок, не поточні дані.
-- ============================================================================


create table if not exists product_cost_lock_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  locked_by uuid references users(id) default auth.uid(),
  locked_at timestamptz not null default now(),
  calc_currency text not null check (calc_currency in ('UAH', 'USD', 'EUR')),
  -- rate — курс, використаний для перерахунку між валютою матеріалів і
  -- операцій; null, якщо на момент фіксації вони збігались (перерахунок не
  -- був потрібен).
  rate numeric,
  material_currency text not null check (material_currency in ('UAH', 'USD', 'EUR')),
  operation_currency text not null check (operation_currency in ('UAH', 'USD', 'EUR'))
);

create index if not exists product_cost_lock_batches_org_id_idx on product_cost_lock_batches(organization_id);


create table if not exists product_cost_locks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references product_cost_lock_batches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  materials_cost numeric not null,
  operations_cost numeric not null,
  total_cost numeric not null
);

create index if not exists product_cost_locks_batch_id_idx on product_cost_locks(batch_id);
create index if not exists product_cost_locks_product_id_idx on product_cost_locks(product_id);


-- RLS — той самий шаблон, що product_specifications: видно й можна створювати
-- лише manager/admin своєї організації; ні update, ні delete policy немає
-- навмисно (незмінний історичний запис).
-- ---------------------------------------------------------------------------

alter table product_cost_lock_batches enable row level security;
alter table product_cost_locks enable row level security;


drop policy if exists product_cost_lock_batches_select on product_cost_lock_batches;
create policy product_cost_lock_batches_select on product_cost_lock_batches for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_cost_lock_batches.organization_id)
);
drop policy if exists product_cost_lock_batches_insert on product_cost_lock_batches;
create policy product_cost_lock_batches_insert on product_cost_lock_batches for insert with check (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_cost_lock_batches.organization_id)
);


drop policy if exists product_cost_locks_select on product_cost_locks;
create policy product_cost_locks_select on product_cost_locks for select using (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_cost_locks.organization_id)
);
drop policy if exists product_cost_locks_insert on product_cost_locks;
create policy product_cost_locks_insert on product_cost_locks for insert with check (
  exists (select 1 from users u where u.id = auth.uid() and u.role in ('manager', 'admin'))
  and exists (select 1 from user_organizations uo where uo.user_id = auth.uid() and uo.organization_id = product_cost_locks.organization_id)
);
