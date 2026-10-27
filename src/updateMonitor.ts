/** Find Vite's entry bundle in a production HTML page without executing it. */
export function entryBundle(html: string, baseUrl: string): string | undefined {
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0]
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!src) continue
    try {
      const base = new URL(baseUrl)
      const url = new URL(src, base)
      if (url.origin === base.origin && /\/assets\/index-[\w-]+\.js$/i.test(url.pathname)) return url.href
    } catch { /* Ignore malformed entry URLs. */ }
  }
  return undefined
}

export function startUpdateMonitor(onAvailable: () => void, isBusy: () => boolean): () => void {
  if (location.protocol !== 'https:') return () => undefined
  const current = entryBundle(document.documentElement.outerHTML, location.href)
  if (!current) return () => undefined
  let running = false
  let stopped = false
  const check = async () => {
    if (running || stopped) return
    running = true
    try {
      const response = await fetch(new URL('/', location.href), { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok || stopped) return
      const next = entryBundle(await response.text(), location.origin + '/')
      if (!next || next === current || stopped) return
      onAvailable()
      const typing = document.activeElement instanceof HTMLElement && (document.activeElement.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName))
      const drafts = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=checkbox]):not([type=radio]),textarea')].some((field) => field.value.trim())
      const playing = [...document.querySelectorAll<HTMLMediaElement>('video,audio')].some((media) => !media.paused && !media.ended)
      const embedded = Boolean(document.querySelector('iframe.media-embed'))
      if (!typing && !drafts && !playing && !embedded && !isBusy()) location.reload()
    } catch { /* Offline or temporarily unavailable; retry on the next check. */ }
    finally { running = false }
  }
  const timer = window.setInterval(() => { void check() }, 60_000)
  const onVisibility = () => { if (document.visibilityState === 'visible') void check() }
  document.addEventListener('visibilitychange', onVisibility)
  void check()
  return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility) }
}
