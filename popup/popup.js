const popupCore = globalThis.SEAFPopupCore.createPopupCore({
  chromeApi: chrome,
  fetchImpl: fetch,
  domain: globalThis.SEAFDomain
});

const HISTORY_COLLAPSED_KEY = 'seaf_popup_history_collapsed';
const SETTINGS_COLLAPSED_KEY = 'seaf_popup_settings_collapsed';

const LABELS = {
  initError: '[SEAF] popup init failed:',
  dashboardRefreshError: '[SEAF] dashboard refresh failed:',
  joinError: '[SEAF] join failed:',
  overlayTestError: '[SEAF] overlay test failed:',
  loadingDashboard: '\uB300\uC2DC\uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4...',
  refreshingPosts: '\uCD5C\uC2E0 \uBAA8\uC9D1\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uB294 \uC911\uC785\uB2C8\uB2E4...',
  waiting: '\uB300\uAE30 \uC911',
  browserOverlay: '\uBE0C\uB77C\uC6B0\uC800 \uC624\uBC84\uB808\uC774',
  currentRecruitment: '\uC0C8 \uBAA8\uC9D1',
  history: '\uAE30\uB85D',
  untitled: '\uC81C\uBAA9 \uC5C6\uC74C',
  fallbackSubject: '\uD5EC\uB2E4\uC774\uBC84\uC988 \uBAA8\uC9D1 \uAE00',
  open: '\uC5F4\uAE30',
  join: '\uCC38\uAC00',
  connecting: '\uC5F0\uACB0 \uC911...',
  joinLinkNotFound: '\uCC38\uAC00 \uB9C1\uD06C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  testRunning: '\uD14C\uC2A4\uD2B8 \uC911...',
  testFailed: '\uC624\uBC84\uB808\uC774 \uD14C\uC2A4\uD2B8\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  testSent: '\uD604\uC7AC \uD0ED\uC73C\uB85C \uD14C\uC2A4\uD2B8 \uC624\uBC84\uB808\uC774\uB97C \uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.',
  galleryOpened: '\uAC24\uB7EC\uB9AC \uD0ED\uC744 \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4.',
  allRead: '\uBAA8\uB450 \uC77D\uC74C',
  allReadDone: '\uC77D\uC9C0 \uC54A\uC740 \uBAA8\uC9D1\uC744 \uBAA8\uB450 \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.',
  settingsSaved: '\uC124\uC815\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.',
  detectionSaved: '\uC2E4\uC2DC\uAC04 \uAC10\uC9C0 \uC124\uC815\uC744 \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  browserAlertSaved: '\uBE0C\uB77C\uC6B0\uC800 \uC54C\uB9BC \uC124\uC815\uC744 \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  toastDurationSaved: '\uC624\uBC84\uB808\uC774 \uC2DC\uAC04\uC744 \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  toastDurationClamped: '\uC624\uBC84\uB808\uC774 \uC2DC\uAC04\uC744 {seconds}\uCD08\uB85C \uC870\uC815\uD588\uC2B5\uB2C8\uB2E4.',
  historyLimitSaved: '\uCD5C\uADFC \uAC10\uC9C0 \uAE30\uB85D \uAC1C\uC218\uB97C \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  historyLimitClamped: '\uCD5C\uADFC \uAC10\uC9C0 \uAE30\uB85D \uAC1C\uC218\uB97C {count}\uAC1C\uB85C \uC870\uC815\uD588\uC2B5\uB2C8\uB2E4.',
  historyRetentionSaved: '\uCD5C\uADFC \uAC10\uC9C0 \uAE30\uB85D \uBCF4\uC874 \uC2DC\uAC04\uC744 \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  historyRetentionClamped: '\uCD5C\uADFC \uAC10\uC9C0 \uAE30\uB85D \uBCF4\uC874 \uC2DC\uAC04\uC744 {minutes}\uBD84\uC73C\uB85C \uC870\uC815\uD588\uC2B5\uB2C8\uB2E4.',
  unreadWindowSaved: '\uC77D\uC9C0 \uC54A\uC740 \uBAA8\uC9D1 \uC720\uC9C0 \uC2DC\uAC04\uC744 \uBC14\uAFB8\uC5C8\uC2B5\uB2C8\uB2E4.',
  unreadWindowClamped: '\uC77D\uC9C0 \uC54A\uC740 \uBAA8\uC9D1 \uC720\uC9C0 \uC2DC\uAC04\uC744 {minutes}\uBD84\uC73C\uB85C \uC870\uC815\uD588\uC2B5\uB2C8\uB2E4.',
  saveWithoutBackground: '\uC124\uC815\uC740 \uC800\uC7A5\uB410\uC9C0\uB9CC \uBC31\uADF8\uB77C\uC6B4\uB4DC\uC640 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
  backgroundMissing: '\uBC31\uADF8\uB77C\uC6B4\uB4DC \uC5F0\uACB0 \uC5C6\uC774 \uD31D\uC5C5\uC774 \uC9C1\uC811 \uBAA9\uB85D\uC744 \uC870\uD68C\uD588\uC2B5\uB2C8\uB2E4.',
  dashboardLoadFailed: '\uB300\uC2DC\uBCF4\uB4DC\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.',
  noActiveRecruitments: '\uC9C0\uAE08 \uCC98\uB9AC\uD560 \uBAA8\uC9D1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noActiveRecruitmentsBody: '\uC0C8 \uBAA8\uC9D1\uC774 \uC7A1\uD788\uBA74 \uC5EC\uAE30\uBD80\uD130 \uCC44\uC6CC\uC9D1\uB2C8\uB2E4.',
  noHistory: '\uC544\uC9C1 \uC800\uC7A5\uB41C \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
  noHistoryBody: '\uAC10\uC9C0\uAC00 \uD55C \uBC88\uC774\uB77C\uB3C4 \uB418\uBA74 \uCD5C\uADFC \uAE30\uB85D\uC744 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.',
  collapseHistory: '\uC811\uAE30',
  expandHistory: '\uD3BC\uCE58\uAE30',
  collapseSettings: '\uC811\uAE30',
  expandSettings: '\uD3BC\uCE58\uAE30',
  alertDisabled: '\uC54C\uB9BC \uAEBC\uC9D0',
  badgeOnly: '\uBC30\uC9C0 \uC911\uC2EC',
  checkingConnection: '\uC5F0\uACB0 \uD655\uC778 \uC911'
};

