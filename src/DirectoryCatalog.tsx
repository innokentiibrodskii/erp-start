import { useState, useEffect } from 'react'
import { useCatalog, genCategoryShortCode } from './hooks/useCatalog'
import { PRESET_COLORS } from './lib/colors'
import { buildCatPath } from './lib/materialFormat'
import type { Department, Position, ProductCategory, ProductAttribute, Operation, Warehouse, MaterialCategory, Unit, Supplier } from './hooks/useCatalog'
import { useProductStatuses, useProductStatusMutations, type ProductStatus } from './hooks/useProducts'
import { useCustomFieldDefinitions, useCustomFieldDefinitionMutations, type CustomFieldDefinition, type EntityType, type FieldType } from './hooks/useCustomFields'
import { useMaterialCostCurrency, useSetMaterialCostCurrency, CURRENCIES, CURRENCY_LABEL_KEY } from './hooks/useOrgSettings'
import { useCurrentUser } from './hooks/useCurrentUser'
import { usePayrollSettings, useSetPayrollSettings, usePayrollClosures, useClosePayrollPeriod, computeMonthPayrollPhase } from './hooks/usePayroll'
import { useLocale } from './LocaleContext'
import type { TranslationKey } from './i18n'

type SubPage =
  | null
  | 'departments'
  | 'positions'
  | 'categories'
  | 'materialCategories'
  | 'attributes'
  | 'operations'
  | 'warehouses'
  | 'units'
  | 'suppliers'
  | 'productStatuses'

type DirectoryGroup = 'Продукт' | 'Матеріали' | 'Люди' | 'Системні каталоги'

interface DirectoryTile {
  id: SubPage
  group: DirectoryGroup
  label: string
  description: string
  color: string
  bg: string
  icon: React.ReactNode
  count: () => number
}

const GROUP_ORDER: DirectoryGroup[] = ['Продукт', 'Матеріали', 'Люди', 'Системні каталоги']

interface Props { onNavigate: (page: string) => void }

