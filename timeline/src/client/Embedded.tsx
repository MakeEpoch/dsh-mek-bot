import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config } from '../config.ts'
import type { TaskRequester } from './actions.ts'
import { TimelinePanel } from './Panel.tsx'
import { viewStoreOptions } from './store.ts'
import type { ViewState } from './store.ts'

interface EmbeddedProps {
  ctx: Context
  clock: ObservableSnapshot<number>
  settings: ObservableSnapshot<ConfigFormSnapshot<Config>>
  requests: TaskRequester
  t: TranslateNS<'timeline'>
  sessionId: SessionId
}

function useSnapshot<T, R>(source: ObservableSnapshot<T>, select: (snapshot: T) => R): R {
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const snapshot = useCallback(() => source.getSnapshot(), [source])
  return select(useSyncExternalStore(subscribe, snapshot))
}

export function Embedded({ ctx, sessionId, ...props }: EmbeddedProps) {
  const [state, setState] = useState<{ session: SessionFace } | { error: string }>()
  const [attempt, retry] = useState(0)
  useEffect(() => {
    let active = true
    let reference
    try { reference = ctx.sessions.retain(sessionId, { source: 'mekBotTimeline' }) }
    catch (failure) {
      setState({ error: failure instanceof Error ? failure.message : String(failure) })
      return
    }
    void reference.ready.then(({ session }) => {
      if (active) setState({ session })
    }, (failure: Error) => {
      if (active) setState({ error: failure.message })
    })
    return () => { active = false; reference.release() }
  }, [ctx, sessionId, attempt])
  if (!state) return <p role="status">{props.t('loading')}</p>
  if ('error' in state) return <div role="alert"><p>{state.error}</p><button type="button" onClick={() => {
    setState(undefined)
    retry(value => value + 1)
  }}>{ctx.locale.getSnapshot().active.startsWith('zh') ? '重试' : 'Retry'}</button></div>
  return <BoundTimeline ctx={ctx} session={state.session} sessionId={sessionId} {...props} />
}

function BoundTimeline({ ctx, session, sessionId, clock, settings, requests, t }: EmbeddedProps & { session: SessionFace }) {
  const [state, setState] = useState(viewStoreOptions.init)
  const actions = useMemo(() => {
    const change = <A extends unknown[]>(reducer: (draft: ViewState, ...args: A) => void) => (...args: A) =>
      setState(previous => {
        const draft = { ...previous, details: { ...previous.details } }
        reducer(draft, ...args)
        return draft
      })
    return {
      open: change(viewStoreOptions.actions.open),
      forgetTree: change(viewStoreOptions.actions.forgetTree),
      update: change(viewStoreOptions.actions.update),
      draft: change(viewStoreOptions.actions.draft),
      toggle: change(viewStoreOptions.actions.toggle),
    }
  }, [])
  const projection = session.projections.faceOf('timeline')
  return <TimelinePanel
    sessionId={sessionId}
    useProjection={() => useSnapshot(projection, value => value)}
    useSession={select => useSnapshot(session, select)}
    useStore={select => select(state)}
    useClock={select => useSnapshot(clock, select)}
    useLocale={select => useSnapshot(ctx.locale, select)}
    useSettings={select => useSnapshot(settings, select)}
    useSelection={select => select(null)}
    consumeSelection={() => {}}
    t={t}
    actions={actions}
    requestTask={request => requests.send(sessionId, request)}
    setPriority={request => requests.setPriority(sessionId, request)}
    annotate={request => requests.annotate(sessionId, request)}
    importTree={request => requests.importTree(sessionId, request)}
    removeTree={tree => requests.removeTree(sessionId, tree)}
  />
}
