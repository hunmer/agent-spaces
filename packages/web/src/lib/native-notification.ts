/**
 * Native notification abstraction layer.
 *
 * - Web: uses the browser Notification API
 * - Flutter: uses __flutterBridge.invoke('sendNotification')
 */

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

const ANDROID_ONGOING_TASK_NOTIFICATION_ID = 10001;

interface NativeNotificationOptions {
  id?: number;
  ongoing?: boolean;
}

/** Detect whether we are running inside a Flutter webview. */
export function isFlutterEnvironment(): boolean {
  return typeof window !== "undefined" && "__FLUTTER_INTERNALS__" in window;
}

/** Detect whether we are running inside a native webview. */
export function isNativeEnvironment(): boolean {
  return isFlutterEnvironment();
}

/** Detect whether we are running inside the Android native webview. */
export function isNativeAndroidEnvironment(): boolean {
  return isFlutterEnvironment()
    && typeof navigator !== 'undefined'
    && /android/i.test(navigator.userAgent);
}

/** @deprecated Use isFlutterEnvironment or isNativeEnvironment */
export function isTauriEnvironment(): boolean {
  return false;
}

/** @deprecated Use isNativeAndroidEnvironment */
export function isTauriAndroidEnvironment(): boolean {
  return isNativeAndroidEnvironment();
}

/** Get the current native notification permission status. */
export async function getNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isFlutterEnvironment()) {
    return getFlutterPermission();
  }
  return getWebPermission();
}

/** Request native notification permission. Returns the resulting status. */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (isFlutterEnvironment()) {
    return requestFlutterPermission();
  }
  return requestWebPermission();
}

/** Send a native notification. */
export async function sendNativeNotification(title: string, body: string, options: NativeNotificationOptions = {}): Promise<void> {
  if (isFlutterEnvironment()) {
    return sendFlutterNotification(title, body, options);
  }
  return sendWebNotification(title, body);
}

/** Update the Android ongoing workflow notification by reusing a stable notification id. */
export async function sendAndroidOngoingWorkflowNotification(body: string): Promise<void> {
  if (!isNativeAndroidEnvironment()) return;
  return sendNativeNotification('Agent Spaces', body, {
    id: ANDROID_ONGOING_TASK_NOTIFICATION_ID,
    ongoing: true,
  });
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
  if (typeof window === 'undefined' || !('Notification' in window)) {
    throw new Error('Notification API not available');
  }
  if (Notification.permission !== 'granted') {
    throw new Error(`Notification permission is "${Notification.permission}", not "granted"`);
  }
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico' });
    n.onerror = () => {
      console.warn('[NativeNotification] browser notification error event');
    };
  } catch (err) {
    throw new Error(`Failed to create Notification: ${err instanceof Error ? err.message : err}`);
  }
}

function mapWebStatus(permission: NotificationPermission): NotificationPermissionStatus {
  switch (permission) {
    case 'granted': return 'granted';
    case 'denied': return 'denied';
    default: return 'default';
  }
}

// ---------------------------------------------------------------------------
// Flutter (flutter_inappwebview JS Bridge)
// ---------------------------------------------------------------------------

type FlutterBridge = { invoke: (method: string, args: unknown) => Promise<unknown> };

function getBridge(): FlutterBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { __flutterBridge?: FlutterBridge }).__flutterBridge ?? null;
}

async function getFlutterPermission(): Promise<NotificationPermissionStatus> {
  try {
    const bridge = getBridge();
    if (!bridge) return 'unsupported';
    const result = await bridge.invoke('getNotificationPermission', null);
    return result === true ? 'granted' : 'default';
  } catch {
    return 'unsupported';
  }
}

async function requestFlutterPermission(): Promise<NotificationPermissionStatus> {
  try {
    const bridge = getBridge();
    if (!bridge) return 'unsupported';
    const result = await bridge.invoke('requestNotificationPermission', null);
    return result === true ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

async function sendFlutterNotification(title: string, body: string, options: NativeNotificationOptions): Promise<void> {
  try {
    const bridge = getBridge();
    if (!bridge) return;
    await bridge.invoke('sendNotification', { title, body, ...options });
  } catch {
    // Flutter bridge not available
  }
}
