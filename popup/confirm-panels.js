(function initializeSEAFPopupConfirmPanels(global) {
  'use strict';

  function createConfirmPanels({ labels, joinGuardModule }) {
    if (!joinGuardModule?.createJoinGuardController) {
      throw new Error('A shared join guard module is required.');
    }

    const joinGuards = new WeakMap();

    function getJoinGuard(card, options) {
      let joinGuard = joinGuards.get(card);
      if (!joinGuard) {
        joinGuard = joinGuardModule.createJoinGuardController(options);
        joinGuards.set(card, joinGuard);
      } else {
        joinGuard.sync(options);
      }
      return joinGuard;
    }

    function createPanel(kind, ariaLabel) {
      const panel = document.createElement('div');
      panel.className = 'seaf-inline-confirm-panel';
      panel.dataset.confirmKind = kind;
      panel.id = `seaf-popup-${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', ariaLabel);
      return panel;
    }

    function connectTrigger(triggerButton, panel) {
      triggerButton.setAttribute('aria-expanded', 'true');
      triggerButton.setAttribute('aria-controls', panel.id);
    }

    function disconnectTrigger(triggerButton) {
      triggerButton.setAttribute('aria-expanded', 'false');
      triggerButton.removeAttribute('aria-controls');
    }

    function renderBannedJoinConfirmation({
      card,
      triggerButton,
      note,
      joinGuard,
      onContinue
    }) {
      const existingPanel = card.querySelector('[data-confirm-kind="join"]');
      if (existingPanel) {
        existingPanel.querySelector('[data-action="join-confirm-cancel"]')?.focus();
        return existingPanel;
      }

      const panel = createPanel('join', '밴 글쓴이 참가 확인');
      const message = document.createElement('p');
      message.className = 'seaf-inline-confirm-message';
      message.textContent = note
        ? `${labels.authorBanJoinWarning}\n메모: ${note}`
        : labels.authorBanJoinWarning;

      const actions = document.createElement('div');
      actions.className = 'seaf-inline-confirm-actions';
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'seaf-secondary-button';
      cancelButton.dataset.action = 'join-confirm-cancel';
      cancelButton.textContent = labels.authorBanCancel;
      const continueButton = document.createElement('button');
      continueButton.type = 'button';
      continueButton.className = 'seaf-action-button seaf-danger-button';
      continueButton.dataset.action = 'join-confirm-continue';
      continueButton.textContent = labels.authorBanContinueJoin;

      const closePanel = () => {
        panel.remove();
        disconnectTrigger(triggerButton);
      };
      cancelButton.addEventListener('click', () => {
        joinGuard.cancel();
        closePanel();
        triggerButton.focus();
      });
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelButton.click();
        }
      });
      continueButton.addEventListener('click', async () => {
        const result = joinGuard.requestJoin();
        if (result.action !== 'execute') {
          return;
        }
        continueButton.disabled = true;
        cancelButton.disabled = true;
        closePanel();
        try {
          const completed = await onContinue();
          if (completed === false) {
            joinGuard.fail();
          } else {
            joinGuard.complete();
          }
        } catch (error) {
          joinGuard.fail(error?.message || error);
          throw error;
        }
      });

      actions.append(cancelButton, continueButton);
      panel.append(message, actions);
      card.querySelector('.seaf-post-actions')?.before(panel);
      connectTrigger(triggerButton, panel);
      cancelButton.focus();
      return panel;
    }

    async function requestBannedJoin({
      card,
      triggerButton,
      note = '',
      isBannedAuthor = true,
      confirmBannedAuthorJoin = true,
      onContinue
    }) {
      const options = {
        isBannedAuthor,
        confirmBannedAuthorJoin,
        authorBanNote: note
      };
      const joinGuard = getJoinGuard(card, options);
      const existingPanel = card.querySelector('[data-confirm-kind="join"]');
      if (existingPanel) {
        existingPanel.querySelector('[data-action="join-confirm-cancel"]')?.focus();
        return { action: 'confirm', snapshot: joinGuard.getSnapshot() };
      }

      const result = joinGuard.requestJoin();
      if (result.action === 'confirm') {
        renderBannedJoinConfirmation({
          card,
          triggerButton,
          note,
          joinGuard,
          onContinue
        });
        return result;
      }

      if (result.action !== 'execute') {
        return result;
      }

      try {
        const completed = await onContinue();
        if (completed === false) {
          joinGuard.fail();
        } else {
          joinGuard.complete();
        }
        return { action: 'execute', completed, snapshot: joinGuard.getSnapshot() };
      } catch (error) {
        joinGuard.fail(error?.message || error);
        throw error;
      }
    }

    function renderAuthorBanRemovalChoices({
      authorRow,
      triggerButton,
      summary,
      onRemove
    }) {
      const card = authorRow.closest('.seaf-post-card, .seaf-history-card');
      if (!card) {
        return null;
      }

      const existingPanel = card.querySelector('[data-confirm-kind="author-unban"]');
      if (existingPanel) {
        existingPanel.querySelector('[data-action="author-unban-cancel"]')?.focus();
        return existingPanel;
      }

      const panel = createPanel('author-unban', '겹치는 밴 규칙 해제');
      const message = document.createElement('p');
      message.className = 'seaf-inline-confirm-message';
      message.textContent = `${labels.authorBanMultipleMatches} (${summary.matchingEntries.length}개)`;

      const actions = document.createElement('div');
      actions.className = 'seaf-inline-confirm-actions';
      const primaryButton = document.createElement('button');
      primaryButton.type = 'button';
      primaryButton.className = 'seaf-secondary-button';
      primaryButton.dataset.action = 'author-unban-primary';
      primaryButton.textContent = labels.authorBanRemovePrimary;
      const allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.className = 'seaf-secondary-button seaf-danger-button';
      allButton.dataset.action = 'author-unban-all';
      allButton.textContent = `${labels.authorBanRemoveAll} (${summary.matchingEntries.length})`;
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'seaf-secondary-button';
      cancelButton.dataset.action = 'author-unban-cancel';
      cancelButton.textContent = labels.authorBanCancel;

      const closePanel = () => {
        panel.remove();
        disconnectTrigger(triggerButton);
      };
      primaryButton.addEventListener('click', async () => {
        closePanel();
        await onRemove('primary');
      });
      allButton.addEventListener('click', async () => {
        closePanel();
        await onRemove('all');
      });
      cancelButton.addEventListener('click', () => {
        closePanel();
        triggerButton.focus();
      });
      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelButton.click();
        }
      });

      actions.append(primaryButton, allButton, cancelButton);
      panel.append(message, actions);
      authorRow.after(panel);
      connectTrigger(triggerButton, panel);
      cancelButton.focus();
      return panel;
    }

    return {
      requestBannedJoin,
      renderBannedJoinConfirmation,
      renderAuthorBanRemovalChoices
    };
  }

  const exported = { createConfirmPanels };
  global.SEAFPopupConfirmPanels = exported;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
