-- ============================================================================
-- Архівування й видалення продукту
-- ============================================================================
-- Виконати ОДИН РАЗ у Supabase Dashboard → SQL Editor → New query → Run.
--
-- Що робить: додає products.archived (той самий підхід, що вже є для
-- materials.archived) — архівований продукт зникає із загального списку,
-- лишається доступним через фільтр "Архів". Архівувати може будь-хто з
-- доступом до редагування продукту (звичайна RLS-політика на update, без
-- змін тут). Видаляти продукт може лише адміністратор — це не покладається
-- лише на UI: тригер нижче реально блокує DELETE на рівні бази для будь-кого,
-- крім адміна, незалежно від того, що дозволяє RLS.
-- ============================================================================


alter table products add column if not exists archived boolean not null default false;


create or replace function check_product_delete_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin') then
    raise exception 'Видаляти продукт може лише адміністратор.';
  end if;
  return old;
end;
$$;


drop trigger if exists products_delete_admin_only_trg on products;
create trigger products_delete_admin_only_trg before delete on products for each row execute function check_product_delete_admin_only();
