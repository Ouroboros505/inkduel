import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`. Phones lock after 30 seconds by default, which dropped a
 * student's connection mid-round while they read the board. Browsers without the Wake Lock API,
 * or that refuse it, simply keep their normal behaviour.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (stopped) void lock.release();
      } catch {
        // denied (low battery, not visible): nothing to do
      }
    };
    // The lock is released whenever the page is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
