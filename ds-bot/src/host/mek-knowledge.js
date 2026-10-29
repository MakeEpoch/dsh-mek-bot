// Explicit project facts supplement existing Bot/group/team memory. Private chat
// is never harvested here; readers must be authorized project members.
import { randomUUID } from 'node:crypto'
import { clone, optionalText, own, refuse, safeText, teamTool, writable } from './mek-safe.js'

export function install(rt) {
  const { state } = rt
  const data = () => {
    if (state.mekKnowledge && state.mekKnowledge.version !== 1) refuse('Project facts were saved by a newer plugin version; update before changing them.')
    return state.mekKnowledge ??= { version: 1, projects: {} }
  }
  const save = () => rt.save({ required: true })
  const project = id => { const item = own(data().projects, id); if (!item) refuse('Project knowledge is unavailable.'); return item }
  const canRead = (item, self) => !self || item.owner === self || item.members.includes(self)
  const canManage = (item, self) => !self || item.owner === self
  const visible = (item, self) => { if (!canRead(item, self)) refuse('This Bot is not a member of the project.'); return item }
  async function action(endpoint, body, self) {
    await rt.load()
    if (endpoint === 'mek-knowledge-list') return rt.mekKnowledgeView(self)
    await writable(rt)
    if (endpoint === 'mek-knowledge-project') {
      // Only the authenticated human channel creates sharing scopes. Bots may
      // propose facts inside existing scopes but cannot grant themselves access.
      if (self) refuse('Only the user can create or change project sharing.')
      const previous = body.id ? project(body.id) : undefined
      const owner = body.owner ?? previous?.owner
      if (!rt.botOf(owner)) refuse('Choose an available project owner Bot.')
      if (!Array.isArray(body.members) || body.members.length > 100 || body.members.some(id => !rt.botOf(id))) refuse('Choose available Bot ids as project members.')
      const item = previous ?? { id: randomUUID(), facts: [], revision: 0, createdAt: Date.now() }
      Object.assign(item, { owner, name: safeText(rt, body.name, 'Project name', 120), members: [...new Set([owner, ...body.members])], updatedAt: Date.now() })
      data().projects[item.id] = item
      await save()
      return clone(item)
    }
    const item = visible(project(body.projectId), self)
    const key = safeText(rt, body.key, 'Fact key', 200)
    const sameKey = item.facts.filter(fact => fact.key === key)
    if (endpoint === 'mek-knowledge-propose') {
      const currentVersion = Math.max(0, ...sameKey.map(fact => fact.version))
      if (body.expectedVersion !== undefined && body.expectedVersion !== currentVersion) refuse('The fact changed since it was read. Read the current versions before updating it.')
      const value = safeText(rt, body.value, 'Fact value', 8000)
      const source = safeText(rt, body.source, 'Fact source', 2000)
      const sourceVersion = optionalText(rt, body.sourceVersion, 'Source version', 200)
      const expiresAt = body.expiresAt ?? null
      if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= 0)) refuse('Fact expiry must be a Unix timestamp in milliseconds or null.')
      const existing = sameKey.find(fact => fact.status !== 'superseded' && fact.value === value && fact.source === source && fact.sourceVersion === sourceVersion && (fact.expiresAt ?? null) === expiresAt)
      if (existing) return clone(existing)
      const disagree = sameKey.filter(fact => fact.status !== 'superseded' && fact.value !== value)
      const fact = { id: randomUUID(), key, value, source, sourceVersion, expiresAt, version: currentVersion + 1, status: disagree.length ? 'conflict' : 'active', author: self ?? 'user', createdAt: Date.now() }
      for (const old of sameKey) {
        if (old.status === 'superseded') continue
        if (disagree.length) old.status = 'conflict'
        else { old.status = 'superseded'; old.supersededBy = fact.id }
      }
      item.facts.push(fact)
      item.revision += 1; item.updatedAt = Date.now()
      await save()
      return clone(fact)
    }
    if (endpoint === 'mek-knowledge-resolve') {
      if (!canManage(item, self)) refuse('Only the project owner or user can resolve conflicting facts.')
      const chosen = sameKey.find(fact => fact.id === body.factId && fact.status !== 'superseded')
      if (!chosen) refuse('Choose an unresolved current fact version.')
      const reason = safeText(rt, body.reason, 'Resolution evidence', 4000)
      for (const fact of sameKey) if (fact.status !== 'superseded') {
        fact.status = fact.id === chosen.id ? 'active' : 'superseded'
        if (fact.id !== chosen.id) fact.supersededBy = chosen.id
      }
      chosen.resolution = { reason, by: self ?? 'user', at: Date.now() }
      item.revision += 1; item.updatedAt = Date.now()
      await save()
      return clone(chosen)
    }
    refuse('Unknown project knowledge action.')
  }
  rt.mekKnowledgeAction = action
  const factView = fact => ({ ...fact, stale: fact.expiresAt !== null && fact.expiresAt !== undefined && fact.expiresAt <= Date.now() })
  rt.mekKnowledgeView = self => clone(Object.values(data().projects).filter(item => canRead(item, self)).map(item => ({ ...item, facts: item.facts.map(factView) })))
  rt.mekProjectFacts = (id, self) => clone(visible(project(id), self).facts.filter(fact => fact.status !== 'superseded').map(factView))
  teamTool(rt, 'read_project_facts', 'Read explicitly shared project facts and their sources. Conflicting versions are unresolved and stale facts need rechecking; do not silently choose one. Existing private Bot memory stays separate.', { projectId: { type: 'string' }, key: { type: 'string' } }, ({ projectId, key }, _exec, self) => projectId ? rt.mekProjectFacts(projectId, self).filter(fact => !key || fact.key === key) : rt.mekKnowledgeView(self).map(({ facts, ...item }) => ({ ...item, factCount: facts.length, conflicts: facts.filter(fact => fact.status === 'conflict').length })))
  teamTool(rt, 'propose_project_fact', 'Save a fact deliberately shared for this project, with its source and version. Never auto-promote a private conversation. A changed value creates a visible conflict until resolved.', {
    projectId: { type: 'string', required: true }, key: { type: 'string', required: true }, value: { type: 'string', required: true }, source: { type: 'string', required: true }, sourceVersion: { type: 'string' }, expectedVersion: { type: 'number' }, expiresAt: { type: 'number', description: 'Optional expiry timestamp in milliseconds; expired facts stay visible and marked stale, never silently reused as current' },
  }, (args, _exec, self) => action('mek-knowledge-propose', args, self))
  teamTool(rt, 'resolve_project_fact', 'As project owner, resolve conflicting facts using explicit evidence. Old versions remain in history; do not guess when sources disagree.', {
    projectId: { type: 'string', required: true }, key: { type: 'string', required: true }, factId: { type: 'string', required: true }, reason: { type: 'string', required: true },
  }, (args, _exec, self) => action('mek-knowledge-resolve', args, self))
}