document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch((error) => {
    console.error(LABELS.initError, error);
  });
});

async function initPopup() {
  const elements = getElements();
  const state = {
    settings: await popupCore.loadSettings(),
    dashboard: createEmptyDashboard(),
    ui: loadUiState()
  };

  renderVersion(elements.versionDisplay);
  renderSettings(elements, state.settings);
  renderDashboard(elements, state);
  wireInteractions(elements, state);

  await refreshDashboard(state, elements, false);
}

function getElements() {
  return {
    versionDisplay: document.getElementById('seaf-version-display'),
    markAllReadButton: document.getElementById('seaf-mark-all-read-button'),
    refreshButton: document.getElementById('seaf-refresh-button'),
    openGalleryButton: document.getElementById('seaf-open-gallery-button'),
    testToastButton: document.getElementById('seaf-test-toast-button'),
    detectionToggle: document.getElementById('seaf-detection-toggle'),
    siteAlertToggle: document.getElementById('seaf-site-alert-toggle'),
    toastDurationInput: document.getElementById('seaf-toast-duration-input'),
    historyLimitInput: document.getElementById('seaf-history-limit-input'),
    historyRetentionInput: document.getElementById('seaf-history-retention-input'),
    unreadActiveWindowInput: document.getElementById('seaf-unread-window-input'),
    pollingIntervalValue: document.getElementById('seaf-polling-interval-value'),
    workerStatusCard: document.getElementById('seaf-worker-status-card'),
    workerStatusBadge: document.getElementById('seaf-worker-status-badge'),
    workerStatusMessage: document.getElementById('seaf-worker-status-message'),
    unreadCount: document.getElementById('seaf-unread-count'),
    lastScanValue: document.getElementById('seaf-last-scan-value'),
    alertModeValue: document.getElementById('seaf-alert-mode-value'),
    feedCount: document.getElementById('seaf-feed-count'),
    historyCount: document.getElementById('seaf-history-count'),
    historyToggleButton: document.getElementById('seaf-history-toggle-button'),
    settingsToggleButton: document.getElementById('seaf-settings-toggle-button'),
    settingsPanel: document.getElementById('seaf-settings-panel') || document.querySelector('.seaf-settings-panel'),
    feedList: document.getElementById('seaf-post-list'),
    historyList: document.getElementById('seaf-history-list'),
    settingsBody: document.getElementById('seaf-settings-body') || document.getElementById('seaf-settings-content'),
    saveStatus: document.getElementById('seaf-save-status'),
    loadingStatus: document.getElementById('seaf-loading-status')
  };
}

