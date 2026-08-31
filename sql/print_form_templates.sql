-- ============================================================================
-- Друковані форми (іменовані шаблони полів для друку — Продукти/Матеріали/Працівники)
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Ідемпотентний скрипт.
--
-- Що робить: адмін/менеджер у Налаштуваннях → "Друкована форма" створює
-- іменовані шаблони (print_form_templates) — які поля сутності показувати
-- при друку (print_form_template_fields.field_key: вбудоване поле, напр.
-- 'name'/'sku'/'photo'/'status'/'category'/'qr', або кастомне поле у форматі
-- 'custom:<custom_field_definitions.id>'). Порядок полів — position.
-- Наразі використовується лише entity_type='product', 'material'/'employee'
-- зарезервовані на майбутнє.
-- ============================================================================

create table if not exists print_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('product', 'material', 'employee')),
  name text not null,
  created_by uuid references users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists print_form_templates_org_entity_idx on print_form_templates(organization_id, entity_type);


create table if not exists print_form_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references print_form_templates(id) on delete cascade,
  field_key text not null,
  position int not null default 0
);

create index if not exists print_form_template_fields_template_id_idx on print_form_template_fields(template_id);


alter table print_form_templates enable row level security;
alter table print_form_template_fields enable row level security;

drop policy if exists org_scoped_all on print_form_templates;
create policy org_scoped_all on print_form_templates for all
  using (organization_id in (select user_org_ids()))
  with check (organization_id in (select user_org_ids()));

drop policy if exists org_scoped_all on print_form_template_fields;
create policy org_scoped_all on print_form_template_fields for all
  using (exists (select 1 from print_form_templates t
    where t.id = template_id and t.organization_id in (select user_org_ids())))
  with check (exists (select 1 from print_form_templates t
    where t.id = template_id and t.organization_id in (select user_org_ids())));
