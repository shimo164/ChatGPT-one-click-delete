// ChatGPT One-Click Delete Extension
(function() {
  'use strict';

  const isDeleteButton = (element) => {
    const text = element.textContent.toLowerCase();
    const label = element.getAttribute('aria-label')?.toLowerCase() || '';
    return (text.includes('delete') || label.includes('delete')) &&
           !text.includes('cancel');
  };

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
})();
