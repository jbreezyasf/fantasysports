type FocusTarget = {
  focus: (options?: FocusOptions) => void;
  disabled?: boolean;
  tabIndex?: number;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

type FocusContainer = {
  querySelectorAll: (selector: string) => ArrayLike<FocusTarget>;
};

type FocusDocument = {
  activeElement?: FocusTarget | null;
  getElementById: (id: string) => FocusTarget | null;
};

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[tabindex]',
  '[role="button"]',
  '[role="link"]',
].join(',');

export function isFocusableTarget(target: FocusTarget | null | undefined) {
  if (!target) return false;
  if (target.disabled) return false;
  if (target.tabIndex === -1) return false;
  if (target.getAttribute?.('aria-hidden') === 'true') return false;
  if (target.getAttribute?.('aria-disabled') === 'true') return false;
  if (target.hasAttribute?.('hidden')) return false;
  return typeof target.focus === 'function';
}

export function focusFirstIn(container: FocusContainer, fallback?: FocusTarget | null) {
  const candidates = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
  const first = candidates.find(isFocusableTarget);
  const target = first ?? (isFocusableTarget(fallback) ? fallback : null);
  target?.focus({ preventScroll: true });
  return target;
}

export function createFocusRestorer(previous: FocusTarget | null | undefined, fallback?: FocusTarget | null) {
  return () => {
    const target = isFocusableTarget(previous) ? previous : isFocusableTarget(fallback) ? fallback : null;
    target?.focus({ preventScroll: true });
    return target;
  };
}

export function moveFocusIntoModal(
  modal: FocusContainer,
  documentRef: Pick<FocusDocument, 'activeElement'>,
  fallback?: FocusTarget | null,
) {
  const restore = createFocusRestorer(documentRef.activeElement, fallback);
  focusFirstIn(modal, fallback);
  return restore;
}

export function focusAfterItemRemoval(items: Array<FocusTarget | null | undefined>, removedIndex: number, fallback?: FocusTarget | null) {
  const nextItems = items.filter((_, index) => index !== removedIndex);
  const after = nextItems[removedIndex];
  const before = nextItems[removedIndex - 1];
  const target = [after, before, fallback].find(isFocusableTarget) ?? null;
  target?.focus({ preventScroll: true });
  return target;
}

export function focusRouteMain(documentRef: FocusDocument, targetId = 'main-content') {
  const target = documentRef.getElementById(targetId);
  if (!target || !isFocusableTarget(target)) return null;
  target.focus({ preventScroll: true });
  return target;
}
