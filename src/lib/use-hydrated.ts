'use client';

import { useSyncExternalStore } from 'react';

/**
 * False during server rendering and hydration, true once React is interactive.
 *
 * Used to keep native form submission disabled until the client handler that
 * calls `preventDefault()` is attached. Combined with `method="post"` this
 * guarantees that a submit before hydration can never put form data (such as a
 * password) into the URL.
 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
