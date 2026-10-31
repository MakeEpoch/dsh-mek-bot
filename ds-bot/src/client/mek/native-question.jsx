import React, { useSyncExternalStore } from 'react'
import { QuestionCard, SettledQuestion } from '../questions.js'

const empty = new Map()
const absent = { subscribe: () => () => {}, getSnapshot: () => empty }
const noCard = { subscribe: () => () => {}, getSnapshot: () => null }

function NativeQuestionCard({ pending }) {
  const snapshot = useSyncExternalStore(pending.subscribe ?? noCard.subscribe, pending.getSnapshot ?? noCard.getSnapshot)
  if (snapshot?.closed) return null
  if (Array.isArray(pending.review)) return pending.questions.map(question => <SettledQuestion key={question.id} question={question} answer={pending.review.find(answer => answer.id === question.id) ?? { selected: [] }} />)
  return <QuestionCard matched={pending} />
}

// Consume the published DSH interaction carrier, including its own answer path.
// It remains independent of Bot ask_user/show_view records and task folding.
export function NativeQuestion({ ctx, sessionId }) {
  const source = ctx.get?.('uiSession')?.sessionStatus ?? absent
  const statuses = useSyncExternalStore(source.subscribe, source.getSnapshot)
  const pending = statuses.get(sessionId)?.pendingInteraction
  if (!pending || !['question', 'plan-review'].includes(pending.kind) || !Array.isArray(pending.questions)) return null
  return <NativeQuestionCard key={`${sessionId}:${pending.key}`} pending={pending} />
}
