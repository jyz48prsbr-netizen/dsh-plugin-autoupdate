/**
 * Host half: a scheduled in-place updater for profile plugins.
 *
 * It ships no Client module. The visible surface is the bundle's row and detail
 * page in Plugins, plus a macOS notification and an NDJSON log under the profile.
 * Updates go through the official `pluginManager` service, so compatibility
 * checks, the profile lock, and rollback-on-failure stay the manager's job.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'plugin-autoupdate'
export const inject = ['pluginManager']

/** This bundle never updates itself: replacing its own package would unload it mid-run. */
const SELF = 'dsh-plugin-autoupdate'

const DEFAULTS = {
  enabled: true,
  autoInstall: true,
  allowPrerelease: false,
  intervalHours: 12,
  initialDelaySeconds: 60,
  /* The market updates itself in place and owns plugin management; the manager must not replace it. */
  exclude: ['dshmarket'],
  notify: true,
}

function profileDirectory() {
  return process.env.DSH_PROFILE_DIR ?? join(homedir(), '.dsh', 'profiles', 'desktop')
}

function logPath() {
  return join(profileDirectory(), '.plugin-autoupdate', 'log.ndjson')
}

function appendLog(record) {
  try {
    const path = logPath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`)
  } catch {
    /* logging never changes the outcome of an update */
  }
}

/** Numeric comparison of `x.y.z[-pre]`; a missing pre-release part sorts higher. */
function compareVersions(left, right) {
  const parse = (value) => {
    const [core, pre = ''] = String(value).split('+')[0].split('-', 2)
    return { core: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  return a.pre > b.pre ? 1 : -1
}

function notify(title, message) {
  if (process.platform !== 'darwin') return
  const quote = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  execFile(
    'osascript',
    ['-e', `display notification ${quote(message)} with title ${quote(title)}`],
    () => {},
  )
}

/**
 * @param ctx - Host context; `pluginManager` is injected by the bundle row.
 * @param config - The row's `config`, every field optional.
 */
export function apply(ctx, config = {}) {
  const options = { ...DEFAULTS, ...config }
  const exclude = [...new Set([...DEFAULTS.exclude, ...(Array.isArray(options.exclude) ? options.exclude.map(String) : [])])]
  let running = false

  async function sweep(reason) {
    if (running) return { skipped: 'busy' }
    running = true
    const startedAt = Date.now()
    const results = []
    const changed = []
    try {
      const bundles = await ctx.pluginManager.listBundles()
      const updateable = bundles.filter((bundle) =>
        bundle?.update === 'registry'
        && bundle.enabled === true
        && bundle.error === undefined
        && typeof bundle.version === 'string'
        && bundle.name !== SELF
        && !exclude.includes(bundle.name))
      for (const bundle of updateable) {
        try {
          const listing = await ctx.pluginManager.listVersions(bundle.name)
          if (listing?.status !== 'listed') {
            results.push({ name: bundle.name, skipped: 'no-versions', reason: listing?.problem ?? listing?.reason })
            continue
          }
          const candidate = listing.versions.find((entry) =>
            entry.incompatible === undefined
            && (options.allowPrerelease || entry.prerelease !== true)
            && compareVersions(entry.version, bundle.version) > 0)
          if (candidate === undefined) {
            results.push({ name: bundle.name, skipped: 'up-to-date', current: bundle.version })
            continue
          }
          if (!options.autoInstall) {
            results.push({ name: bundle.name, current: bundle.version, available: candidate.version, skipped: 'install-disabled' })
            continue
          }
          const outcome = await ctx.pluginManager.updateBundle(bundle.name, candidate.version)
          const result = outcome?.result ?? {}
          const application = result.application
          results.push({
            name: bundle.name,
            from: bundle.version,
            to: candidate.version,
            application,
            ...(application === 'failed' ? { error: result.error?.code ?? 'unknown' } : {}),
          })
          if (application === 'applied' || application === 'restart-required') changed.push(`${bundle.name} ${bundle.version}→${candidate.version}`)
        } catch (error) {
          results.push({ name: bundle.name, skipped: 'failed', error: String(error?.message ?? error) })
        }
      }
    } catch (error) {
      appendLog({ event: 'sweep-failed', reason, error: String(error?.message ?? error) })
      return { failed: String(error?.message ?? error) }
    } finally {
      running = false
    }
    const summary = { event: 'sweep', reason, checked: results.length, changed, results, ms: Date.now() - startedAt }
    appendLog(summary)
    if (changed.length > 0 && options.notify) {
      notify('DSH 插件已更新', `${changed.join('，')}；重启 DSH 后生效。`)
    }
    return summary
  }

  if (options.enabled === false) {
    appendLog({ event: 'disabled' })
    return
  }

  const hours = Math.min(24 * 7, Math.max(1 / 60, Number(options.intervalHours) || DEFAULTS.intervalHours))
  /* Node timers overflow above 2^31-1 ms and silently fire immediately. */
  const interval = Math.min(hours * 3_600_000, 2_147_000_000)
  const initialDelay = Math.max(5, Number(options.initialDelaySeconds) || DEFAULTS.initialDelaySeconds) * 1_000

  ctx.effect(() => {
    const first = setTimeout(() => void sweep('startup'), initialDelay)
    const repeat = setInterval(() => void sweep('schedule'), interval)
    first.unref?.()
    repeat.unref?.()
    return () => {
      clearTimeout(first)
      clearInterval(repeat)
    }
  })

  appendLog({ event: 'armed', intervalHours: options.intervalHours, autoInstall: options.autoInstall, exclude, notify: options.notify })
}
