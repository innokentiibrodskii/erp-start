-- Замикаємо доступ до чернетки імпорту сировини (draft.*, задум і view'и —
-- sql/draft_raw_materials.sql) на рівні бази. Раніше цей захист тримався
-- лише на прихованні сторінки "Information about raw materials" в UI
-- (Shell.tsx, LILY_EMBER_ORG_ID) — на рівні даних доступу не було жодного.
--
-- Що саме було не так:
-- 1. View'и в public (draft_raw_materials тощо) належать postgres і не мають
--    security_invoker — за замовчуванням view перевіряє права від імені
--    ВЛАСНИКА, а не того, хто робить запит. postgres обходить RLS, тож
--    "draft.* має RLS enabled без жодної policy (deny-all)" — задум
--    sql/draft_raw_materials.sql — через ці view ніколи не спрацьовував,
--    той захист був суто ілюзорний.
-- 2. ALTER DEFAULT PRIVILEGES на схемі public (стандартний supabase-дефолт:
--    postgres → anon/authenticated/service_role) автоматично видає ALL
--    (включно з insert/update/delete/truncate) на щойно створені у public
--    таблиці й view — "grant select ... to authenticated" наприкінці
--    sql/draft_raw_materials.sql нічого не змінював, той ширший ALL-грант
--    ролі anon уже існував паралельно, від самого створення view.
-- Разом: будь-хто з публічним anon-ключем (він і так у фронтенд-бандлі) міг
-- без жодного логіну прочитати — і навіть змінити/видалити — усі 35k+
-- рядків draft.materials напряму через Supabase REST, в обхід і UI, і
-- автентифікації як такої.
--
-- Фікс:
-- - вмикаємо security_invoker на view — тепер права й RLS перевіряються від
--   імені того, хто реально робить запит, а не власника-postgres;
-- - додаємо на draft.* RLS-policy "лише SELECT, лише адмінам LILY EMBER"
--   (те саме обмеження, що вже є в UI, Shell.tsx: LILY_EMBER_ORG_ID) —
--   is_lily_ember_admin() за тим самим патерном, що вже є user_org_ids();
-- - звужуємо гранти на view до "лише SELECT, лише authenticated" (anon —
--   прибираємо повністю), даємо authenticated SELECT на самі draft.* й
--   USAGE на схему draft (потрібно для security_invoker view).

create or replace function public.is_lily_ember_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_organizations uo
    join public.users u on u.id = uo.user_id
    where uo.user_id = auth.uid()
      and u.role = 'admin'
      and uo.organization_id = 'f0604025-d304-4d16-9edb-84cd2d65f441' -- LILY EMBER
  );
$$;

grant usage on schema draft to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'materials', 'material_types', 'materials_groups', 'nomenclature_groups',
    'nomenclature_group_hierarchy', 'characteristics_materials', 'providers', 'appointments'
  ]
  loop
    execute format('grant select on draft.%I to authenticated', t);
    execute format('drop policy if exists lily_ember_admin_select on draft.%I', t);
    execute format(
      'create policy lily_ember_admin_select on draft.%I for select to authenticated using (public.is_lily_ember_admin())', t
    );
  end loop;
end $$;

alter view public.draft_raw_materials set (security_invoker = true);
alter view public.draft_raw_material_characteristics set (security_invoker = true);
alter view public.draft_material_types set (security_invoker = true);
alter view public.draft_nomenclature_groups set (security_invoker = true);
alter view public.draft_materials_groups set (security_invoker = true);

revoke all on public.draft_raw_materials from anon, authenticated;
revoke all on public.draft_raw_material_characteristics from anon, authenticated;
revoke all on public.draft_material_types from anon, authenticated;
revoke all on public.draft_nomenclature_groups from anon, authenticated;
revoke all on public.draft_materials_groups from anon, authenticated;

grant select on public.draft_raw_materials to authenticated;
grant select on public.draft_raw_material_characteristics to authenticated;
grant select on public.draft_material_types to authenticated;
grant select on public.draft_nomenclature_groups to authenticated;
grant select on public.draft_materials_groups to authenticated;
