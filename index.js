// Host half of @local/dsh-skill-picker.
// Exposes one read-only RPC channel so the browser can list skills even when the
// session-scoped client catalog is unavailable. Pure read: nothing is written.

const CHANNEL = '/dsh-skill-picker'

function messageOf(error) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

function normalize(skill) {
  return {
    name: String(skill.name ?? ''),
    description: String(skill.description ?? ''),
    whenToUse: typeof skill.whenToUse === 'string' ? skill.whenToUse : undefined,
    modelInvocable: skill.modelInvocable !== false,
  }
}

export function apply(ctx, config) {
  // Optional lookup: the Host owns these services, but a given profile may not mount one of them.
  const service = (name) => {
    try {
      const found = ctx.get(name)
      return found === null ? undefined : found
    } catch {
      return undefined
    }
  }

  ctx.inject(['connection'], (scope) => {
    let connection
    try {
      connection = scope.connection
    } catch {
      connection = undefined
    }
    if (connection === undefined) connection = service('connection')
    if (connection === undefined || connection.rpc === undefined) return

    const dispose = connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
      if (endpoint !== 'list') {
        return { ok: false, error: { code: 'unknown-endpoint', message: `unknown endpoint "${String(endpoint)}"`, details: {} } }
      }
      const sessionId = payload && typeof payload.sessionId === 'string' ? payload.sessionId : ''
      try {
        const catalog = service('sessionSkillCatalog')
        let skills
        if (catalog !== undefined && sessionId !== '') {
          const value = await catalog.list({ sessionId })
          skills = Array.isArray(value?.skills) ? value.skills : []
        } else {
          const registry = service('skills')
          if (registry === undefined) throw new Error('no skill service is mounted in this profile')
          const value = await registry.list({})
          skills = Array.isArray(value) ? value : []
        }
        return { ok: true, value: { skills: skills.map(normalize) } }
      } catch (error) {
        return { ok: false, error: { code: 'list-failed', message: messageOf(error), details: {} } }
      }
    })

    scope.effect(() => dispose, 'dsh-skill-picker: skills RPC channel')
  })
}
