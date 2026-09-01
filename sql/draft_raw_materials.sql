-- "Information about raw materials" — сторінка перегляду чернетки імпорту
-- сировини (схема draft.*, завантажена окремо через CSV, ще не звірена й не
-- перенесена у робочі таблиці проєкту). Сторінка лише читає ці дані.
--
-- draft.* має RLS enabled БЕЗ жодної policy (дефолтний deny-all) — тому
-- застосунок (роль authenticated через PostgREST) не може читати ці таблиці
-- напряму, і сама схема draft не додана до переліку схем, які віддає API.
-- Замість того, щоб послаблювати RLS чи відкривати всю схему draft назовні,
-- створюємо VIEW у public, що належить postgres (власнику таблиць draft.*) —
-- за замовчуванням view виконує перевірку прав від імені свого власника, а не
-- того, хто робить запит, тож власник-суперкористувач обходить RLS таблиць
-- draft.*, і достатньо видати GRANT SELECT лише на сам view.
--
-- id_product/uuid_product у draft.materials навмисно ніде не використовуються —
-- посилаються на зовнішній каталог продуктів, не пов'язаний із цим проєктом.
--
-- draft_raw_materials навмисно через DROP+CREATE, а не CREATE OR REPLACE —
-- Postgres забороняє OR REPLACE міняти порядок/імена вже наявних колонок
-- view, лише додавати нові в кінець; коли треба вставити нову колонку не в
-- самому кінці списку (як тут), простіше й надійніше перестворити view.

-- Швидкий пошук по назві серед 35k+ рядків.
create extension if not exists pg_trgm with schema extensions;
create index if not exists idx_draft_materials_name_trgm
  on draft.materials using gin (name_material extensions.gin_trgm_ops);

-- Список + картка: усі поля draft.materials, розгорнуті назви довідників
-- (тип, група номенклатури, група матеріалів, ієрархія групи й батьківської
-- групи, призначення, постачальник) + external_uuid_* самих цих зв'язків —
-- потрібні на сторінці для фільтрів (точний .eq() замість фільтра по
-- розшифрованій назві, яка може повторюватись). external_uuid_type/
-- external_uuid_type_decor лишаються "сирими" uuid — у складі імпорту немає
-- довідникової таблиці, що їх розшифровує.
drop view if exists public.draft_raw_materials;
create view public.draft_raw_materials as
select
  m.id_material,
  m.external_uuid_material,
  m.name_material,
  m.article_bas_erp,
  m.code_bas_erp,
  m.percentage_of_defects,
  m.color_family,
  m.color,
  m.size,
  m.category,
  m.country,
  m.supplier_price,
  m.control_price,
  m.minimum_order_quantity,
  m.production_time,
  m.production_time_details,
  m.delivery_time,
  m.supplier_nomenclature,
  m.status_for_deletion,
  m.design_name_for_patterns,
  m.created_at,
  m.created_by,
  m.updated_at,
  m.updated_by,
  m.external_uuid_type,
  m.external_uuid_type_decor,
  m.external_uuid_material_type,
  m.external_uuid_nomenclature_group,
  m.external_uuid_name_materials_group,
  mt.name_material_type,
  ng.name_nomenclature_group,
  mg.name_materials_group,
  gh.name_group          as hierarchy_group_name,
  ghp.name_group          as hierarchy_parent_group_name,
  ap.name_appointment,
  pr.name_provider
from draft.materials m
left join draft.material_types mt on mt.external_uuid_material_type = m.external_uuid_material_type
left join draft.nomenclature_groups ng on ng.external_uuid_nomenclature_group = m.external_uuid_nomenclature_group
left join draft.materials_groups mg on mg.external_uuid_name_materials_group = m.external_uuid_name_materials_group
left join draft.nomenclature_group_hierarchy gh on gh.uuid_group = m.uuid_group
left join draft.nomenclature_group_hierarchy ghp on ghp.uuid_group = gh.uuid_main_group
left join draft.appointments ap on ap.external_uuid_appointment = m.external_uuid_appointment
left join draft.providers pr on pr.external_uuid_provider = m.external_uuid_provider;

-- Характеристики — один матеріал може мати кілька рядків, тож окремий view,
-- підвантажується в картці за external_uuid_material (лише 553 рядки всього).
create or replace view public.draft_raw_material_characteristics as
select
  id_characteristics_materials,
  external_uuid_material,
  value,
  created_at,
  created_by
from draft.characteristics_materials;

-- Довідники для фільтрів на сторінці списку — з лічильником матеріалів
-- (total_count — усього, active_count — без status_for_deletion), щоб UI
-- міг ховати порожні групи (з довідника BAS ERP їх багато — заведені, але
-- жоден матеріал так і не отримав) і групи, де лишились самі позначені на
-- видалення, коли увімкнено "не показувати видалені".
create or replace view public.draft_material_types as
select
  mt.id_material_type, mt.name_material_type, mt.external_uuid_material_type,
  count(m.id_material) as total_count,
  count(m.id_material) filter (where not m.status_for_deletion) as active_count
from draft.material_types mt
left join draft.materials m on m.external_uuid_material_type = mt.external_uuid_material_type
group by mt.id_material_type, mt.name_material_type, mt.external_uuid_material_type
order by mt.name_material_type;

create or replace view public.draft_nomenclature_groups as
select
  ng.id_nomenclature_group, ng.name_nomenclature_group, ng.external_uuid_nomenclature_group,
  count(m.id_material) as total_count,
  count(m.id_material) filter (where not m.status_for_deletion) as active_count
from draft.nomenclature_groups ng
left join draft.materials m on m.external_uuid_nomenclature_group = ng.external_uuid_nomenclature_group
group by ng.id_nomenclature_group, ng.name_nomenclature_group, ng.external_uuid_nomenclature_group
order by ng.name_nomenclature_group;

-- draft.materials_groups (739 рядків) фактично суміш двох геть різних
-- речей з BAS ERP: реальні категорії сировини ("- МАТЕРІАЛИ", "- УПАКУВАННЯ",
-- "- ФУРНІТУРА" — рівно 3 записи, з префіксом "- " і великими укр. літерами)
-- і назви колекцій/сезонів ("Milla 2501", "LR-2024-Sleeping Beauty",
-- "Couture-2023" тощо — самі по собі теж валідні значення поля, які
-- лишаються видимими на картці конкретного матеріалу). У фільтр списку
-- виносимо лише перше — реальні категорії — бо для звуження результатів
-- значення сезону/колекції в цьому полі не мають сенсу.
create or replace view public.draft_materials_groups as
select
  mg.id_materials_group, mg.name_materials_group, mg.external_uuid_name_materials_group,
  count(m.id_material) as total_count,
  count(m.id_material) filter (where not m.status_for_deletion) as active_count
from draft.materials_groups mg
left join draft.materials m on m.external_uuid_name_materials_group = mg.external_uuid_name_materials_group
where mg.name_materials_group ~ '^-\s*[А-ЯІЇЄҐ ]+\s*$'
group by mg.id_materials_group, mg.name_materials_group, mg.external_uuid_name_materials_group
order by mg.name_materials_group;

grant select on public.draft_raw_materials to authenticated;
grant select on public.draft_raw_material_characteristics to authenticated;
grant select on public.draft_material_types to authenticated;
grant select on public.draft_nomenclature_groups to authenticated;
grant select on public.draft_materials_groups to authenticated;
