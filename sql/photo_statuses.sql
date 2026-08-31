-- ============================================================================
-- Статуси фото продукту (довідник) + посилання на оригінал файлу
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
-- Ідемпотентний скрипт.
--
-- Що робить: photo_statuses — довідник статусів для окремих фото в галереї
-- продукту (Довідники → "Статуси фото"), адмін сам визначає список значень.
-- is_visible гейтить показ: фото з невидимим статусом не показуються у
-- звичайному перегляді продукту (ProductPhotoGallery) і не потрапляють у
-- друковану форму (printProductForm.ts). Наявні фото (без статусу)
-- автоматично отримують дефолтний статус — по одному на кожну організацію.
--
-- original_url — посилання на оригінал файлу, якщо користувач попросив його
-- зберегти при завантаженні (замість/на додачу до стисненого прев'ю).
-- ============================================================================

create table if not exists photo_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  name_en text,
  color text not null default '#94a3b8',
  is_default boolean not null default false,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists photo_statuses_org_idx on photo_statuses(organization_id);


alter table product_images add column if not exists status_id uuid references photo_statuses(id);
alter table product_images add column if not exists original_url text;


-- Дефолтний статус "Активне"/"Active" на кожну наявну організацію.
insert into photo_statuses (organization_id, code, name, name_en, color, is_default, is_visible)
select id, 'active', 'Активне', 'Active', '#22c55e', true, true from organizations
on conflict (organization_id, code) do nothing;

-- Наявні фото без статусу отримують дефолтний статус своєї організації.
update product_images pi
set status_id = ps.id
from photo_statuses ps
where pi.status_id is null and ps.organization_id = pi.organization_id and ps.is_default = true;


alter table photo_statuses enable row level security;

drop policy if exists org_scoped_all on photo_statuses;
create policy org_scoped_all on photo_statuses for all
  using (organization_id in (select user_org_ids()))
  with check (organization_id in (select user_org_ids()));
