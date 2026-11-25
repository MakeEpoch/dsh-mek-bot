import type { Session } from '@deepseek-ai/dsh-session/types'
import { taskId, treeId } from './records.ts'
import type { Task } from './records.ts'
import type { TimelineStorage } from './storage.ts'
import { patchTasks } from './tasks.ts'

export interface GroupPlan {
  id: string
  title: string
  description: string
  status: Task['status']
  note: string
  details: string
}

/** Upsert the same task in the normal Timeline projection and Session log. */
export function publishGroupPlan(storage: TimelineStorage, session: Session, plan: GroupPlan): Promise<void> {
  const id = treeId.parse(`mek-group-${plan.id}`)
  const itemId = taskId.parse('assignment')
  return storage.append(session, 'plugin:timeline/tree', state => {
    const tree = state.view.trees.find(item => item.id === id)
    const previous = tree?.tasks.find(item => item.id === itemId)
    const { title, description, status, note, details } = plan
    if (previous?.title === title && previous.description === description && previous.status === status
      && previous.note === note && previous.details === details) return
    const at = Date.now()
    const tasks = patchTasks(tree?.tasks ?? [], [{
      id: itemId, title, description, status, note, details,
      done: [status === 'done' ? 1 : 0, 1], remaining: status === 'done' ? 0 : null,
    }], at, Math.max(1, tree?.tasks.length ?? 0) + (tree && !previous ? 1 : 0))
    return {
      version: 1, sessionId: session.id, callId: id,
      tree: { id, title, description, tasks, createdAt: tree?.createdAt ?? at, lastTaskUpdate: at },
    }
  })
}
