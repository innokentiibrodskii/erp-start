-- ============================================================================
-- Дозволити той самий матеріал додавати до продукту декілька разів —
-- без жодних обмежень (у т.ч. з тією самою операцією)
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Скрипт ідемпотентний, кожна команда в один рядок.
--
-- Що робить:
-- Додає власний id (surrogate PK) до product_materials — раніше рядок
-- ідентифікувався парою (product_id, material_id), тому один матеріал
-- міг бути доданий до продукту лише один раз. Тепер PK — сам id, старий
-- композитний PK знімається і НІЯКОГО unique-обмеження на його місце не
-- ставиться — той самий матеріал можна додати скільки завгодно разів,
-- незалежно від операції.
-- ============================================================================


alter table product_materials add column if not exists id uuid not null default gen_random_uuid();


alter table product_materials drop constraint if exists product_materials_pkey;
alter table product_materials add constraint product_materials_pkey primary key (id);


drop index if exists product_materials_unique_no_op;
drop index if exists product_materials_unique_with_op;