function loadUiState() {
  try {
    return {
      isHistoryCollapsed: localStorage.getItem(HISTORY_COLLAPSED_KEY) === 'true',
      isSettingsCollapsed: localStorage.getItem(SETTINGS_COLLAPSED_KEY) === 'true'
    };
  } catch (error) {
    return {
      isHistoryCollapsed: false,
      isSettingsCollapsed: false
    };
  }
}

function persistUiState(state) {
  try {
    localStorage.setItem(HISTORY_COLLAPSED_KEY, String(Boolean(state.ui?.isHistoryCollapsed)));
    localStorage.setItem(SETTINGS_COLLAPSED_KEY, String(Boolean(state.ui?.isSettingsCollapsed)));
  } catch (error) {
    // Ignore storage failures in popup UI state.
  }
}

function createEmptyDashboard() {
  return {
    worker: popupCore.createCheckingWorkerStatus(),
    unreadPosts: [],
    historyPosts: [],
    unreadCount: 0,
    lastScanLabel: LABELS.waiting,
    alertModeLabel: LABELS.browserOverlay,
    loadMessage: LABELS.loadingDashboard
  };
}

function renderVersion(versionDisplay) {
  versionDisplay.textContent = `v${chrome.runtime.getManifest().version}`;
}

function renderSettings(elements, settings) {
  const normalizedSettings = popupCore.normalizeSettings(settings);
  elements.detectionToggle.checked = normalizedSettings.isDetectionActive;
  elements.siteAlertToggle.checked = normalizedSettings.isSiteAlertEnabled;
  elements.toastDurationInput.value = String(normalizedSettings.toastDuration);
  elements.historyLimitInput.value = String(normalizedSettings.recentHistoryLimit);
  elements.historyRetentionInput.value = String(normalizedSettings.recentHistoryRetentionMinutes);
  elements.unreadActiveWindowInput.value = String(normalizedSettings.unreadActiveWindowMinutes);
  elements.pollingIntervalValue.textContent = `${normalizedSettings.pollingInterval}\uCD08 \uACE0\uC815`;
}

