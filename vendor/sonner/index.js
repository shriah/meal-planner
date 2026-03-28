'use client';

import * as React from 'react';

const listeners = new Set();
let nextToastId = 1;
let toastState = [];

function emit() {
  for (const listener of listeners) {
    listener(toastState);
  }
}

function subscribe(listener) {
  listeners.add(listener);
  listener(toastState);

  return () => {
    listeners.delete(listener);
  };
}

function pushToast(type, message) {
  const toast = {
    id: nextToastId++,
    type,
    message,
  };

  toastState = [...toastState, toast];
  emit();
  return toast.id;
}

export const toast = {
  error(message) {
    return pushToast('error', message);
  },
};

export function Toaster() {
  const [toasts, setToasts] = React.useState(toastState);

  React.useEffect(() => subscribe(setToasts), []);

  if (toasts.length === 0) {
    return null;
  }

  return React.createElement(
    'div',
    {
      'aria-live': 'polite',
      className:
        'pointer-events-none fixed top-4 right-4 z-[100] flex max-w-sm flex-col gap-2',
    },
    toasts.map((item) =>
      React.createElement(
        'div',
        {
          key: item.id,
          className:
            item.type === 'error'
              ? 'rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-foreground shadow-lg'
              : 'rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-lg',
          role: 'status',
        },
        item.message,
      ),
    ),
  );
}
