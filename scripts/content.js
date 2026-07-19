const DEFAULT_SETTINGS = {
  isSiteAlertEnabled: true,
  toastDuration: 10,
  authorRecords: [],
  authorBanEntries: [],
  authorBanOverlayMode: 'warn',
  confirmBannedAuthorJoin: true
};

const MIN_TOAST_DURATION_SECONDS = 3;
const MAX_TOAST_DURATION_SECONDS = 30;
const FETCH_TIMEOUT_MS = 10000;
const ENTRY_TOAST_LIMIT = 3;
const SURFACED_POST_RETENTION_MS = 20 * 60 * 1000;
const MAX_SURFACED_POST_IDS = 200;

const LABELS = {
  manghoAlert: 'MANGHO \uAC10\uC9C0',
  listAlert: '\uBAA9\uB85D \uAC10\uC9C0',
  testAlert: '\uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
  join: '\uCC38\uAC00',
  bannedJoin: '\uC8FC\uC758 \u00B7 \uCC38\uAC00',
  bannedAuthorFallback: '\uBC34 \uBAA9\uB85D\uC5D0 \uC788\uB294 \uAE00\uC4F4\uC774\uC785\uB2C8\uB2E4.',
  bannedAuthorConfirmTitle: '\uBC34 \uAE00\uC4F4\uC774 \uCC38\uAC00 \uD655\uC778',
  bannedAuthorConfirmBody: '\uBC34 \uBAA9\uB85D \uAE00\uC4F4\uC774\uC785\uB2C8\uB2E4. \uCC38\uAC00\uB97C \uACC4\uC18D\uD558\uB824\uBA74 \uD55C \uBC88 \uB354 \uD655\uC778\uD558\uC138\uC694.',
  continueJoin: '\uACC4\uC18D \uCC38\uAC00',
  cancel: '\uCDE8\uC18C',
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

function getJoinGuardNamespace() {
  if (globalThis.SEAFJoinGuard?.createJoinGuardController) {
    return globalThis.SEAFJoinGuard;
  }

  if (typeof require === 'function') {
    globalThis.SEAFJoinGuard = require('./shared/seaf-join-guard.js');
    return globalThis.SEAFJoinGuard;
  }

  throw new Error('SEAFJoinGuard must be loaded before the content script.');
}

function getFetchNamespace() {
  if (globalThis.SEAFFetch?.createFetchRuntime) {
    return globalThis.SEAFFetch;
  }

  if (typeof require === 'function') {
    globalThis.SEAFFetch = require('./shared/seaf-fetch.js');
    return globalThis.SEAFFetch;
  }

  throw new Error('SEAFFetch must be loaded before the content script.');
}

const SEAFContent = {
  state: {
    settings: { ...DEFAULT_SETTINGS },
    observer: null,
    listBodyObserver: null,
    listBody: null,
    isManghoFilteredList: false,
    surfacedPostIds: new Map(),
    listenersRegistered: false,
    initPromise: null,
    initialized: false,
    fetchRuntime: null
  },

  async init() {
    if (!globalThis.SEAFDomain.isHelldiversListUrl(window.location.href)) {
      return;
    }

    if (this.state.initialized) {
      return;
    }

    if (!this.state.initPromise) {
      this.state.initPromise = (async () => {
        await this.loadSettings();
        this.state.isManghoFilteredList = this.isManghoFilteredListPage();
        this.registerListeners();
        this.connectListBody(this.getListBody());
        this.observeListBodyChanges();
        this.state.initialized = true;
      })().catch((error) => {
        this.state.initPromise = null;
        throw error;
      });
    }

    await this.state.initPromise;
  },

  async loadSettings() {
    const { seaf_settings: savedSettings } = await chrome.storage.local.get(['seaf_settings']);
    this.state.settings = this.normalizeSettings(savedSettings);
  },

  normalizeSettings(savedSettings) {
    const sourceSettings = savedSettings && typeof savedSettings === 'object'
      ? savedSettings
      : {};
    const normalizedSettings = { ...DEFAULT_SETTINGS, ...sourceSettings };
    const numericToastDuration = Number(normalizedSettings.toastDuration);

    normalizedSettings.toastDuration = Number.isFinite(numericToastDuration)
      ? Math.min(
        MAX_TOAST_DURATION_SECONDS,
        Math.max(MIN_TOAST_DURATION_SECONDS, Math.round(numericToastDuration))
      )
      : DEFAULT_SETTINGS.toastDuration;
    normalizedSettings.isSiteAlertEnabled = Boolean(normalizedSettings.isSiteAlertEnabled);
    const canonicalAuthorRecords = Array.isArray(sourceSettings.authorRecords)
      ? sourceSettings.authorRecords
      : [];
    const legacyAuthorBanRecords = (Array.isArray(sourceSettings.authorBanEntries)
      ? sourceSettings.authorBanEntries
      : [])
      .map((record) => (
        record && typeof record === 'object'
          ? { ...record, status: 'banned' }
          : record
      ));
    const authorRecordInput = [...canonicalAuthorRecords, ...legacyAuthorBanRecords];
    normalizedSettings.authorRecords = typeof globalThis.SEAFDomain.normalizeAuthorRecords === 'function'
      ? globalThis.SEAFDomain.normalizeAuthorRecords(authorRecordInput)
      : [];
    normalizedSettings.authorBanEntries = globalThis.SEAFDomain.normalizeAuthorBanEntries(
      normalizedSettings.authorBanEntries
    );
    normalizedSettings.useLegacyAuthorBanFallback = normalizedSettings.authorRecords.length === 0
      && normalizedSettings.authorBanEntries.length > 0;
    normalizedSettings.authorBanOverlayMode = globalThis.SEAFDomain.normalizeAuthorBanOverlayMode(
      normalizedSettings.authorBanOverlayMode
    );
    normalizedSettings.confirmBannedAuthorJoin = globalThis.SEAFDomain.normalizeConfirmBannedAuthorJoin(
      normalizedSettings.confirmBannedAuthorJoin
    );

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
    return this.state.listBody
      ? [...this.state.listBody.querySelectorAll('.ub-content[data-no]')]
      : [];
  },

  connectListBody(listBody) {
    const nextListBody = listBody || null;
    if (
      this.state.listBody === nextListBody &&
      (!nextListBody || this.state.observer)
    ) {
      return;
    }

    if (this.state.observer) {
      this.state.observer.disconnect();
      this.state.observer = null;
    }

    this.state.listBody = nextListBody;
    if (!nextListBody) {
      return;
    }

    this.processRows(this.getInitialRows(), {
      surfaceOpenPosts: false,
      toastLimit: ENTRY_TOAST_LIMIT
    });
    this.observeListChanges();
  },

  observeListBodyChanges() {
    if (this.state.listBodyObserver || !document.documentElement) {
      return;
    }

    this.state.listBodyObserver = new MutationObserver(() => {
      const currentListBody = this.getListBody();
      if (currentListBody !== this.state.listBody) {
        this.connectListBody(currentListBody);
      }
    });

    this.state.listBodyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
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
        const author = this.normalizeAuthor(message.author);
        const authorSummary = this.getAuthorRecordSummary(author);
        const isBannedAuthor = authorSummary.isBanned;
        if (this.hasSurfacedPost(postId)) {
          return;
        }

        this.markPostSurfaced(postId);
        if (isBannedAuthor && this.state.settings.authorBanOverlayMode === 'hide') {
          return;
        }

        this.renderOverlay({
          sourceLabel: LABELS.manghoAlert,
          posts: [{
            id: postId,
            title: message.title,
            relativeTime: message.relativeTime,
            postUrl: message.postUrl || this.buildPostUrl(postId),
            toastDuration: message.toastDuration,
            author,
            isBannedAuthor,
            authorNote: authorSummary.note,
            hasAuthorNote: authorSummary.hasNote,
            authorBanNote: isBannedAuthor ? authorSummary.banNote : '',
            confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
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
      this.refreshJoinButtonStates();
    });

    this.state.listenersRegistered = true;
  },

  observeListChanges() {
    if (this.state.observer) {
      this.state.observer.disconnect();
      this.state.observer = null;
    }

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

      this.ensureJoinButton(row, parsedRow.titleLink, parsedRow.post.id, parsedRow.post.author);

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
    const author = this.parseAuthorFromRow(row);
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
    post.author = author;

    return { post, titleLink };
  },

  parseAuthorFromRow(row) {
    const writerElements = [...row.querySelectorAll('.gall_writer')];
    const writerElement = writerElements.find((element) => {
      const nickname = element.getAttribute('data-nick') || '';
      const uid = element.getAttribute('data-uid') || '';
      const ip = element.getAttribute('data-ip') || '';
      const displayName = element.textContent.trim();
      return Boolean(nickname || uid || ip || displayName);
    });
    if (!writerElement) {
      return null;
    }

    return this.normalizeAuthor({
      nickname: writerElement.getAttribute('data-nick') || '',
      uid: writerElement.getAttribute('data-uid') || '',
      ip: writerElement.getAttribute('data-ip') || '',
      displayName: writerElement.textContent.trim()
    });
  },

  normalizeAuthor(author) {
    if (!author) {
      return null;
    }
    return globalThis.SEAFDomain.normalizeAuthor(author);
  },

  isBannedAuthor(author) {
    return this.getAuthorRecordSummary(author).isBanned;
  },

  getAuthorBanNote(author) {
    const summary = this.getAuthorRecordSummary(author);
    return summary.isBanned ? summary.banNote : '';
  },

  getAuthorNote(author) {
    return this.getAuthorRecordSummary(author).note;
  },

  getAuthorRecordSummary(author) {
    const emptySummary = {
      isBanned: false,
      hasNote: false,
      note: '',
      hasBanNote: false,
      banNote: '',
      matches: [],
      primaryRecord: null,
      primaryBannedRecord: null
    };
    if (!author) {
      return emptySummary;
    }

    if (
      !this.state.settings.useLegacyAuthorBanFallback
      && typeof globalThis.SEAFDomain.getAuthorRecordMatchSummary === 'function'
    ) {
      const summary = globalThis.SEAFDomain.getAuthorRecordMatchSummary(
        author,
        this.state.settings.authorRecords
      ) || emptySummary;
      const note = String(summary.note || '').trim();
      const banNote = String(summary.banNote || '').trim();
      return {
        ...emptySummary,
        ...summary,
        isBanned: Boolean(summary.isBanned),
        hasNote: Boolean(summary.hasNote || note),
        note,
        hasBanNote: Boolean(summary.hasBanNote || banNote),
        banNote
      };
    }

    const isBanned = globalThis.SEAFDomain.isAuthorBanned(
      author,
      this.state.settings.authorBanEntries
    );
    const note = isBanned
      ? String(globalThis.SEAFDomain.getAuthorBanNote(
        author,
        this.state.settings.authorBanEntries
      ) || '').trim()
      : '';
    return {
      ...emptySummary,
      isBanned,
      hasNote: Boolean(note),
      note,
      hasBanNote: Boolean(note),
      banNote: note
    };
  },

  refreshJoinButtonStates() {
    if (!this.state.listBody) {
      return;
    }

    this.processRows(this.getInitialRows(), { surfaceOpenPosts: false });
  },

  ensureJoinButton(row, titleLink, postId, author) {
    const existingButton = row.querySelector('.seaf-inline-join-button');
    if (row.hasAttribute('data-seaf-processed') && existingButton) {
      this.updateInlineJoinButton(existingButton, postId, author);
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'seaf-inline-join-wrap';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seaf-inline-join-button';
    wrapper.addEventListener('mouseenter', () => {
      this.updateInlineTooltipPlacement(wrapper);
    });
    wrapper.addEventListener('focusin', () => {
      this.updateInlineTooltipPlacement(wrapper);
    });
    wrapper.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      const controller = wrapper.__seafJoinGuard;
      if (!controller) {
        return;
      }

      const snapshot = controller.getSnapshot();
      if (snapshot.phase !== getJoinGuardNamespace().PHASES.confirm && snapshot.phase !== getJoinGuardNamespace().PHASES.error) {
        return;
      }

      event.preventDefault();
      controller.cancel();
      this.renderInlineJoinGuardState(wrapper, button, postId, author);
      button.focus();
    });
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const result = this.requestInlineJoin(wrapper, button, postId, author);
      if (result?.action === 'execute') {
        await this.executeInlineJoin(wrapper, button, postId, author);
      }
    });

    wrapper.appendChild(button);
    titleLink.after(wrapper);
    row.setAttribute('data-seaf-processed', 'true');
    this.updateInlineJoinButton(button, postId, author);
  },

  updateInlineJoinButton(button, postId, author) {
    const wrapper = button.closest('.seaf-inline-join-wrap');
    const authorSummary = this.getAuthorRecordSummary(author);
    const isBannedAuthor = authorSummary.isBanned;
    const isNotedAuthor = authorSummary.hasNote && !isBannedAuthor;
    const defaultLabel = isBannedAuthor ? LABELS.bannedJoin : LABELS.join;
    const joinGuard = this.getInlineJoinGuard(wrapper, {
      isBannedAuthor,
      authorBanNote: isBannedAuthor ? authorSummary.banNote : '',
      confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
    });

    button.dataset.defaultLabel = defaultLabel;
    button.classList.toggle('seaf-inline-join-button--banned', isBannedAuthor);
    button.classList.toggle('seaf-inline-join-button--noted', isNotedAuthor);
    button.dataset.authorBanned = String(isBannedAuthor);
    button.dataset.authorNoted = String(isNotedAuthor);
    button.dataset.authorStatus = isBannedAuthor ? 'banned' : (isNotedAuthor ? 'note' : 'none');
    if (!button.disabled && joinGuard.getSnapshot().phase !== getJoinGuardNamespace().PHASES.confirm) {
      button.textContent = defaultLabel;
    }

    if (!wrapper) {
      return;
    }

    let tooltip = wrapper.querySelector('.seaf-inline-author-tooltip');
    if (!isBannedAuthor) {
      wrapper.querySelector('.seaf-inline-join-confirm')?.remove();
      button.removeAttribute('aria-controls');
      button.setAttribute('aria-expanded', 'false');
      wrapper.dataset.confirmOpen = 'false';
    }

    if (!isBannedAuthor && !isNotedAuthor) {
      tooltip?.remove();
      button.removeAttribute('aria-describedby');
      return;
    }

    if (!tooltip) {
      tooltip = document.createElement('span');
      tooltip.className = 'seaf-inline-author-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      wrapper.appendChild(tooltip);
    }

    tooltip.classList.toggle('seaf-inline-ban-tooltip', isBannedAuthor);
    tooltip.classList.toggle('seaf-inline-note-tooltip', isNotedAuthor);
    const tooltipId = `seaf-inline-author-tooltip-${Number(postId) || 'unknown'}`;
    tooltip.id = tooltipId;
    tooltip.textContent = isBannedAuthor
      ? (authorSummary.banNote || LABELS.bannedAuthorFallback)
      : authorSummary.note;
    button.setAttribute('aria-describedby', tooltipId);
    if (isBannedAuthor) {
      this.renderInlineJoinGuardState(wrapper, button, postId, author);
    }
  },

  getInlineJoinGuard(wrapper, options) {
    if (!wrapper) {
      return null;
    }

    const joinGuardApi = getJoinGuardNamespace();
    if (!wrapper.__seafJoinGuard) {
      wrapper.__seafJoinGuard = joinGuardApi.createJoinGuardController(options);
    } else {
      wrapper.__seafJoinGuard.sync(options);
    }

    return wrapper.__seafJoinGuard;
  },

  requestInlineJoin(wrapper, button, postId, author) {
    const authorSummary = this.getAuthorRecordSummary(author);
    const joinGuard = this.getInlineJoinGuard(wrapper, {
      isBannedAuthor: authorSummary.isBanned,
      authorBanNote: authorSummary.isBanned ? authorSummary.banNote : '',
      confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
    });
    const result = joinGuard.requestJoin();
    this.renderInlineJoinGuardState(wrapper, button, postId, author);
    return result;
  },

  async executeInlineJoin(wrapper, button, postId, author) {
    const authorSummary = this.getAuthorRecordSummary(author);
    const joinGuard = this.getInlineJoinGuard(wrapper, {
      isBannedAuthor: authorSummary.isBanned,
      authorBanNote: authorSummary.isBanned ? authorSummary.banNote : '',
      confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
    });
    const confirmButton = wrapper?.querySelector('.seaf-inline-join-confirm-button');
    const cancelButton = wrapper?.querySelector('.seaf-inline-join-cancel-button');
    const feedback = wrapper?.querySelector('.seaf-inline-join-feedback');

    if (confirmButton) {
      confirmButton.disabled = true;
    }
    if (cancelButton) {
      cancelButton.disabled = true;
    }
    if (feedback) {
      feedback.textContent = '';
    }

    const result = await this.joinPost(postId, button);
    if (result.success) {
      joinGuard.complete();
    } else {
      joinGuard.fail(result.errorMessage || LABELS.failed);
    }

    if (confirmButton) {
      confirmButton.disabled = false;
    }
    if (cancelButton) {
      cancelButton.disabled = false;
    }
    if (feedback) {
      feedback.textContent = result.success ? '' : (result.errorMessage || LABELS.failed);
    }

    this.renderInlineJoinGuardState(wrapper, button, postId, author);
  },

  renderInlineJoinGuardState(wrapper, button, postId, author) {
    if (!wrapper || !button) {
      return;
    }

    const authorSummary = this.getAuthorRecordSummary(author);
    const joinGuard = this.getInlineJoinGuard(wrapper, {
      isBannedAuthor: authorSummary.isBanned,
      authorBanNote: authorSummary.isBanned ? authorSummary.banNote : '',
      confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
    });
    const snapshot = joinGuard.getSnapshot();
    if (!snapshot.isBannedAuthor) {
      wrapper.querySelector('.seaf-inline-join-confirm')?.remove();
      wrapper.dataset.confirmOpen = 'false';
      button.removeAttribute('aria-controls');
      button.setAttribute('aria-expanded', 'false');
      return;
    }

    const panelId = `seaf-inline-join-confirm-${Number(postId) || 'unknown'}`;
    let panel = wrapper.querySelector('.seaf-inline-join-confirm');
    let feedback = wrapper.querySelector('.seaf-inline-join-feedback');
    let continueButton = wrapper.querySelector('.seaf-inline-join-confirm-button');
    let cancelButton = wrapper.querySelector('.seaf-inline-join-cancel-button');

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'seaf-inline-join-confirm';
      panel.id = panelId;
      panel.setAttribute('role', 'group');
      panel.hidden = true;

      const title = document.createElement('p');
      title.className = 'seaf-inline-join-confirm-title';
      title.textContent = LABELS.bannedAuthorConfirmTitle;

      const body = document.createElement('p');
      body.className = 'seaf-inline-join-confirm-body';
      body.textContent = LABELS.bannedAuthorConfirmBody;

      const note = document.createElement('p');
      note.className = 'seaf-inline-join-confirm-note';

      feedback = document.createElement('p');
      feedback.className = 'seaf-inline-join-feedback';
      feedback.setAttribute('role', 'status');

      const actions = document.createElement('div');
      actions.className = 'seaf-inline-join-confirm-actions';

      cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'seaf-inline-join-cancel-button';
      cancelButton.textContent = LABELS.cancel;
      cancelButton.addEventListener('click', () => {
        joinGuard.cancel();
        this.renderInlineJoinGuardState(wrapper, button, postId, author);
        button.focus();
      });

      continueButton = document.createElement('button');
      continueButton.type = 'button';
      continueButton.className = 'seaf-inline-join-confirm-button';
      continueButton.textContent = LABELS.continueJoin;
      continueButton.addEventListener('click', async () => {
        const result = joinGuard.requestJoin();
        this.renderInlineJoinGuardState(wrapper, button, postId, author);
        if (result.action === 'execute') {
          await this.executeInlineJoin(wrapper, button, postId, author);
        }
      });

      actions.append(cancelButton, continueButton);
      panel.append(title, body, note, feedback, actions);
      wrapper.appendChild(panel);
    }

    const noteElement = panel.querySelector('.seaf-inline-join-confirm-note');
    noteElement.textContent = snapshot.authorBanNote || LABELS.bannedAuthorFallback;

    const showPanel = snapshot.phase === getJoinGuardNamespace().PHASES.confirm
      || snapshot.phase === getJoinGuardNamespace().PHASES.error;
    panel.hidden = !showPanel;
    wrapper.dataset.confirmOpen = String(showPanel);
    button.setAttribute('aria-expanded', String(showPanel));
    if (showPanel) {
      button.setAttribute('aria-controls', panelId);
    } else {
      button.removeAttribute('aria-controls');
      if (feedback) {
        feedback.textContent = '';
      }
    }

    if (feedback && snapshot.phase === getJoinGuardNamespace().PHASES.error) {
      feedback.textContent = snapshot.errorMessage || LABELS.failed;
    }

    continueButton.textContent = snapshot.phase === getJoinGuardNamespace().PHASES.submitting
      ? LABELS.joining
      : LABELS.continueJoin;
    continueButton.disabled = snapshot.phase === getJoinGuardNamespace().PHASES.submitting;
    cancelButton.disabled = snapshot.phase === getJoinGuardNamespace().PHASES.submitting;
    this.updateInlineTooltipPlacement(wrapper);
  },

  updateInlineTooltipPlacement(wrapper) {
    const tooltip = wrapper?.querySelector('.seaf-inline-author-tooltip');
    if (!tooltip) {
      return;
    }

    tooltip.classList.remove(
      'seaf-inline-ban-tooltip--align-left',
      'seaf-inline-ban-tooltip--align-right',
      'seaf-inline-ban-tooltip--below'
    );

    const tooltipRect = tooltip.getBoundingClientRect();
    const safePadding = 8;
    if (tooltipRect.left < safePadding) {
      tooltip.classList.add('seaf-inline-ban-tooltip--align-left');
    } else if (tooltipRect.right > window.innerWidth - safePadding) {
      tooltip.classList.add('seaf-inline-ban-tooltip--align-right');
    }

    if (tooltipRect.top < safePadding) {
      tooltip.classList.add('seaf-inline-ban-tooltip--below');
    }
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
    this.pruneSurfacedPostIds(surfacedAt);
  },

  surfaceOpenPosts(posts, toastLimit) {
    const visiblePosts = [];

    posts
      .sort((left, right) => right.id - left.id)
      .forEach((post) => {
        const authorSummary = this.getAuthorRecordSummary(post.author);
        const isBannedAuthor = authorSummary.isBanned;
        this.markPostSurfaced(post.id);
        if (isBannedAuthor && this.state.settings.authorBanOverlayMode === 'hide') {
          return;
        }

        if (visiblePosts.length >= toastLimit) {
          return;
        }

        visiblePosts.push({ post, authorSummary });
      });

    visiblePosts.forEach(({ post, authorSummary }, index) => {
      window.setTimeout(() => {
        this.renderOverlay({
          sourceLabel: LABELS.listAlert,
          posts: [{
            id: post.id,
            title: post.title,
            relativeTime: post.relativeTime || '\uBC29\uAE08 \uAC10\uC9C0',
            postUrl: post.postUrl,
            toastDuration: this.state.settings.toastDuration * 1000,
            author: post.author,
            isBannedAuthor: authorSummary.isBanned,
            authorNote: authorSummary.note,
            hasAuthorNote: authorSummary.hasNote,
            authorBanNote: authorSummary.isBanned ? authorSummary.banNote : '',
            confirmBannedAuthorJoin: this.state.settings.confirmBannedAuthorJoin
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
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = LABELS.joining;

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

      button.textContent = LABELS.done;
      return { success: true };
    } catch (error) {
      try {
        const directLink = await this.extractLobbyLinkDirectly(postId);
        if (!directLink) {
          throw new Error(LABELS.joinLinkNotFound);
        }

        window.location.href = directLink;
        button.textContent = LABELS.done;
        return { success: true };
      } catch (fallbackError) {
        console.error(LABELS.joinFailed, fallbackError);
        button.textContent = LABELS.failed;
        return {
          success: false,
          errorMessage: String(fallbackError?.message || fallbackError || LABELS.joinFailed).trim()
        };
      }
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = button.dataset.defaultLabel || originalText;
      }, 1600);
    }
  },

  async extractLobbyLinkDirectly(postId) {
    const html = await this.fetchText(
      `${globalThis.SEAFDomain.constants.VIEW_URL_PREFIX}${postId}`
    );
    return globalThis.SEAFDomain.extractLobbyLinkFromHtml(html);
  },

  async fetchText(url) {
    if (!this.state.fetchRuntime) {
      this.state.fetchRuntime = getFetchNamespace().createFetchRuntime({
        fetchImpl: (...args) => fetch(...args),
        defaultTimeoutMs: FETCH_TIMEOUT_MS
      });
    }

    return this.state.fetchRuntime.fetchText(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      timeoutErrorMessage: 'Request timed out.'
    });
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