function renderDashboard(elements, state) {
  const dashboard = state.dashboard;
  const worker = popupCore.normalizeWorkerStatus(dashboard.worker);

  elements.workerStatusCard.dataset.mode = worker.mode;
  elements.workerStatusBadge.textContent = worker.label;
  elements.workerStatusMessage.textContent = worker.message;
  elements.unreadCount.textContent = formatCount(dashboard.unreadCount);
  elements.lastScanValue.textContent = dashboard.lastScanLabel;
  elements.alertModeValue.textContent = dashboard.alertModeLabel;
  elements.feedCount.textContent = formatCount(dashboard.unreadPosts.length);
  elements.historyCount.textContent = formatCount(dashboard.historyPosts.length);
  elements.markAllReadButton.disabled = dashboard.unreadCount === 0;
  elements.markAllReadButton.title = LABELS.allRead;
  elements.markAllReadButton.setAttribute('aria-label', LABELS.allRead);
  renderHistoryVisibility(elements, state);
  renderSettingsVisibility(elements, state);

  renderPostList(elements.feedList, dashboard.unreadPosts, 'feed', state, elements);
  renderPostList(elements.historyList, dashboard.historyPosts, 'history', state, elements);
}

function renderHistoryVisibility(elements, state) {
  const isCollapsed = Boolean(state.ui?.isHistoryCollapsed);
  elements.historyList.hidden = isCollapsed;
  elements.historyToggleButton.dataset.collapsed = String(isCollapsed);
  elements.historyToggleButton.textContent = isCollapsed ? LABELS.expandHistory : LABELS.collapseHistory;
  elements.historyToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
}

function renderSettingsVisibility(elements, state) {
  const isCollapsed = Boolean(state.ui?.isSettingsCollapsed);
  if (!elements.settingsBody || !elements.settingsToggleButton) {
    return;
  }

  elements.settingsBody.hidden = isCollapsed;
  if (elements.settingsPanel) {
    elements.settingsPanel.dataset.collapsed = String(isCollapsed);
  }
  elements.settingsToggleButton.dataset.collapsed = String(isCollapsed);
  elements.settingsToggleButton.textContent = isCollapsed
    ? LABELS.expandSettings
    : LABELS.collapseSettings;
  elements.settingsToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
}

function renderPostList(container, posts, kind, state, elements) {
  container.replaceChildren();

  if (!Array.isArray(posts) || posts.length === 0) {
    const emptyCard = document.createElement('article');
    emptyCard.className = 'seaf-empty-card';
    emptyCard.innerHTML = kind === 'feed'
      ? `<strong>${LABELS.noActiveRecruitments}</strong><br>${LABELS.noActiveRecruitmentsBody}`
      : `<strong>${LABELS.noHistory}</strong><br>${LABELS.noHistoryBody}`;
    container.appendChild(emptyCard);
    return;
  }

  posts.forEach((post) => {
    const card = document.createElement('article');
    card.className = kind === 'feed' ? 'seaf-post-card' : 'seaf-history-card';

    const head = document.createElement('div');
    head.className = 'seaf-post-card-head';

    const meta = document.createElement('div');
    meta.className = 'seaf-post-meta';

    const chip = document.createElement('span');
    chip.className = 'seaf-post-chip';
    chip.dataset.tone = kind === 'feed' ? 'active' : 'muted';
    chip.textContent = kind === 'feed' ? LABELS.currentRecruitment : LABELS.history;

    const time = document.createElement('span');
    time.textContent = post.relativeTime || '\uBC29\uAE08';

    meta.append(chip, time);
    head.appendChild(meta);

    const title = document.createElement('div');
    title.className = 'seaf-post-title';
    title.textContent = post.title || LABELS.untitled;
    title.title = post.title || LABELS.untitled;

    const subject = document.createElement('div');
    subject.className = 'seaf-post-subject';
    subject.textContent = post.subject || LABELS.fallbackSubject;

    const actions = document.createElement('div');
    actions.className = 'seaf-post-actions';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'seaf-secondary-button';
    openButton.textContent = LABELS.open;
    openButton.addEventListener('click', async () => {
      await openPost(post);
      await refreshDashboard(state, elements, false);
    });

    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = 'seaf-action-button';
    joinButton.textContent = LABELS.join;
    joinButton.addEventListener('click', async () => {
      await joinPost(post, joinButton);
      await refreshDashboard(state, elements, false);
    });

    actions.append(openButton, joinButton);
    card.append(head, title, subject, actions);
    container.appendChild(card);
  });
}

