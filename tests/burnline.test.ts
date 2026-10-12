import { expect, mock, test } from 'claude-code/testing'

// Answers the engine nouns beneath the mod and records the last status line it set.
const harness = (on: any) => {
  const seen = { line: undefined as string | undefined }
  mock.clock(on, { now: Date.parse('2026-10-03T10:00:00Z') })
  on('ui.status', (_$: unknown, e: { text?: string }) => ((seen.line = e.text), { value: undefined }))
  on('tool.call', () => ({ result: 'ok' }))
  on('classic.TaskCreated', () => ({}))
  on('classic.TaskCompleted', () => ({}))
  return seen
}

test('task dots: window of seven around the current task, counts on both sides', async ($, on) => {
  const seen = harness(on)
  const classic = $.classic as any
  for (let i = 1; i <= 21; i++) await classic.TaskCreated({ task_id: String(i), task_subject: `Step ${i}` })
  for (let i = 1; i <= 11; i++) await classic.TaskCompleted({ task_id: String(i), task_subject: `Step ${i}` })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '12', status: 'in_progress' } as any)
  expect(seen.line).toBe('8✓ ●●●◉○○○ +6 11/21')

  await $.tool.call({ tool: 'TaskUpdate', taskId: '21', status: 'deleted' } as any)
  expect(seen.line).toBe('8✓ ●●●◉○○○ +5 11/20')
})

test('a finished list is replaced by the next plan', async ($, on) => {
  const seen = harness(on)
  const classic = $.classic as any
  await classic.TaskCreated({ task_id: '1', task_subject: 'Only task' })
  expect(seen.line).toBe('◉ 0/1')
  await classic.TaskCompleted({ task_id: '1', task_subject: 'Only task' })
  expect(seen.line).toBe('● 1/1')
  await classic.TaskCreated({ task_id: '2', task_subject: 'Next goal' })
  expect(seen.line).toBe('◉ 0/1')
})
