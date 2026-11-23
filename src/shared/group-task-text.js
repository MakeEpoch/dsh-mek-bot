export function isGroupAcknowledgement(text) {
  return /^\s*(?:\[\s*pass\s*\]|pass|收到|明白|好的|了解|acknowledged|got it|understood)[.。!！]?\s*$/i.test(text ?? '')
}

// Older builds published this maintenance message as a normal group post.
export function isLegacyTaskReminder(text) {
  const body = (text ?? '').replace(/^\[Group post from [^\]\n]+\][ \t]*\r?\n/, '').trim()
  return /^Task [\da-f-]{36} has had no closable state for \d+ min[:.]/i.test(body)
    && body.endsWith('The group administrator owns this task; this notice does not call any member or start new work.')
}
