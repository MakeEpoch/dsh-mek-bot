export const TIMELINE_ACTIVATION_CHANNEL = '/mek-timeline'
export const TIMELINE_ACTIVATION_METHOD = 'activation'

export const TIMELINE_CONFLICTS = {
  official: '@deepseek-ai/dsh-timeline',
  standalone: '@magolor/dsh-timeline',
} as const

export type TimelineActivation = 'active' | keyof typeof TIMELINE_CONFLICTS
