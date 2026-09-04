-- ============================================================================
-- Режим генерації SKU матеріалу (авто/вручну) + унікальність коду
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
--
-- Що робить:
--  - materials(organization_id, code) — унікальний індекс (лише для НЕ-null
--    code; кілька матеріалів без коду — це ОК). Раніше унікальність коду
--    матеріалу не перевірялась на рівні БД взагалі.
--  - organizations.material_sku_mode ('auto'|'manual', дефолт 'auto') —
--    чи система сама пропонує наскрізний код матеріалу при створенні
--    ("M-0001", "M-0002"…), чи користувач вводить його сам. У режимі
--    'manual', якщо введений код уже зайнятий в межах організації — insert
--    впаде на цьому індексі (23505), і клієнт покаже дружню помилку
--    (той самий шлях, що вже є для 23505 в useMaterials.ts).
-- ============================================================================


create unique index if not exists materials_org_code_unique on materials(organization_id, code) where code is not null;


alter table organizations add column if not exists material_sku_mode text not null default 'auto';

alter table organizations drop constraint if exists organizations_material_sku_mode_check;
alter table organizations add constraint organizations_material_sku_mode_check
  check (material_sku_mode in ('auto', 'manual'));
