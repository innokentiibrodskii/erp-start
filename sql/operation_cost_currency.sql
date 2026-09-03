-- ============================================================================
-- Валюта вартості операцій (окремо від валюти вартості матеріалів)
-- ============================================================================
-- Вартість операцій (tasks.cost) до цього завжди відображалась як "₴" по
-- всьому застосунку — захардкоджено, незалежно від того, яку валюту обрали
-- для матеріалів (organizations.material_cost_currency). Той самий підхід,
-- що й material_cost_currency, лише окрема колонка — валюта операцій не
-- обов'язково збігається з валютою матеріалів.
-- ============================================================================

alter table organizations add column if not exists operation_cost_currency text not null default 'UAH';

alter table organizations drop constraint if exists organizations_operation_cost_currency_check;
alter table organizations add constraint organizations_operation_cost_currency_check
  check (operation_cost_currency in ('UAH', 'USD', 'EUR'));
