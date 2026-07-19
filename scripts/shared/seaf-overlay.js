(function (global) {
  const ROOT_ID = 'seaf-overlay-root';
  const STYLE_ID = 'seaf-overlay-style';
  const MAX_VISIBLE_TOASTS = 3;

  const LABELS = {
    testAlert: '\uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
    manghoAlert: 'MANGHO \uAC10\uC9C0',
    justNow: '\uBC29\uAE08 \uD655\uC778',
    newRecruitment: '\uC0C8 \uBAA8\uC9D1\uC744 \uAC10\uC9C0\uD588\uC2B5\uB2C8\uB2E4.',
    author: '\uC791\uC131\uC790',
    authorNote: '\uC791\uC131\uC790 \uBA54\uBAA8',
    authorNoteFallback: '\uBA54\uBAA8\uAC00 \uC800\uC7A5\uB41C \uAE00\uC4F4\uC774\uC785\uB2C8\uB2E4.',
    bannedAuthor: '\uBC34 \uBAA9\uB85D \uAE00\uC4F4\uC774',
    bannedAuthorWarning: '\uC774 \uAE00\uC4F4\uC774\uB294 \uBC34 \uBAA9\uB85D\uC5D0 \uC788\uC2B5\uB2C8\uB2E4. \uCC38\uAC00 \uC804 \uD655\uC778\uD558\uC138\uC694.',
    join: '\uCC38\uAC00',
    continueJoin: '\uACC4\uC18D \uCC38\uAC00',
    cancel: '\uCDE8\uC18C',
    confirm: '\uD655\uC778',
    openPost: '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30',
    close: '\uB2EB\uAE30',
    joining: '\uC5F0\uACB0 \uC911...',
    retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
    joinLinkNotFound: '\uCC38\uAC00 \uB9C1\uD06C\uB97C \uB2E4\uC2DC \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
    openPostRecovery: '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30\uB85C \uC9C1\uC811 \uD655\uC778\uD574 \uC8FC\uC138\uC694.'
  };

  function getJoinGuardNamespace() {
    if (global.SEAFJoinGuard?.createJoinGuardController) {
      return global.SEAFJoinGuard;
    }

    if (typeof require === 'function') {
      global.SEAFJoinGuard = require('./seaf-join-guard.js');
      return global.SEAFJoinGuard;
    }

    throw new Error('SEAFJoinGuard must be loaded before the overlay script.');
  }

  function createOverlayController() {
    function ensureStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }

      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${ROOT_ID} {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 2147483647;
          width: min(360px, calc(100vw - 24px));
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
          font-family: "Segoe UI Variable", "Segoe UI", sans-serif;
        }

        .seaf-overlay-toast {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(232, 197, 71, 0.45);
          border-radius: 18px;
          padding: 14px 14px 12px;
          background:
            linear-gradient(180deg, rgba(13, 17, 13, 0.96), rgba(8, 11, 8, 0.96)),
            radial-gradient(circle at top right, rgba(232, 197, 71, 0.16), transparent 38%);
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.35);
          color: #f4f1dc;
          opacity: 0;
          transform: translateY(-10px) scale(0.98);
          transition: opacity 180ms ease, transform 180ms ease;
          pointer-events: auto;
          backdrop-filter: blur(10px);
        }

        .seaf-overlay-toast.seaf-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .seaf-overlay-toast.seaf-banned-author {
          border-color: rgba(255, 120, 74, 0.62);
          background:
            linear-gradient(180deg, rgba(25, 9, 8, 0.97), rgba(14, 6, 6, 0.97)),
            radial-gradient(circle at top right, rgba(255, 120, 74, 0.22), transparent 42%);
          box-shadow: 0 24px 56px rgba(60, 10, 4, 0.45);
          color: #ffe7d6;
        }

        .seaf-overlay-toast::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: linear-gradient(180deg, #e8c547, #7abf66);
        }

        .seaf-overlay-toast.seaf-banned-author::before {
          background: linear-gradient(180deg, #ff7a4a, #d94141);
        }

        .seaf-overlay-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          color: rgba(244, 241, 220, 0.75);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .seaf-overlay-badge {
          border: 1px solid rgba(232, 197, 71, 0.38);
          border-radius: 999px;
          padding: 3px 8px;
          color: #e8c547;
          font-weight: 700;
        }

        .seaf-overlay-title {
          margin: 0 0 14px;
          color: #ffffff;
          font-size: 15px;
          line-height: 1.45;
          font-weight: 700;
          word-break: break-word;
        }

        .seaf-overlay-toast.seaf-banned-author .seaf-overlay-title {
          color: #fff3eb;
        }

        .seaf-overlay-author {
          margin: -6px 0 12px;
          display: grid;
          gap: 4px;
        }

        .seaf-overlay-author-label {
          color: rgba(244, 241, 220, 0.74);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .seaf-overlay-author-name {
          color: #f4f1dc;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 600;
          word-break: break-word;
        }

        .seaf-overlay-warning {
          margin: -4px 0 12px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 146, 112, 0.35);
          border-radius: 12px;
          background: rgba(255, 122, 74, 0.12);
          color: #ffe7d6;
          font-size: 12px;
          line-height: 1.5;
          word-break: break-word;
        }

        .seaf-overlay-info {
          margin: -4px 0 12px;
          padding: 10px 12px;
          border: 1px solid rgba(108, 178, 255, 0.4);
          border-radius: 12px;
          background: rgba(54, 132, 218, 0.13);
          color: #e1f0ff;
          font-size: 12px;
          line-height: 1.5;
          word-break: break-word;
        }

        .seaf-overlay-info-label {
          display: block;
          margin-bottom: 3px;
          color: #8fc7ff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .seaf-overlay-info-note {
          margin: 0;
        }

        .seaf-overlay-note {
          margin: -4px 0 12px;
          color: rgba(255, 231, 214, 0.88);
          font-size: 12px;
          line-height: 1.5;
          word-break: break-word;
        }

        .seaf-overlay-toast.seaf-banned-author .seaf-overlay-author-label {
          color: rgba(255, 186, 162, 0.88);
        }

        .seaf-overlay-toast.seaf-banned-author .seaf-overlay-author-name {
          color: #fff3eb;
        }

        .seaf-overlay-actions {
          display: flex;
          align-items: stretch;
          gap: 8px;
          flex-wrap: wrap;
        }

        .seaf-overlay-feedback {
          margin: -4px 0 12px;
          color: rgba(244, 241, 220, 0.78);
          font-size: 12px;
          line-height: 1.45;
        }

        .seaf-overlay-feedback:empty {
          display: none;
        }

        .seaf-overlay-button {
          flex: 1 1 0;
          min-width: 88px;
          border: 1px solid rgba(232, 197, 71, 0.3);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.04);
          color: #f4f1dc;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease, opacity 140ms ease;
        }

        .seaf-overlay-button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(232, 197, 71, 0.62);
          background: rgba(232, 197, 71, 0.08);
        }

        .seaf-overlay-button:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .seaf-overlay-button[data-kind="primary"] {
          background: linear-gradient(180deg, #e8c547, #c9a936);
          border-color: rgba(0, 0, 0, 0.08);
          color: #17160d;
        }

        .seaf-overlay-button[data-kind="primary"]:hover:not(:disabled) {
          background: linear-gradient(180deg, #f1d56d, #dcb945);
        }

        .seaf-overlay-button[data-kind="ghost"] {
          flex: 0 0 auto;
          min-width: 64px;
        }

        .seaf-overlay-button[data-kind="danger"] {
          background: linear-gradient(180deg, #ff916f, #e05a4f);
          border-color: rgba(0, 0, 0, 0.08);
          color: #210b08;
        }

        .seaf-overlay-button[data-kind="danger"]:hover:not(:disabled) {
          background: linear-gradient(180deg, #ffad8f, #ea6d60);
        }

        @media (max-width: 600px) {
          #${ROOT_ID} {
            top: auto;
            right: 12px;
            bottom: 12px;
            width: calc(100vw - 24px);
          }
        }
      `;

      document.documentElement.appendChild(style);
    }

    function getRoot() {
      ensureStyles();

      let root = document.getElementById(ROOT_ID);
      if (!root) {
        root = document.createElement('section');
        root.id = ROOT_ID;
        root.setAttribute('aria-live', 'polite');
        document.documentElement.appendChild(root);
      }

      return root;
    }

    async function openPost(postUrl, postId) {
      if (global.chrome?.runtime?.sendMessage && Number.isFinite(Number(postId))) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'OPEN_POST',
            postId: Number(postId)
          });
          if (response?.success) {
            return true;
          }
        } catch (error) {
          // Fall back to direct open when background routing is unavailable.
        }
      }

      if (postUrl) {
        global.open(postUrl, '_blank', 'noopener,noreferrer');
        return true;
      }

      return false;
    }

    function prune(root) {
      const toasts = [...root.querySelectorAll('.seaf-overlay-toast[data-kind="live"]')];
      const overflow = toasts.length - MAX_VISIBLE_TOASTS;
      if (overflow <= 0) {
        return;
      }

      toasts.slice(0, overflow).forEach((toast) => toast.remove());
    }

    function closeToast(toast) {
      if (toast.__seafAutoCloseId) {
        global.clearTimeout(toast.__seafAutoCloseId);
        toast.__seafAutoCloseId = null;
      }
      toast.classList.remove('seaf-visible');
      global.setTimeout(() => {
        toast.remove();
      }, 180);
    }

    function scheduleAutoClose(toast, duration) {
      if (toast.__seafAutoCloseId) {
        global.clearTimeout(toast.__seafAutoCloseId);
        toast.__seafAutoCloseId = null;
      }

      toast.__seafAutoCloseId = global.setTimeout(() => closeToast(toast), duration);
    }

    function showOverlay(payload = {}) {
      const root = getRoot();
      const toast = document.createElement('article');
      const isTest = Boolean(payload.isTest);
      const isBannedAuthor = Boolean(payload.isBannedAuthor);
      const confirmBannedAuthorJoin = payload.confirmBannedAuthorJoin !== false;
      const toastDuration = Number(payload.toastDuration) || 10000;
      const sourceLabel = payload.sourceLabel || (isTest ? LABELS.testAlert : LABELS.manghoAlert);
      const authorDisplayName = String(
        payload.author?.displayName
        || payload.author?.nickname
        || payload.author?.uid
        || payload.author?.ip
        || ''
      ).trim();
      const authorNote = String(payload.authorNote || (!isBannedAuthor && payload.authorBanNote) || '').trim();
      const hasAuthorNote = Boolean(payload.hasAuthorNote || authorNote);
      const authorBanNote = isBannedAuthor
        ? String(payload.authorBanNote || '').trim()
        : '';
      const joinGuard = getJoinGuardNamespace().createJoinGuardController({
        isBannedAuthor,
        confirmBannedAuthorJoin,
        authorBanNote
      });

      toast.className = 'seaf-overlay-toast';
      if (isBannedAuthor) {
        toast.classList.add('seaf-banned-author');
      } else if (hasAuthorNote) {
        toast.classList.add('seaf-noted-author');
      }
      toast.dataset.kind = isTest ? 'test' : 'live';

      const meta = document.createElement('div');
      meta.className = 'seaf-overlay-meta';

      const source = document.createElement('span');
      source.textContent = sourceLabel;

      const badge = document.createElement('span');
      badge.className = 'seaf-overlay-badge';
      badge.textContent = payload.relativeTime || LABELS.justNow;

      meta.append(source, badge);

      const title = document.createElement('p');
      title.className = 'seaf-overlay-title';
      title.textContent = payload.title || LABELS.newRecruitment;

      let authorBlock = null;
      if (authorDisplayName) {
        authorBlock = document.createElement('div');
        authorBlock.className = 'seaf-overlay-author';

        const authorLabel = document.createElement('span');
        authorLabel.className = 'seaf-overlay-author-label';
        authorLabel.textContent = isBannedAuthor ? LABELS.bannedAuthor : LABELS.author;

        const authorName = document.createElement('span');
        authorName.className = 'seaf-overlay-author-name';
        authorName.textContent = authorDisplayName;

        authorBlock.append(authorLabel, authorName);
      }

      let warningBlock = null;
      if (isBannedAuthor) {
        warningBlock = document.createElement('p');
        warningBlock.className = 'seaf-overlay-warning';
        warningBlock.textContent = LABELS.bannedAuthorWarning;
      }

      let infoBlock = null;
      if (!isBannedAuthor && hasAuthorNote) {
        infoBlock = document.createElement('div');
        infoBlock.className = 'seaf-overlay-info';

        const infoLabel = document.createElement('span');
        infoLabel.className = 'seaf-overlay-info-label';
        infoLabel.textContent = LABELS.authorNote;

        const infoNote = document.createElement('p');
        infoNote.className = 'seaf-overlay-info-note';
        infoNote.textContent = authorNote || LABELS.authorNoteFallback;

        infoBlock.append(infoLabel, infoNote);
      }

      let noteBlock = null;
      if (isBannedAuthor && authorBanNote) {
        noteBlock = document.createElement('p');
        noteBlock.className = 'seaf-overlay-note';
        noteBlock.textContent = authorBanNote;
      }

      const actions = document.createElement('div');
      actions.className = 'seaf-overlay-actions';

      const feedback = document.createElement('p');
      feedback.className = 'seaf-overlay-feedback';
      feedback.setAttribute('role', 'status');

      const joinButton = document.createElement('button');
      joinButton.type = 'button';
      joinButton.className = 'seaf-overlay-button';
      joinButton.dataset.kind = 'primary';
      joinButton.textContent = isTest ? LABELS.confirm : LABELS.join;

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'seaf-overlay-button';
      openButton.textContent = LABELS.openPost;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'seaf-overlay-button';
      cancelButton.dataset.kind = 'danger';
      cancelButton.textContent = LABELS.cancel;
      cancelButton.hidden = true;

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'seaf-overlay-button';
      closeButton.dataset.kind = 'ghost';
      closeButton.textContent = LABELS.close;

      function renderJoinGuardState() {
        const snapshot = joinGuard.getSnapshot();
        const isConfirming = snapshot.phase === getJoinGuardNamespace().PHASES.confirm
          || snapshot.phase === getJoinGuardNamespace().PHASES.error;

        cancelButton.hidden = !isConfirming;
        joinButton.textContent = snapshot.phase === getJoinGuardNamespace().PHASES.confirm
          ? LABELS.continueJoin
          : (snapshot.phase === getJoinGuardNamespace().PHASES.submitting
            ? LABELS.joining
            : (snapshot.phase === getJoinGuardNamespace().PHASES.error
              ? LABELS.retry
              : (isTest ? LABELS.confirm : LABELS.join)));
        joinButton.disabled = snapshot.phase === getJoinGuardNamespace().PHASES.submitting;
        cancelButton.disabled = snapshot.phase === getJoinGuardNamespace().PHASES.submitting;
        toast.dataset.confirmOpen = String(isConfirming);

        if (snapshot.phase === getJoinGuardNamespace().PHASES.error) {
          feedback.textContent = snapshot.errorMessage || LABELS.joinLinkNotFound;
        } else if (!isConfirming) {
          feedback.textContent = '';
        }

        if (isConfirming) {
          scheduleAutoClose(toast, toastDuration + 4000);
        } else if (snapshot.phase !== getJoinGuardNamespace().PHASES.submitting) {
          scheduleAutoClose(toast, toastDuration);
        }
      }

      if (isTest) {
        joinButton.addEventListener('click', () => closeToast(toast));
      } else {
        joinButton.addEventListener('click', async () => {
          const result = joinGuard.requestJoin();
          renderJoinGuardState();
          if (result.action !== 'execute') {
            return;
          }

          try {
            const response = await chrome.runtime.sendMessage({
              type: 'JOIN_POST',
              postId: Number(payload.postId)
            });

            if (!response?.success) {
              throw new Error(response?.error || LABELS.joinLinkNotFound);
            }

            if (response.link && response.opened === false) {
              global.location.href = response.link;
            }
            joinGuard.complete();
            closeToast(toast);
          } catch (error) {
            const reason = String(error?.message || error || LABELS.joinLinkNotFound)
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 140);
            joinGuard.fail(payload.postUrl
              ? `${reason} ${LABELS.openPostRecovery}`
              : reason);
            renderJoinGuardState();
          }
        });
      }

      cancelButton.addEventListener('click', () => {
        joinGuard.cancel();
        renderJoinGuardState();
        joinButton.focus();
      });

      openButton.addEventListener('click', async () => {
        await openPost(payload.postUrl, payload.postId);
        closeToast(toast);
      });

      closeButton.addEventListener('click', () => closeToast(toast));
      toast.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
          return;
        }

        const snapshot = joinGuard.getSnapshot();
        if (snapshot.phase !== getJoinGuardNamespace().PHASES.confirm
          && snapshot.phase !== getJoinGuardNamespace().PHASES.error) {
          return;
        }

        event.preventDefault();
        joinGuard.cancel();
        renderJoinGuardState();
        joinButton.focus();
      });

      actions.append(joinButton);
      actions.append(cancelButton);
      if (payload.postUrl && !isTest) {
        actions.append(openButton);
      }
      actions.append(closeButton);

      if (isTest) {
        [...root.querySelectorAll('.seaf-overlay-toast[data-kind="test"]')].forEach((element) => {
          element.remove();
        });
      }

      toast.append(meta, title);
      if (authorBlock) {
        toast.append(authorBlock);
      }
      if (warningBlock) {
        toast.append(warningBlock);
      }
      if (infoBlock) {
        toast.append(infoBlock);
      }
      if (noteBlock) {
        toast.append(noteBlock);
      }
      toast.append(feedback, actions);
      root.appendChild(toast);
      prune(root);

      global.setTimeout(() => {
        toast.classList.add('seaf-visible');
      }, 10);

      renderJoinGuardState();
      return toast;
    }

    return {
      getRoot,
      openPost,
      showOverlay,
      render(payload = {}) {
        const posts = Array.isArray(payload.posts) && payload.posts.length > 0
          ? payload.posts
          : [payload];

        posts.forEach((post, index) => {
          global.setTimeout(() => {
            showOverlay({
              ...payload,
              ...post,
              postId: Number.isFinite(Number(post?.id)) ? Number(post.id) : payload.postId,
              title: post?.title || payload.title,
              relativeTime: post?.relativeTime || payload.relativeTime,
              postUrl: post?.postUrl || payload.postUrl,
              toastDuration: Number(post?.toastDuration) || Number(payload.toastDuration) || 10000,
              isBannedAuthor: post?.isBannedAuthor ?? payload.isBannedAuthor,
              authorNote: post?.authorNote ?? payload.authorNote,
              hasAuthorNote: post?.hasAuthorNote ?? payload.hasAuthorNote,
              authorBanNote: post?.authorBanNote ?? payload.authorBanNote,
              confirmBannedAuthorJoin: post?.confirmBannedAuthorJoin ?? payload.confirmBannedAuthorJoin,
              isTest: Boolean(payload.isTest)
            });
          }, index * 140);
        });
      }
    };
  }

  let singletonController = null;

  global.SEAFOverlay = {
    createOverlayController,
    getController() {
      singletonController = singletonController || createOverlayController();
      return singletonController;
    },
    render(payload) {
      return this.getController().render(payload);
    },
    showOverlay(payload) {
      return this.getController().showOverlay(payload);
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SEAFOverlay;
  }
})(globalThis);