function formatCount(value) {
  const numericValue = Number(value) || 0;
  return numericValue > 99 ? '99+' : String(numericValue);
}

function describeAlertMode(settings, worker) {
  if (!settings.isSiteAlertEnabled) {
    return LABELS.alertDisabled;
  }

  if (worker.mode === 'limited') {
    return LABELS.badgeOnly;
  }

  if (worker.mode === 'checking') {
    return LABELS.checkingConnection;
  }

  return LABELS.browserOverlay;
}

async function buildDashboard(response, settings) {
  const worker = popupCore.normalizeWorkerStatus(response?.worker);
  const unreadPosts = normalizePosts(response?.unreadPosts || response?.posts || []);
  const historyPosts = normalizePosts(response?.historyPosts || response?.recentPosts || []);

  return {
    worker,
    unreadPosts,
    historyPosts,
    unreadCount: Number.isFinite(Number(response?.unreadCount))
      ? Number(response.unreadCount)
      : unreadPosts.length,
    lastScanLabel: popupCore.formatLastScanLabel(response?.lastScanAt, response),
    alertModeLabel: describeAlertMode(settings, worker),
    loadMessage: popupCore.describePostSource(response)
  };
}

function normalizePosts(posts) {
  return Array.isArray(posts)
    ? posts.filter((post) => Number.isFinite(Number(post?.id)) && post?.title)
    : [];
}

function wireInteractions(elements, state) {
  elements.detectionToggle.addEventListener('change', async (event) => {
    state.settings = {
      ...state.settings,
      isDetectionActive: event.target.checked
    };
    await saveSettings(state, elements, LABELS.detectionSaved);
  });

  elements.siteAlertToggle.addEventListener('change', async (event) => {
    state.settings = {
      ...state.settings,
      isSiteAlertEnabled: event.target.checked
    };
    await saveSettings(state, elements, LABELS.browserAlertSaved);
  });

  elements.toastDurationInput.addEventListener('change', async (event) => {
    const rawValue = event.target.value;
    const normalizedToastDuration = popupCore.normalizeToastDuration(rawValue);
    state.settings = {
      ...state.settings,
      toastDuration: normalizedToastDuration
    };

    renderSettings(elements, state.settings);

    const message = String(rawValue).trim() !== String(normalizedToastDuration)
      ? LABELS.toastDurationClamped.replace('{seconds}', String(normalizedToastDuration))
      : LABELS.toastDurationSaved;

    await saveSettings(state, elements, message);
  });

  elements.historyLimitInput.addEventListener('change', async (event) => {
    const rawValue = event.target.value;
    const normalizedHistoryLimit = popupCore.normalizeRecentHistoryLimit(rawValue);
    state.settings = {
      ...state.settings,
      recentHistoryLimit: normalizedHistoryLimit
    };

    renderSettings(elements, state.settings);

    const message = String(rawValue).trim() !== String(normalizedHistoryLimit)
      ? LABELS.historyLimitClamped.replace('{count}', String(normalizedHistoryLimit))
      : LABELS.historyLimitSaved;

    await saveSettings(state, elements, message);
  });

  elements.historyRetentionInput.addEventListener('change', async (event) => {
    const rawValue = event.target.value;
    const normalizedRetentionMinutes = popupCore.normalizeRecentHistoryRetentionMinutes(rawValue);
    state.settings = {
      ...state.settings,
      recentHistoryRetentionMinutes: normalizedRetentionMinutes
    };

    renderSettings(elements, state.settings);

    const message = String(rawValue).trim() !== String(normalizedRetentionMinutes)
      ? LABELS.historyRetentionClamped.replace('{minutes}', String(normalizedRetentionMinutes))
      : LABELS.historyRetentionSaved;

    await saveSettings(state, elements, message);
  });

  elements.unreadActiveWindowInput.addEventListener('change', async (event) => {
    const rawValue = event.target.value;
    const normalizedUnreadWindow = popupCore.normalizeUnreadActiveWindowMinutes(rawValue);
    state.settings = {
      ...state.settings,
      unreadActiveWindowMinutes: normalizedUnreadWindow
    };

    renderSettings(elements, state.settings);

    const message = String(rawValue).trim() !== String(normalizedUnreadWindow)
      ? LABELS.unreadWindowClamped.replace('{minutes}', String(normalizedUnreadWindow))
      : LABELS.unreadWindowSaved;

    await saveSettings(state, elements, message);
  });

  elements.refreshButton.addEventListener('click', async () => {
    await refreshDashboard(state, elements, true);
  });

  elements.markAllReadButton.addEventListener('click', async () => {
    await markAllRead(state, elements);
  });

  elements.historyToggleButton.addEventListener('click', () => {
    state.ui.isHistoryCollapsed = !state.ui.isHistoryCollapsed;
    persistUiState(state);
    renderHistoryVisibility(elements, state);
  });

  elements.settingsToggleButton.addEventListener('click', () => {
    state.ui.isSettingsCollapsed = !state.ui.isSettingsCollapsed;
    persistUiState(state);
    renderSettingsVisibility(elements, state);
  });

  elements.openGalleryButton.addEventListener('click', async () => {
    await chrome.tabs.create({ url: globalThis.SEAFDomain.constants.MANGHO_LIST_URL });
    showTransientStatus(elements.saveStatus, LABELS.galleryOpened);
  });

  elements.testToastButton.addEventListener('click', async () => {
    await triggerOverlayTest(state, elements);
  });
}

