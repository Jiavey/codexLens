import type { SessionsApi } from './shared/sessions'

declare global {
  interface Window {
    sessionsApi: SessionsApi
  }
}

export {}
