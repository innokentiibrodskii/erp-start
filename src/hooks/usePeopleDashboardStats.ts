import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useActiveOrgId } from '../OrgContext'
import { useEmployees } from './useEmployees'
import { useCatalog } from './useCatalog'
import type { AssignmentStatus } from './useAssignments'

/* ───────────────────────────────────────────────────────────
   Дашборд "Люди": скільки завдань має кожна посада (сума по всіх
   працівниках цієї посади) — і деталізація по кліку: які саме
   працівники, скільки в кожного завдань і як вони розподілені
   по статусах. Рахуємо на клієнті з уже наявних працівників
   (useEmployees) і легкого запиту assignments(assignee_id, status)
   — той самий підхід, що й у useDashboardStats.ts, нових таблиць
   у базі не потрібно.
─────────────────────────────────────────────────────────── */

export const NO_POSITION_ID = '__no_position__'

export interface PositionTaskStat {
  positionId: string
  positionName: string
  positionNameEn: string | null
  taskCount: number
  employeeCount: number
  /** taskCount / максимум серед посад — для ширини бару */
  fraction: number
}

export interface PositionEmployeeStat {
  employeeId: string
  employeeName: string
  taskCount: number
  byStatus: Partial<Record<AssignmentStatus, number>>
}

function useAssignmentAssigneeRows() {
  const orgId = useActiveOrgId()
  return useQuery({
    queryKey: ['dashboard-people-assignments', orgId],
    queryFn: async (): Promise<{ assigneeId: string | null; status: AssignmentStatus }[]> => {
      const { data, error } = await supabase.from('assignments').select('assignee_id, status').eq('organization_id', orgId)
      if (error) throw error
      return data.map((r: { assignee_id: string | null; status: string }) => ({ assigneeId: r.assignee_id, status: r.status as AssignmentStatus }))
    },
  })
}

export function usePositionTaskStats(): { stats: PositionTaskStat[]; totalTasks: number; isLoading: boolean } {
  const employeesQ = useEmployees()
  const { positions, isLoading: positionsLoading } = useCatalog()
  const rowsQ = useAssignmentAssigneeRows()
  const employees = employeesQ.data ?? []
  const rows = rowsQ.data ?? []

  const stats = useMemo(() => {
    const countByEmployee = new Map<string, number>()
    for (const r of rows) {
      if (!r.assigneeId) continue
      countByEmployee.set(r.assigneeId, (countByEmployee.get(r.assigneeId) ?? 0) + 1)
    }
    const byPosition = new Map<string, { name: string; nameEn: string | null; taskCount: number; employeeCount: number }>()
    for (const p of positions) byPosition.set(p.id, { name: p.title, nameEn: p.titleEn, taskCount: 0, employeeCount: 0 })
    let noPositionTaskCount = 0
    let noPositionEmployeeCount = 0
    for (const e of employees) {
      const taskCount = countByEmployee.get(e.id) ?? 0
      const entry = e.positionId ? byPosition.get(e.positionId) : undefined
      if (entry) {
        entry.taskCount += taskCount
        entry.employeeCount += 1
      } else {
        noPositionTaskCount += taskCount
        noPositionEmployeeCount += 1
      }
    }
    const entries = [...byPosition.entries()].map(([id, v]) => ({ positionId: id, positionName: v.name, positionNameEn: v.nameEn, taskCount: v.taskCount, employeeCount: v.employeeCount }))
    if (noPositionEmployeeCount > 0) {
      entries.push({ positionId: NO_POSITION_ID, positionName: 'Без посади', positionNameEn: 'No position', taskCount: noPositionTaskCount, employeeCount: noPositionEmployeeCount })
    }
    const max = Math.max(1, ...entries.map(e => e.taskCount))
    return entries
      .sort((a, b) => b.taskCount - a.taskCount)
      .map(e => ({ ...e, fraction: e.taskCount / max }))
  }, [positions, employees, rows])

  return {
    stats,
    totalTasks: rows.filter(r => r.assigneeId !== null).length,
    isLoading: employeesQ.isLoading || positionsLoading || rowsQ.isLoading,
  }
}

/** Деталізація по кліку на посаду: працівники цієї посади (або без посади,
 *  якщо positionId === NO_POSITION_ID), у кожного — к-сть завдань і розподіл
 *  по статусах. */
export function usePositionEmployeeBreakdown(positionId: string | null): { employees: PositionEmployeeStat[]; isLoading: boolean } {
  const employeesQ = useEmployees()
  const rowsQ = useAssignmentAssigneeRows()
  const employees = employeesQ.data ?? []
  const rows = rowsQ.data ?? []

  const data = useMemo(() => {
    if (positionId === null) return []
    const relevant = employees.filter(e => (positionId === NO_POSITION_ID ? !e.positionId : e.positionId === positionId))
    return relevant
      .map(e => {
        const empRows = rows.filter(r => r.assigneeId === e.id)
        const byStatus: Partial<Record<AssignmentStatus, number>> = {}
        for (const r of empRows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
        return { employeeId: e.id, employeeName: e.fullName, taskCount: empRows.length, byStatus }
      })
      .sort((a, b) => b.taskCount - a.taskCount)
  }, [positionId, employees, rows])

  return { employees: data, isLoading: employeesQ.isLoading || rowsQ.isLoading }
}
