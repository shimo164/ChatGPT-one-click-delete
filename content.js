// ChatGPT One-Click Delete Extension
(function () {
  'use strict';

  const DELETE_KEYWORDS = ['delete', 'remove', 'trash', 'clear', 'erase', '削除', '消去'];
  const CANCEL_KEYWORDS = ['cancel', 'close', 'dismiss', 'キャンセル', '閉じる'];

  const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

  const hasKeyword = (value, keywords) => {
    if (!value) {
      return false;
    }

    return keywords.some((keyword) => value.includes(keyword));
  };

  const getTextCandidates = (element) => ({
    text: normalizeText(element.textContent),
    label: normalizeText(element.getAttribute('aria-label')),
    title: normalizeText(element.getAttribute('title')),
    testId: normalizeText(element.getAttribute('data-testid')),
    name: normalizeText(element.getAttribute('name')),
    dataAction: normalizeText(element.getAttribute('data-action')),
  });

  const isDeleteButton = (element) => {
    const candidates = getTextCandidates(element);
    const isDeleteCandidate = Object.values(candidates).some((value) =>
      hasKeyword(value, DELETE_KEYWORDS),
    );
    if (!isDeleteCandidate) {
      return false;
    }

    const isCancelCandidate = [candidates.text, candidates.label, candidates.title].some(
      (value) => hasKeyword(value, CANCEL_KEYWORDS),
    );
    return !isCancelCandidate;
  };

  const MENU_CONTAINER_SELECTORS = [
    '[role="menu"]',
    '[data-radix-menu-content]',
    '[data-radix-popper-content-wrapper]',
    '[data-headlessui-state="open"]',
    '[data-state="open"][data-radix-menu-content]',
    '[data-slot="dropdown-menu-content"]',
    '[data-slot="dropdown-menu-sub-content"]',
    '[data-slot="context-menu-content"]',
    '[data-slot*="menu-content"]',
    '[data-slot*="popover-content"]',
  ].join(', ');

  const MENU_ITEM_SELECTORS = [
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[data-radix-menu-item]',
    '[data-radix-collection-item]',
    '[data-headlessui-menu-item]',
    '[data-slot="dropdown-menu-item"]',
    '[data-slot="context-menu-item"]',
    '[data-slot*="menu-item"]',
  ].join(', ');

  const GENERIC_ACTIONABLE_SELECTORS =
    'button, [role="button"], [role="option"], a, [tabindex]:not([tabindex="-1"])';
  const MENU_ITEM_IN_MENU_SELECTORS = `${MENU_ITEM_SELECTORS}, ${GENERIC_ACTIONABLE_SELECTORS}`;

  const PRIORITY_MENU_ITEM_SELECTORS = [
    '[data-testid="delete-chat-menu-item"]',
    '[data-testid*="delete"]',
    '[data-color="danger"][role="menuitem"]',
  ];

  const DELETE_BUTTON_SELECTORS = [
    'button[data-testid="delete-button"]',
    'button[aria-label*="Delete"]',
    'button[class*="delete"]',
    'button, [role="menuitem"], div[role="button"]',
  ];
  const DIALOG_SELECTORS = '[role="dialog"], [role="alertdialog"], .modal, [data-slot*="dialog"]';
  const DIALOG_ACTIONABLE_SELECTORS =
    'button, [role="button"], [type="button"], [type="submit"], [tabindex]:not([tabindex="-1"])';

  const EDITABLE_SELECTORS =
    '[contenteditable="true"], [contenteditable="plaintext-only"], textarea, input, [role="textbox"]';

  const findDeleteButton = (root = document) => {
    for (const selector of DELETE_BUTTON_SELECTORS) {
      const elements = root.querySelectorAll(selector);
      for (const element of elements) {
        if (isActionableDeleteCandidate(element)) {
          return element;
        }
      }
    }
    return null;
  };

  const isVisible = (element) => {
    if (!element) {
      return false;
    }

    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    if (style.pointerEvents === 'none') {
      return false;
    }

    if (Number(style.opacity) === 0) {
      return false;
    }

    const rects = element.getClientRects();
    if (rects.length > 0) {
      const hasSize = Array.from(rects).some((rect) => rect.width > 0 && rect.height > 0);
      if (hasSize) {
        return true;
      }
    }

    if (style.display === 'contents') {
      return Array.from(element.children).some(isVisible);
    }

    return false;
  };

  const isEditableContext = (element) => {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    const tagName = element.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
      return true;
    }

    if (element.getAttribute('role') === 'textbox') {
      return true;
    }

    return Boolean(element.closest?.(EDITABLE_SELECTORS));
  };

  const getEventPath = (event) =>
    typeof event.composedPath === 'function' ? event.composedPath() : [];

  const isEditableEvent = (event) => {
    if (isEditableContext(event.target)) {
      return true;
    }

    if (isEditableContext(document.activeElement)) {
      return true;
    }

    return getEventPath(event).some(isEditableContext);
  };

  const isDisabled = (element) => {
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  };

  const isActionableDeleteCandidate = (element) => {
    return isVisible(element) && !isDisabled(element) && isDeleteButton(element);
  };

  let lastMenuTrigger = null;
  let lastMenuTriggerAt = 0;
  const MENU_TRIGGER_TTL_MS = 5000;
  const pendingDialogConfirmations = new WeakSet();

  const isMenuTriggerActive = () => {
    if (!lastMenuTrigger) {
      return false;
    }

    if (lastMenuTrigger.getAttribute('aria-expanded') === 'true') {
      return true;
    }

    return Date.now() - lastMenuTriggerAt < MENU_TRIGGER_TTL_MS;
  };

  const getVisibleMenuContainers = () =>
    Array.from(document.querySelectorAll(MENU_CONTAINER_SELECTORS)).filter(isVisible);

  const hasVisibleMenu = () => getVisibleMenuContainers().length > 0;

  const getViewportDistance = (source, target) => {
    if (!source || !target) {
      return Number.POSITIVE_INFINITY;
    }

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const sourceX = sourceRect.left + sourceRect.width / 2;
    const sourceY = sourceRect.top + sourceRect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    return Math.hypot(sourceX - targetX, sourceY - targetY);
  };

  const getDeleteCandidateScore = (element) => {
    let score = 0;

    if (lastMenuTrigger) {
      score += getViewportDistance(lastMenuTrigger, element);
    }

    if (element.closest(MENU_CONTAINER_SELECTORS)) {
      score -= 2000;
    } else if (element.closest('[data-slot], [data-state="open"], [role="dialog"], [role="listbox"]')) {
      score -= 1000;
    }

    if (element.matches(PRIORITY_MENU_ITEM_SELECTORS.join(', '))) {
      score -= 500;
    }

    return score;
  };

  const findBestDeleteCandidate = (elements, getScore = getDeleteCandidateScore) => {
    let bestCandidate = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const element of elements) {
      if (!isActionableDeleteCandidate(element)) {
        continue;
      }

      const score = getScore(element);
      if (score < bestScore) {
        bestCandidate = element;
        bestScore = score;
      }
    }

    return bestCandidate;
  };

  const findPrioritizedDeleteItem = (root) => {
    for (const selector of PRIORITY_MENU_ITEM_SELECTORS) {
      const candidate = root.querySelector(selector);
      if (candidate && isVisible(candidate) && !isDisabled(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const getDeleteDialogScore = (element) => {
    let score = 0;
    const candidates = getTextCandidates(element);
    const candidateValues = Object.values(candidates);

    if (candidateValues.some((value) => value === 'delete' || value === '削除')) {
      score -= 300;
    }

    if (candidateValues.some((value) => value.includes('delete chat'))) {
      score -= 400;
    }

    if (normalizeText(element.getAttribute('data-color')) === 'danger') {
      score -= 250;
    }

    if (element.matches('button, [type="button"], [type="submit"]')) {
      score -= 100;
    }

    return score;
  };

  const findDeleteButtonInDialog = (dialog) => {
    const prioritizedCandidate = findPrioritizedDeleteItem(dialog);
    if (prioritizedCandidate) {
      return prioritizedCandidate;
    }

    const directCandidate = findDeleteButton(dialog);
    if (directCandidate) {
      return directCandidate;
    }

    return findBestDeleteCandidate(
      dialog.querySelectorAll(DIALOG_ACTIONABLE_SELECTORS),
      getDeleteDialogScore,
    );
  };

  const clickElement = (element) => {
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    element.click();
  };

  const scheduleDialogDeleteConfirmation = (dialog) => {
    if (!dialog?.isConnected) {
      return;
    }

    const tryConfirmDelete = () => {
      if (!dialog.isConnected) {
        return true;
      }

      const deleteButton = findDeleteButtonInDialog(dialog);
      if (!deleteButton) {
        return false;
      }

      clickElement(deleteButton);
      return true;
    };

    if (tryConfirmDelete() || pendingDialogConfirmations.has(dialog)) {
      return;
    }

    pendingDialogConfirmations.add(dialog);

    let frameId = 0;
    let timeoutId = 0;

    const cleanup = () => {
      observer.disconnect();
      pendingDialogConfirmations.delete(dialog);

      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };

    const pumpFrames = (attempt = 0) => {
      if (tryConfirmDelete() || attempt >= 10) {
        cleanup();
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        pumpFrames(attempt + 1);
      });
    };

    const observer = new MutationObserver(() => {
      if (tryConfirmDelete()) {
        cleanup();
      }
    });

    observer.observe(dialog, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'hidden', 'class', 'style', 'data-state', 'disabled', 'aria-disabled'],
    });

    frameId = window.requestAnimationFrame(() => {
      pumpFrames();
    });

    timeoutId = window.setTimeout(() => {
      cleanup();
    }, 2000);
  };

  const findDeleteMenuItem = (allowGlobalFallback) => {
    const menus = getVisibleMenuContainers();

    if (menus.length > 0) {
      for (const menu of menus) {
        const prioritizedCandidate = findPrioritizedDeleteItem(menu);
        if (prioritizedCandidate) {
          return prioritizedCandidate;
        }

        const items = menu.querySelectorAll(MENU_ITEM_IN_MENU_SELECTORS);
        for (const item of items) {
          if (isActionableDeleteCandidate(item)) {
            return item;
          }
        }
      }
    }

    if (!allowGlobalFallback) {
      return null;
    }

    const prioritizedCandidate = findPrioritizedDeleteItem(document);
    if (prioritizedCandidate) {
      return prioritizedCandidate;
    }

    const globalItems = document.querySelectorAll(MENU_ITEM_SELECTORS);
    const globalMenuCandidate = findBestDeleteCandidate(globalItems);
    if (globalMenuCandidate) {
      return globalMenuCandidate;
    }

    return findBestDeleteCandidate(document.querySelectorAll(GENERIC_ACTIONABLE_SELECTORS));
  };

  const handleDialogAppearance = (node) => {
    const dialog =
      node.matches?.(DIALOG_SELECTORS) ? node : node.querySelector?.(DIALOG_SELECTORS);

    if (dialog) {
      scheduleDialogDeleteConfirmation(dialog);
    }
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          handleDialogAppearance(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const handleMenuTriggerClick = (event) => {
    const trigger = event.target.closest?.('[aria-haspopup="menu"]');
    if (!trigger) {
      return;
    }

    lastMenuTrigger = trigger;
    lastMenuTriggerAt = Date.now();
  };

  const handleKeydown = (event) => {
    const isDKey = event.key?.toLowerCase() === 'd' || event.code === 'KeyD';
    if (!isDKey) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const menuIsOpen = hasVisibleMenu();
    if (event.isComposing && !menuIsOpen) {
      return;
    }

    if (!menuIsOpen && event.defaultPrevented) {
      return;
    }

    if (!menuIsOpen && isEditableEvent(event)) {
      return;
    }

    const deleteMenuItem = findDeleteMenuItem(menuIsOpen || isMenuTriggerActive());
    if (!deleteMenuItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    deleteMenuItem.click();
  };

  document.addEventListener('click', handleMenuTriggerClick, true);
  document.addEventListener('keydown', handleKeydown, true);
})();
