import { useEffect, useState } from 'react'
import { UserCog, UserPlus } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { RolePermissionsPanel } from '../../components/team/RolePermissionsPanel'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { extractList } from '../../lib/apiHelpers'
import { PERMISSION_LABELS } from '../../lib/permissions'
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

interface Member {
  id: number
  user: { id: number; username: string; full_name: string; email: string }
  role: Role
  is_active: boolean
}

interface RolePermissionRow {
  role: Role
  permissions: string[]
}

interface PermissionsResponse {
  available_permissions: { code: string; label: string }[]
  roles: RolePermissionRow[]
}

export function TeamPage() {
  const toast = useToastStore((s) => s.add)
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const isOwner = useAuthStore((s) => s.currentStore()?.role?.code === 'owner')
  const [members, setMembers] = useState<Member[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', role_id: '', first_name: '', last_name: '' })
  const [loading, setLoading] = useState(false)
  const [permData, setPermData] = useState<PermissionsResponse | null>(null)
  const [permDraft, setPermDraft] = useState<Record<string, string[]>>({})
  const [permSaving, setPermSaving] = useState<string | null>(null)
  const [expandedRole, setExpandedRole] = useState<string | null>(null)

  const load = () => {
    api
      .get<Member[] | { results: Member[] }>('/stores/members/')
      .then(({ data }) => setMembers(extractList(data)))
      .catch((err) => toast(getErrorMessage(err), 'error'))
  }

  const loadPermissions = () => {
    if (!isOwner) return
    api
      .get<PermissionsResponse>('/stores/role-permissions/')
      .then(({ data }) => {
        setPermData(data)
        const draft: Record<string, string[]> = {}
        data.roles.forEach((r) => {
          draft[r.role.code] = [...r.permissions]
        })
        setPermDraft(draft)
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
  }

  useEffect(() => {
    load()
    api
      .get<Role[] | { results: Role[] }>('/stores/roles/')
      .then(({ data }) => {
        const list = extractList(data)
        setRoles(list)
        const defaultRole = list.find((r) => r.code === 'cashier') || list.find((r) => r.code === 'manager') || list[0]
        if (defaultRole) setForm((f) => ({ ...f, role_id: String(defaultRole.id) }))
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
    loadPermissions()
  }, [isOwner])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/stores/invite/', {
        ...form,
        role_id: parseInt(form.role_id, 10),
      })
      toast('تمت دعوة الموظف', 'success')
      setOpen(false)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const togglePermission = (roleCode: string, permCode: string) => {
    setPermDraft((prev) => {
      const current = prev[roleCode] || []
      const next = current.includes(permCode)
        ? current.filter((p) => p !== permCode)
        : [...current, permCode]
      return { ...prev, [roleCode]: next }
    })
  }

  const saveRolePermissions = async (roleCode: string) => {
    setPermSaving(roleCode)
    try {
      await api.put('/stores/role-permissions/', {
        role_code: roleCode,
        permissions: permDraft[roleCode] || [],
      })
      toast(`تم حفظ صلاحيات ${roleLabels[roleCode] || roleCode}`, 'success')
      loadPermissions()
      await refreshStores()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setPermSaving(null)
    }
  }

  const availablePerms = permData?.available_permissions ?? Object.entries(PERMISSION_LABELS).map(([code, label]) => ({ code, label }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">فريق العمل</h1>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" />
          دعوة موظف
        </Button>
      </div>

      {isOwner && permData && (
        <RolePermissionsPanel
          roles={permData.roles}
          availablePerms={availablePerms}
          permDraft={permDraft}
          expandedRole={expandedRole}
          permSaving={permSaving}
          onToggleExpand={(code) => setExpandedRole((prev) => (prev === code ? null : code))}
          onTogglePermission={togglePermission}
          onSave={saveRolePermissions}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {members.map((m) => (
          <Card key={m.id} className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/20">
              <UserCog className="h-6 w-6 text-[var(--primary)]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{m.user.full_name}</p>
              <p className="text-sm text-[var(--text-muted)]">{m.user.email}</p>
            </div>
            <Badge variant="primary">{roleDisplayName(m.role)}</Badge>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="دعوة موظف">
        <form onSubmit={invite} className="space-y-4">
          <Input label="البريد" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="الاسم الأول" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          <Input label="اسم العائلة" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          <div>
            <label className="text-sm font-medium">الدور</label>
            <select
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
            >
              {roles.filter((r) => r.code !== 'owner').map((r) => (
                <option key={r.id} value={r.id}>{roleDisplayName(r)}</option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={loading} className="w-full">إرسال الدعوة</Button>
        </form>
      </Modal>
    </div>
  )
}
