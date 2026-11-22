import { createPortal as platformPortal } from 'react-dom'
import { sceneRoot } from './dom.js'

export const createPortal = (children, target, key) => {
  const root = sceneRoot()
  if (!root) return null
  // Transcript status rows and other local outlets must keep their target.
  // Only a portal aimed outside this scene needs redirecting to its root.
  const local = target && (root.contains(target) || (target.host && root.contains(target.host)))
  return platformPortal(children, local ? target : root, key)
}
