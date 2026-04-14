// fetch-with-timeout.ts
// Wraps fetch() with an AbortController timeout so requests don't hang forever.
// Cloud APIs: 60s timeout. Local models (Ollama/LM Studio): 120s (slower hardware).

const CLOUD_TIMEOUT_MS = 60_000
const LOCAL_TIMEOUT_MS = 120_000

export function fetchWithTimeout(
  url: string,
  options: RequestInit,
  isLocal: boolean = false
): Promise<Response> {
  const timeoutMs = isLocal ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, { ...options, signal: controller.signal })
    .then((response) => {
      clearTimeout(timer)
      return response
    })
    .catch((error) => {
      clearTimeout(timer)
      if (error instanceof DOMException && error.name === 'AbortError') {
        const seconds = Math.round(timeoutMs / 1000)
        throw new Error(
          `Request timed out after ${seconds}s. ${isLocal ? 'Check that your local model server is running and responsive.' : 'The API may be experiencing issues — try again.'}`
        )
      }
      throw error
    })
}
