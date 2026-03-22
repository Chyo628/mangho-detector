const DEFAULT_SETTINGS = {
  isSiteAlertEnabled: true,
  toastDuration: 10
};

const MIN_TOAST_DURATION_SECONDS = 3;
const MAX_TOAST_DURATION_SECONDS = 30;
const ENTRY_TOAST_LIMIT = 3;
const SURFACED_POST_RETENTION_MS = 20 * 60 * 1000;
const MAX_SURFACED_POST_IDS = 200;

const LABELS = {
  manghoAlert: 'MANGHO \uAC10\uC9C0',
  listAlert: '\uBAA9\uB85D \uAC10\uC9C0',
  testAlert: '\uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
  join: '\uCC38\uAC00',
  joining: '\uC5F0\uACB0 \uC911...',
  done: '\uC644\uB8CC',
  failed: '\uC2E4\uD328',
  justNow: '\uBC29\uAE08 \uD655\uC778',
  testOverlayTitle: '\uD14C\uC2A4\uD2B8 \uC624\uBC84\uB808\uC774\uC785\uB2C8\uB2E4.',
  joinLinkNotFound: '\uCC38\uAC00 \uB9C1\uD06C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  contentInitFailed: '[SEAF] \uCF58\uD150\uCE20 \uC2A4\uD06C\uB9BD\uD2B8 \uCD08\uAE30\uD654 \uC2E4\uD328:',
  joinFailed: '[SEAF] \uCC38\uAC00 \uC2E4\uD328:',
  postRequestFailedPrefix: '\uAC8C\uC2DC\uAE00 \uC694\uCCAD \uC2E4\uD328: '
};

