// A view of the existing ledger, never another goal or another acceptance record.
export function taskProgress(task, children) {
  const accepted = children.filter(child => child.status === 'completed').length
  const open = children.filter(child => !['completed', 'cancelled'].includes(child.status))
  const phase = task.paused || task.status === 'paused' ? 'paused'
    : task.status === 'cancelled' ? 'cancelled'
      : task.status === 'completed' ? 'completed'
        : open.some(child => ['blocked', 'failed', 'unknown', 'needs_report'].includes(child.status)) ? 'blocked'
          : open.some(child => child.status === 'review') ? 'review'
            : open.some(child => ['running', 'queued', 'dispatching'].includes(child.status)) ? 'running'
              : children.length > 0 && accepted === children.length ? 'final-review'
                : 'waiting'
  return { accepted, total: children.length, phase }
}
