import { createPortal as platformPortal } from 'react-dom'
import { sceneRoot } from './dom.js'

export const createPortal = (children, _target, key) => {
  const root = sceneRoot()
  return root ? platformPortal(children, root, key) : null
}