async function saveSettings(state, elements, message) {
  state.settings = popupCore.normalizeSettings(state.settings);
  renderSettings(elements, state.settings);
  await chrome.storage.local.set({ seaf_settings: state.settings });

  try {
    const response = await chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED' });
    if (response?.settings) {
      state.settings = popupCore.normalizeSettings(response.settings);
      renderSettings(elements, state.settings);
    }

    if (response?.worker) {
      state.dashboard.worker = popupCore.normalizeWorkerStatus(response.worker);
      state.dashboard.alertModeLabel = describeAlertMode(state.settings, state.dashboard.worker);
      renderDashboard(elements, state);
    }

    showTransientStatus(elements.saveStatus, message || LABELS.settingsSaved);
    await refreshDashboard(state, elements, false);
  } catch (error) {
    if (!popupCore.isMissingReceiverError(error)) {
      throw error;
    }

    state.dashboard.worker = popupCore.createLimitedWorkerStatus(LABELS.backgroundMissing);
    state.dashboard.alertModeLabel = describeAlertMode(state.settings, state.dashboard.worker);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, LABELS.saveWithoutBackground);
    await refreshDashboard(state, elements, false);
  }
}

async function refreshDashboard(state, elements, isManualRefresh) {
  elements.refreshButton.disabled = true;
  elements.loadingStatus.textContent = isManualRefresh
    ? LABELS.refreshingPosts
    : LABELS.loadingDashboard;

  try {
    let response = null;
    let fallbackWorker = null;
    let shouldUseDirectFetchFallback = false;

    try {
      response = await chrome.runtime.sendMessage({ type: 'GET_LIVE_POSTS' });
      shouldUseDirectFetchFallback = !response?.success;
    } catch (error) {
      if (!popupCore.isMissingReceiverError(error)) {
        throw error;
      }

      shouldUseDirectFetchFallback = true;
      fallbackWorker = popupCore.createLimitedWorkerStatus(LABELS.backgroundMissing);
    }

    if (shouldUseDirectFetchFallback) {
      const directResponse = await popupCore.fetchPopupPostsWithFallback();
      response = {
        ...directResponse,
        worker: fallbackWorker || response?.worker
      };
    }

    state.dashboard = await buildDashboard({
      ...response,
      worker: fallbackWorker || response?.worker
    }, state.settings);
    renderDashboard(elements, state);
    elements.loadingStatus.textContent = state.dashboard.loadMessage;
  } catch (error) {
    console.error(LABELS.dashboardRefreshError, error);
    state.dashboard = createEmptyDashboard();
    state.dashboard.worker = popupCore.createLimitedWorkerStatus(
      error.message || LABELS.dashboardLoadFailed
    );
    state.dashboard.alertModeLabel = describeAlertMode(state.settings, state.dashboard.worker);
    renderDashboard(elements, state);
    elements.loadingStatus.textContent = LABELS.dashboardLoadFailed;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

async function openPost(post) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'OPEN_POST',
      postId: Number(post.id)
    });

    if (response?.success) {
      return true;
    }
  } catch (error) {
    if (!popupCore.isMissingReceiverError(error)) {
      throw error;
    }
  }

  await popupCore.markPostRead(post.id);
  await chrome.tabs.create({
    url: post.postUrl || `${globalThis.SEAFDomain.constants.VIEW_URL_PREFIX}${post.id}`
  });
  return true;
}

