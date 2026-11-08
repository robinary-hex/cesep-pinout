/// <reference types="vite/client" />
import type { PinoutApi } from '../electron/api'

declare global {
  interface Window {
    /** Pont IPC exposé par electron/preload.ts. */
    pinout: PinoutApi
  }
}

export {}
