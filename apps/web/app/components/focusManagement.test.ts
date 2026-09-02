import { describe, expect, it } from 'vitest';
import {
  FOCUSABLE_SELECTOR,
  createFocusRestorer,
  focusAfterItemRemoval,
  focusFirstIn,
  focusRouteMain,
  isFocusableTarget,
  moveFocusIntoModal,
} from './focusManagement';

function target(name: string, options: { disabled?: boolean; tabIndex?: number; ariaHidden?: boolean; ariaDisabled?: boolean; hidden?: boolean } = {}) {
  const calls: Array<FocusOptions | undefined> = [];
  return {
    name,
    disabled: options.disabled,
    tabIndex: options.tabIndex,
    calls,
    focus(focusOptions?: FocusOptions) {
      calls.push(focusOptions);
    },
    getAttribute(attribute: string) {
      if (attribute === 'aria-hidden') return options.ariaHidden ? 'true' : null;
      if (attribute === 'aria-disabled') return options.ariaDisabled ? 'true' : null;
      return null;
    },
    hasAttribute(attribute: string) {
      return attribute === 'hidden' && Boolean(options.hidden);
    },
  };
}

function container(items: ReturnType<typeof target>[]) {
  return {
    selector: '',
    querySelectorAll(selector: string) {
      this.selector = selector;
      return items;
    },
  };
}

describe('focus management utilities', () => {
  it('filters disabled, hidden, aria-disabled, aria-hidden, and tabindex -1 targets', () => {
    expect(isFocusableTarget(target('ok'))).toBe(true);
    expect(isFocusableTarget(target('disabled', { disabled: true }))).toBe(false);
    expect(isFocusableTarget(target('tab-hidden', { tabIndex: -1 }))).toBe(false);
    expect(isFocusableTarget(target('aria-hidden', { ariaHidden: true }))).toBe(false);
    expect(isFocusableTarget(target('aria-disabled', { ariaDisabled: true }))).toBe(false);
    expect(isFocusableTarget(target('hidden', { hidden: true }))).toBe(false);
  });

  it('moves focus to the first usable control inside a container', () => {
    const skipped = target('skipped', { disabled: true });
    const first = target('first');
    const group = container([skipped, first]);

    const focused = focusFirstIn(group);

    expect(group.selector).toBe(FOCUSABLE_SELECTOR);
    expect(focused).toBe(first);
    expect(skipped.calls).toHaveLength(0);
    expect(first.calls).toEqual([{ preventScroll: true }]);
  });

  it('moves focus into a modal and restores the previous trigger on close', () => {
    const trigger = target('open dialog');
    const modalButton = target('close dialog');
    const modal = container([modalButton]);

    const restore = moveFocusIntoModal(modal, { activeElement: trigger });

    expect(modalButton.calls).toEqual([{ preventScroll: true }]);
    const restored = restore();
    expect(restored).toBe(trigger);
    expect(trigger.calls).toEqual([{ preventScroll: true }]);
  });

  it('restores fallback focus when the previous trigger is no longer focusable', () => {
    const removedTrigger = target('removed', { disabled: true });
    const fallback = target('fallback');
    const restore = createFocusRestorer(removedTrigger, fallback);

    const restored = restore();

    expect(restored).toBe(fallback);
    expect(fallback.calls).toEqual([{ preventScroll: true }]);
  });

  it('moves focus predictably after an item is removed', () => {
    const first = target('first');
    const second = target('second');
    const third = target('third');

    const focused = focusAfterItemRemoval([first, second, third], 1);

    expect(focused).toBe(third);
    expect(third.calls).toEqual([{ preventScroll: true }]);
  });

  it('falls back to the previous item or supplied fallback after removal', () => {
    const first = target('first');
    const second = target('second');
    const fallback = target('fallback');

    const focusedPrevious = focusAfterItemRemoval([first, second], 1, fallback);
    const focusedFallback = focusAfterItemRemoval([first], 0, fallback);

    expect(focusedPrevious).toBe(first);
    expect(first.calls).toEqual([{ preventScroll: true }]);
    expect(focusedFallback).toBe(fallback);
    expect(fallback.calls).toEqual([{ preventScroll: true }]);
  });

  it('focuses the shared main-content target for route transitions', () => {
    const main = target('main');
    const focused = focusRouteMain({
      getElementById(id: string) {
        return id === 'main-content' ? main : null;
      },
    });

    expect(focused).toBe(main);
    expect(main.calls).toEqual([{ preventScroll: true }]);
  });
});
