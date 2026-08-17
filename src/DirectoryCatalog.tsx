import { useState } from 'react'
import { useCatalog } from './hooks/useCatalog'
import { PRESET_COLORS } from './lib/colors'
import type { Department, Position, ProductCategory, ProductAttribute, Operation, Warehouse, MaterialCategory, Unit, Supplier } from './hooks/useCatalog'
import { useProductStatuses, useProductStatusMutations, type ProductStatus } from './hooks/useProducts'
import { useCustomFieldDefinitions, useCustomFieldDefinitionMutations, type CustomFieldDefinition, type EntityType, type FieldType } from './hooks/useCustomFields'

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
  | 'customFields'

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
  const [page, setPage] = useState<SubPage>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DirectoryGroup>>(new Set(['Системні каталоги']))
  const catalog = useCatalog()
  const statusesQ = useProductStatuses()
  const materialFieldsQ = useCustomFieldDefinitions('material')
  const supplierFieldsQ = useCustomFieldDefinitions('supplier')
  const productFieldsQ = useCustomFieldDefinitions('product')
  const customFieldsCount = (materialFieldsQ.data?.length ?? 0) + (supplierFieldsQ.data?.length ?? 0) + (productFieldsQ.data?.length ?? 0)

  const toggleGroup = (g: DirectoryGroup) => setCollapsedGroups(prev => {
    const next = new Set(prev)
    if (next.has(g)) next.delete(g); else next.add(g)
    return next
  })

  const tiles: DirectoryTile[] = [
    // ── Продукт ──
    {
      id: 'categories', group: 'Продукт', label: 'Категорії продуктів', description: 'Категорії та підкатегорії продуктів',
      color: '#7c3aed', bg: '#f5f3ff', count: () => catalog.categories.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 5a3 3 0 013-3h10a3 3 0 013 3v10a3 3 0 01-3 3H5a3 3 0 01-3-3V5z" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9h8M6 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'operations', group: 'Продукт', label: 'Операції', description: 'Виробничі та технологічні операції',
      color: '#ea580c', bg: '#fff7ed', count: () => catalog.operations.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 2v2.5M10 15.5V18M2 10h2.5M15.5 10H18M4.22 4.22l1.77 1.77M14.01 14.01l1.77 1.77M4.22 15.78l1.77-1.77M14.01 5.99l1.77-1.77" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'attributes', group: 'Продукт', label: 'Характеристики', description: 'Групи та значення характеристик',
      color: '#0891b2', bg: '#ecfeff', count: () => catalog.attributes.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    // ── Матеріали ──
    {
      id: 'materialCategories', group: 'Матеріали', label: 'Категорії матеріалів', description: 'Окремий каталог категорій для матеріалів',
      color: '#0d9488', bg: '#f0fdfa', count: () => catalog.materialCategories.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'warehouses', group: 'Матеріали', label: 'Склади', description: 'Адреси та відповідальні особи',
      color: '#16a34a', bg: '#f0fdf4', count: () => catalog.warehouses.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 8l8-5 8 5v9a1 1 0 01-1 1H3a1 1 0 01-1-1V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7 18V11h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
      id: 'suppliers', group: 'Матеріали', label: 'Постачальники', description: 'Контакти та реквізити постачальників',
      color: '#b45309', bg: '#fffbeb', count: () => catalog.suppliers.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7l7-4 7 4v8l-7 4-7-4V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 3v14M3 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    },
    {
      id: 'units', group: 'Матеріали', label: 'Одиниці виміру', description: 'Одиниці для матеріалів і операцій',
      color: '#0284c7', bg: '#f0f9ff', count: () => catalog.units.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 16L16 4M8 4h8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    // ── Люди ──
    {
      id: 'positions', group: 'Люди', label: 'Посади', description: "Посади та прив'язка до департаментів",
      color: '#db2777', bg: '#fdf2f8', count: () => catalog.positions.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M4 18c0-3.31 2.69-6 6-6s6 2.69 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    {
      id: 'departments', group: 'Люди', label: 'Департаменти', description: 'Організаційні підрозділи',
      color: '#2563eb', bg: '#eff6ff', count: () => catalog.departments.length,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="7" y="2" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/><path d="M10 7v3M10 10H4.5v3M10 10h5.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    },
    // ── Системні каталоги ──
    {
      id: 'productStatuses', group: 'Системні каталоги', label: 'Статуси продуктів', description: 'Статуси каталогу продуктів (активний, неактивний тощо)',
      color: '#64748b', bg: '#f1f5f9', count: () => statusesQ.data?.length ?? 0,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/><path d="M6.8 10l2.2 2.2 4.2-4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    {
      id: 'customFields', group: 'Системні каталоги', label: 'Кастомні поля', description: 'Додаткові поля для матеріалів, постачальників і продуктів',
      color: '#4f46e5', bg: '#eef2ff', count: () => customFieldsCount,
      icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="4" width="15" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2.5" y="9.5" width="15" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2.5" y="15" width="9" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>,
    },
  ]

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
  if (page === 'customFields')       return <CustomFieldsPage       onBack={() => setPage(null)} />

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="px-4 pt-5 pb-4">
        <h1 style={{ fontFamily: "'DM Serif Display', serif" }} className="text-2xl text-slate-800">Довідники</h1>
        <p className="text-sm text-slate-400 mt-1">Каталогові дані системи</p>
      </div>

      {catalog.isLoading ? (
        <div className="px-4 pb-8 text-sm text-slate-400">Завантаження…</div>
      ) : (
        <div className="px-4 pb-8 space-y-6">
          {GROUP_ORDER.map(group => {
            const groupTiles = tiles.filter(t => t.group === group)
            if (groupTiles.length === 0) return null
            const isCollapsed = collapsedGroups.has(group)
            return (
              <div key={group}>
                <button onClick={() => toggleGroup(group)} className="mb-2.5 flex w-full items-center justify-between text-left">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{group}</p>
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
                          <span className="text-xs text-slate-400">записів</span>
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

function SubPageHeader({ title, subtitle, onBack, onAdd }: { title: string; subtitle: string; onBack: () => void; onAdd: () => void }) {
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
      <button onClick={onAdd}
        className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-medium text-white active:scale-95 transition-all shrink-0">
        <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
        Додати
      </button>
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

function SheetActions({ onCancel, onSave, saveLabel = 'Зберегти', disabled }: { onCancel: () => void; onSave: () => void; saveLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-3 mt-6 px-5 pb-10">
      <button onClick={onCancel} className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm text-slate-600">Скасувати</button>
      <button onClick={onSave} disabled={disabled}
        className="flex-1 rounded-2xl bg-slate-800 py-3.5 text-sm font-medium text-white disabled:opacity-40 active:scale-[0.98] transition-all">
        {saveLabel}
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
  const [form, setForm] = useState<{ open: boolean; editing: Department | null; name: string; color: string }>
    ({ open: false, editing: null, name: '', color: PRESET_COLORS[0].text })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', color: PRESET_COLORS[0].text })
  const openEdit = (d: Department) => setForm({ open: true, editing: d, name: d.name, color: d.color })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateDepartment(form.editing.id, form.name.trim(), form.color)
    else addDepartment(form.name.trim(), form.color)
    close()
  }

  const posCount = (id: string) => positions.filter(p => p.departmentId === id).length
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f1f5f9'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Департаменти" subtitle={`${departments.length} записів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {departments.map(d => (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(d.color) }}>
              <div className="h-3 w-3 rounded-full" style={{ background: d.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{d.name}</p>
              <p className="text-xs text-slate-400">{posCount(d.id)} посад</p>
            </div>
            <EditButton onEdit={() => openEdit(d)} />
            <DeleteButton onDelete={() => removeDepartment(d.id)} />
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? 'Редагувати' : 'Новий департамент'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Назва департаменту" /></Field>
            <Field label="Колір"><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── POSITIONS ─── */
function PositionsPage({ onBack }: { onBack: () => void }) {
  const { departments, positions, addPosition, updatePosition, removePosition } = useCatalog()
  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState<string | null>(null)
  const [form, setForm] = useState<{ open: boolean; editing: Position | null; title: string; deptId: string }>
    ({ open: false, editing: null, title: '', deptId: '' })

  const openAdd  = () => setForm({ open: true, editing: null, title: '', deptId: departments[0]?.id ?? '' })
  const openEdit = (p: Position) => setForm({ open: true, editing: p, title: p.title, deptId: p.departmentId })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.title.trim() || !form.deptId) return
    if (form.editing) updatePosition(form.editing.id, form.title.trim(), form.deptId)
    else addPosition(form.title.trim(), form.deptId)
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
      <SubPageHeader title="Посади" subtitle={`${positions.length} записів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 pt-3 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input type="search" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterDept(null)}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all ${filterDept === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-500'}`}>
            Усі
          </button>
          {departments.map(d => {
            const c = PRESET_COLORS.find(c => c.text === d.color) ?? PRESET_COLORS[0]
            const active = filterDept === d.id
            return (
              <button key={d.id} onClick={() => setFilterDept(active ? null : d.id)}
                className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium border transition-all"
                style={active ? { background: d.color, color: '#fff', borderColor: d.color } : { background: c.bg, color: d.color, borderColor: 'transparent' }}>
                {d.name}
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
                <p className="text-sm font-medium text-slate-800 truncate">{p.title}</p>
                {dept && c
                  ? <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: c.bg, color: dept.color }}>{dept.name}</span>
                  : <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">Без департаменту</span>
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
          <SheetTitle>{form.editing ? 'Редагувати посаду' : 'Нова посада'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва"><Input value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="Назва посади" /></Field>
            <Field label="Департамент">
              {departments.length === 0 ? (
                <p className="text-xs text-red-500">Спочатку додайте хоча б один департамент</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {departments.map(d => {
                    const c = PRESET_COLORS.find(c => c.text === d.color) ?? PRESET_COLORS[0]
                    const active = form.deptId === d.id
                    return (
                      <button key={d.id} onClick={() => setForm(f => ({ ...f, deptId: d.id }))}
                        className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                        style={active ? { background: d.color, color: '#fff', borderColor: d.color } : { background: c.bg, color: d.color, borderColor: 'transparent' }}>
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.title.trim() || !form.deptId} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── CATEGORIES ─── */
function CategoriesPage({ onBack }: { onBack: () => void }) {
  const { categories, addCategory, updateCategory, removeCategory } = useCatalog()
  const [form, setForm] = useState<{ open: boolean; editing: ProductCategory | null; name: string; color: string; parentId: string | null }>
    ({ open: false, editing: null, name: '', color: PRESET_COLORS[0].text, parentId: null })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', color: PRESET_COLORS[0].text, parentId: null })
  const openEdit = (c: ProductCategory) => setForm({ open: true, editing: c, name: c.name, color: c.color, parentId: c.parentId })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateCategory(form.editing.id, form.name.trim(), form.color, form.parentId)
    else addCategory(form.name.trim(), form.color, form.parentId)
    close()
  }

  const roots = categories.filter(c => c.parentId === null)
  const children = (id: string) => categories.filter(c => c.parentId === id)
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f5f3ff'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Категорії" subtitle={`${categories.length} записів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {roots.map(root => (
          <div key={root.id}>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 mb-2"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(root.color) }}>
                <div className="h-3 w-3 rounded-full" style={{ background: root.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{root.name}</p>
                <p className="text-xs text-slate-400">{children(root.id).length} підкатегорій</p>
              </div>
              <EditButton onEdit={() => openEdit(root)} />
              <DeleteButton onDelete={() => removeCategory(root.id)} />
            </div>
            {children(root.id).map(child => (
              <div key={child.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ml-5 mb-2"
                style={{ border: '1px solid rgba(157,200,255,0.15)' }}>
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: child.color }} />
                <p className="flex-1 text-sm text-slate-700">{child.name}</p>
                <EditButton onEdit={() => openEdit(child)} />
                <DeleteButton onDelete={() => removeCategory(child.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? 'Редагувати категорію' : 'Нова категорія'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Назва категорії" /></Field>
            <Field label="Батьківська категорія">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setForm(f => ({ ...f, parentId: null }))}
                  className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                  style={form.parentId === null ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                  Коренева
                </button>
                {roots.filter(r => r.id !== form.editing?.id).map(r => {
                  const bg = bgOf(r.color)
                  const active = form.parentId === r.id
                  return (
                    <button key={r.id} onClick={() => setForm(f => ({ ...f, parentId: r.id }))}
                      className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                      style={active ? { background: r.color, color: '#fff', borderColor: r.color } : { background: bg, color: r.color, borderColor: 'transparent' }}>
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Колір"><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── MATERIAL CATEGORIES (окремий каталог, не пов'язаний з categories) ─── */
function MaterialCategoriesPage({ onBack }: { onBack: () => void }) {
  const { materialCategories, addMaterialCategory, updateMaterialCategory, removeMaterialCategory } = useCatalog()
  const [form, setForm] = useState<{ open: boolean; editing: MaterialCategory | null; name: string; color: string; parentId: string | null }>
    ({ open: false, editing: null, name: '', color: PRESET_COLORS[0].text, parentId: null })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', color: PRESET_COLORS[0].text, parentId: null })
  const openEdit = (c: MaterialCategory) => setForm({ open: true, editing: c, name: c.name, color: c.color, parentId: c.parentId })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateMaterialCategory(form.editing.id, form.name.trim(), form.color, form.parentId)
    else addMaterialCategory(form.name.trim(), form.color, form.parentId)
    close()
  }

  const roots = materialCategories.filter(c => c.parentId === null)
  const children = (id: string) => materialCategories.filter(c => c.parentId === id)
  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f0fdfa'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Категорії матеріалів" subtitle={`${materialCategories.length} записів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {materialCategories.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Категорій матеріалів ще немає</p>
        )}
        {roots.map(root => (
          <div key={root.id}>
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 mb-2"
              style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
              <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(root.color) }}>
                <div className="h-3 w-3 rounded-full" style={{ background: root.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{root.name}</p>
                <p className="text-xs text-slate-400">{children(root.id).length} підкатегорій</p>
              </div>
              <EditButton onEdit={() => openEdit(root)} />
              <DeleteButton onDelete={() => removeMaterialCategory(root.id)} />
            </div>
            {children(root.id).map(child => (
              <div key={child.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ml-5 mb-2"
                style={{ border: '1px solid rgba(157,200,255,0.15)' }}>
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: child.color }} />
                <p className="flex-1 text-sm text-slate-700">{child.name}</p>
                <EditButton onEdit={() => openEdit(child)} />
                <DeleteButton onDelete={() => removeMaterialCategory(child.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? 'Редагувати категорію' : 'Нова категорія матеріалу'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Назва категорії" /></Field>
            <Field label="Батьківська категорія">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setForm(f => ({ ...f, parentId: null }))}
                  className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                  style={form.parentId === null ? { background: '#1e293b', color: '#fff', borderColor: '#1e293b' } : { background: '#f8fafc', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                  Коренева
                </button>
                {roots.filter(r => r.id !== form.editing?.id).map(r => {
                  const bg = bgOf(r.color)
                  const active = form.parentId === r.id
                  return (
                    <button key={r.id} onClick={() => setForm(f => ({ ...f, parentId: r.id }))}
                      className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                      style={active ? { background: r.color, color: '#fff', borderColor: r.color } : { background: bg, color: r.color, borderColor: 'transparent' }}>
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Колір"><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── ATTRIBUTES ─── */
function AttributesPage({ onBack }: { onBack: () => void }) {
  const { attributes, addAttribute, updateAttribute, removeAttribute, addAttributeValue, removeAttributeValue } = useCatalog()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductAttribute | null>(null)
  const [attrName, setAttrName] = useState('')
  const [attrIsVariant, setAttrIsVariant] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})

  const openAdd  = () => { setEditing(null); setAttrName(''); setAttrIsVariant(false); setFormOpen(true) }
  const openEdit = (a: ProductAttribute) => { setEditing(a); setAttrName(a.name); setAttrIsVariant(a.isVariant); setFormOpen(true) }
  const close    = () => setFormOpen(false)
  const save = () => {
    if (!attrName.trim()) return
    if (editing) updateAttribute(editing.id, attrName.trim(), attrIsVariant)
    else addAttribute(attrName.trim(), attrIsVariant)
    close()
  }

  const addValue = (attrId: string) => {
    const v = newValueInputs[attrId]?.trim()
    if (!v) return
    addAttributeValue(attrId, v)
    setNewValueInputs(p => ({ ...p, [attrId]: '' }))
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Характеристики" subtitle={`${attributes.length} груп`} onBack={onBack} onAdd={openAdd} />
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
                      {attr.name}
                      {attr.isVariant && (
                        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium" style={{ background: '#f5f3ff', color: '#7c3aed' }}>варіант</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{attr.values.length} значень</p>
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
                      <span key={v.id} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs"
                        style={{ background: c.bg, color: c.text, border: `1px solid ${c.text}22` }}>
                        {v.value}
                        <button onClick={() => removeAttributeValue(attr.id, v.id)} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                      </span>
                    ))}
                    {attr.values.length === 0 && <p className="text-xs text-slate-300">Немає значень</p>}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newValueInputs[attr.id] || ''} placeholder="Нове значення…"
                      onChange={e => setNewValueInputs(p => ({ ...p, [attr.id]: e.target.value }))}
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
          <SheetTitle>{editing ? 'Редагувати групу' : 'Нова характеристика'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва групи">
              <Input value={attrName} onChange={setAttrName} placeholder="Напр. Колір, Розмір" />
            </Field>
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
              <span className="text-sm text-slate-600">Формує варіант товару</span>
              <input type="checkbox" checked={attrIsVariant} onChange={e => setAttrIsVariant(e.target.checked)}
                className="h-4 w-4 rounded accent-slate-800" />
            </label>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={editing ? 'Зберегти' : 'Додати'} disabled={!attrName.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── OPERATIONS ─── */
function OperationsPage({ onBack }: { onBack: () => void }) {
  const { operations, addOperation, updateOperation, removeOperation } = useCatalog()
  const [form, setForm] = useState<{ open: boolean; editing: Operation | null; name: string; description: string }>
    ({ open: false, editing: null, name: '', description: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', description: '' })
  const openEdit = (o: Operation) => setForm({ open: true, editing: o, name: o.name, description: o.description })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateOperation(form.editing.id, form.name.trim(), form.description)
    else addOperation(form.name.trim(), form.description)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Операції" subtitle={`${operations.length} записів`} onBack={onBack} onAdd={openAdd} />
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
              <p className="text-sm font-medium text-slate-800">{op.name}</p>
              {op.description && <p className="text-xs text-slate-400 truncate mt-0.5">{op.description}</p>}
            </div>
            <EditButton onEdit={() => openEdit(op)} />
            <DeleteButton onDelete={() => removeOperation(op.id)} />
          </div>
        ))}
      </div>
      {form.open && (
        <BottomSheet onClose={close}>
          <SheetTitle>{form.editing ? 'Редагувати операцію' : 'Нова операція'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва операції"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Напр. Крій, Пошиття" /></Field>
            <Field label="Опис">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Короткий опис операції…" rows={3}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none" />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── UNITS ─── */
function UnitsPage({ onBack }: { onBack: () => void }) {
  const { units, addUnit, updateUnit, removeUnit } = useCatalog()
  const [form, setForm] = useState<{ open: boolean; editing: Unit | null; name: string; shortName: string }>
    ({ open: false, editing: null, name: '', shortName: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', shortName: '' })
  const openEdit = (u: Unit) => setForm({ open: true, editing: u, name: u.name, shortName: u.shortName })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim() || !form.shortName.trim()) return
    if (form.editing) updateUnit(form.editing.id, form.name.trim(), form.shortName.trim())
    else addUnit(form.name.trim(), form.shortName.trim())
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Одиниці виміру" subtitle={`${units.length} одиниць`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {units.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Одиниць ще немає</p>
        )}
        {units.map(u => (
          <div key={u.id} className="rounded-2xl bg-white px-4 py-4 flex items-center gap-3"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center bg-sky-50">
              <span className="text-sm font-bold text-sky-600">{u.shortName}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{u.name}</p>
              <p className="text-xs text-slate-400">{u.shortName}</p>
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
          <SheetTitle>{form.editing ? 'Редагувати одиницю' : 'Нова одиниця'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва">
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Напр. Кілограм" />
            </Field>
            <Field label="Скорочення">
              <Input value={form.shortName} onChange={v => setForm(f => ({ ...f, shortName: v }))} placeholder="Напр. кг" />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim() || !form.shortName.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── SUPPLIERS ─── */
function SuppliersPage({ onBack }: { onBack: () => void }) {
  const { suppliers, addSupplier, updateSupplier, removeSupplier } = useCatalog()
  const [form, setForm] = useState<{
    open: boolean; editing: Supplier | null
    name: string; contactPerson: string; phone: string; email: string; address: string
  }>({ open: false, editing: null, name: '', contactPerson: '', phone: '', email: '', address: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', contactPerson: '', phone: '', email: '', address: '' })
  const openEdit = (s: Supplier) => setForm({ open: true, editing: s, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateSupplier(form.editing.id, form.name.trim(), form.contactPerson, form.phone, form.email, form.address)
    else addSupplier(form.name.trim(), form.contactPerson, form.phone, form.email, form.address)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Постачальники" subtitle={`${suppliers.length} записів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-3 pb-8">
        {suppliers.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Постачальників ще немає</p>
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
                <p className="text-sm font-semibold text-slate-800">{s.name}</p>
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
          <SheetTitle>{form.editing ? 'Редагувати постачальника' : 'Новий постачальник'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва компанії *">
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="ТОВ «Назва»" />
            </Field>
            <Field label="Контактна особа">
              <Input value={form.contactPerson} onChange={v => setForm(f => ({ ...f, contactPerson: v }))} placeholder="Ім'я та прізвище" />
            </Field>
            <Field label="Телефон">
              <Input value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+380" />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="info@company.ua" />
            </Field>
            <Field label="Адреса">
              <Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="вул., місто" />
            </Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
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
  const [form, setForm] = useState<{ open: boolean; editing: ProductStatus | null; name: string; color: string }>
    ({ open: false, editing: null, name: '', color: PRESET_COLORS[0].text })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', color: PRESET_COLORS[0].text })
  const openEdit = (s: ProductStatus) => setForm({ open: true, editing: s, name: s.name, color: s.color })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateStatus(form.editing.id, form.name.trim(), form.color)
    else addStatus(form.name.trim(), form.color)
    close()
  }

  const bgOf = (color: string) => PRESET_COLORS.find(c => c.text === color)?.bg ?? '#f1f5f9'

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Статуси продуктів" subtitle={`${statuses.length} статусів`} onBack={onBack} onAdd={openAdd} />
      <div className="px-4 py-4 space-y-2 pb-8">
        {statuses.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Статусів ще немає</p>
        )}
        {statuses.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5"
            style={{ border: '1px solid rgba(157,200,255,0.25)' }}>
            <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: bgOf(s.color) }}>
              <div className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                {s.name}
                {s.isDefault && (
                  <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium" style={{ background: bgOf(s.color), color: s.color }}>за замовчуванням</span>
                )}
              </p>
              {!s.isDefault && (
                <button onClick={() => setDefaultStatus(s.id)} className="mt-0.5 text-xs text-blue-500 hover:underline">
                  Зробити основним
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
          <SheetTitle>{form.editing ? 'Редагувати статус' : 'Новий статус'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Напр. В архіві" /></Field>
            <Field label="Колір"><ColorPicker value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── CUSTOM FIELDS (системний конструктор для 3 сутностей) ─── */
const ENTITY_TABS: { id: EntityType; label: string }[] = [
  { id: 'material', label: 'Матеріали' },
  { id: 'supplier', label: 'Постачальники' },
  { id: 'product', label: 'Продукти' },
]
const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Текст', number: 'Число', boolean: 'Булеве значення', file: 'Файл(и)', select: 'Список значень',
}
const FIELD_TYPE_OPTIONS: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Текст' },
  { id: 'number', label: 'Число' },
  { id: 'boolean', label: 'Булеве' },
  { id: 'file', label: 'Файл(и)' },
  { id: 'select', label: 'Список' },
]

function FieldDefBody({ d }: { d: CustomFieldDefinition }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        {d.name}
        {d.isRequired && <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium bg-red-50 text-red-500">обов'язкове</span>}
      </p>
      <p className="text-xs text-slate-400">
        {FIELD_TYPE_LABEL[d.fieldType]}
        {d.fieldType === 'select' ? ` · ${d.options.length} значень` : ''}
      </p>
    </div>
  )
}

function CustomFieldsPage({ onBack }: { onBack: () => void }) {
  const [entityType, setEntityType] = useState<EntityType>('material')
  const definitionsQ = useCustomFieldDefinitions(entityType)
  const definitions = definitionsQ.data ?? []
  const { addDefinition, updateDefinition, removeDefinition, addOption, removeOption } = useCustomFieldDefinitionMutations(entityType)

  const [form, setForm] = useState<{ open: boolean; editing: CustomFieldDefinition | null; name: string; fieldType: FieldType; isRequired: boolean }>
    ({ open: false, editing: null, name: '', fieldType: 'text', isRequired: false })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({})

  const openAdd  = () => setForm({ open: true, editing: null, name: '', fieldType: 'text', isRequired: false })
  const openEdit = (d: CustomFieldDefinition) => setForm({ open: true, editing: d, name: d.name, fieldType: d.fieldType, isRequired: d.isRequired })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateDefinition({ id: form.editing.id, name: form.name.trim(), isRequired: form.isRequired })
    else addDefinition({ name: form.name.trim(), fieldType: form.fieldType, isRequired: form.isRequired, position: definitions.length })
    close()
  }

  const addOptionValue = (fieldId: string) => {
    const v = newOptionInputs[fieldId]?.trim()
    if (!v) return
    const def = definitions.find(d => d.id === fieldId)
    addOption({ fieldDefinitionId: fieldId, value: v, position: def?.options.length ?? 0 })
    setNewOptionInputs(p => ({ ...p, [fieldId]: '' }))
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Кастомні поля" subtitle={`${definitions.length} полів`} onBack={onBack} onAdd={openAdd} />

      <div className="px-4 pt-3">
        <div className="flex gap-1.5 rounded-2xl bg-white p-1" style={{ border: '1px solid rgba(157,200,255,0.22)' }}>
          {ENTITY_TABS.map(t => (
            <button key={t.id} onClick={() => { setEntityType(t.id); setExpandedId(null) }}
              className="flex-1 rounded-xl py-2 text-xs font-medium transition-all"
              style={entityType === t.id ? { background: '#1e293b', color: '#fff' } : { color: '#64748b' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 pb-8">
        {definitions.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Кастомних полів ще немає</p>
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
                      <span key={o.id} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs" style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                        {o.value}
                        <button onClick={() => removeOption(o.id)} className="opacity-50 hover:opacity-100 transition-opacity">✕</button>
                      </span>
                    ))}
                    {d.options.length === 0 && <p className="text-xs text-slate-300">Немає значень</p>}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newOptionInputs[d.id] || ''} placeholder="Нове значення…"
                      onChange={e => setNewOptionInputs(p => ({ ...p, [d.id]: e.target.value }))}
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
          <SheetTitle>{form.editing ? 'Редагувати поле' : 'Нове кастомне поле'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва поля">
              <Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Напр. Колір, Термін виготовлення" />
            </Field>
            <Field label="Тип поля">
              {form.editing ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  {FIELD_TYPE_LABEL[form.fieldType]} — тип не можна змінити після створення
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {FIELD_TYPE_OPTIONS.map(t => {
                    const active = form.fieldType === t.id
                    return (
                      <button key={t.id} onClick={() => setForm(f => ({ ...f, fieldType: t.id }))}
                        className="rounded-xl px-3 py-2 text-xs font-medium border transition-all"
                        style={active ? { background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' } : { background: '#eef2ff', color: '#4f46e5', borderColor: 'transparent' }}>
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </Field>
            <label className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 cursor-pointer">
              <span className="text-sm text-slate-600">Обов'язкове поле</span>
              <input type="checkbox" checked={form.isRequired} onChange={e => setForm(f => ({ ...f, isRequired: e.target.checked }))}
                className="h-4 w-4 rounded accent-slate-800" />
            </label>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}

/* ─── WAREHOUSES ─── */
function WarehousesPage({ onBack }: { onBack: () => void }) {
  const { warehouses, addWarehouse, updateWarehouse, removeWarehouse } = useCatalog()
  const [form, setForm] = useState<{ open: boolean; editing: Warehouse | null; name: string; address: string; responsible: string }>
    ({ open: false, editing: null, name: '', address: '', responsible: '' })

  const openAdd  = () => setForm({ open: true, editing: null, name: '', address: '', responsible: '' })
  const openEdit = (w: Warehouse) => setForm({ open: true, editing: w, name: w.name, address: w.address, responsible: w.responsible })
  const close    = () => setForm(f => ({ ...f, open: false }))

  const save = () => {
    if (!form.name.trim()) return
    if (form.editing) updateWarehouse(form.editing.id, form.name.trim(), form.address, form.responsible)
    else addWarehouse(form.name.trim(), form.address, form.responsible)
    close()
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <SubPageHeader title="Склади" subtitle={`${warehouses.length} записів`} onBack={onBack} onAdd={openAdd} />
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
                <p className="text-sm font-semibold text-slate-800">{w.name}</p>
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
          <SheetTitle>{form.editing ? 'Редагувати склад' : 'Новий склад'}</SheetTitle>
          <div className="px-5 space-y-4">
            <Field label="Назва складу"><Input value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Напр. Головний склад" /></Field>
            <Field label="Адреса"><Input value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="вул. Промислова, 12, Київ" /></Field>
            <Field label="Відповідальний"><Input value={form.responsible} onChange={v => setForm(f => ({ ...f, responsible: v }))} placeholder="Ім'я та прізвище" /></Field>
          </div>
          <SheetActions onCancel={close} onSave={save} saveLabel={form.editing ? 'Зберегти' : 'Додати'} disabled={!form.name.trim()} />
        </BottomSheet>
      )}
    </div>
  )
}
