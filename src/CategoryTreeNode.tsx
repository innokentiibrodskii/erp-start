import { useLocale } from './LocaleContext'

/** Мінімальна форма категорії, потрібна для побудови дерева — підходить
 *  і для ProductCategory (продукти), і для MaterialCategory (матеріали). */
interface CategoryLike {
  id: string
  name: string
  nameEn: string | null
  parentId: string | null
}

/** Один вузол ієрархічного дерева категорій: клік по рядку — вибір категорії,
 *  клік по шеврону — розгортання/згортання дітей (не впливає на вибір). */
export function CategoryTreeNode<T extends CategoryLike>({ cat, depth, allCats, selectedId, expandedIds, onSelect, onToggleExpand }: {
  cat: T
  depth: number
  allCats: T[]
  selectedId: string | null
  expandedIds: string[]
  onSelect: (id: string) => void
  onToggleExpand: (id: string) => void
}) {
  const { tn } = useLocale()
  const children = allCats.filter(c => c.parentId === cat.id)
  const isExpanded = expandedIds.includes(cat.id)
  const isSelected = selectedId === cat.id

  return (
    <div style={{ marginLeft: depth > 0 ? depth * 16 : 0 }}>
      <div className="flex items-center gap-1 rounded-2xl overflow-hidden"
        style={{ background: isSelected ? '#1e293b' : depth === 0 ? '#f8fafc' : 'white', border: `1px solid ${isSelected ? '#1e293b' : 'rgba(157,200,255,0.25)'}` }}>
        <button onClick={() => onSelect(cat.id)} className="flex-1 flex items-center gap-3 px-4 py-2.5 text-left">
          <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: isSelected ? 'white' : '#cbd5e1' }}>
            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
          </div>
          <span className="text-sm font-medium" style={{ color: isSelected ? 'white' : '#1e293b' }}>{tn(cat.name, cat.nameEn)}</span>
          {children.length > 0 && (
            <span className="ml-auto rounded-full text-[10px] font-bold px-1.5 py-0.5 shrink-0"
              style={{ background: isSelected ? 'rgba(255,255,255,0.2)' : '#e2e8f0', color: isSelected ? 'white' : '#64748b' }}>
              {children.length}
            </span>
          )}
        </button>
        {children.length > 0 && (
          <button onClick={() => onToggleExpand(cat.id)} className="flex h-9 w-9 items-center justify-center shrink-0"
            style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
              <path d="M2.5 4l4 4.5 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
      {isExpanded && children.length > 0 && (
        <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 pl-3" style={{ borderColor: 'rgba(157,200,255,0.3)' }}>
          {children.map(child => (
            <CategoryTreeNode key={child.id} cat={child} depth={depth + 1} allCats={allCats} selectedId={selectedId}
              expandedIds={expandedIds} onSelect={onSelect} onToggleExpand={onToggleExpand} />
          ))}
        </div>
      )}
    </div>
  )
}
