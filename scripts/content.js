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
const MAX_AUTHOR_NOTE_LENGTH = 240;

const LABELS = {
  manghoAlert: 'MANGHO \uAC10\uC9C0',
  listAlert: '\uBAA9\uB85D \uAC10\uC9C0',
  testAlert: '\uD14C\uC2A4\uD2B8 \uC54C\uB9BC',
  join: '\uCC38\uAC00',
  bannedJoin: '\uC8FC\uC758 \u00B7 \uCC38\uAC00',
  authorManageAdd: '+ \uAE30\uB85D',
  authorManageNote: '\uBA54\uBAA8',
  authorManageBanned: '\uBC34',
  authorManageTitle: '\uC791\uC131\uC790 \uAD00\uB9AC',
  authorManageDisplayFallback: '\uC791\uC131\uC790',
  authorManageMetaMissing: '\uC5C6\uC74C',
  authorManageNickname: '\uB2C9\uB124\uC784',
  authorManageUid: 'UID',
  authorManageIp: 'IP',
  authorManageNoteLabel: '\uBA54\uBAA8',
  authorManageBanLabel: '\uBC34 \uC5EC\uBD80',
  authorManageSave: '\uC800\uC7A5',
  authorManageSaving: '\uC800\uC7A5 \uC911...',
  authorManageDelete: '\uAE30\uB85D \uC0AD\uC81C',
  authorManageDeleting: '\uC0AD\uC81C \uC911...',
  authorManageDeleteDisabled: '\uAE30\uB85D \uC5C6\uC74C',
  authorManageDeleteConfirm: '\uC815\uB9D0 \uC0AD\uC81C',
  authorManageDeleteConfirmTextPrefix: '\uC77C\uCE58\uD558\uB294 \uAE30\uB85D ',
  authorManageDeleteConfirmTextSuffix: '\uAC1C\uB97C \uC0AD\uC81C\uD569\uB2C8\uB2E4. \uD55C \uBC88 \uB354 \uB204\uB974\uBA74 \uACC4\uC18D\uD569\uB2C8\uB2E4.',
  authorManageBroadConfirmText: '\u2018\u3147\u3147\u2019 \uB2C9\uB124\uC784 \uAE30\uB85D\uC740 \uBC94\uC704\uAC00 \uB113\uC2B5\uB2C8\uB2E4. \uD55C \uBC88 \uB354 \uC800\uC7A5\uD558\uBA74 \uACC4\uC18D\uD569\uB2C8\uB2E4.',
  authorManageBroadScopePrefix: '\uB113\uC740 \uBC94\uC704:',
  authorManageErrorFallback: '\uC791\uC131\uC790 \uAE30\uB85D\uC744 \uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  authorManageNoteRequired: '\uC77C\uBC18 \uBA54\uBAA8\uB294 \uBE44\uC5B4 \uC788\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.',
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
    fetchRuntime: null,
    activeAuthorManager: null,
    authorManagerDocumentPointerHandler: null,
    authorManagerDocumentKeyHandler: null
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

    this.registerAuthorManagerListeners();

    this.state.listenersRegistered = true;
  },

  registerAuthorManagerListeners() {
    if (!document || this.state.authorManagerDocumentPointerHandler || this.state.authorManagerDocumentKeyHandler) {
      return;
    }

    this.state.authorManagerDocumentPointerHandler = (event) => {
      const activeManager = this.state.activeAuthorManager;
      if (!activeManager?.wrapper) {
        return;
      }

      if (activeManager.wrapper.contains(event.target)) {
        return;
      }

      this.closeAuthorManager({ restoreFocus: false });
    };

    this.state.authorManagerDocumentKeyHandler = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      const activeManager = this.state.activeAuthorManager;
      if (!activeManager?.wrapper) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.closeAuthorManager({ restoreFocus: true });
    };

    document.addEventListener('mousedown', this.state.authorManagerDocumentPointerHandler, true);
    document.addEventListener('keydown', this.state.authorManagerDocumentKeyHandler, true);
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

      this.ensureInlineControls(row, parsedRow.titleLink, parsedRow.post.id, parsedRow.post.author);

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

  ensureInlineControls(row, titleLink, postId, author) {
    const existingButton = row.querySelector('.seaf-inline-join-button');
    if (row.hasAttribute('data-seaf-processed') && existingButton) {
      this.updateInlineJoinButton(existingButton, postId, author);
      this.updateAuthorManageButton(row, postId, author);
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
      this.closeAuthorManager({ restoreFocus: false });
      const result = this.requestInlineJoin(wrapper, button, postId, author);
      if (result?.action === 'execute') {
        await this.executeInlineJoin(wrapper, button, postId, author);
      }
    });

    wrapper.appendChild(button);
    titleLink.after(wrapper);
    row.setAttribute('data-seaf-processed', 'true');
    this.updateInlineJoinButton(button, postId, author);
    this.updateAuthorManageButton(row, postId, author);
  },

  ensureJoinButton(row, titleLink, postId, author) {
    this.ensureInlineControls(row, titleLink, postId, author);
  },

  updateAuthorManageButton(row, postId, author) {
    const wrapper = row.querySelector('.seaf-inline-join-wrap');
    if (!wrapper) {
      return;
    }

    const existingButton = wrapper.querySelector('.seaf-inline-author-manage-button');
    if (!author) {
      existingButton?.remove();
      if (this.state.activeAuthorManager?.wrapper === wrapper) {
        this.closeAuthorManager({ restoreFocus: false });
      }
      return;
    }

    const authorSummary = this.getAuthorRecordSummary(author);
    const status = authorSummary.isBanned
      ? 'banned'
      : (authorSummary.hasNote ? 'note' : 'none');
    const label = status === 'banned'
      ? LABELS.authorManageBanned
      : (status === 'note' ? LABELS.authorManageNote : LABELS.authorManageAdd);
    const button = existingButton || document.createElement('button');

    if (!existingButton) {
      button.type = 'button';
      button.className = 'seaf-inline-author-manage-button';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleAuthorManager(row, postId, author);
      });
      wrapper.appendChild(button);
    }

    const popupId = `seaf-inline-author-manager-${Number(postId) || 'unknown'}`;
    button.dataset.authorStatus = status;
    button.dataset.authorManageStatus = status;
    button.textContent = label;
    button.classList.toggle('seaf-inline-author-manage-button--banned', status === 'banned');
    button.classList.toggle('seaf-inline-author-manage-button--noted', status === 'note');
    button.classList.toggle('seaf-inline-author-manage-button--empty', status === 'none');
    if (this.state.activeAuthorManager?.wrapper === wrapper) {
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-controls', popupId);
    } else {
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-controls');
    }
  },

  getAuthorManageContext(author) {
    const normalizedAuthor = this.normalizeAuthor(author);
    const summary = this.getAuthorRecordSummary(normalizedAuthor);
    const displayedNote = summary.note || '';
    const noteTargetKey = summary.noteRecord?.key || summary.primaryRecord?.key || '';
    const matchingKeys = summary.matches.map((record) => record.key);
    const nextStatus = summary.isBanned ? 'banned' : 'note';
    return {
      author: normalizedAuthor,
      summary,
      displayedNote,
      noteTargetKey,
      matchingKeys,
      deleteCount: matchingKeys.length,
      nextStatus
    };
  },

  toggleAuthorManager(row, postId, author) {
    const wrapper = row?.querySelector('.seaf-inline-join-wrap');
    if (!wrapper || !author) {
      return;
    }

    if (this.state.activeAuthorManager?.wrapper === wrapper) {
      this.closeAuthorManager({ restoreFocus: true });
      return;
    }

    this.openAuthorManager(row, postId, author);
  },

  openAuthorManager(row, postId, author) {
    const wrapper = row?.querySelector('.seaf-inline-join-wrap');
    const manageButton = wrapper?.querySelector('.seaf-inline-author-manage-button');
    if (!wrapper || !manageButton || !author) {
      return;
    }

    this.closeAuthorManager({ restoreFocus: false });

    const joinGuard = wrapper.__seafJoinGuard;
    const joinPhases = getJoinGuardNamespace().PHASES;
    if (joinGuard) {
      const snapshot = joinGuard.getSnapshot();
      if (snapshot.phase === joinPhases.confirm || snapshot.phase === joinPhases.error) {
        joinGuard.cancel();
        const joinButton = wrapper.querySelector('.seaf-inline-join-button');
        this.renderInlineJoinGuardState(wrapper, joinButton, postId, author);
      }
    }

    const panel = this.ensureAuthorManagerPanel(wrapper, postId);
    const context = this.getAuthorManageContext(author);
    this.state.activeAuthorManager = {
      wrapper,
      panel,
      button: manageButton,
      row,
      postId,
      author
    };
    this.renderAuthorManagerPanel(this.state.activeAuthorManager, context);
    panel.hidden = false;
    panel.dataset.open = 'true';
    manageButton.setAttribute('aria-expanded', 'true');
    manageButton.setAttribute('aria-controls', panel.id);
    this.updateAuthorManagerPlacement(panel);
  },

  closeAuthorManager({ restoreFocus = false } = {}) {
    const activeManager = this.state.activeAuthorManager;
    if (!activeManager) {
      return;
    }

    const { panel, button } = activeManager;
    if (panel) {
      panel.hidden = true;
      panel.dataset.open = 'false';
      panel.removeAttribute('data-pending-action');
    }
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-controls');
      if (restoreFocus) {
        button.focus();
      }
    }

    this.state.activeAuthorManager = null;
  },

  ensureAuthorManagerPanel(wrapper, postId) {
    const panelId = `seaf-inline-author-manager-${Number(postId) || 'unknown'}`;
    let panel = wrapper.querySelector('.seaf-inline-author-manager');
    if (panel) {
      panel.id = panelId;
      return panel;
    }

    panel = document.createElement('div');
    panel.className = 'seaf-inline-author-manager';
    panel.id = panelId;
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', LABELS.authorManageTitle);
    panel.innerHTML = `
      <p class="seaf-inline-author-manager-title"></p>
      <p class="seaf-inline-author-manager-display"></p>
      <dl class="seaf-inline-author-manager-meta"></dl>
      <label class="seaf-inline-author-manager-field">
        <span class="seaf-inline-author-manager-field-label"></span>
        <textarea class="seaf-inline-author-manager-note-input" rows="3" maxlength="${MAX_AUTHOR_NOTE_LENGTH}"></textarea>
      </label>
      <label class="seaf-inline-author-manager-toggle">
        <input class="seaf-inline-author-manager-ban-input" type="checkbox">
        <span class="seaf-inline-author-manager-toggle-label"></span>
      </label>
      <p class="seaf-inline-author-manager-status" role="status" aria-live="polite"></p>
      <p class="seaf-inline-author-manager-error" role="alert"></p>
      <div class="seaf-inline-author-manager-actions">
        <button type="button" class="seaf-inline-author-manager-delete-button"></button>
        <button type="button" class="seaf-inline-author-manager-save-button"></button>
      </div>
    `;

    const title = panel.querySelector('.seaf-inline-author-manager-title');
    const noteLabel = panel.querySelector('.seaf-inline-author-manager-field-label');
    const toggleLabel = panel.querySelector('.seaf-inline-author-manager-toggle-label');
    const noteInput = panel.querySelector('.seaf-inline-author-manager-note-input');
    const banInput = panel.querySelector('.seaf-inline-author-manager-ban-input');
    const saveButton = panel.querySelector('.seaf-inline-author-manager-save-button');
    const deleteButton = panel.querySelector('.seaf-inline-author-manager-delete-button');

    title.textContent = LABELS.authorManageTitle;
    noteLabel.textContent = LABELS.authorManageNoteLabel;
    toggleLabel.textContent = LABELS.authorManageBanLabel;
    saveButton.textContent = LABELS.authorManageSave;
    deleteButton.textContent = LABELS.authorManageDelete;

    noteInput.addEventListener('input', () => {
      if (this.state.activeAuthorManager?.panel !== panel) {
        return;
      }

      panel.dataset.pendingAction = '';
      this.clearAuthorManagerMessages(panel);
    });

    banInput.addEventListener('change', () => {
      if (this.state.activeAuthorManager?.panel !== panel) {
        return;
      }

      panel.dataset.pendingAction = '';
      this.clearAuthorManagerMessages(panel);
    });

    saveButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this.submitAuthorManager(panel);
    });

    deleteButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await this.deleteAuthorManagerRecords(panel);
    });

    wrapper.appendChild(panel);
    return panel;
  },

  clearAuthorManagerMessages(panel) {
    const status = panel?.querySelector('.seaf-inline-author-manager-status');
    const error = panel?.querySelector('.seaf-inline-author-manager-error');
    if (status) {
      status.textContent = '';
    }
    if (error) {
      error.textContent = '';
    }
  },

  renderAuthorManagerPanel(activeManager, context = this.getAuthorManageContext(activeManager?.author)) {
    const panel = activeManager?.panel;
    if (!panel || !context?.author) {
      return;
    }

    const title = panel.querySelector('.seaf-inline-author-manager-title');
    const display = panel.querySelector('.seaf-inline-author-manager-display');
    const meta = panel.querySelector('.seaf-inline-author-manager-meta');
    const noteInput = panel.querySelector('.seaf-inline-author-manager-note-input');
    const banInput = panel.querySelector('.seaf-inline-author-manager-ban-input');
    const saveButton = panel.querySelector('.seaf-inline-author-manager-save-button');
    const deleteButton = panel.querySelector('.seaf-inline-author-manager-delete-button');

    title.textContent = LABELS.authorManageTitle;
    display.textContent = context.author.displayName || LABELS.authorManageDisplayFallback;
    meta.replaceChildren(...this.buildAuthorManagerMeta(context.author));
    noteInput.value = context.displayedNote;
    banInput.checked = context.nextStatus === 'banned';
    panel.dataset.deleteCount = String(context.deleteCount);
    saveButton.textContent = LABELS.authorManageSave;
    deleteButton.textContent = context.deleteCount > 0
      ? LABELS.authorManageDelete
      : LABELS.authorManageDeleteDisabled;
    deleteButton.disabled = context.deleteCount === 0;
    panel.dataset.pendingAction = '';
    this.clearAuthorManagerMessages(panel);
  },

  buildAuthorManagerMeta(author) {
    const rows = [
      [LABELS.authorManageNickname, author?.nickname || LABELS.authorManageMetaMissing],
      [LABELS.authorManageUid, author?.uid || LABELS.authorManageMetaMissing],
      [LABELS.authorManageIp, author?.ip || LABELS.authorManageMetaMissing]
    ];

    return rows.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      return [term, detail];
    });
  },

  updateAuthorManagerPlacement(panel) {
    if (!panel) {
      return;
    }

    panel.style.transform = '';
    const panelRect = panel.getBoundingClientRect();
    const safePadding = 8;
    let offsetX = 0;
    let offsetY = 0;

    if (panelRect.left < safePadding) {
      offsetX = safePadding - panelRect.left;
    } else if (panelRect.right > window.innerWidth - safePadding) {
      offsetX = (window.innerWidth - safePadding) - panelRect.right;
    }

    if (panelRect.bottom > window.innerHeight - safePadding) {
      offsetY = (window.innerHeight - safePadding) - panelRect.bottom;
    }
    if (panelRect.top + offsetY < safePadding) {
      offsetY = safePadding - panelRect.top;
    }

    const transforms = [];
    if (offsetX !== 0) {
      transforms.push(`translateX(${Math.round(offsetX)}px)`);
    }
    if (offsetY !== 0) {
      transforms.push(`translateY(${Math.round(offsetY)}px)`);
    }
    panel.style.transform = transforms.join(' ');
  },

  setAuthorManagerPending(panel, isPending, action = '') {
    if (!panel) {
      return;
    }

    const deleteCount = Number(panel.dataset.deleteCount || '0');
    const hasDeletableRecords = Number.isFinite(deleteCount) && deleteCount > 0;
    const controls = panel.querySelectorAll('button, textarea, input');
    controls.forEach((control) => {
      control.disabled = isPending;
    });

    panel.dataset.pending = String(isPending);
    panel.dataset.pendingAction = action;
    const saveButton = panel.querySelector('.seaf-inline-author-manager-save-button');
    const deleteButton = panel.querySelector('.seaf-inline-author-manager-delete-button');
    const noteInput = panel.querySelector('.seaf-inline-author-manager-note-input');
    const banInput = panel.querySelector('.seaf-inline-author-manager-ban-input');
    if (!isPending) {
      if (noteInput) {
        noteInput.disabled = false;
      }
      if (banInput) {
        banInput.disabled = false;
      }
      if (saveButton) {
        saveButton.disabled = false;
      }
      if (deleteButton) {
        deleteButton.disabled = !hasDeletableRecords;
      }
    }
    if (saveButton) {
      saveButton.textContent = action === 'save'
        ? LABELS.authorManageSaving
        : LABELS.authorManageSave;
    }
    if (deleteButton) {
      deleteButton.textContent = action === 'delete'
        ? LABELS.authorManageDeleting
        : (hasDeletableRecords ? LABELS.authorManageDelete : LABELS.authorManageDeleteDisabled);
    }
  },

  isBroadNicknameOnlyAuthor(author) {
    const normalizedAuthor = this.normalizeAuthor(author);
    return Boolean(
      normalizedAuthor
      && !normalizedAuthor.uid
      && !normalizedAuthor.ip
      && normalizedAuthor.nickname === '\u3147\u3147'
    );
  },

  async applyUpdatedSettings(settings) {
    this.state.settings = this.normalizeSettings(settings);
    this.refreshJoinButtonStates();
  },

  async sendAuthorRecordMessage(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.success) {
      throw new Error(response?.error || LABELS.authorManageErrorFallback);
    }

    await this.applyUpdatedSettings(response.settings);
    return response;
  },

  async submitAuthorManager(panel) {
    const activeManager = this.state.activeAuthorManager;
    if (!activeManager || activeManager.panel !== panel) {
      return;
    }

    const context = this.getAuthorManageContext(activeManager.author);
    const noteInput = panel.querySelector('.seaf-inline-author-manager-note-input');
    const banInput = panel.querySelector('.seaf-inline-author-manager-ban-input');
    const statusMessage = panel.querySelector('.seaf-inline-author-manager-status');
    const errorMessage = panel.querySelector('.seaf-inline-author-manager-error');
    const nextNote = globalThis.SEAFDomain.normalizeAuthorNote(noteInput.value);
    const nextStatus = banInput.checked ? 'banned' : 'note';
    const pendingAction = panel.dataset.pendingAction || '';
    const needsBroadConfirm = context.matchingKeys.length === 0
      && this.isBroadNicknameOnlyAuthor(activeManager.author);

    this.clearAuthorManagerMessages(panel);

    if (nextStatus === 'note' && !nextNote) {
      errorMessage.textContent = LABELS.authorManageNoteRequired;
      return;
    }

    if (needsBroadConfirm && pendingAction !== 'confirm-broad') {
      panel.dataset.pendingAction = 'confirm-broad';
      statusMessage.textContent = LABELS.authorManageBroadConfirmText;
      return;
    }

    this.setAuthorManagerPending(panel, true, 'save');

    try {
      if (context.matchingKeys.length === 0) {
        await this.sendAuthorRecordMessage({
          type: 'ADD_AUTHOR_RECORD',
          author: activeManager.author,
          note: nextNote,
          status: nextStatus
        });
      } else {
        if (context.noteTargetKey && nextNote !== context.displayedNote) {
          await this.sendAuthorRecordMessage({
            type: 'UPDATE_AUTHOR_RECORD_NOTE',
            key: context.noteTargetKey,
            note: nextNote
          });
        }

        const statusKeys = context.summary.matches
          .filter((record) => record.status !== nextStatus)
          .map((record) => record.key);
        if (statusKeys.length > 0) {
          await this.sendAuthorRecordMessage({
            type: 'SET_AUTHOR_RECORD_STATUS',
            keys: statusKeys,
            status: nextStatus
          });
        }
      }

      this.closeAuthorManager({ restoreFocus: false });
    } catch (error) {
      errorMessage.textContent = String(error?.message || error || LABELS.authorManageErrorFallback).trim();
      this.setAuthorManagerPending(panel, false);
      noteInput.value = nextNote;
      banInput.checked = nextStatus === 'banned';
      return;
    }

    this.setAuthorManagerPending(panel, false);
  },

  async deleteAuthorManagerRecords(panel) {
    const activeManager = this.state.activeAuthorManager;
    if (!activeManager || activeManager.panel !== panel) {
      return;
    }

    const context = this.getAuthorManageContext(activeManager.author);
    if (context.deleteCount === 0) {
      return;
    }

    const statusMessage = panel.querySelector('.seaf-inline-author-manager-status');
    const errorMessage = panel.querySelector('.seaf-inline-author-manager-error');
    const deleteButton = panel.querySelector('.seaf-inline-author-manager-delete-button');
    const pendingAction = panel.dataset.pendingAction || '';

    this.clearAuthorManagerMessages(panel);

    if (pendingAction !== 'confirm-delete') {
      panel.dataset.pendingAction = 'confirm-delete';
      statusMessage.textContent = `${LABELS.authorManageDeleteConfirmTextPrefix}${context.deleteCount}${LABELS.authorManageDeleteConfirmTextSuffix}`;
      deleteButton.textContent = LABELS.authorManageDeleteConfirm;
      return;
    }

    this.setAuthorManagerPending(panel, true, 'delete');

    try {
      await this.sendAuthorRecordMessage({
        type: 'REMOVE_AUTHOR_RECORD_KEYS',
        keys: context.matchingKeys
      });
      this.closeAuthorManager({ restoreFocus: false });
    } catch (error) {
      errorMessage.textContent = String(error?.message || error || LABELS.authorManageErrorFallback).trim();
      this.setAuthorManagerPending(panel, false);
    }
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
