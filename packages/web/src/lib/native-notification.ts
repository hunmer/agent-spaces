/**
 * Native notification abstraction layer.
 *
 * - Web: uses the browser Notification API
 * - Tauri: uses @tauri-apps/plugin-notification
 */

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

/** Detect whether we are running inside a Tauri webview. */
export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined"
    && (window.location.hostname === "tauri.localhost" || "__TAURI_INTERNALS__" in window);
}

/** Get the current native notification permission status. */
export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isTauriEnvironment()) {
    return getTauriPermission();
  }
  return getWebPermission();
}

/** Request native notification permission. Returns the resulting status. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isTauriEnvironment()) {
    return requestTauriPermission();
  }
  return requestWebPermission();
}

/** Send a native notification. */
export async function sendNativeNotification(title: string, body: string): Promise<void> {
  if (isTauriEnvironment()) {
    return sendTauriNotification(title, body);
  }
  return sendWebNotification(title, body);
}

// ---------------------------------------------------------------------------
// Web (browser Notification API)
// ---------------------------------------------------------------------------

function getWebPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return mapWebStatus(Notification.permission);
}

async function requestWebPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const result = await Notification.requestPermission();
  return mapWebStatus(result);
}

function sendWebNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  new Notification(title, { body, icon: '/favicon.ico' });
}

function mapWebStatus(permission: NotificationPermission): NotificationPermissionStatus {
  switch (permission) {
    case 'granted': return 'granted';
    case 'denied': return 'denied';
    default: return 'default';
  }
}

// ---------------------------------------------------------------------------
// Tauri (tauri-plugin-notification)
// ---------------------------------------------------------------------------

async function getTauriPermission(): Promise<NotificationPermissionStatus> {
  try {
    const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    const granted = await isPermissionGranted();
    return granted ? 'granted' : 'default';
  } catch {
    return 'unsupported';
  }
}

async function requestTauriPermission(): Promise<NotificationPermissionStatus> {
  try {
    const { requestPermission, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    const permission = await requestPermission();
    if (permission === 'granted' || await isPermissionGranted()) {
      return 'granted';
    }
    return 'denied';
  } catch {
    return 'unsupported';
  }
}

async function sendTauriNotification(title: string, body: string): Promise<void> {
  try {
    const { sendNotification, isPermissionGranted } = await import('@tauri-apps/plugin-notification');
    if (!(await isPermissionGranted())) return;
    sendNotification({ title, body });
  } catch {
    // Tauri plugin not available, fall back silently
  }
}
