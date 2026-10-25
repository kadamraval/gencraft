import { getCurrentWindow } from "@tauri-apps/api/window"

/**
 * The window frame buttons. The desktop window has no frame of its own (decorations are off), so the title bar
 * draws Minimize, Maximize and Close and calls the window here. In a plain browser there is no window to control.
 */

export const inDesktopApp = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function minimizeWindow() {
  if (inDesktopApp()) void getCurrentWindow().minimize()
}

export function toggleMaximizeWindow() {
  if (inDesktopApp()) void getCurrentWindow().toggleMaximize()
}

export function closeWindow() {
  if (inDesktopApp()) void getCurrentWindow().close()
}
