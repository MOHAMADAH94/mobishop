import { ChevronDown, Shield } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { cn } from '../../lib/utils'
import type { Role } from '../../types'

const roleLabels: Record<string, string> = {
  owner: 'مالك',
  manager: 'مدير',
  cashier: 'كاشير',
  technician: 'فني صيانة',
}

function roleDisplayName(role: Role): string {
  const name = role.name?.trim()
  if (name && !name.includes('?')) return name
  return roleLabels[role.code] || role.code
}

interface RolePermissionRow {
  role: Role
  permissions: string[]
}

interface Props {
  roles: RolePermissionRow[]
  availablePerms: { code: string; label: string }[]
  permDraft: Record<string, string[]>
  expandedRole: string | null
  permSaving: string | null
  onToggleExpand: (roleCode: string) => void
  onTogglePermission: (roleCode: string, permCode: string) => void
  onSave: (roleCode: string) => void
}

export function RolePermissionsPanel({
  roles,
  availablePerms,
  permDraft,
  expandedRole,
  permSaving,
  onToggleExpand,
  onTogglePermission,
  onSave,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          صلاحيات الأدوار
        </CardTitle>
      </CardHeader>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        اختر دوراً لتعديل صلاحياته. المالك لديه صلاحية كاملة دائماً.
      </p>
      <div className="space-y-2">
        {roles.map(({ role }) => {
          const isOpen = expandedRole === role.code
          const count = (permDraft[role.code] || []).length
          return (
            <div
              key={role.code}
              className="overflow-hidden rounded-xl border border-[var(--border)]"
            >
              <button
                type="button"
                onClick={() => onToggleExpand(role.code)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-right transition-colors',
                  isOpen ? 'bg-[var(--primary)]/10' : 'hover:bg-[var(--bg-muted)]/60',
                )}
              >
                <div className="flex-1">
                  <p className="font-semibold">{roleDisplayName(role)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {count} صلاحية مفعّلة
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 shrink-0 text-[var(--text-muted)] transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
              {isOpen && (
                <div className="border-t border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="mb-4 grid gap-2 sm:grid-cols-2">
                    {availablePerms.map(({ code, label }) => (
                      <label
                        key={code}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)]/60 px-3 py-2 text-sm hover:bg-[var(--bg-muted)]/50"
                      >
                        <input
                          type="checkbox"
                          checked={(permDraft[role.code] || []).includes(code)}
                          onChange={() => onTogglePermission(role.code, code)}
                          className="h-4 w-4 rounded"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    loading={permSaving === role.code}
                    onClick={() => onSave(role.code)}
                  >
                    حفظ صلاحيات {roleDisplayName(role)}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
