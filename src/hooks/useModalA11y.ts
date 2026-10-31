import { useEffect, RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Keyboard and screen-reader behaviour shared by every modal dialog.
 *
 * - Escape closes the dialog.
 * - Tab / Shift+Tab cycle inside the dialog instead of leaking to the page behind.
 * - Focus moves into the dialog on open and returns to the trigger on close.
 * - The page behind cannot scroll while the dialog is open.
 *
 * Attach `ref` to the dialog panel (not the backdrop) and spread the returned
 * ARIA props onto the same element.
 */
export function useModalA11y<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
  isOpen = true
): { role: 'dialog'; 'aria-modal': true; tabIndex: -1 } {
  useEffect(() => {
    if (!isOpen) return;

    const container = ref.current;
    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const focusable = (): HTMLElement[] => {
      if (!container) return [];
      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && (element.offsetParent !== null || element === document.activeElement)
      );
    };

    const firstFocusable = focusable()[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else if (container) {
      container.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = bodyOverflow;
      previouslyFocused?.focus?.();
    };
  }, [ref, onClose, isOpen]);

  return { role: 'dialog', 'aria-modal': true, tabIndex: -1 };
}
