export function watchProjectView(projectSlug: string, onError: (cause: unknown) => void): () => void {
  let controller = new AbortController()

  async function connect(signal: AbortSignal): Promise<void> {
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectSlug)}/watch`, {
        signal,
      })
      if (!response.ok) throw new Error(`Project watcher request failed: ${await response.text()}`)
      if (!response.body) throw new Error('Project watcher response has no body.')
      const reader = response.body.getReader()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error('Project watcher connection closed.')
        }
      } finally {
        reader.releaseLock()
      }
    } catch (cause) {
      if (!signal.aborted) onError(cause)
    }
  }

  function start(): void {
    controller.abort()
    controller = new AbortController()
    void connect(controller.signal)
  }

  function stop(): void {
    controller.abort()
  }

  start()
  window.addEventListener('pagehide', stop)
  window.addEventListener('pageshow', start)
  return () => {
    window.removeEventListener('pagehide', stop)
    window.removeEventListener('pageshow', start)
    stop()
  }
}
