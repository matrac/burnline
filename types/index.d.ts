export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; subject: string; status: TaskStatus }

declare module 'claude-code' {
  interface PluginState {
    'burnline': { limits: Limit[]; tasks: Task[] }
  }
}