async function joinPost(post, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = LABELS.connecting;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'JOIN_POST',
      postId: Number(post.id)
    });

    if (!response?.success) {
      throw new Error(response?.error || LABELS.joinLinkNotFound);
    }

    if (response.link && response.opened === false) {
      await chrome.tabs.create({ url: response.link });
    }
  } catch (error) {
    try {
      const directLink = await popupCore.extractLobbyLinkDirectly(post.id);
      if (!directLink) {
        throw new Error(LABELS.joinLinkNotFound);
      }

      await popupCore.markPostRead(post.id);
      await chrome.tabs.create({ url: directLink });
    } catch (fallbackError) {
      console.error(LABELS.joinError, fallbackError);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function triggerOverlayTest(state, elements) {
  const originalLabel = elements.testToastButton.textContent;
  elements.testToastButton.disabled = true;
  elements.testToastButton.textContent = LABELS.testRunning;

  try {
    let response;

    try {
      response = await chrome.runtime.sendMessage({ type: 'TEST_ACTIVE_TAB_TOAST' });
    } catch (error) {
      if (!popupCore.isMissingReceiverError(error)) {
        throw error;
      }

      response = await popupCore.triggerTestToastDirectly(state.settings);
    }

    if (!response?.success) {
      throw new Error(response?.error || LABELS.testFailed);
    }

    showTransientStatus(elements.saveStatus, LABELS.testSent);
  } catch (error) {
    if (popupCore.isExpectedToastTestError(error)) {
      showTransientStatus(elements.saveStatus, error.message);
    } else {
      console.error(LABELS.overlayTestError, error);
      showTransientStatus(elements.saveStatus, LABELS.testFailed);
    }
  } finally {
    elements.testToastButton.disabled = false;
    elements.testToastButton.textContent = originalLabel;
  }
}

async function markAllRead(state, elements) {
  const originalLabel = elements.markAllReadButton.innerHTML;
  elements.markAllReadButton.disabled = true;
  elements.markAllReadButton.textContent = '...';

  try {
    let didClear = false;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' });
      didClear = response?.success === true;
    } catch (error) {
      if (!popupCore.isMissingReceiverError(error)) {
        throw error;
      }
    }

    if (!didClear) {
      await chrome.storage.local.set({ seaf_unread_post_ids: [] });
    }

    showTransientStatus(elements.saveStatus, LABELS.allReadDone);
    await refreshDashboard(state, elements, false);
  } finally {
    elements.markAllReadButton.innerHTML = originalLabel;
  }
}

function showTransientStatus(element, message) {
  element.textContent = message;
  window.setTimeout(() => {
    if (element.textContent === message) {
      element.textContent = '';
    }
  }, 2200);
}
