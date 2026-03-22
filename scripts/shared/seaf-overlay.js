(function (global) {
  const ROOT_ID = 'seaf-overlay-root';
  const STYLE_ID = 'seaf-overlay-style';
  const UNREAD_POST_IDS_KEY = 'seaf_unread_post_ids';
  const MAX_VISIBLE_TOASTS = 3;

  const LABELS = {
    testAlert: '\uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
    manghoAlert: 'MANGHO \uAC10\uC9C0',
    justNow: '\uBC29\uAE08 \uD655\uC778',
    newRecruitment: '\uC0C8 \uBAA8\uC9D1\uC744 \uAC10\uC9C0\uD588\uC2B5\uB2C8\uB2E4.',
    join: '\uCC38\uAC00',
    confirm: '\uD655\uC778',
    openPost: '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30',
    close: '\uB2EB\uAE30',
    joining: '\uC5F0\uACB0 \uC911...',
    retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
    joinLinkNotFound: '\uCC38\uAC00 \uB9C1\uD06C\uB97C \uB2E4\uC2DC \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'
  };

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

        .seaf-overlay-toast::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: linear-gradient(180deg, #e8c547, #7abf66);
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

        .seaf-overlay-actions {
          display: flex;
          align-items: stretch;
          gap: 8px;
          flex-wrap: wrap;
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

    async function markPostRead(postId) {
      if (!global.chrome?.storage?.local || !Number.isFinite(Number(postId))) {
        return;
      }

      const normalizedPostId = Number(postId);
      const { [UNREAD_POST_IDS_KEY]: unreadPostIds } = await chrome.storage.local.get([UNREAD_POST_IDS_KEY]);
      const nextIds = (Array.isArray(unreadPostIds) ? unreadPostIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value !== normalizedPostId);

      await chrome.storage.local.set({ [UNREAD_POST_IDS_KEY]: nextIds });
    }

    async function openPost(postUrl, postId) {
      await markPostRead(postId);
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
      toast.classList.remove('seaf-visible');
      global.setTimeout(() => {
        toast.remove();
      }, 180);
    }

    function showOverlay(payload = {}) {
      const root = getRoot();
      const toast = document.createElement('article');
      const isTest = Boolean(payload.isTest);
      const toastDuration = Number(payload.toastDuration) || 10000;
      const sourceLabel = payload.sourceLabel || (isTest ? LABELS.testAlert : LABELS.manghoAlert);

      toast.className = 'seaf-overlay-toast';
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

      const actions = document.createElement('div');
      actions.className = 'seaf-overlay-actions';

      const joinButton = document.createElement('button');
      joinButton.type = 'button';
      joinButton.className = 'seaf-overlay-button';
      joinButton.dataset.kind = 'primary';
      joinButton.textContent = isTest ? LABELS.confirm : LABELS.join;

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'seaf-overlay-button';
      openButton.textContent = LABELS.openPost;

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'seaf-overlay-button';
      closeButton.dataset.kind = 'ghost';
      closeButton.textContent = LABELS.close;

      if (isTest) {
        joinButton.addEventListener('click', () => closeToast(toast));
      } else {
        joinButton.addEventListener('click', async () => {
          joinButton.disabled = true;
          joinButton.textContent = LABELS.joining;

          try {
            const response = await chrome.runtime.sendMessage({
              type: 'JOIN_POST',
              postId: Number(payload.postId)
            });

            if (!response?.success) {
              throw new Error(response?.error || LABELS.joinLinkNotFound);
            }

            await markPostRead(payload.postId);
            if (response.link && response.opened === false) {
              global.location.href = response.link;
            }
            closeToast(toast);
          } catch (error) {
            joinButton.disabled = false;
            joinButton.textContent = LABELS.retry;
          }
        });
      }

      openButton.addEventListener('click', async () => {
        await openPost(payload.postUrl, payload.postId);
        closeToast(toast);
      });

      closeButton.addEventListener('click', () => closeToast(toast));

      actions.append(joinButton);
      if (payload.postUrl && !isTest) {
        actions.append(openButton);
      }
      actions.append(closeButton);

      if (isTest) {
        [...root.querySelectorAll('.seaf-overlay-toast[data-kind="test"]')].forEach((element) => {
          element.remove();
        });
      }

      toast.append(meta, title, actions);
      root.appendChild(toast);
      prune(root);

      global.setTimeout(() => {
        toast.classList.add('seaf-visible');
      }, 10);

      global.setTimeout(() => closeToast(toast), toastDuration);
      return toast;
    }

    return {
      getRoot,
      markPostRead,
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
