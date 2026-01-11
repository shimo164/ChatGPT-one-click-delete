// ChatGPT One-Click Delete Extension
(function() {
  'use strict';

  const isDeleteButton = (element) => {
    const text = element.textContent.toLowerCase();
    const label = element.getAttribute('aria-label')?.toLowerCase() || '';
    return (text.includes('delete') || label.includes('delete')) &&
           !text.includes('cancel');
  };

  const MENU_CONTAINER_SELECTORS = [
    '[role="menu"]',
    '[data-radix-menu-content]',
    '[data-radix-popper-content-wrapper]',
    '[data-headlessui-state="open"]'
  ].join(', ');

  const MENU_ITEM_SELECTORS = [
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[data-radix-menu-item]',
    '[data-radix-collection-item]',
    '[data-headlessui-menu-item]'
  ].join(', ');

  const findDeleteButton = () => {
    const selectors = [
      'button[data-testid="delete-button"]',
      'button[aria-label*="Delete"]',
      'button[class*="delete"]',
      'button, [role="menuitem"], div[role="button"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (isDeleteButton(element)) {
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

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    const rects = element.getClientRects();
    if (rects.length > 0) {
      return true;
    }

    if (style.display === 'contents') {
      return Array.from(element.children).some(isVisible);
    }

    return false;
  };

  const isDisabled = (element) => {
    return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
  };

  let lastMenuTrigger = null;
  let lastMenuTriggerAt = 0;
  const MENU_TRIGGER_TTL_MS = 2000;

  const isMenuTriggerActive = () => {
    if (!lastMenuTrigger) {
      return false;
    }

    if (lastMenuTrigger.getAttribute('aria-expanded') === 'true') {
      return true;
    }

    return Date.now() - lastMenuTriggerAt < MENU_TRIGGER_TTL_MS;
  };

  const findDeleteMenuItem = (allowGlobalFallback) => {
    const menus = Array.from(document.querySelectorAll(
      MENU_CONTAINER_SELECTORS
    )).filter(isVisible);

    if (menus.length > 0) {
      for (const menu of menus) {
        const items = menu.querySelectorAll(
          `${MENU_ITEM_SELECTORS}, button, [role="button"], a, [tabindex]`
        );
        for (const item of items) {
          if (isVisible(item) && !isDisabled(item) && isDeleteButton(item)) {
            return item;
          }
        }
      }
    }

    if (!allowGlobalFallback) {
      return null;
    }

    const globalItems = document.querySelectorAll(MENU_ITEM_SELECTORS);
    for (const item of globalItems) {
      if (isVisible(item) && !isDisabled(item) && isDeleteButton(item)) {
        return item;
      }
    }

    return null;
  };

  const handleDialogAppearance = (node) => {
    const isDialog = node.matches?.('[role="dialog"], [role="alertdialog"], .modal') ||
                    node.querySelector?.('[role="dialog"], [role="alertdialog"], .modal');
    
    if (isDialog) {
      setTimeout(() => {
        const deleteButton = findDeleteButton();
        if (deleteButton) {
          deleteButton.click();
        }
      }, 100);
    }
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          handleDialogAppearance(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[aria-haspopup="menu"]');
    if (!trigger) {
      return;
    }

    lastMenuTrigger = trigger;
    lastMenuTriggerAt = Date.now();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key.toLowerCase() !== 'd') {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const target = event.target;
    if (target && (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA')) {
      return;
    }

    const deleteMenuItem = findDeleteMenuItem(isMenuTriggerActive());
    if (!deleteMenuItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    deleteMenuItem.click();
  }, true);
})();