export default function DirectoryCatalog({ onNavigate: _onNavigate }: Props) {
  const { t } = useLocale()
  const [page, setPage] = useState<SubPage>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DirectoryGroup>>(new Set(['Системні каталоги']))
  const catalog = useCatalog()
  const statusesQ = useProductStatuses()

  const toggleGroup = (g: DirectoryGroup) => setCollapsedGroups(prev => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const tiles: DirectoryTile[] = [
    // ── Продукт ──
    {
      id: 'categories', group: 'Продукт', label: t('directory.tiles.categories.label'), description: t('directory.tiles.categories.desc'),
      color: '#7c3aed', bg: '#f5f3ff', count: () => catalog.categories.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5a3 3 0 013-3h10a3 3 0 013 3v10a3 3 0 01-3 3H5a3 3 0 01-3-3V5z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9h8M6 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'operations', group: 'Продукт', label: t('directory.tiles.operations.label'), description: t('directory.tiles.operations.desc'),
      color: '#ea580c', bg: '#fff7ed', count: () => catalog.operations.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.22 4.22l1.77 1.77M14.01 14.01l1.77 1.77M4.22 15.78l1.77-1.77M14.01 5.99l1.77-1.77" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'attributes', group: 'Продукт', label: t('directory.tiles.attributes.label'), description: t('directory.tiles.attributes.desc'),
      color: '#0891b2', bg: '#ecfeff', count: () => catalog.attributes.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    // ── Матеріали ──
    {
      id: 'materialCategories', group: 'Матеріали', label: t('directory.tiles.materialCategories.label'), description: t('directory.tiles.materialCategories.desc'),
      color: '#0d9488', bg: '#f0fdfa', count: () => catalog.materialCategories.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'warehouses', group: 'Матеріали', label: t('directory.tiles.warehouses.label'), description: t('directory.tiles.warehouses.desc'),
      color: '#16a34a', bg: '#f0fdf4', count: () => catalog.warehouses.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 8l8-5 8 5v9a1 1 0 01-1 1H3a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7 18V11h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
      id: 'suppliers', group: 'Матеріали', label: t('directory.tiles.suppliers.label'), description: t('directory.tiles.suppliers.desc'),
      color: '#b45309', bg: '#fffbeb', count: () => catalog.suppliers.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7l7-4 7 4v8l-7 4-7-4V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 3v14M3 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
      id: 'units', group: 'Матеріали', label: t('directory.tiles.units.label'), description: t('directory.tiles.units.desc'),
      color: '#0284c7', bg: '#f0f9ff', count: () => catalog.units.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 16L16 4M8 4h8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    // ── Люди ──
    {
      id: 'positions', group: 'Люди', label: t('directory.tiles.positions.label'), description: t('directory.tiles.positions.desc'),
      color: '#db2777', bg: '#fdf2f8', count: () => catalog.positions.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M4 18c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'departments', group: 'Люди', label: t('directory.tiles.departments.label'), description: t('directory.tiles.departments.desc'),
      color: '#2563eb', bg: '#eff6ff', count: () => catalog.departments.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="7" y="2" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M10 7v3M10 10H4.5v3M10 10h5.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    // ── Системні каталоги ──
    {
      id: 'productStatuses', group: 'Системні каталоги', label: t('directory.tiles.productStatuses.label'), description: t('directory.tiles.productStatuses.desc'),
      color: '#64748b', bg: '#f1f5f9', count: () => statusesQ.data?.length ?? 0,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6.8 10l2.2 2.2 4.2-4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
  ]

  const GROUP_LABEL_KEY: Record<DirectoryGroup, TranslationKey> = {
    'Продукт': 'directory.groupProduct',
    'Матеріали': 'directory.groupMaterials',
    'Люди': 'directory.groupPeople',
    'Системні каталоги': 'directory.groupSystem',
  }

  if (page === 'departments')        return <DepartmentsPage        onBack={() => setPage(null)} />
  if (page === 'positions')          return <PositionsPage          onBack={() => setPage(null)} />
  if (page === 'categories')         return <CategoriesPage         onBack={() => setPage(null)} />
  if (page === 'materialCategories') return <MaterialCategoriesPage onBack={() => setPage(null)} />
  if (page === 'attributes')         return <AttributesPage         onBack={() => setPage(null)} />
  if (page === 'operations')         return <OperationsPage         onBack={() => setPage(null)} />
  if (page === 'warehouses')         return <WarehousesPage         onBack={() => setPage(null)} />
  if (page === 'units')              return <UnitsPage              onBack={() => setPage(null)} />
  if (page === 'suppliers')          return <SuppliersPage          onBack={() => setPage(null)} />
  if (page === 'productStatuses')    return <ProductStatusesPage    onBack={() => setPage(null)} />

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-5 pb-4">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">{t('directory.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('directory.subtitle')}</p>
      </div>

      {catalog.isLoading ? (
        <div className="px-4 pb-8 text-sm text-slate-400">{t('common.loading')}</div>
      ) : (
        <div className="px-4 pb-8 space-y-6">
          {GROUP_ORDER.map(group => {
            const groupTiles = tiles.filter(tile => tile.group === group)
            if (groupTiles.length === 0) return null
            const isCollapsed = collapsedGroups.has(group)
            return (
              <div key={group}>
                <button onClick={() => toggleGroup(group)} className="mb-2.5 flex w-full items-center justify-between text-left">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t(GROUP_LABEL_KEY[group])}</p>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
                    className={`shrink-0 text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {!isCollapsed && (
                  <div className="grid grid-cols-2 gap-3">
                    {groupTiles.map(tile => (
                      <button
                        key={tile.id}
                        onClick={() => setPage(tile.id)}
                        className="flex flex-col items-start rounded-2xl bg-white p-4 text-left active:scale-[0.97] transition-all"
                        style={{ border: '1px solid rgba(157,200,255,0.25)', boxShadow: '0 1px 8px rgba(157,200,255,0.08)' }}
                      >
                        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tile.bg, color: tile.color }}>
                          {tile.icon}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 leading-tight">{tile.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400 leading-snug">{tile.description}</p>
                        <div className="mt-3 flex items-center gap-1">
                          <span className="text-lg font-bold" style={{ color: tile.color }}>{tile.count()}</span>
                          <span className="text-xs text-slate-400">{t('directory.recordsWord')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────
   Shared primitives
─────────────────────────────────────────────────────────── */

function SubPageHeader({ title, subtitle, onBack, onAdd }: { title: string; subtitle: string; onBack: () => void; onAdd?: () => void }) {
  const { t } = useLocale()
  return (
    <div className="flex items-center gap-3 px-4 py-4" style={{ borderBottom: '1px solid rgba(157,200,255,0.2)' }}>
      <button onClick={onBack}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95 transition-all">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-xl text-slate-800 leading-tight">{title}</h1>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      {onAdd && (
        <button onClick={onAdd}
          className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-medium text-white active:scale-95 transition-all shrink-0">
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          {t('common.add')}
        </button>
      )}
    </div>
  )
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-t-3xl bg-white max-h-[92vh] overflow-y-auto sm:rounded-3xl sm:w-full sm:max-w-md">
        <div className="sticky top-0 flex justify-center pt-3 pb-1 bg-white z-10">
          <button onClick={onClose} className="h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
        </div>
        {children}
      </div>
    </div>
  )
}

function SheetTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: "'DM Serif Display', serif" }} className="py-3 text-2xl text-slate-800 px-5">{children}</h2>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
  )
}

function SheetActions({ onCancel, onSave, saveLabel, disabled }: { onCancel: () => void; onSave: () => void; saveLabel?: string; disabled?: boolean }) {
  const { t } = useLocale()
  return (
    <div className="flex gap-3 mt-6 px-5 pb-10">
      <button onClick={onCancel} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">{t('common.cancel')}</button>
      <button onClick={onSave} disabled={disabled}
        className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
        {saveLabel ?? t('common.save')}
      </button>
    </div>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button onClick={onDelete}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-300 hover:border-red-200 hover:text-red-400 active:scale-95 transition-all shrink-0">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M2 3h9M4 3V2h5v1M5 6v4M8 6v4M3 3l.5 8h6l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <button onClick={onEdit}
      className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-white active:scale-95 transition-all shrink-0">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {PRESET_COLORS.map(c => (
        <button key={c.text} onClick={() => onChange(c.text)}
          className="h-9 w-9 rounded-xl transition-all active:scale-90"
          style={{ background: c.bg, border: value === c.text ? `2.5px solid ${c.text}` : '2px solid transparent' }}>
          <div className="h-3 w-3 rounded-full mx-auto" style={{ background: c.text }} />
        </button>
      ))}
    </div>
  )
}

/* ─── DEPARTMENTS ─── */
function DepartmentsPage({ onBack }: { onBack: () => void }) {
  const { departments, positions, addDepartment, updateDepartment, removeDepartment } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: Department | null; name: string; nameEn: string; color: string }>
    ({ open: false, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text })
  const openEdit = (d: Department) => setForm({ open: true, editing: d, name: d.name, nameEn: d.nameEn ?? '', color: d.color })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) updateDepartment(form.editing.id, form.name.trim(), form.color, nameEn)
    else addDepartment(form.name.trim(), form.color, nameEn)
    close()
  }

  const posCount = (id: string) => positions.filter(p => p.departmentId === id).length
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f1f5f9'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.tiles.departments.label')} subtitle={t('directory.countRecords', { count: departments.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {departments.map(d => (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(d.color) }}>
              <div className="h-3 w-3 rounded-full" style={{ background: d.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{tn(d.name, d.nameEn)}</p>
              <p className="text-xs text-slate-400">{t('directory.posCount', { count: posCount(d.id) })}</p>
            </div>
            <EditButton onEdit={() => openEdit(d)} />
            <DeleteButton onDelete={() => removeDepartment(d.id)} />
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('common.edit') : t('directory.newDepartment')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.departmentNamePlaceholder')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" /></Field>
            <Field label={t('directory.colorLabel')}><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── POSITIONS ─── */
function PositionsPage({ onBack }: { onBack: () => void }) {
  const { departments, positions, addPosition, updatePosition, removePosition } = useCatalog()
  const { t, tn } = useLocale()
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState<string | null>(null)
  const [form, setForm] = useState<{ open: boolean; editing: Position | null; title: string; titleEn: string; deptId: string }>
    ({ open: false, editing: null, title: '', titleEn: '', deptId: '' })

  const openAdd  = () => setForm({ open: true, editing: null, title: '', titleEn: '', deptId: departments[0]?.id ?? '' })
  const openEdit = (p: Position) => setForm({ open: true, editing: p, title: p.title, titleEn: p.titleEn ?? '', deptId: p.departmentId })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.title.trim() || !form.deptId) return
    const titleEn = form.titleEn.trim() || null
    if (form.editing) updatePosition(form.editing.id, form.title.trim(), form.deptId, titleEn)
    else addPosition(form.title.trim(), form.deptId, titleEn)
    close()
  }

  const filtered = positions.filter(p => {
    const q = p.title.toLowerCase().includes(search.toLowerCase())
    const d = filterDept !== null ? p.departmentId === filterDept : true
    return q && d
  })

  const getDept = (id: string) => departments.find(d => d.id === id)
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f1f5f9'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.tiles.positions.label')} subtitle={t('directory.countRecords', { count: positions.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder={t('common.searchGeneric')} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterDept(null)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${filterDept === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>
            {t('filters.all')}
          </button>
          {departments.map(d => {
            const c = PRESET_COLORS.find(c => c.text === d.color) ?? PRESET_COLORS[0]
            const active = filterDept === d.id
            return (
              <button key={d.id} onClick={() => setFilterDept(active ? null : d.id)}
                className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all"
                style={active ? { background: d.color, color: '#fff', borderColor: d.color } : { background: c.bg, color: d.color, borderColor: 'transparent' }}>
                {tn(d.name, d.nameEn)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="px-4 py-3 space-y-2 pb-8">
        {filtered.map(p => {
          const dept = getDept(p.departmentId)
          const c = dept ? (PRESET_COLORS.find(c => c.text === dept.color) ?? PRESET_COLORS[0]) : null
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{tn(p.title, p.titleEn)}</p>
                {dept && c
                  ? <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: c.bg, color: dept.color }}>{tn(dept.name, dept.nameEn)}</span>
                  : <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">{t('employees.noDepartment')}</span>
                }
              </div>
              <EditButton onEdit={() => openEdit(p)} />
              <DeleteButton onDelete={() => removePosition(p.id)} />
            </div>
          )
        })}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editPosition') : t('directory.newPosition')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}><Input value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder={t('directory.positionNamePlaceholder')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.titleEn} onChange={v => setForm(f => ({ ...f, titleEn: v }))} placeholder="English name" /></Field>
            <Field label={t('employees.departmentLabel')}>
              {departments.length === 0 ? (
                <p className="text-xs text-red-500">{t('directory.addDepartmentFirst')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {departments.map(d => {
                    const c = PRESET_COLORS.find(c => c.text === d.color) ?? PRESET_COLORS[0]
                    const active = form.deptId === d.id
                    return (
                      <button key={d.id} onClick={() => setForm(f => ({ ...f, deptId: d.id }))}
                        className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                        style={active ? { background: d.color, color: '#fff', borderColor: d.color } : { background: c.bg, color: d.color, borderColor: 'transparent' }}>
                        {tn(d.name, d.nameEn)}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.title.trim() || !form.deptId} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── CATEGORIES ─── */
function CategoriesPage({ onBack }: { onBack: () => void }) {
  const { categories, addCategory, updateCategory, removeCategory } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: ProductCategory | null; name: string; nameEn: string; color: string; parentId: string | null }>
    ({ open: false, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text, parentId: null })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text, parentId: null })
  const openEdit = (c: ProductCategory) => setForm({ open: true, editing: c, name: c.name, nameEn: c.nameEn ?? '', color: c.color, parentId: c.parentId })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) updateCategory(form.editing.id, form.name.trim(), form.color, form.parentId, nameEn)
    else addCategory(form.name.trim(), form.color, form.parentId, nameEn)
    close()
  }

  const roots = categories.filter(c => c.parentId === null)
  const children = (id: string) => categories.filter(c => c.parentId === id)
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f5f3ff'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.categoriesTitle')} subtitle={t('directory.countRecords', { count: categories.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {roots.map(root => (
          <div key={root.id}>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 mb-2"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(root.color) }}>
                <div className="h-3 w-3 rounded-full" style={{ background: root.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{tn(root.name, root.nameEn)}</p>
                <p className="text-xs text-slate-400">{t('directory.subcategoriesCount', { count: children(root.id).length })}</p>
              </div>
              <EditButton onEdit={() => openEdit(root)} />
              <DeleteButton onDelete={() => removeCategory(root.id)} />
            </div>
            {children(root.id).map(child => (
              <div key={child.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ml-5 mb-2"
                style={{ border: '1px solid rgba(157,200,255,0.15)' }}>
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: child.color }} />
                <p className="flex-1 text-sm text-slate-700">{tn(child.name, child.nameEn)}</p>
                <EditButton onEdit={() => openEdit(child)} />
                <DeleteButton onDelete={() => removeCategory(child.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editCategory') : t('directory.newCategory')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('materialEditor.categoryNamePlaceholder')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" /></Field>
            <Field label={t('directory.parentCategoryLabel')}>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setForm(f => ({ ...f, parentId: null }))}
                  className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                  style={form.parentId === null ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                  {t('directory.rootOption')}
                </button>
                {roots.filter(r => r.id !== form.editing?.id).map(r => {
                  const bg = bgOf(r.color)
                  const active = form.parentId === r.id
                  return (
                    <button key={r.id} onClick={() => setForm(f => ({ ...f, parentId: r.id }))}
                      className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                      style={active ? { background: r.color, color: '#fff', borderColor: r.color } : { background: bg, color: r.color, borderColor: 'transparent' }}>
                      {tn(r.name, r.nameEn)}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label={t('directory.colorLabel')}><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── MATERIAL CATEGORIES (окремий каталог, не пов'язаний з categories) ─── */
function MaterialCategoriesPage({ onBack }: { onBack: () => void }) {
  const { t, tn } = useLocale()
  const { materialCategories, addMaterialCategory, updateMaterialCategory, removeMaterialCategory } = useCatalog()
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatNameEn, setNewCatNameEn] = useState('')
  const [addCatParentId, setAddCatParentId] = useState<string | null>(null)
  const [editing, setEditing] = useState<MaterialCategory | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')

  const topLevelCats = materialCategories.filter(c => c.parentId === null)
  const toggleExpand = (id: string) =>
    setExpandedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const handleAdd = () => {
    if (!newCatName.trim()) return
    addMaterialCategory(newCatName.trim(), PRESET_COLORS[materialCategories.length % PRESET_COLORS.length].text, addCatParentId, newCatNameEn.trim() || null)
    setNewCatName(''); setNewCatNameEn(''); setAddCatParentId(null); setShowAddCat(false)
  }

  const openEdit = (cat: MaterialCategory) => { setEditing(cat); setEditName(cat.name); setEditNameEn(cat.nameEn ?? '') }
  const saveEdit = () => {
    if (!editing || !editName.trim()) return
    updateMaterialCategory(editing.id, editName.trim(), editing.color, editing.parentId, editNameEn.trim() || null)
    setEditing(null)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.materialCategoryPageTitle')} subtitle={t('directory.countRecords', { count: materialCategories.length })} onBack={onBack} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {materialCategories.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">{t('directory.noMaterialCategoriesYet')}</p>
        )}
        {topLevelCats.map(cat => (
          <MaterialCategoryNode key={cat.id} cat={cat} depth={0} allCats={materialCategories}
            expandedIds={expandedIds} onToggleExpand={toggleExpand}
            onEdit={openEdit}
            onDelete={id => removeMaterialCategory(id)} />
        ))}

        {showAddCat ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 space-y-2.5">
            <p className="text-xs font-semibold text-blue-700">{t('directory.newCategory')}</p>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
              placeholder={t('materialEditor.categoryNamePlaceholder')} autoFocus
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
            <input value={newCatNameEn} onChange={e => setNewCatNameEn(e.target.value)}
              placeholder={t('common.nameEn')}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 transition-all" />
            {newCatName.trim() && (
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-[10px] text-slate-400">{t('directory.categoryCodeLabel')}</span>
                <span className="rounded-md bg-blue-100 text-blue-700 text-[10px] font-mono font-bold px-1.5 py-0.5">
                  {genCategoryShortCode(newCatName.trim(), materialCategories.filter(c => c.parentId === addCatParentId).map(c => c.shortCode))}
                </span>
              </div>
            )}
            <div className="relative">
              <select value={addCatParentId ?? ''} onChange={e => setAddCatParentId(e.target.value || null)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-sm outline-none focus:border-blue-400 transition-all">
                <option value="">{t('materialEditor.topLevelOption')}</option>
                {materialCategories.map(c => <option key={c.id} value={c.id}>{buildCatPath(c.id, materialCategories, tn)}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowAddCat(false); setNewCatName('') }}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-500 active:scale-[0.98]">{t('common.cancel')}</button>
              <button onClick={handleAdd} disabled={!newCatName.trim()}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40 active:scale-[0.98]">{t('common.add')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddCat(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-semibold text-blue-600 transition-all active:scale-[0.98]"
            style={{ border: '1.5px dashed rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.02)' }}>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {t('materialEditor.addCategory')}
          </button>
        )}
      </div>
      {editing && (
        <BottomSheet onClose={() => setEditing(null)}>
          <SheetTitle>{t('directory.editCategory')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}><Input value={editName} onChange={setEditName} placeholder={t('materialEditor.categoryNamePlaceholder')} /></Field>
            <Field label={t('common.nameEn')}><Input value={editNameEn} onChange={setEditNameEn} placeholder="English name" /></Field>
          </div>
          <SheetActions onCancel={() => setEditing(null)} onSave={saveEdit} saveLabel={t('common.save')} disabled={!editName.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

function MaterialCategoryNode({ cat, depth, allCats, expandedIds, onToggleExpand, onEdit, onDelete }: {
  cat: MaterialCategory
  depth: number
  allCats: MaterialCategory[]
  expandedIds: string[]
  onToggleExpand: (id: string) => void
  onEdit: (cat: MaterialCategory) => void
  onDelete: (id: string) => void
}) {
  const { t, tn } = useLocale()
  const children = allCats.filter(c => c.parentId === cat.id)
  const isExpanded = expandedIds.includes(cat.id)

  return (
    <div style={{ marginLeft: depth > 0 ? depth * 16 : 0 }}>
      <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
        style={{ background: depth === 0 ? '#f8fafc' : 'white', border: '1px solid rgba(157,200,255,0.25)' }}>
        <button onClick={() => children.length > 0 && onToggleExpand(cat.id)} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
          <span className="text-sm font-medium text-slate-800">{tn(cat.name, cat.nameEn)}</span>
          {cat.shortCode && (
            <span className="rounded-md bg-blue-50 text-blue-600 text-[10px] font-mono font-bold px-1.5 py-0.5 shrink-0">{cat.shortCode}</span>
          )}
          {children.length > 0 && (
            <span className="ml-auto rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 shrink-0">{children.length}</span>
          )}
        </button>
        <EditButton onEdit={() => onEdit(cat)} />
        <DeleteButton onDelete={() => onDelete(cat.id)} />
        {children.length > 0 && (
          <button onClick={() => onToggleExpand(cat.id)} className="flex h-9 w-9 items-center justify-center shrink-0 text-slate-400">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
      {isExpanded && children.length > 0 && (
        <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 pl-3" style={{ borderColor: 'rgba(157,200,255,0.3)' }}>
          {children.map(child => (
            <MaterialCategoryNode key={child.id} cat={child} depth={depth + 1} allCats={allCats}
              expandedIds={expandedIds} onToggleExpand={onToggleExpand} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── ATTRIBUTES ─── */
function AttributesPage({ onBack }: { onBack: () => void }) {
  const { attributes, addAttribute, updateAttribute, removeAttribute, addAttributeValue, updateAttributeValue, removeAttributeValue } = useCatalog()
  const { t, tn } = useLocale()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductAttribute | null>(null)
  const [attrName, setAttrName] = useState('')
  const [attrNameEn, setAttrNameEn] = useState('')
  const [attrIsVariant, setAttrIsVariant] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})
  const [newValueEnInputs, setNewValueEnInputs] = useState<Record<string, string>>({})
  const [editingValue, setEditingValue] = useState<{ attrId: string; id: string; value: string; valueEn: string } | null>(null)

  const openAdd  = () => { setEditing(null); setAttrName(''); setAttrNameEn(''); setAttrIsVariant(false); setFormOpen(true) }
  const openEdit = (a: ProductAttribute) => { setEditing(a); setAttrName(a.name); setAttrNameEn(a.nameEn ?? ''); setAttrIsVariant(a.isVariant); setFormOpen(true) }
  const close    = () => setFormOpen(false)
  const save = () => {
    if (!attrName.trim()) return
    const nameEn = attrNameEn.trim() || null
    if (editing) updateAttribute(editing.id, attrName.trim(), attrIsVariant, nameEn)
    else addAttribute(attrName.trim(), attrIsVariant, nameEn)
    close()
  }

  const addValue = (attrId: string) => {
    const v = newValueInputs[attrId]?.trim()
    if (!v) return
    addAttributeValue(attrId, v, newValueEnInputs[attrId]?.trim() || null)
    setNewValueInputs(p => ({ ...p, [attrId]: '' }))
    setNewValueEnInputs(p => ({ ...p, [attrId]: '' }))
  }

  const saveValueEdit = () => {
    if (!editingValue || !editingValue.value.trim()) return
    updateAttributeValue(editingValue.attrId, editingValue.id, editingValue.value.trim(), editingValue.valueEn.trim() || null)
    setEditingValue(null)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('productEditor.attributes')} subtitle={t('directory.countGroups', { count: attributes.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {attributes.map((attr, idx) => {
          const c = PRESET_COLORS[idx % PRESET_COLORS.length]
          const expanded = expandedId === attr.id
          return (
            <div key={attr.id} className="rounded-2xl bg-white overflow-hidden"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button onClick={() => setExpandedId(expanded ? null : attr.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold"
                    style={{ background: c.bg, color: c.text }}>
                    {attr.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      {tn(attr.name, attr.nameEn)}
                      {attr.isVariant && (
                        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>{t('directory.variantBadge')}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{t('directory.valuesCount', { count: attr.values.length })}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`ml-auto shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <EditButton onEdit={() => openEdit(attr)} />
                <DeleteButton onDelete={() => removeAttribute(attr.id)} />
              </div>

              {/* Expanded values */}
              {expanded && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(157,200,255,0.15)' }}>
                  <div className="flex flex-wrap gap-2 pt-3 mb-3">
                    {attr.values.map(v => (
                      <span key={v.id} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs cursor-pointer"
                        style={{ background: c.bg, color: c.text, border: `1px solid ${c.text}22` }}
                        onClick={() => setEditingValue({ attrId: attr.id, id: v.id, value: v.value, valueEn: v.valueEn ?? '' })}>
                        {tn(v.value, v.valueEn)}
                        <button onClick={e => { e.stopPropagation(); removeAttributeValue(attr.id, v.id) }} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                      </span>
                    ))}
                    {attr.values.length === 0 && <p className="text-xs text-slate-300">{t('directory.noValues')}</p>}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newValueInputs[attr.id] || ''} placeholder={t('directory.newValuePlaceholder')}
                      onChange={e => setNewValueInputs(p => ({ ...p, [attr.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addValue(attr.id)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                    <input type="text" value={newValueEnInputs[attr.id] || ''} placeholder="English…"
                      onChange={e => setNewValueEnInputs(p => ({ ...p, [attr.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addValue(attr.id)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                    <button onClick={() => addValue(attr.id)}
                      className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white active:scale-95 transition-all">+</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {formOpen && (
        <BottomSheet onClose={close}>
          <SheetTitle>{editing ? t('directory.editGroup') : t('directory.newAttribute')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.groupNameLabel')}>
              <Input value={attrName} onChange={setAttrName} placeholder={t('directory.attrNameExample')} />
            </Field>
            <Field label={t('common.nameEn')}>
              <Input value={attrNameEn} onChange={setAttrNameEn} placeholder="English name" />
            </Field>
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
              <span className="text-sm text-slate-600">{t('directory.formsVariantLabel')}</span>
              <input type="checkbox" checked={attrIsVariant} onChange={e => setAttrIsVariant(e.target.checked)}
                className="h-4 w-4 rounded accent-slate-800" />
            </label>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={editing ? t('common.save') : t('common.add')} disabled={!attrName.trim()} />
        </BottomSheet>
      )}
      {editingValue && (
        <BottomSheet onClose={() => setEditingValue(null)}>
          <SheetTitle>{t('directory.editValueTitle')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.valueLabel')}>
              <Input value={editingValue.value} onChange={v => setEditingValue(p => p && { ...p, value: v })} placeholder={t('directory.valueLabel')} />
            </Field>
            <Field label={t('directory.valueEnLabel')}>
              <Input value={editingValue.valueEn} onChange={v => setEditingValue(p => p && { ...p, valueEn: v })} placeholder="English value" />
            </Field>
          </div>
          <SheetActions onCancel={() => setEditingValue(null)} onSave={saveValueEdit} saveLabel={t('common.save')} disabled={!editingValue.value.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── OPERATIONS ─── */
function OperationsPage({ onBack }: { onBack: () => void }) {
  const { operations, addOperation, updateOperation, removeOperation } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: Operation | null; name: string; nameEn: string; description: string }>
    ({ open: false, editing: null, name: '', nameEn: '', description: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', description: '' })
  const openEdit = (o: Operation) => setForm({ open: true, editing: o, name: o.name, nameEn: o.nameEn ?? '', description: o.description })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateOperation(form.editing.id, form.name.trim(), form.description, form.nameEn.trim() || null)
    else addOperation(form.name.trim(), form.description, form.nameEn.trim() || null)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('products.operationsLabel')} subtitle={t('directory.countRecords', { count: operations.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {operations.map(op => (
          <div key={op.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-orange-50 text-orange-500">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{tn(op.name, op.nameEn)}</p>
              {op.description && <p className="text-xs text-slate-400 truncate mt-0.5">{op.description}</p>}
            </div>
            <EditButton onEdit={() => openEdit(op)} />
            <DeleteButton onDelete={() => removeOperation(op.id)} />
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editOperation') : t('directory.newOperation')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.operationNameLabel')}><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.operationNameExample')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" /></Field>
            <Field label={t('productEditor.description')}>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('directory.operationDescPlaceholder')} rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── UNITS ─── */
function UnitsPage({ onBack }: { onBack: () => void }) {
  const { units, addUnit, updateUnit, removeUnit } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: Unit | null; name: string; nameEn: string; shortName: string; shortNameEn: string }>
    ({ open: false, editing: null, name: '', nameEn: '', shortName: '', shortNameEn: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', shortName: '', shortNameEn: '' })
  const openEdit = (u: Unit) => setForm({ open: true, editing: u, name: u.name, nameEn: u.nameEn ?? '', shortName: u.shortName, shortNameEn: u.shortNameEn ?? '' })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim() || !form.shortName.trim()) return
    const nameEn = form.nameEn.trim() || null
    const shortNameEn = form.shortNameEn.trim() || null
    if (form.editing) updateUnit(form.editing.id, form.name.trim(), form.shortName.trim(), nameEn, shortNameEn)
    else addUnit(form.name.trim(), form.shortName.trim(), nameEn, shortNameEn)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.tiles.units.label')} subtitle={t('directory.countUnits', { count: units.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {units.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">{t('directory.noUnitsYet')}</p>
        )}
        {units.map(u => (
          <div key={u.id} className="rounded-2xl bg-white px-4 py-4 flex items-center gap-3"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-sky-50">
              <span className="text-sm font-bold text-sky-600">{u.shortName}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{tn(u.name, u.nameEn)}</p>
              <p className="text-xs text-slate-400">{tn(u.shortName, u.shortNameEn)}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <EditButton onEdit={() => openEdit(u)} />
              <DeleteButton onDelete={() => removeUnit(u.id)} />
            </div>
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editUnit') : t('directory.newUnit')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}>
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.unitNameExample')} />
            </Field>
            <Field label={t('common.nameEn')}>
              <Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="E.g. Kilogram" />
            </Field>
            <Field label={t('directory.shortNameLabel')}>
              <Input value={form.shortName} onChange={v => setForm(f => ({ ...f, shortName: v }))} placeholder={t('directory.shortNameExample')} />
            </Field>
            <Field label={t('directory.shortNameEnLabel')}>
              <Input value={form.shortNameEn} onChange={v => setForm(f => ({ ...f, shortNameEn: v }))} placeholder="E.g. kg" />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim() || !form.shortName.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── SUPPLIERS ─── */
function SuppliersPage({ onBack }: { onBack: () => void }) {
  const { suppliers, addSupplier, updateSupplier, removeSupplier } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{
    open: boolean; editing: Supplier | null
    name: string; nameEn: string; contactPerson: string; phone: string; email: string; address: string
  }>({ open: false, editing: null, name: '', nameEn: '', contactPerson: '', phone: '', email: '', address: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', contactPerson: '', phone: '', email: '', address: '' })
  const openEdit = (s: Supplier) => setForm({ open: true, editing: s, name: s.name, nameEn: s.nameEn ?? '', contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) updateSupplier(form.editing.id, form.name.trim(), form.contactPerson, form.phone, form.email, form.address, nameEn)
    else addSupplier(form.name.trim(), form.contactPerson, form.phone, form.email, form.address, nameEn)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('materials.suppliers')} subtitle={t('directory.countRecords', { count: suppliers.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {suppliers.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">{t('directory.noSuppliersYet')}</p>
        )}
        {suppliers.map(s => (
          <div key={s.id} className="rounded-2xl bg-white px-4 py-4"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-amber-50 text-amber-700">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M3 7l7-4 7 4v8l-7 4-7-4V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M10 3v14M3 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-slate-800">{tn(s.name, s.nameEn)}</p>
                {s.contactPerson && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    {s.contactPerson}
                  </p>
                )}
                {s.phone && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2h2l1 2.5L3.5 6a6.5 6.5 0 003.5 3.5l1.5-1.5L11 9v2a1 1 0 01-1 1A9 9 0 011 3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {s.phone}
                  </p>
                )}
                {s.email && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="2.5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1"/><path d="M1 3.5l4 2.5 4-2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                    {s.email}
                  </p>
                )}
                {s.address && (
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1C3.34 1 2 2.34 2 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3zm0 4a1 1 0 110-2 1 1 0 010 2z" fill="currentColor" fillOpacity="0.5"/></svg>
                    {s.address}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <EditButton onEdit={() => openEdit(s)} />
                <DeleteButton onDelete={() => removeSupplier(s.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editSupplier') : t('materialEditor.newSupplier')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.companyNameLabel')}>
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.companyPlaceholderExample')} />
            </Field>
            <Field label={t('common.nameEn')}>
              <Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" />
            </Field>
            <Field label={t('materialEditor.contactPersonPlaceholder')}>
              <Input value={form.contactPerson} onChange={v => setForm(f => ({ ...f, contactPerson: v }))} placeholder={t('directory.fullNamePlaceholder')} />
            </Field>
            <Field label={t('materialEditor.phonePlaceholder')}>
              <Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+380" />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@company.ua" />
            </Field>
            <Field label={t('directory.addressLabel')}>
              <Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder={t('directory.streetCityPlaceholder')} />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── PRODUCT STATUSES (системний каталог) ─── */
function ProductStatusesPage({ onBack }: { onBack: () => void }) {
  const statusesQ = useProductStatuses()
  const statuses = statusesQ.data ?? []
  const { addStatus, updateStatus, removeStatus, setDefaultStatus } = useProductStatusMutations()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: ProductStatus | null; name: string; nameEn: string; color: string }>
    ({ open: false, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', color: PRESET_COLORS[0].text })
  const openEdit = (s: ProductStatus) => setForm({ open: true, editing: s, name: s.name, nameEn: s.nameEn ?? '', color: s.color })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) updateStatus(form.editing.id, form.name.trim(), form.color, nameEn)
    else addStatus(form.name.trim(), form.color, nameEn)
    close()
  }

  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f1f5f9'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.tiles.productStatuses.label')} subtitle={t('directory.countStatuses', { count: statuses.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {statuses.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">{t('directory.noStatusesYet')}</p>
        )}
        {statuses.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(s.color) }}>
              <div className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                {tn(s.name, s.nameEn)}
                {s.isDefault && (
                  <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium" style={{ background: bgOf(s.color), color: s.color }}>{t('directory.defaultBadge')}</span>
                )}
              </p>
              {!s.isDefault && (
                <button onClick={() => setDefaultStatus(s.id)} className="mt-0.5 text-xs text-blue-500 hover:underline">
                  {t('directory.makeDefault')}
                </button>
              )}
            </div>
            <EditButton onEdit={() => openEdit(s)} />
            <DeleteButton onDelete={() => removeStatus(s.id)} />
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editStatus') : t('directory.newStatus')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.nameLabel')}><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.statusNameExample')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" /></Field>
            <Field label={t('directory.colorLabel')}><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── CUSTOM FIELDS (системний конструктор для 3 сутностей) ─── */
const ENTITY_TAB_IDS: EntityType[] = ['material', 'supplier', 'product']
const ENTITY_TAB_LABEL_KEY: Record<EntityType, TranslationKey> = {
  material: 'nav.materials', supplier: 'materials.suppliers', product: 'nav.products',
}
const FIELD_TYPE_LABEL_KEY: Record<FieldType, TranslationKey> = {
  text: 'customField.typeText', number: 'customField.typeNumber', boolean: 'customField.typeBoolean',
  file: 'customField.typeFile', select: 'customField.typeSelect',
}
const FIELD_TYPE_IDS: FieldType[] = ['text', 'number', 'boolean', 'file', 'select']

function FieldDefBody({ d }: { d: CustomFieldDefinition }) {
  const { t, tn } = useLocale()
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {tn(d.name, d.nameEn)}
        {d.isRequired && <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-red-50 text-red-500">{t('directory.requiredBadge')}</span>}
      </p>
      <p className="text-xs text-slate-400">
        {t(FIELD_TYPE_LABEL_KEY[d.fieldType])}
        {d.fieldType === 'select' ? ` · ${t('directory.valuesCount', { count: d.options.length })}` : ''}
      </p>
    </div>
  )
}

export function CustomFieldsPage({ onBack }: { onBack: () => void }) {
  const [entityType, setEntityType] = useState<EntityType>('material')
  const definitionsQ = useCustomFieldDefinitions(entityType)
  const definitions = definitionsQ.data ?? []
  const { addDefinition, updateDefinition, removeDefinition, addOption, updateOption, removeOption } = useCustomFieldDefinitionMutations(entityType)

  const currencyQ = useMaterialCostCurrency()
  const setCurrency = useSetMaterialCostCurrency()
  const { t, tn } = useLocale()

  // Зарплатний період — визначає й закриває лише адмін (менеджер, який теж
  // потрапляє на цю сторінку, тут нічого не бачить/не змінює).
  const { data: currentUser } = useCurrentUser()
  const isAdmin = currentUser?.role === 'admin'
  const payrollSettingsQ = usePayrollSettings()
  const setPayrollSettings = useSetPayrollSettings()
  const payrollClosuresQ = usePayrollClosures()
  const closePeriod = useClosePayrollPeriod()
  const [payrollFrom, setPayrollFrom] = useState('')
  const [payrollTo, setPayrollTo] = useState('')
  useEffect(() => {
    if (payrollSettingsQ.data) {
      setPayrollFrom(payrollSettingsQ.data.openFromDay !== null ? String(payrollSettingsQ.data.openFromDay) : '')
      setPayrollTo(payrollSettingsQ.data.openToDay !== null ? String(payrollSettingsQ.data.openToDay) : '')
    }
  }, [payrollSettingsQ.data])
  const savePayrollSettings = () => {
    const from = Number(payrollFrom), to = Number(payrollTo)
    if (!from || !to || from < 1 || from > 31 || to < 1 || to > 31 || from > to) return
    setPayrollSettings({ openFromDay: from, openToDay: to })
  }
  // Поточний + два попередні місяці — щоб адмін бачив, що ще треба закрити.
  const recentMonths = Array.from({ length: 3 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  const [form, setForm] = useState<{ open: boolean; editing: CustomFieldDefinition | null; name: string; nameEn: string; fieldType: FieldType; isRequired: boolean }>
    ({ open: false, editing: null, name: '', nameEn: '', fieldType: 'text', isRequired: false })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({})
  const [newOptionEnInputs, setNewOptionEnInputs] = useState<Record<string, string>>({})
  const [editingOption, setEditingOption] = useState<{ id: string; value: string; valueEn: string } | null>(null)

  // Значення списку, які користувач додає прямо у формі "Тип поля: Список" —
  // ще без field_definition_id (поле щойно створюється), тож зберігаємо чернеткою
  // й записуємо в базу одразу після появи id нового поля.
  const [pendingOptions, setPendingOptions] = useState<{ value: string; valueEn: string }[]>([])
  const [pendingOptionValue, setPendingOptionValue] = useState('')
  const [pendingOptionValueEn, setPendingOptionValueEn] = useState('')

  const openAdd  = () => { setForm({ open: true, editing: null, name: '', nameEn: '', fieldType: 'text', isRequired: false }); setPendingOptions([]); setPendingOptionValue(''); setPendingOptionValueEn('') }
  const openEdit = (d: CustomFieldDefinition) => { setForm({ open: true, editing: d, name: d.name, nameEn: d.nameEn ?? '', fieldType: d.fieldType, isRequired: d.isRequired }); setPendingOptions([]); setPendingOptionValue(''); setPendingOptionValueEn('') }
  const close    = () => setForm(f => ({ ...f, open: false }))

  const addPendingOption = () => {
    const v = pendingOptionValue.trim()
    if (!v) return
    setPendingOptions(prev => [...prev, { value: v, valueEn: pendingOptionValueEn.trim() || null as unknown as string }])
    setPendingOptionValue('')
    setPendingOptionValueEn('')
  }
  const removePendingOption = (idx: number) => setPendingOptions(prev => prev.filter((_, i) => i !== idx))

  // Під час редагування вже існуючого поля-списку значення додаються/видаляються одразу
  // в базі (той самий шлях, що й у розгорнутому рядку списку нижче).
  const editingLiveDef = form.editing ? (definitions.find(d => d.id === form.editing!.id) ?? form.editing) : null

  const save = async () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) {
      updateDefinition({ id: form.editing.id, name: form.name.trim(), nameEn, isRequired: form.isRequired })
    } else {
      const newId = await addDefinition({ name: form.name.trim(), nameEn, fieldType: form.fieldType, isRequired: form.isRequired, position: definitions.length })
      for (let i = 0; i < pendingOptions.length; i++) {
        const opt = pendingOptions[i]
        await addOption({ fieldDefinitionId: newId, value: opt.value, valueEn: opt.valueEn || null, position: i })
      }
    }
    close()
  }

  const addOptionValue = (fieldId: string) => {
    const v = newOptionInputs[fieldId]?.trim()
    if (!v) return
    const def = definitions.find(d => d.id === fieldId)
    addOption({ fieldDefinitionId: fieldId, value: v, valueEn: newOptionEnInputs[fieldId]?.trim() || null, position: def?.options.length ?? 0 })
    setNewOptionInputs(p => ({ ...p, [fieldId]: '' }))
    setNewOptionEnInputs(p => ({ ...p, [fieldId]: '' }))
  }

  const saveOptionEdit = () => {
    if (!editingOption || !editingOption.value.trim()) return
    updateOption({ id: editingOption.id, value: editingOption.value.trim(), valueEn: editingOption.valueEn.trim() || null })
    setEditingOption(null)
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.customFieldsTitle')} subtitle={t('directory.countFields', { count: definitions.length })} onBack={onBack} onAdd={openAdd} />

      <div className="px-4 pt-3">
        <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('directory.materialCostCurrencyLabel')}</label>
          <div className="relative">
            <select value={currencyQ.data ?? 'UAH'} onChange={e => setCurrency(e.target.value as typeof CURRENCIES[number])}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-9 py-2.5 text-sm outline-none focus:border-blue-400 transition-all">
              {CURRENCIES.map(c => <option key={c} value={c}>{t(CURRENCY_LABEL_KEY[c])}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M2 3.5l3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-300">{t('directory.currencyHint')}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="px-4 pt-3">
          <div className="rounded-2xl bg-white p-4" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{t('payroll.settingsTitle')}</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="31" value={payrollFrom} onChange={e => setPayrollFrom(e.target.value)} placeholder={t('payroll.openFromLabel')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all" />
              <span className="text-xs text-slate-400 shrink-0">{t('payroll.rangeSeparator')}</span>
              <input type="number" min="1" max="31" value={payrollTo} onChange={e => setPayrollTo(e.target.value)} placeholder={t('payroll.openToLabel')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 transition-all" />
              <button onClick={savePayrollSettings} className="shrink-0 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-medium text-white active:scale-95 transition-all">
                {t('common.save')}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-slate-300">{t('payroll.settingsHint')}</p>

            {payrollSettingsQ.data && payrollSettingsQ.data.openToDay !== null && (
              <div className="mt-3 space-y-1.5">
                {recentMonths.map(({ year, month }) => {
                  const phase = computeMonthPayrollPhase(year, month, payrollSettingsQ.data, payrollClosuresQ.data ?? [])
                  const closure = (payrollClosuresQ.data ?? []).find(c => c.periodYear === year && c.periodMonth === month)
                  const label = new Date(year, month - 1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
                  return (
                    <div key={`${year}-${month}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 capitalize">{label}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {phase === 'closed' && closure
                            ? t('payroll.closedByHint', { name: closure.closedByName, date: new Date(closure.closedAt).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }) })
                            : t(phase === 'awaiting_closure' ? 'payroll.periodStatusAwaitingClosure' : 'payroll.periodStatusActive')}
                        </p>
                      </div>
                      {phase !== 'closed' && (
                        <button onClick={() => { if (currentUser && confirm(t('payroll.closeConfirm'))) closePeriod({ periodYear: year, periodMonth: month, closedById: currentUser.id }) }}
                          className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] font-medium text-red-500 active:scale-95 transition-all">
                          {t('payroll.closeButton')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="flex gap-1.5 rounded-2xl bg-white p-1" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
          {ENTITY_TAB_IDS.map(id => (
            <button key={id} onClick={() => { setEntityType(id); setExpandedId(null) }}
              className="flex-1 rounded-xl py-2 text-xs font-medium transition-all"
              style={entityType === id ? { background: '#1e293b', color: '#fff' } : { color: '#64748b' }}>
              {t(ENTITY_TAB_LABEL_KEY[id])}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 pb-8">
        {definitions.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">{t('directory.noCustomFieldsYet')}</p>
        )}
        {definitions.map(d => {
          const expanded = expandedId === d.id
          return (
            <div key={d.id} className="rounded-2xl bg-white overflow-hidden" style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {d.fieldType === 'select' ? (
                  <button onClick={() => setExpandedId(expanded ? null : d.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    <FieldDefBody d={d} />
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`ml-auto shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>
                      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <div className="flex-1 min-w-0"><FieldDefBody d={d} /></div>
                )}
                <EditButton onEdit={() => openEdit(d)} />
                <DeleteButton onDelete={() => removeDefinition(d.id)} />
              </div>
              {d.fieldType === 'select' && expanded && (
                <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(157,200,255,0.15)' }}>
                  <div className="flex flex-wrap gap-2 pt-3 mb-3">
                    {d.options.map(o => (
                      <span key={o.id} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs cursor-pointer"
                        style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}
                        onClick={() => setEditingOption({ id: o.id, value: o.value, valueEn: o.valueEn ?? '' })}>
                        {tn(o.value, o.valueEn)}
                        <button onClick={e => { e.stopPropagation(); removeOption(o.id) }} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                      </span>
                    ))}
                    {d.options.length === 0 && <p className="text-xs text-slate-300">{t('directory.noValues')}</p>}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newOptionInputs[d.id] || ''} placeholder={t('directory.newValuePlaceholder')}
                      onChange={e => setNewOptionInputs(p => ({ ...p, [d.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addOptionValue(d.id)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                    <input type="text" value={newOptionEnInputs[d.id] || ''} placeholder="English…"
                      onChange={e => setNewOptionEnInputs(p => ({ ...p, [d.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addOptionValue(d.id)}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                    <button onClick={() => addOptionValue(d.id)}
                      className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white active:scale-95 transition-all">+</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editField') : t('directory.newCustomField')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.fieldNameLabel')}>
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.fieldNameExample')} />
            </Field>
            <Field label={t('common.nameEn')}>
              <Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" />
            </Field>
            <Field label={t('directory.fieldTypeLabel')}>
              {form.editing ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  {t('directory.typeLockedHint', { type: t(FIELD_TYPE_LABEL_KEY[form.fieldType]) })}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {FIELD_TYPE_IDS.map(id => {
                    const active = form.fieldType === id
                    return (
                      <button key={id} onClick={() => setForm(f => ({ ...f, fieldType: id }))}
                        className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                        style={active ? { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' } : { background: '#eef2ff', color: '#4f46e5', borderColor: 'transparent' }}>
                        {t(FIELD_TYPE_LABEL_KEY[id])}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
            {form.fieldType === 'select' && (
              <Field label={t('directory.listValuesLabel')}>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.editing ? (
                    <>
                      {(editingLiveDef?.options ?? []).map(o => (
                        <span key={o.id} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs cursor-pointer"
                          style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}
                          onClick={() => setEditingOption({ id: o.id, value: o.value, valueEn: o.valueEn ?? '' })}>
                          {tn(o.value, o.valueEn)}
                          <button onClick={e => { e.stopPropagation(); removeOption(o.id) }} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                        </span>
                      ))}
                      {(editingLiveDef?.options.length ?? 0) === 0 && <p className="text-xs text-slate-300">{t('directory.noValues')}</p>}
                    </>
                  ) : (
                    <>
                      {pendingOptions.map((o, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                          style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                          {o.value}
                          <button onClick={() => removePendingOption(i)} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                        </span>
                      ))}
                      {pendingOptions.length === 0 && <p className="text-xs text-slate-300">{t('directory.noValues')}</p>}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <input type="text"
                    value={form.editing ? (newOptionInputs[form.editing.id] || '') : pendingOptionValue}
                    placeholder={t('directory.newValuePlaceholder')}
                    onChange={e => form.editing
                      ? setNewOptionInputs(p => ({ ...p, [form.editing!.id]: e.target.value }))
                      : setPendingOptionValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (form.editing ? addOptionValue(form.editing.id) : addPendingOption())}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                  <input type="text"
                    value={form.editing ? (newOptionEnInputs[form.editing.id] || '') : pendingOptionValueEn}
                    placeholder="English…"
                    onChange={e => form.editing
                      ? setNewOptionEnInputs(p => ({ ...p, [form.editing!.id]: e.target.value }))
                      : setPendingOptionValueEn(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (form.editing ? addOptionValue(form.editing.id) : addPendingOption())}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all" />
                  <button onClick={() => form.editing ? addOptionValue(form.editing.id) : addPendingOption()}
                    className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-white active:scale-95 transition-all">+</button>
                </div>
              </Field>
            )}
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
              <span className="text-sm text-slate-600">{t('common.requiredField')}</span>
              <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
                className="h-4 w-4 rounded accent-slate-800" />
            </label>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
      {editingOption && (
        <BottomSheet onClose={() => setEditingOption(null)}>
          <SheetTitle>{t('directory.editValueTitle')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.valueLabel')}>
              <Input value={editingOption.value} onChange={v => setEditingOption(p => p && { ...p, value: v })} placeholder={t('directory.valueLabel')} />
            </Field>
            <Field label={t('directory.valueEnLabel')}>
              <Input value={editingOption.valueEn} onChange={v => setEditingOption(p => p && { ...p, valueEn: v })} placeholder="English value" />
            </Field>
          </div>
          <SheetActions onCancel={() => setEditingOption(null)} onSave={saveOptionEdit} saveLabel={t('common.save')} disabled={!editingOption.value.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── WAREHOUSES ─── */
function WarehousesPage({ onBack }: { onBack: () => void }) {
  const { warehouses, addWarehouse, updateWarehouse, removeWarehouse } = useCatalog()
  const { t, tn } = useLocale()
  const [form, setForm] = useState<{ open: boolean; editing: Warehouse | null; name: string; nameEn: string; address: string; responsible: string }>
    ({ open: false, editing: null, name: '', nameEn: '', address: '', responsible: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', nameEn: '', address: '', responsible: '' })
  const openEdit = (w: Warehouse) => setForm({ open: true, editing: w, name: w.name, nameEn: w.nameEn ?? '', address: w.address, responsible: w.responsible })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    const nameEn = form.nameEn.trim() || null
    if (form.editing) updateWarehouse(form.editing.id, form.name.trim(), form.address, form.responsible, nameEn)
    else addWarehouse(form.name.trim(), form.address, form.responsible, nameEn)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title={t('directory.tiles.warehouses.label')} subtitle={t('directory.countRecords', { count: warehouses.length })} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {warehouses.map(w => (
          <div key={w.id} className="rounded-2xl bg-white px-4 py-4"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-green-50 text-green-600">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M2 8l8-5 8 5v9a1 1 0 01-1 1H3a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M7 18V11h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{tn(w.name, w.nameEn)}</p>
                {w.address && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1C3.34 1 2 2.34 2 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.66-1.34-3-3-3zm0 4a1 1 0 110-2 1 1 0 010 2z" fill="currentColor" fillOpacity="0.6"/></svg>
                    {w.address}
                  </p>
                )}
                {w.responsible && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    {w.responsible}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <EditButton onEdit={() => openEdit(w)} />
                <DeleteButton onDelete={() => removeWarehouse(w.id)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? t('directory.editWarehouse') : t('directory.newWarehouse')}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label={t('directory.warehouseNameLabel')}><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder={t('directory.warehouseNameExample')} /></Field>
            <Field label={t('common.nameEn')}><Input value={form.nameEn} onChange={v => setForm(f => ({ ...f, nameEn: v }))} placeholder="English name" /></Field>
            <Field label={t('directory.addressLabel')}><Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder={t('directory.warehouseAddressExample')} /></Field>
            <Field label={t('directory.responsibleLabel')}><Input value={form.responsible} onChange={v => setForm(f => ({ ...f, responsible: v }))} placeholder={t('directory.fullNamePlaceholder')} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? t('common.save') : t('common.add')} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}
