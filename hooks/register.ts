import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Task, TaskStatus } from '../types'

// One plain-text line beside the model selector (the status line renders no markup):
//   5h ▰¦▱▱▱▱ 29% ↻4h10m | 7d ▰▰▰▱▱▱▱¦ 49% ↻1h | 8✓ ●●●◉○○○ +6 11/21
// Bars: share of the 5-hour / 7-day limit used; ¦ marks how much of the window has passed.
// Dots: Claude's task list, done ● / current ◉ / next ○, at most seven around the current one.

const limits = atom({ plugin: 'burnline', key: 'limits' } as const, [])
const tasks = atom({ plugin: 'burnline', key: 'tasks' } as const, [])

// One box per hour of the 5-hour window, one per day of the 7-day window.
const WINDOWS: Record<string, { label: string; ms: number; cells: number }> = {
  five_hour: { label: '5h', ms: 5 * 3600_000, cells: 5 },
  seven_day: { label: '7d', ms: 7 * 86400_000, cells: 7 },
}
const DOTS = 7

const countdown = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}m` : ''}`
  return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`
}

const bar = (size: number, pct: number, elapsed?: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, pct)) / 100) * size)
  const cells = [...'▰'.repeat(filled) + '▱'.repeat(size - filled)]
  if (elapsed !== undefined) cells.splice(Math.round(elapsed * size), 0, '¦')
  return cells.join('')
}

const limitText = (limit: Limit, now: number) => {
  const win = WINDOWS[limit.kind]
  if (!win) return []
  const left = limit.resetsAt ? Date.parse(limit.resetsAt) - now : NaN
  // A remembered window that has reset since shows as fresh until the next reply brings real figures.
  if (left <= 0) return [`${win.label} ${bar(win.cells, 0)} 0%`]
  const known = Number.isFinite(left)
  const elapsed = known ? Math.min(1, Math.max(0, 1 - left / win.ms)) : undefined
  return [`${win.label} ${bar(win.cells, limit.percentUsed, elapsed)} ${Math.round(limit.percentUsed)}%${known ? ` ↻${countdown(left)}` : ''}`]
}

const taskText = (list: Task[]) => {
  if (!list.length) return []
  const done = list.filter(t => t.status === 'completed').length
  const active = list.findIndex(t => t.status === 'in_progress')
  const cur = active >= 0 ? active : list.findIndex(t => t.status !== 'completed')
  const n = Math.min(DOTS, list.length)
  const start = cur < 0 ? list.length - n : Math.max(0, Math.min(cur - Math.floor(DOTS / 2), list.length - n))
  const dots = list.slice(start, start + n)
    .map((t, i) => (t.status === 'completed' ? '●' : start + i === cur ? '◉' : '○')).join('')
  const before = start ? `${start}✓ ` : ''
  const after = list.length > start + n ? ` +${list.length - start - n}` : ''
  return [`${before}${dots}${after} ${done}/${list.length}`]
}

// The line is never blank: with no figures yet it shows empty bars, until a reply has shown
// whether this account has plan limits at all (an API key has none, and then they're dropped).
let replied = false
const PLACEHOLDER = [`5h ${bar(5, 0)} –%`, `7d ${bar(7, 0)} –%`]

async function refresh($: EngineInterface) {
  const now = await $.clock.now()
  const limitParts = (await read($, limits)).flatMap(l => limitText(l, now))
  const parts = [
    ...(limitParts.length || replied ? limitParts : PLACEHOLDER),
    ...taskText(await read($, tasks)),
  ]
  $.ui.status(parts.length ? parts.join(' | ') : undefined)
}

// Usage figures arrive only with a reply, so a new or resumed session starts with none. Limits are per
// account, so the last figures any session saw are remembered across sessions and shown until then.
// Clears first, so an unchanged line still reaches a window that connected after it was set.
async function resend($: EngineInterface) {
  $.ui.status(undefined)
  await refresh($)
}

async function setLimits($: EngineInterface, list: readonly Limit[]) {
  const clean = list.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))
  await update($, limits, () => clean)
  if (clean.length) await $.store.set('limits', clean)
  await refresh($)
}

async function rememberedLimits($: EngineInterface): Promise<Limit[]> {
  const saved = await $.store.get('limits')
  return Array.isArray(saved) ? (saved as Limit[]) : []
}

async function setTasks($: EngineInterface, fn: (list: Task[]) => Task[]) {
  await update($, tasks, fn)
  await refresh($)
}

// Claude's task list arrives two ways: TodoWrite replaces the whole list; TaskUpdate and the
// TaskCreated/TaskCompleted events change one task at a time. Subagents' and teammates' tasks are ignored.
const STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed']
const asStatus = (v: unknown) => ((STATUSES as unknown[]).includes(v) ? (v as TaskStatus) : undefined)
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)

const upsert = (list: Task[], id: string, patch: Partial<Task>): Task[] => {
  // A new plan after a finished one starts a fresh list.
  const base = list.length && list.every(t => t.status === 'completed') && !list.some(t => t.id === id) ? [] : list
  const at = base.findIndex(t => t.id === id)
  if (at < 0) return patch.subject ? [...base, { id, subject: patch.subject, status: patch.status ?? 'pending' }] : base
  return base.map((t, i) => (i === at ? { ...t, ...patch, subject: patch.subject || t.subject } : t))
}

// burnline only watches: if one of its hooks fails, Claude Code carries on as if it weren't there.
const passThrough = ($: unknown, e: any, next: (e: any) => any) => next(e)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(60_000, () => void refresh($)) // keeps the countdowns and pace markers moving
    // The desktop window may connect a moment after the session starts: send the line again then.
    $.clock.after(3_000, () => void resend($))
    try {
      const fresh = (await $.session.usage()).rateLimits
      await setLimits($, fresh.length ? fresh : await rememberedLimits($))
    } catch {
      await refresh($) // no figures to be had: the placeholder still shows
    }

    return next(e)
  }).catch(passThrough)

  // A window connecting later doesn't get a line set before it: send it again.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await resend($)

    return attached
  }).catch(passThrough)

  on('session.measure', async ($, e, next) => {
    replied = true
    if (e.rateLimits.length) await setLimits($, e.rateLimits)
    else await refresh($)

    return next(e)
  }).catch(passThrough)

  // A new prompt clears a finished task list, so the next goal starts clean.
  on('prompt.submit', async ($, e, next) => {
    await setTasks($, list => (list.length && list.every(t => t.status === 'completed') ? [] : list))

    return next(e)
  }).catch(passThrough)

  on('classic.TaskCreated', async ($, e, next) => {
    if (!e.teammate_name) await setTasks($, list => upsert(list, e.task_id, { subject: e.task_subject }))

    return next(e)
  }).catch(passThrough)

  on('classic.TaskCompleted', async ($, e, next) => {
    if (!e.teammate_name) {
      await setTasks($, list => upsert(list, e.task_id, { subject: e.task_subject, status: 'completed' }))
    }

    return next(e)
  }).catch(passThrough)

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId || ran.isError || 'deny' in ran) return ran
    const args = e as unknown as Record<string, unknown>

    if (e.tool === 'TodoWrite' && Array.isArray(args.todos)) {
      const todos = args.todos as Record<string, unknown>[]
      await setTasks($, () => todos.flatMap((t, i) => {
        const subject = str(t.content) ?? str(t.subject)
        return subject ? [{ id: `todo-${i}`, subject, status: asStatus(t.status) ?? 'pending' }] : []
      }))
    } else if (e.tool === 'TaskUpdate') {
      const id = str(args.taskId) ?? str(args.task_id) ?? str(args.id)
      if (id && args.status === 'deleted') await setTasks($, list => list.filter(t => t.id !== id))
      else if (id) await setTasks($, list => upsert(list, id, { subject: str(args.subject) ?? '', status: asStatus(args.status) }))
    }

    return ran
  }).catch(passThrough)
}