const SEAFContent = {
  state: {
    settings: { ...DEFAULT_SETTINGS },
    observer: null,
    listBody: null,
    isManghoFilteredList: false,
    surfacedPostIds: new Map(),
    listenersRegistered: false
  },

  async init() {
    if (!globalThis.SEAFDomain.isHelldiversListUrl(window.location.href)) {
      return;
    }

    await this.loadSettings();
    this.state.listBody = this.getListBody();
    this.state.isManghoFilteredList = this.isManghoFilteredListPage();

    if (!this.state.listBody) {
      return;
    }

    this.registerListeners();
    this.processRows(this.getInitialRows(), {
      surfaceOpenPosts: false,
      toastLimit: ENTRY_TOAST_LIMIT
    });
    this.observeListChanges();
  },

  async loadSettings() {
    const { seaf_settings: savedSettings } = await chrome.storage.local.get(['seaf_settings']);
    this.state.settings = this.normalizeSettings(savedSettings);
  },

  normalizeSettings(savedSettings) {
    const normalizedSettings = { ...DEFAULT_SETTINGS, ...savedSettings };
    const numericToastDuration = Number(normalizedSettings.toastDuration);

    normalizedSettings.toastDuration = Number.isFinite(numericToastDuration)
      ? Math.min(
        MAX_TOAST_DURATION_SECONDS,
        Math.max(MIN_TOAST_DURATION_SECONDS, Math.round(numericToastDuration))
      )
      : DEFAULT_SETTINGS.toastDuration;
    normalizedSettings.isSiteAlertEnabled = Boolean(normalizedSettings.isSiteAlertEnabled);

    return normalizedSettings;
  },

  getListBody() {
    return document.querySelector('tbody.listwrap2');
  },

  isManghoFilteredListPage() {
    const currentUrl = new URL(window.location.href);
    return currentUrl.searchParams.get('search_head') === '60';
  },

  getInitialRows() {
    return [...this.state.listBody.querySelectorAll('.ub-content[data-no]')];
  },

  registerListeners() {
    if (this.state.listenersRegistered) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SEAF_NEW_POST') {
        if (!this.state.settings.isSiteAlertEnabled) {
          return;
        }

        const postId = Number(message.postId);
        if (this.hasSurfacedPost(postId)) {
          return;
        }

        this.markPostSurfaced(postId);

        this.renderOverlay({
          sourceLabel: LABELS.manghoAlert,
          posts: [{
            id: postId,
            title: message.title,
            relativeTime: message.relativeTime,
            postUrl: message.postUrl || this.buildPostUrl(postId),
            toastDuration: message.toastDuration
          }]
        });
        return;
      }

      if (message.type === 'SEAF_JOIN_LINK' && message.link) {
        window.location.href = message.link;
        return;
      }

      if (message.type === 'SEAF_TEST_TOAST') {
        this.renderOverlay({
          sourceLabel: LABELS.testAlert,
          isTest: true,
          posts: [{
            title: message.title || LABELS.testOverlayTitle,
            relativeTime: message.relativeTime || LABELS.justNow,
            postUrl: globalThis.SEAFDomain.constants.MANGHO_LIST_URL,
            toastDuration: message.toastDuration || this.state.settings.toastDuration * 1000
          }]
        });
        sendResponse({ success: true });
        return true;
      }

      return false;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes.seaf_settings) {
        return;
      }

      this.state.settings = this.normalizeSettings(changes.seaf_settings.newValue);
    });

    this.state.listenersRegistered = true;
  },

  observeListChanges() {
    if (!this.state.listBody) {
      return;
    }

    this.state.observer = new MutationObserver((mutations) => {
      const addedRows = this.collectAddedRows(mutations);
      if (addedRows.length === 0) {
        return;
      }

      this.processRows(addedRows, { surfaceOpenPosts: true });
    });

    this.state.observer.observe(this.state.listBody, {
      childList: true
    });
  },

  collectAddedRows(mutations) {
    const seenRows = new Set();
    const rows = [];

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }

        if (node.matches('.ub-content[data-no]')) {
          const rowId = node.getAttribute('data-no');
          if (!seenRows.has(rowId)) {
            seenRows.add(rowId);
            rows.push(node);
          }
          return;
        }

        node.querySelectorAll('.ub-content[data-no]').forEach((row) => {
          const rowId = row.getAttribute('data-no');
          if (seenRows.has(rowId)) {
            return;
          }

          seenRows.add(rowId);
          rows.push(row);
        });
      });
    });

    return rows;
  },

  processRows(rows, options = {}) {
    const { surfaceOpenPosts = false, toastLimit = ENTRY_TOAST_LIMIT } = options;
    const openPostsById = new Map();

    this.pruneSurfacedPostIds();

    rows.forEach((row) => {
      const parsedRow = this.parseRow(row);
      if (!parsedRow) {
        return;
      }

      this.ensureJoinButton(row, parsedRow.titleLink, parsedRow.post.id);

      if (
        surfaceOpenPosts &&
        this.state.settings.isSiteAlertEnabled &&
        globalThis.SEAFDomain.isOpenRecruitment(parsedRow.post) &&
        !this.hasSurfacedPost(parsedRow.post.id)
      ) {
        openPostsById.set(parsedRow.post.id, parsedRow.post);
      }
    });

    if (surfaceOpenPosts && openPostsById.size > 0) {
      this.surfaceOpenPosts([...openPostsById.values()], toastLimit);
    }
  },

  parseRow(row) {
    if (!(row instanceof Element) || !row.matches('.ub-content[data-no]')) {
      return null;
    }

    const rowType = row.getAttribute('data-type') || '';
    if (rowType === 'icon_notice' || rowType === 'icon_fnews') {
      return null;
    }

    const postId = Number(row.getAttribute('data-no'));
    if (!Number.isFinite(postId)) {
      return null;
    }

    const titleCell = row.querySelector('.gall_tit.ub-word, .gall_tit');
    const titleLink = titleCell?.querySelector('a[href]');
    if (!titleLink) {
      return null;
    }

    const title = titleLink.textContent.trim();
    if (!title) {
      return null;
    }

    const subjectCell = row.querySelector('.gall_subject');
    const subject = subjectCell?.textContent.trim() || '';
    if (!this.state.isManghoFilteredList && !globalThis.SEAFDomain.isManghoSubject(subject)) {
      return null;
    }

    const dateCell = row.querySelector('.gall_date');
    const post = globalThis.SEAFDomain.normalizePost(
      {
        id: postId,
        title,
        subject,
        fullDateStr: dateCell?.getAttribute('title') || dateCell?.textContent.trim() || '',
        postUrl: titleLink.href,
        detectedAt: Date.now()
      },
      {
        viewUrlPrefix: globalThis.SEAFDomain.constants.VIEW_URL_PREFIX
      }
    );

    return { post, titleLink };
  },

  ensureJoinButton(row, titleLink, postId) {
    if (row.hasAttribute('data-seaf-processed')) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seaf-inline-join-button';
    button.innerText = LABELS.join;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this.joinPost(postId, button);
    });

    titleLink.after(button);
    row.setAttribute('data-seaf-processed', 'true');
  },

  pruneSurfacedPostIds(currentTime = Date.now()) {
    for (const [postId, surfacedAt] of this.state.surfacedPostIds.entries()) {
      if (!Number.isFinite(surfacedAt) || currentTime - surfacedAt > SURFACED_POST_RETENTION_MS) {
        this.state.surfacedPostIds.delete(postId);
      }
    }

    while (this.state.surfacedPostIds.size > MAX_SURFACED_POST_IDS) {
      const oldestPostId = this.state.surfacedPostIds.keys().next().value;
      if (typeof oldestPostId === 'undefined') {
        break;
      }

      this.state.surfacedPostIds.delete(oldestPostId);
    }
  },

  hasSurfacedPost(postId, currentTime = Date.now()) {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId)) {
      return false;
    }

    this.pruneSurfacedPostIds(currentTime);
    return this.state.surfacedPostIds.has(normalizedPostId);
  },

  markPostSurfaced(postId, surfacedAt = Date.now()) {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId)) {
      return;
    }

    this.pruneSurfacedPostIds(surfacedAt);
    this.state.surfacedPostIds.delete(normalizedPostId);
    this.state.surfacedPostIds.set(normalizedPostId, surfacedAt);
  },

  surfaceOpenPosts(posts, toastLimit) {
    posts
      .sort((left, right) => right.id - left.id)
      .slice(0, toastLimit)
      .forEach((post, index) => {
        this.markPostSurfaced(post.id);
        window.setTimeout(() => {
          this.renderOverlay({
            sourceLabel: LABELS.listAlert,
            posts: [{
              id: post.id,
              title: post.title,
              relativeTime: post.relativeTime || '\uBC29\uAE08 \uAC10\uC9C0',
              postUrl: post.postUrl,
              toastDuration: this.state.settings.toastDuration * 1000
            }]
          });
        }, 250 * index);
      });
  },

  renderOverlay(payload) {
    if (!globalThis.SEAFOverlay?.render) {
      return;
    }

    globalThis.SEAFOverlay.render({
      source: 'list',
      sourceLabel: payload.sourceLabel || LABELS.manghoAlert,
      toastDuration: this.state.settings.toastDuration * 1000,
      isTest: Boolean(payload.isTest),
      posts: Array.isArray(payload.posts) ? payload.posts : []
    });
  },

  async joinPost(postId, button) {
    const originalText = button.innerText;
    button.disabled = true;
    button.innerText = LABELS.joining;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'JOIN_POST',
        postId: Number(postId)
      });

      if (!response?.success) {
        throw new Error(response?.error || LABELS.joinLinkNotFound);
      }

      if (response.link && response.opened === false) {
        window.location.href = response.link;
      }

      button.innerText = LABELS.done;
    } catch (error) {
      try {
        const directLink = await this.extractLobbyLinkDirectly(postId);
        if (!directLink) {
          throw new Error(LABELS.joinLinkNotFound);
        }

        window.location.href = directLink;
        button.innerText = LABELS.done;
      } catch (fallbackError) {
        console.error(LABELS.joinFailed, fallbackError);
        button.innerText = LABELS.failed;
      }
    }

    window.setTimeout(() => {
      button.disabled = false;
      button.innerText = originalText;
    }, 1600);
  },

  async extractLobbyLinkDirectly(postId) {
    const response = await fetch(
      `${globalThis.SEAFDomain.constants.VIEW_URL_PREFIX}${postId}`,
      { cache: 'no-store' }
    );
    if (!response.ok) {
      throw new Error(`${LABELS.postRequestFailedPrefix}${response.status}`);
    }

    const html = await response.text();
    return globalThis.SEAFDomain.extractLobbyLinkFromHtml(html);
  },

  buildPostUrl(postId) {
    return `${globalThis.SEAFDomain.constants.VIEW_URL_PREFIX}${postId}`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SEAFContent;
}

if (!globalThis.__SEAF_DISABLE_AUTO_INIT__) {
  SEAFContent.init().catch((error) => {
    console.error(LABELS.contentInitFailed, error);
  });
}
