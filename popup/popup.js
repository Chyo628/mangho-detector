const popupCore = globalThis.SEAFPopupCore.createPopupCore({
  chromeApi: chrome,
  fetchImpl: fetch,
  domain: globalThis.SEAFDomain
});
const settingsClientModule = globalThis.SEAFSettingsClient
  || (typeof module !== 'undefined' && module.exports ? require('./settings-client.js') : null);
const settingsClient = settingsClientModule.createSettingsClient({
  chromeApi: chrome,
  popupCore
});

const HISTORY_COLLAPSED_KEY = 'seaf_popup_history_collapsed';
const SETTINGS_COLLAPSED_KEY = 'seaf_popup_settings_collapsed';
const AUTHOR_MANAGER_COLLAPSED_KEY = 'seaf_popup_author_manager_collapsed';
const AUTHOR_BAN_LIST_COLLAPSED_KEY = 'seaf_popup_author_ban_list_collapsed';
const AUTHOR_NOTE_LIST_COLLAPSED_KEY = 'seaf_popup_author_note_list_collapsed';
const MAX_AUTHOR_NOTE_LENGTH = Number(
  globalThis.SEAFDomain?.constants?.MAX_AUTHOR_NOTE_LENGTH
    || globalThis.SEAFDomain?.constants?.MAX_AUTHOR_RECORD_NOTE_LENGTH
    || globalThis.SEAFDomain?.constants?.MAX_AUTHOR_BAN_NOTE_LENGTH
) || 240;
let popupInitializationStarted = false;

const LABELS = {
  initError: '[SEAF] popup init failed:',
  dashboardRefreshError: '[SEAF] dashboard refresh failed:',
  joinError: '[SEAF] join failed:',
  overlayTestError: '[SEAF] overlay test failed:',
  loadingDashboard: '대시보드를 불러오는 중입니다...',
  refreshingPosts: '최신 모집을 다시 확인하는 중입니다...',
  waiting: '대기 중',
  browserOverlay: '브라우저 오버레이',
  currentRecruitment: '새 모집',
  history: '기록',
  untitled: '제목 없음',
  fallbackSubject: '헬다이버즈 모집 글',
  open: '열기',
  join: '참가',
  markRead: '읽음',
  markingRead: '처리 중...',
  markReadDone: '모집을 읽음 처리했습니다.',
  markReadFailed: '읽음 처리하지 못했습니다.',
  connecting: '연결 중...',
  joinLinkNotFound: '참가 링크를 찾지 못했습니다.',
  backgroundUnavailable: '백그라운드 연결이 끊겼습니다.',
  joinRecovery: '{reason} 게시글 열기로 직접 확인해 주세요.',
  joinDirectOpened: '참가 링크를 직접 열었습니다. 읽지 않은 상태는 유지됩니다.',
  testRunning: '테스트 중...',
  testFailed: '오버레이 테스트에 실패했습니다.',
  testSent: '현재 탭으로 테스트 오버레이를 보냈습니다.',
  galleryOpened: '갤러리 탭을 열었습니다.',
  allRead: '모두 읽음',
  allReadDone: '읽지 않은 모집을 모두 정리했습니다.',
  allReadFailed: '읽지 않은 모집을 정리하지 못했습니다.',
  settingsSaved: '설정을 저장했습니다.',
  detectionSaved: '실시간 감지 설정을 바꿨습니다.',
  browserAlertSaved: '브라우저 알림 설정을 바꿨습니다.',
  browserAlertPermissionGranted: '모든 웹사이트에 오버레이를 표시할 권한을 허용했습니다.',
  browserAlertPermissionDenied: '브라우저 알림을 켜려면 모든 웹사이트의 오버레이 표시 권한을 허용해야 합니다.',
  browserAlertPermissionMissing: '저장된 브라우저 알림 설정을 끕니다. 다시 켜면 권한을 요청합니다.',
  browserAlertPermissionRemoved: '브라우저 알림 권한을 해제했습니다.',
  browserAlertPermissionRemovalFailed: '브라우저 알림은 껐지만 사이트 권한은 브라우저 설정에서 직접 해제해야 합니다.',
  masterToggleOn: '실시간 감지와 브라우저 알림을 함께 켰습니다.',
  masterToggleOff: '실시간 감지와 브라우저 알림을 함께 껐습니다.',
  toastDurationSaved: '오버레이 시간을 바꿨습니다.',
  toastDurationClamped: '오버레이 시간을 {seconds}초로 조정했습니다.',
  historyLimitSaved: '최근 감지 기록 개수를 바꿨습니다.',
  historyLimitClamped: '최근 감지 기록 개수를 {count}개로 조정했습니다.',
  historyRetentionSaved: '최근 감지 기록 보존 시간을 바꿨습니다.',
  historyRetentionClamped: '최근 감지 기록 보존 시간을 {minutes}분으로 조정했습니다.',
  unreadWindowSaved: '읽지 않은 모집 유지 시간을 바꿨습니다.',
  unreadWindowClamped: '읽지 않은 모집 유지 시간을 {minutes}분으로 조정했습니다.',
  saveWithoutBackground: '설정은 저장됐지만 백그라운드와 연결되지 않았습니다.',
  backgroundMissing: '백그라운드 연결 없이 팝업이 직접 목록을 조회했습니다.',
  dashboardLoadFailed: '대시보드를 불러오지 못했습니다.',
  noActiveRecruitments: '지금 처리할 모집이 없습니다.',
  noActiveRecruitmentsBody: '새 모집이 잡히면 여기부터 채워집니다.',
  noHistory: '아직 저장된 기록이 없습니다.',
  noHistoryBody: '감지가 한 번이라도 되면 최근 기록을 보여줍니다.',
  collapseHistory: '접기',
  expandHistory: '펼치기',
  collapseSettings: '접기',
  expandSettings: '펼치기',
  collapseAuthorManager: '접기',
  expandAuthorManager: '펼치기',
  alertDisabled: '알림 꺼짐',
  badgeOnly: '배지 중심',
  checkingConnection: '연결 확인 중',
  authorBanSaved: '작성자를 밴으로 저장했습니다.',
  authorBanDuplicate: '이미 등록된 글쓴이입니다.',
  authorBanInvalid: '등록할 닉네임이나 글쓴이 정보를 찾지 못했습니다.',
  authorBanRemoved: '밴 항목을 삭제했습니다.',
  authorBanNoSelection: '선택된 밴 항목이 없습니다.',
  authorBanWarnModeSaved: '밴 경고 모드를 저장했습니다.',
  authorBanHideModeSaved: '밴 숨김 모드를 저장했습니다.',
  authorBanCommonNicknameConfirm: '"ㅇㅇ"은 매우 넓게 매칭됩니다. 그대로 추가할까요?',
  authorBanChipWarn: '밴 글쓴이 · 경고',
  authorBanChipHide: '밴 글쓴이 · 배너 숨김',
  authorBanQuickAdd: '밴 추가',
  authorBanQuickNotePrompt: '밴 메모를 입력하세요. 비워두면 기본 경고 문구가 표시됩니다.',
  authorBanJoinConfirmSaved: '밴 글쓴이 참가 확인 설정을 저장했습니다.',
  authorNoteSaved: '글쓴이 메모를 저장했습니다.',
  authorNoteUpdated: '글쓴이 메모를 저장했습니다.',
  authorNoteRemoved: '글쓴이 메모를 삭제했습니다.',
  authorNoteRequired: '글쓴이 메모를 입력해 주세요.',
  authorNoteQuickAdd: '메모 추가',
  authorNoteQuickEdit: '메모 편집',
  authorNoteQuickPrompt: '글쓴이 메모를 입력하세요.',
  authorNoteChip: '글쓴이 메모',
  authorRecordMoveToNote: '메모로 전환',
  authorRecordMoveToBan: '밴으로 전환',
  authorRecordMovedToNote: '일반 메모로 전환했습니다.',
  authorRecordMovedToBan: '밴으로 전환했습니다.',
  authorRecordUndoDone: '전환을 취소했습니다.',
  authorRecordUndoFailed: '전환을 되돌리지 못했습니다. 다시 시도하세요.',
  authorRecordSwapFailed: '목록을 전환하지 못했습니다. 다시 시도하세요.',
  authorRecordNoteDirty: '저장되지 않은 변경',
  authorRecordNoteSaving: '저장 중…',
  authorRecordNoteSaveFailed: '저장하지 못했습니다. 입력 내용은 유지됩니다.',
  authorRecordNoteSave: '저장',
  authorRecordCapacityReached: '글쓴이 기록은 최대 200개까지 저장할 수 있습니다.',
  authorManagerSelectionModeOn: '선택 관리 종료',
  authorManagerSelectionModeOff: '선택 관리',
  authorManagerSearchEmpty: '검색 결과가 없습니다.',
  authorManagerEmpty: '저장된 작성자 기록이 없습니다.',
  authorManagerEmptyHint: '닉네임과 메모를 추가하거나 갤러리에서 바로 기록하세요.',
  authorManagerBulkBanned: '선택한 작성자를 밴으로 전환했습니다.',
  authorManagerBulkUnbanned: '선택한 작성자의 밴을 해제했습니다.',
  authorManagerBulkDeleteConfirm: '선택한 작성자 기록 {count}개를 삭제할까요?',
  authorManagerSelectionRequired: '선택된 작성자가 없습니다.',
  anonymousAuthor: '익명 글쓴이'
};
const confirmPanelsModule = globalThis.SEAFPopupConfirmPanels
  || (typeof module !== 'undefined' && module.exports ? require('./confirm-panels.js') : null);
const joinGuardModule = globalThis.SEAFJoinGuard
  || (typeof module !== 'undefined' && module.exports
    ? require('../scripts/shared/seaf-join-guard.js')
    : null);
const confirmPanels = confirmPanelsModule.createConfirmPanels({
  labels: LABELS,
  joinGuardModule
});
const permissionsModule = globalThis.SEAFPermissions
  || (typeof module !== 'undefined' && module.exports
    ? require('../scripts/shared/seaf-permissions.js')
    : null);
const permissionsControllerModule = globalThis.SEAFPopupPermissionsController
  || (typeof module !== 'undefined' && module.exports
    ? require('./permissions-controller.js')
    : null);
const permissionsController = permissionsControllerModule.createPermissionsController({
  permissionsApi: chrome.permissions,
  permissionsModule,
  settingsClient,
  popupCore,
  missingPermissionMessage: LABELS.browserAlertPermissionMissing
});
const {
  normalizeOptionalPermissionSettings,
  requestOptionalSitePermissions,
  removeOptionalSitePermissions
} = permissionsController;

document.addEventListener('DOMContentLoaded', () => {
  if (popupInitializationStarted) {
    return;
  }
  popupInitializationStarted = true;
  initPopup().catch((error) => {
    console.error(LABELS.initError, error);
  });
});

async function initPopup() {
  const elements = getElements();
  const permissionResult = await normalizeOptionalPermissionSettings(
    await settingsClient.getSettings()
  );
  const state = {
    settings: permissionResult.settings,
    dashboard: createEmptyDashboard(),
    ui: loadUiState()
  };

  renderVersion(elements.versionDisplay);
  renderSettings(elements, state);
  renderDashboard(elements, state);
  wireInteractions(elements, state);
  setPermissionStatus(elements, permissionResult.message);

  await refreshDashboard(state, elements, false);
}

function getElements() {
  return {
    versionDisplay: document.getElementById('seaf-version-display'),
    masterToggle: document.getElementById('seaf-master-toggle'),
    masterToggleLabel: document.getElementById('seaf-master-toggle-label'),
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
    authorManagerPanel: document.getElementById('seaf-author-manager-panel'),
    authorManagerBody: document.getElementById('seaf-author-manager-body'),
    authorManagerToggleButton: document.getElementById('seaf-author-manager-toggle-button'),
    authorManagerCount: document.getElementById('seaf-author-manager-count'),
    authorManagerNicknameInput: document.getElementById('seaf-author-manager-nickname-input'),
    authorManagerNoteInput: document.getElementById('seaf-author-manager-note-input'),
    authorManagerBanToggle: document.getElementById('seaf-author-manager-ban-toggle'),
    authorManagerAddButton: document.getElementById('seaf-author-manager-add-button'),
    authorManagerSearchInput: document.getElementById('seaf-author-manager-search-input'),
    authorManagerFilterButtons: [...document.querySelectorAll('#seaf-author-manager-panel [data-filter]')],
    authorManagerSelectionModeButton: document.getElementById('seaf-author-manager-selection-mode-button'),
    authorManagerSelectionBar: document.getElementById('seaf-author-manager-selection-bar'),
    authorManagerSelectVisible: document.getElementById('seaf-author-manager-select-visible'),
    authorManagerBulkBanButton: document.getElementById('seaf-author-manager-bulk-ban-button'),
    authorManagerBulkUnbanButton: document.getElementById('seaf-author-manager-bulk-unban-button'),
    authorManagerBulkDeleteButton: document.getElementById('seaf-author-manager-bulk-delete-button'),
    authorManagerList: document.getElementById('seaf-author-manager-list'),
    authorBanModeInputs: [...document.querySelectorAll('input[name="seaf-author-ban-mode"]')],
    authorBanJoinConfirmToggle: document.getElementById('seaf-author-ban-join-confirm-toggle'),
    authorRecordUndo: document.getElementById('seaf-author-record-undo'),
    authorRecordUndoMessage: document.getElementById('seaf-author-record-undo-message'),
    authorRecordUndoButton: document.getElementById('seaf-author-record-undo-button'),
    pollingIntervalValue: document.getElementById('seaf-polling-interval-value'),
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
    settingsBody: document.getElementById('seaf-settings-body'),
    saveStatus: document.getElementById('seaf-save-status'),
    permissionStatus: document.getElementById('seaf-permission-status'),
    loadingStatus: document.getElementById('seaf-loading-status')
  };
}

function setPermissionStatus(elements, message) {
  if (elements.permissionStatus) {
    elements.permissionStatus.textContent = message || '';
  }
}

function loadUiState() {
  try {
    const storedAuthorManagerCollapsed = localStorage.getItem(AUTHOR_MANAGER_COLLAPSED_KEY);
    return {
      isHistoryCollapsed: localStorage.getItem(HISTORY_COLLAPSED_KEY) === 'true',
      isSettingsCollapsed: localStorage.getItem(SETTINGS_COLLAPSED_KEY) === 'true',
      isAuthorManagerCollapsed: storedAuthorManagerCollapsed === null
        ? (
          localStorage.getItem(AUTHOR_BAN_LIST_COLLAPSED_KEY) === 'true'
          && localStorage.getItem(AUTHOR_NOTE_LIST_COLLAPSED_KEY) === 'true'
        )
        : storedAuthorManagerCollapsed === 'true',
      authorManagerQuery: '',
      authorManagerFilter: 'all',
      authorManagerSelectionMode: false,
      selectedAuthorRecordKeys: [],
      authorManagerDrafts: {},
      authorManagerDeletedKeys: [],
      authorRecordUndo: null
    };
  } catch (error) {
    return {
      isHistoryCollapsed: false,
      isSettingsCollapsed: false,
      isAuthorManagerCollapsed: false,
      authorManagerQuery: '',
      authorManagerFilter: 'all',
      authorManagerSelectionMode: false,
      selectedAuthorRecordKeys: [],
      authorManagerDrafts: {},
      authorManagerDeletedKeys: [],
      authorRecordUndo: null
    };
  }
}

function persistUiState(state) {
  try {
    localStorage.setItem(HISTORY_COLLAPSED_KEY, String(Boolean(state.ui?.isHistoryCollapsed)));
    localStorage.setItem(SETTINGS_COLLAPSED_KEY, String(Boolean(state.ui?.isSettingsCollapsed)));
    localStorage.setItem(
      AUTHOR_MANAGER_COLLAPSED_KEY,
      String(Boolean(state.ui?.isAuthorManagerCollapsed))
    );
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

function renderSettings(elements, state) {
  const normalizedSettings = popupCore.normalizeSettings(state.settings);
  state.settings = normalizedSettings;
  const isMasterEnabled = normalizedSettings.isDetectionActive && normalizedSettings.isSiteAlertEnabled;

  elements.masterToggle.checked = isMasterEnabled;
  elements.masterToggle.setAttribute('aria-checked', String(isMasterEnabled));
  elements.masterToggleLabel.textContent = isMasterEnabled ? 'ON' : 'OFF';
  elements.detectionToggle.checked = normalizedSettings.isDetectionActive;
  elements.siteAlertToggle.checked = normalizedSettings.isSiteAlertEnabled;
  elements.toastDurationInput.value = String(normalizedSettings.toastDuration);
  elements.historyLimitInput.value = String(normalizedSettings.recentHistoryLimit);
  elements.historyRetentionInput.value = String(normalizedSettings.recentHistoryRetentionMinutes);
  elements.unreadActiveWindowInput.value = String(normalizedSettings.unreadActiveWindowMinutes);
  elements.pollingIntervalValue.textContent = `${normalizedSettings.pollingInterval}초 고정`;

  elements.authorBanModeInputs.forEach((input) => {
    input.checked = input.value === normalizedSettings.authorBanOverlayMode;
  });
  if (elements.authorBanJoinConfirmToggle) {
    elements.authorBanJoinConfirmToggle.checked = normalizedSettings.confirmBannedAuthorJoin !== false;
  }

  renderAuthorManager(elements, state);
  renderAuthorManagerVisibility(elements, state);
  renderAuthorRecordUndo(elements, state);
}

function renderDashboard(elements, state) {
  const dashboard = state.dashboard;
  const worker = popupCore.normalizeWorkerStatus(dashboard.worker);

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

function renderAuthorManagerVisibility(elements, state) {
  if (!elements.authorManagerBody || !elements.authorManagerToggleButton) {
    return;
  }

  const isCollapsed = Boolean(state.ui?.isAuthorManagerCollapsed);
  elements.authorManagerBody.hidden = isCollapsed;
  if (elements.authorManagerPanel) {
    elements.authorManagerPanel.dataset.collapsed = String(isCollapsed);
  }
  elements.authorManagerToggleButton.dataset.collapsed = String(isCollapsed);
  elements.authorManagerToggleButton.textContent = isCollapsed
    ? LABELS.expandAuthorManager
    : LABELS.collapseAuthorManager;
  elements.authorManagerToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
}

function renderAuthorRecordUndo(elements, state) {
  if (!elements.authorRecordUndo || !elements.authorRecordUndoMessage) {
    return;
  }

  const undo = state.ui?.authorRecordUndo;
  elements.authorRecordUndo.hidden = !undo;
  elements.authorRecordUndoMessage.textContent = undo?.message || '';
  if (elements.authorRecordUndoButton) {
    elements.authorRecordUndoButton.disabled = Boolean(undo?.isPending);
  }
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
    const authorSummary = getAuthorRecordMatchSummary(getAuthorRecords(state), post.author);
    const isAuthorBanned = authorSummary.isBanned;
    const hasAuthorNote = authorSummary.hasNote;
    const visibleAuthorNote = isAuthorBanned ? authorSummary.banNote : authorSummary.note;

    const card = document.createElement('article');
    card.className = kind === 'feed' ? 'seaf-post-card' : 'seaf-history-card';
    if (isAuthorBanned) {
      card.dataset.authorBanned = 'true';
    } else if (hasAuthorNote) {
      card.dataset.authorNoted = 'true';
    }

    const head = document.createElement('div');
    head.className = 'seaf-post-card-head';

    const meta = document.createElement('div');
    meta.className = 'seaf-post-meta';

    const chip = document.createElement('span');
    chip.className = 'seaf-post-chip';
    chip.dataset.tone = kind === 'feed' ? 'active' : 'muted';
    chip.textContent = kind === 'feed' ? LABELS.currentRecruitment : LABELS.history;
    meta.appendChild(chip);

    if (isAuthorBanned) {
      const banChip = document.createElement('span');
      banChip.className = 'seaf-post-chip';
      banChip.dataset.tone = 'danger';
      banChip.textContent = state.settings.authorBanOverlayMode === 'hide'
        ? LABELS.authorBanChipHide
        : LABELS.authorBanChipWarn;
      meta.appendChild(banChip);
    } else if (hasAuthorNote) {
      const noteChip = document.createElement('span');
      noteChip.className = 'seaf-post-chip';
      noteChip.dataset.tone = 'info';
      noteChip.textContent = LABELS.authorNoteChip;
      meta.appendChild(noteChip);
    }

    const time = document.createElement('span');
    time.textContent = post.relativeTime || '방금';
    meta.appendChild(time);
    head.appendChild(meta);

    const title = document.createElement('div');
    title.className = 'seaf-post-title';
    title.textContent = post.title || LABELS.untitled;
    title.title = post.title || LABELS.untitled;

    const subject = document.createElement('div');
    subject.className = 'seaf-post-subject';
    subject.textContent = post.subject || LABELS.fallbackSubject;

    const authorRow = document.createElement('div');
    authorRow.className = 'seaf-post-author-row';

    const authorName = document.createElement('div');
    authorName.className = 'seaf-post-author';
    authorName.textContent = getAuthorDisplayName(post.author);
    if (visibleAuthorNote) {
      authorName.title = visibleAuthorNote;
    }
    authorRow.appendChild(authorName);

    if (post.author) {
      const primaryRecord = isAuthorBanned
        ? (authorSummary.primaryBannedRecord || authorSummary.primaryRecord)
        : authorSummary.primaryRecord;
      const noteRecord = isAuthorBanned
        ? (authorSummary.banNoteRecord || primaryRecord)
        : (authorSummary.noteRecord || primaryRecord);
      const hasEditableNote = isAuthorBanned
        ? authorSummary.hasBanNote
        : authorSummary.hasNote;
      const matchingStatusKeys = authorSummary.matches
        .filter((record) => record.status === (isAuthorBanned ? 'banned' : 'note'))
        .map((record) => record.key);

      const quickNoteButton = document.createElement('button');
      quickNoteButton.type = 'button';
      quickNoteButton.className = 'seaf-secondary-button';
      quickNoteButton.dataset.action = hasEditableNote ? 'author-note-edit' : 'author-note-add';
      quickNoteButton.textContent = hasEditableNote
        ? LABELS.authorNoteQuickEdit
        : LABELS.authorNoteQuickAdd;
      quickNoteButton.addEventListener('click', async () => {
        await editPostAuthorNote(post, noteRecord, state, elements);
      });
      authorRow.appendChild(quickNoteButton);

      const quickSwapButton = document.createElement('button');
      quickSwapButton.type = 'button';
      quickSwapButton.className = isAuthorBanned
        ? 'seaf-secondary-button seaf-author-swap-button'
        : 'seaf-secondary-button';
      quickSwapButton.dataset.action = primaryRecord
        ? 'author-record-swap'
        : 'author-ban';
      quickSwapButton.textContent = primaryRecord
        ? (isAuthorBanned ? LABELS.authorRecordMoveToNote : LABELS.authorRecordMoveToBan)
        : LABELS.authorBanQuickAdd;
      quickSwapButton.addEventListener('click', async () => {
        if (primaryRecord?.key) {
          await moveAuthorRecordKeys(
            matchingStatusKeys,
            isAuthorBanned ? 'note' : 'banned',
            state,
            elements,
            isAuthorBanned ? LABELS.authorRecordMovedToNote : LABELS.authorRecordMovedToBan
          );
          return;
        }
        await addPostAuthorBan(post, state, elements);
      });
      authorRow.appendChild(quickSwapButton);
    }

    const actions = document.createElement('div');
    actions.className = 'seaf-post-actions';

    const feedback = document.createElement('p');
    feedback.className = 'seaf-post-feedback';
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'seaf-secondary-button';
    openButton.dataset.action = 'open';
    openButton.textContent = LABELS.open;
    openButton.addEventListener('click', async () => {
      await openPost(post);
      await refreshDashboard(state, elements, false);
    });

    const joinButton = document.createElement('button');
    joinButton.type = 'button';
    joinButton.className = isAuthorBanned
      ? 'seaf-action-button seaf-danger-button'
      : 'seaf-action-button';
    joinButton.dataset.action = 'join';
    joinButton.textContent = isAuthorBanned ? '주의 · 참가' : LABELS.join;
    joinButton.setAttribute('aria-expanded', 'false');
    joinButton.addEventListener('click', async () => {
      if (isAuthorBanned) {
        await confirmPanels.requestBannedJoin({
          card,
          triggerButton: joinButton,
          note: authorSummary.banNote,
          isBannedAuthor: true,
          confirmBannedAuthorJoin: state.settings.confirmBannedAuthorJoin !== false,
          onContinue: async () => {
            const joined = await joinPost(post, joinButton, feedback);
            if (joined) {
              await refreshDashboard(state, elements, false);
            }
            return joined;
          }
        });
        return;
      }

      const joined = await joinPost(post, joinButton, feedback);
      if (joined) {
        await refreshDashboard(state, elements, false);
      }
    });

    if (kind === 'feed') {
      const markReadButton = document.createElement('button');
      markReadButton.type = 'button';
      markReadButton.className = 'seaf-secondary-button';
      markReadButton.dataset.action = 'dismiss';
      markReadButton.textContent = LABELS.markRead;
      markReadButton.addEventListener('click', async () => {
        const marked = await markPostRead(post, markReadButton, feedback, elements);
        if (marked) {
          await refreshDashboard(state, elements, false);
        }
      });
      actions.append(markReadButton);
    }

    actions.append(openButton, joinButton);
    card.append(head, title, subject, authorRow, feedback, actions);
    container.appendChild(card);
  });
}

function renderAuthorManager(elements, state) {
  if (!elements.authorManagerList) {
    return;
  }

  captureAuthorManagerDrafts(elements, state);

  const allEntries = getAuthorRecords(state);
  const visibleEntries = getVisibleManagedAuthorRecords(state);
  const visibleKeySet = new Set(visibleEntries.map((entry) => entry.key));
  const selectedSet = new Set(
    (state.ui.selectedAuthorRecordKeys || []).filter((key) => visibleKeySet.has(key))
  );
  state.ui.selectedAuthorRecordKeys = [...selectedSet];

  const bannedCount = allEntries.filter((entry) => entry.status === 'banned').length;
  const noteCount = allEntries.length - bannedCount;
  elements.authorManagerCount.textContent = `전체 ${allEntries.length} · 밴 ${bannedCount} · 메모 ${noteCount}`;
  elements.authorManagerSearchInput.value = state.ui.authorManagerQuery || '';
  elements.authorManagerBanToggle.checked = Boolean(elements.authorManagerBanToggle.checked);

  const isSelectionMode = Boolean(state.ui.authorManagerSelectionMode);
  elements.authorManagerSelectionModeButton.textContent = isSelectionMode
    ? LABELS.authorManagerSelectionModeOn
    : LABELS.authorManagerSelectionModeOff;
  elements.authorManagerSelectionModeButton.setAttribute('aria-pressed', String(isSelectionMode));
  elements.authorManagerSelectionBar.hidden = !isSelectionMode;
  elements.authorManagerBulkBanButton.disabled = selectedSet.size === 0;
  elements.authorManagerBulkUnbanButton.disabled = selectedSet.size === 0;
  elements.authorManagerBulkDeleteButton.disabled = selectedSet.size === 0;
  elements.authorManagerSelectVisible.checked =
    visibleEntries.length > 0 && selectedSet.size === visibleEntries.length;
  elements.authorManagerSelectVisible.indeterminate =
    selectedSet.size > 0 && selectedSet.size < visibleEntries.length;
  elements.authorManagerSelectVisible.disabled = visibleEntries.length === 0;

  elements.authorManagerFilterButtons.forEach((button) => {
    const filter = button.dataset.filter || 'all';
    button.setAttribute('aria-pressed', String(state.ui.authorManagerFilter === filter));
  });

  elements.authorManagerList.replaceChildren();

  if (visibleEntries.length === 0) {
    const emptyCard = document.createElement('article');
    emptyCard.className = 'seaf-empty-card';
    const emptyTitle = document.createElement('strong');
    const emptyBody = document.createElement('span');
    emptyTitle.textContent = state.ui.authorManagerQuery
      ? LABELS.authorManagerSearchEmpty
      : LABELS.authorManagerEmpty;
    emptyBody.textContent = state.ui.authorManagerQuery
      ? state.ui.authorManagerQuery
      : LABELS.authorManagerEmptyHint;
    emptyCard.append(emptyTitle, document.createElement('br'), emptyBody);
    elements.authorManagerList.appendChild(emptyCard);
    return;
  }

  visibleEntries.forEach((entry, index) => {
    const row = document.createElement('article');
    row.className = 'seaf-author-record-entry seaf-author-manager-entry';
    row.dataset.status = entry.status;
    row.dataset.authorRecordKey = entry.key;

    const head = document.createElement('div');
    head.className = 'seaf-author-record-entry-main seaf-author-manager-entry-main';

    const leading = document.createElement('div');
    leading.className = 'seaf-author-manager-entry-leading';

    if (isSelectionMode) {
      const selectionLabel = document.createElement('label');
      selectionLabel.className = 'seaf-author-record-entry-select seaf-author-manager-entry-select';
      const selectBox = document.createElement('input');
      selectBox.type = 'checkbox';
      selectBox.checked = selectedSet.has(entry.key);
      selectBox.addEventListener('change', () => {
        toggleAuthorRecordSelection(state, entry.key, selectBox.checked);
        renderAuthorManager(elements, state);
      });
      const selectText = document.createElement('span');
      selectText.textContent = '선택';
      selectionLabel.append(selectBox, selectText);
      leading.appendChild(selectionLabel);
    }

    const copy = document.createElement('div');
    copy.className = 'seaf-author-record-entry-copy';

    const title = document.createElement('div');
    title.className = 'seaf-author-record-entry-title';
    title.textContent = entry.label || entry.displayName || entry.nickname
      || entry.uid || entry.ip || entry.value || entry.key;

    const meta = document.createElement('div');
    meta.className = 'seaf-author-record-entry-meta';
    meta.textContent = getAuthorRecordMeta(entry);

    copy.append(title, meta);
    leading.appendChild(copy);

    const actions = document.createElement('div');
    actions.className = 'seaf-author-manager-entry-actions';

    const banLabel = document.createElement('label');
    banLabel.className = 'seaf-inline-check seaf-author-manager-row-toggle';
    const banCheckbox = document.createElement('input');
    banCheckbox.type = 'checkbox';
    banCheckbox.checked = entry.status === 'banned';
    const banText = document.createElement('span');
    banText.textContent = '밴';
    banLabel.append(banCheckbox, banText);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'seaf-secondary-button seaf-danger-button';
    removeButton.textContent = '삭제';

    actions.append(banLabel, removeButton);
    head.append(leading, actions);

    const noteRow = document.createElement('div');
    noteRow.className = 'seaf-author-record-note-row seaf-author-manager-note-row';

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'seaf-text-input seaf-author-record-note-editor';
    noteInput.value = getAuthorManagerDraftValue(state, entry.key, entry.note || '');
    noteInput.placeholder = '메모';
    noteInput.maxLength = MAX_AUTHOR_NOTE_LENGTH;
    noteInput.dataset.authorRecordNoteKey = entry.key;
    noteInput.dataset.originalValue = entry.note || '';
    noteInput.setAttribute('aria-label', `${title.textContent} 메모`);

    const noteSaveButton = document.createElement('button');
    noteSaveButton.type = 'button';
    noteSaveButton.className = 'seaf-secondary-button seaf-author-record-note-save';
    noteSaveButton.textContent = LABELS.authorRecordNoteSave;
    noteSaveButton.disabled = true;

    noteRow.append(noteInput, noteSaveButton);

    const noteStatus = document.createElement('div');
    noteStatus.className = 'seaf-author-record-note-status';
    noteStatus.setAttribute('role', 'status');

    const updateDirtyState = () => {
      const isDirty = normalizeAuthorRecordNote(noteInput.value)
        !== normalizeAuthorRecordNote(noteInput.dataset.originalValue);
      noteSaveButton.disabled = !isDirty;
      noteStatus.textContent = isDirty ? LABELS.authorRecordNoteDirty : '';
      noteStatus.dataset.tone = isDirty ? 'dirty' : '';
    };

    const saveNote = async () => {
      if (noteSaveButton.disabled) {
        return;
      }

      const normalizedDraft = normalizeAuthorRecordNote(noteInput.value);
      if (entry.status === 'note' && !normalizedDraft) {
        noteStatus.textContent = LABELS.authorNoteRequired;
        noteStatus.dataset.tone = 'error';
        noteSaveButton.disabled = false;
        state.ui.authorManagerDrafts = {
          ...(state.ui.authorManagerDrafts || {}),
          [entry.key]: noteInput.value
        };
        return;
      }

      noteInput.disabled = true;
      noteSaveButton.disabled = true;
      noteStatus.textContent = LABELS.authorRecordNoteSaving;
      noteStatus.dataset.tone = '';
      try {
        await updateAuthorRecordNote(entry.key, noteInput.value, state);
        const savedEntry = getAuthorRecords(state)
          .find((candidate) => candidate.key === entry.key);
        const savedNote = savedEntry?.note || '';
        noteInput.value = savedNote;
        noteInput.dataset.originalValue = savedNote;
        if (state.ui?.authorManagerDrafts) {
          delete state.ui.authorManagerDrafts[entry.key];
        }
        noteStatus.textContent = LABELS.authorNoteUpdated;
        noteStatus.dataset.tone = 'success';
        renderDashboard(elements, state);
        renderAuthorManager(elements, state);
      } catch (error) {
        noteStatus.textContent = LABELS.authorRecordNoteSaveFailed;
        noteStatus.dataset.tone = 'error';
        noteSaveButton.disabled = false;
      } finally {
        noteInput.disabled = false;
      }
    };

    banCheckbox.addEventListener('change', async () => {
      banCheckbox.disabled = true;
      removeButton.disabled = true;
      try {
        await moveAuthorRecordKeys(
          [entry.key],
          banCheckbox.checked ? 'banned' : 'note',
          state,
          elements,
          banCheckbox.checked ? LABELS.authorRecordMovedToBan : LABELS.authorRecordMovedToNote
        );
      } finally {
        renderAuthorManager(elements, state);
      }
    });

    removeButton.addEventListener('click', async (event) => {
      event.preventDefault();
      await removeAuthorRecordKeys(
        [entry.key],
        state,
        elements,
        entry.status === 'banned' ? LABELS.authorBanRemoved : LABELS.authorNoteRemoved
      );
    });

    noteInput.addEventListener('input', updateDirtyState);
    noteSaveButton.addEventListener('click', saveNote);
    noteInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void saveNote();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        noteInput.value = noteInput.dataset.originalValue || '';
        updateDirtyState();
      }
    });
    updateDirtyState();

    row.append(head, noteRow, noteStatus);
    elements.authorManagerList.appendChild(row);
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
    ? posts
      .filter((post) => Number.isFinite(Number(post?.id)) && post?.title)
      .map((post) => ({ ...post }))
    : [];
}

function wireInteractions(elements, state) {
  elements.masterToggle.addEventListener('change', async (event) => {
    const isEnabled = Boolean(event.target.checked);
    if (isEnabled) {
      const granted = await requestOptionalSitePermissions();
      if (!granted) {
        renderSettings(elements, state);
        setPermissionStatus(elements, LABELS.browserAlertPermissionDenied);
        return;
      }
      setPermissionStatus(elements, LABELS.browserAlertPermissionGranted);
    } else {
      const removed = await removeOptionalSitePermissions();
      setPermissionStatus(elements, removed
        ? LABELS.browserAlertPermissionRemoved
        : LABELS.browserAlertPermissionRemovalFailed);
    }

    state.settings = {
      ...state.settings,
      isDetectionActive: isEnabled,
      isSiteAlertEnabled: isEnabled
    };
    await saveSettings(
      state,
      elements,
      isEnabled ? LABELS.masterToggleOn : LABELS.masterToggleOff
    );
  });

  elements.detectionToggle.addEventListener('change', async (event) => {
    state.settings = {
      ...state.settings,
      isDetectionActive: event.target.checked
    };
    await saveSettings(state, elements, LABELS.detectionSaved);
  });

  elements.siteAlertToggle.addEventListener('change', async (event) => {
    const isEnabled = Boolean(event.target.checked);
    if (isEnabled) {
      const granted = await requestOptionalSitePermissions();
      if (!granted) {
        renderSettings(elements, state);
        setPermissionStatus(elements, LABELS.browserAlertPermissionDenied);
        return;
      }
      setPermissionStatus(elements, LABELS.browserAlertPermissionGranted);
    } else {
      const removed = await removeOptionalSitePermissions();
      setPermissionStatus(elements, removed
        ? LABELS.browserAlertPermissionRemoved
        : LABELS.browserAlertPermissionRemovalFailed);
    }

    state.settings = {
      ...state.settings,
      isSiteAlertEnabled: isEnabled
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

    renderSettings(elements, state);

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

    renderSettings(elements, state);

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

    renderSettings(elements, state);

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

    renderSettings(elements, state);

    const message = String(rawValue).trim() !== String(normalizedUnreadWindow)
      ? LABELS.unreadWindowClamped.replace('{minutes}', String(normalizedUnreadWindow))
      : LABELS.unreadWindowSaved;

    await saveSettings(state, elements, message);
  });

  elements.authorBanModeInputs.forEach((input) => {
    input.addEventListener('change', async (event) => {
      if (!event.target.checked) {
        return;
      }

      state.settings = {
        ...state.settings,
        authorBanOverlayMode: event.target.value
      };
      await saveSettings(
        state,
        elements,
        event.target.value === 'hide' ? LABELS.authorBanHideModeSaved : LABELS.authorBanWarnModeSaved
      );
    });
  });

  elements.authorBanJoinConfirmToggle?.addEventListener('change', async (event) => {
    state.settings = {
      ...state.settings,
      confirmBannedAuthorJoin: Boolean(event.target.checked)
    };
    await saveSettings(state, elements, LABELS.authorBanJoinConfirmSaved);
  });

  wireUnifiedAuthorManager(elements, state);

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

  elements.authorManagerToggleButton?.addEventListener('click', () => {
    state.ui.isAuthorManagerCollapsed = !state.ui.isAuthorManagerCollapsed;
    persistUiState(state);
    renderAuthorManagerVisibility(elements, state);
  });

  elements.authorRecordUndoButton.addEventListener('click', async () => {
    await undoLastAuthorRecordMove(state, elements);
  });

  elements.openGalleryButton.addEventListener('click', async () => {
    await chrome.tabs.create({ url: globalThis.SEAFDomain.constants.MANGHO_LIST_URL });
    showTransientStatus(elements.saveStatus, LABELS.galleryOpened);
  });

  elements.testToastButton.addEventListener('click', async () => {
    await triggerOverlayTest(state, elements);
  });
}

function wireUnifiedAuthorManager(elements, state) {
  elements.authorManagerAddButton?.addEventListener('click', async () => {
    await addManagedAuthorRecord(elements, state);
  });

  [elements.authorManagerNicknameInput, elements.authorManagerNoteInput].forEach((field) => {
    field?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      await addManagedAuthorRecord(elements, state);
    });
  });

  elements.authorManagerSearchInput?.addEventListener('input', (event) => {
    state.ui.authorManagerQuery = String(event.target.value || '');
    state.ui.selectedAuthorRecordKeys = [];
    renderAuthorManager(elements, state);
  });

  elements.authorManagerFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.ui.authorManagerFilter = button.dataset.filter || 'all';
      state.ui.selectedAuthorRecordKeys = [];
      renderAuthorManager(elements, state);
    });
  });

  elements.authorManagerSelectionModeButton?.addEventListener('click', () => {
    state.ui.authorManagerSelectionMode = !state.ui.authorManagerSelectionMode;
    if (!state.ui.authorManagerSelectionMode) {
      state.ui.selectedAuthorRecordKeys = [];
    }
    renderAuthorManager(elements, state);
  });

  elements.authorManagerSelectVisible?.addEventListener('change', () => {
    const visibleKeys = getVisibleManagedAuthorRecords(state).map((entry) => entry.key);
    const selectedSet = new Set(state.ui.selectedAuthorRecordKeys || []);
    if (elements.authorManagerSelectVisible.checked) {
      visibleKeys.forEach((key) => selectedSet.add(key));
    } else {
      visibleKeys.forEach((key) => selectedSet.delete(key));
    }
    state.ui.selectedAuthorRecordKeys = [...selectedSet];
    renderAuthorManager(elements, state);
  });

  elements.authorManagerBulkBanButton?.addEventListener('click', async () => {
    const keys = state.ui.selectedAuthorRecordKeys || [];
    if (keys.length === 0) {
      showTransientStatus(elements.saveStatus, LABELS.authorManagerSelectionRequired);
      return;
    }
    await moveAuthorRecordKeys(keys, 'banned', state, elements, LABELS.authorManagerBulkBanned);
  });

  elements.authorManagerBulkUnbanButton?.addEventListener('click', async () => {
    const keys = state.ui.selectedAuthorRecordKeys || [];
    if (keys.length === 0) {
      showTransientStatus(elements.saveStatus, LABELS.authorManagerSelectionRequired);
      return;
    }
    await moveAuthorRecordKeys(keys, 'note', state, elements, LABELS.authorManagerBulkUnbanned);
  });

  elements.authorManagerBulkDeleteButton?.addEventListener('click', async () => {
    const keys = state.ui.selectedAuthorRecordKeys || [];
    if (keys.length === 0) {
      showTransientStatus(elements.saveStatus, LABELS.authorManagerSelectionRequired);
      return;
    }
    if (!window.confirm(
      LABELS.authorManagerBulkDeleteConfirm.replace('{count}', String(keys.length))
    )) {
      return;
    }
    await removeAuthorRecordKeys(keys, state, elements, '선택한 작성자 기록을 삭제했습니다.');
  });
}

async function saveSettings(state, elements, message) {
  try {
    state.settings = await settingsClient.updateSettingsPatch(
      popupCore.normalizeSettings(state.settings)
    );
    renderSettings(elements, state);
    showTransientStatus(elements.saveStatus, message || LABELS.settingsSaved);
    await refreshDashboard(state, elements, false);
    return true;
  } catch (error) {
    state.settings = await settingsClient.getSettings();
    renderSettings(elements, state);
    state.dashboard.worker = popupCore.createLimitedWorkerStatus(
      error?.message || LABELS.backgroundMissing
    );
    state.dashboard.alertModeLabel = describeAlertMode(state.settings, state.dashboard.worker);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, LABELS.saveWithoutBackground);
    return false;
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
      response = await chrome.runtime.sendMessage({
        type: 'GET_LIVE_POSTS',
        manualRefresh: Boolean(isManualRefresh)
      });
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
    // The post can still be opened directly, but unread state remains background-owned.
  }

  await chrome.tabs.create({
    url: post.postUrl || `${globalThis.SEAFDomain.constants.VIEW_URL_PREFIX}${post.id}`
  });
  return true;
}

async function joinPost(post, button, feedback) {
  const originalLabel = button.textContent;
  let failureMessage = LABELS.joinLinkNotFound;
  button.disabled = true;
  button.textContent = LABELS.connecting;
  setPostFeedback(feedback, '');

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
    return true;
  } catch (error) {
    if (popupCore.isMissingReceiverError(error)) {
      failureMessage = LABELS.backgroundUnavailable;
    } else {
      failureMessage = getUserFacingError(error, LABELS.joinLinkNotFound);
    }

    try {
      const directLink = await popupCore.extractLobbyLinkDirectly(post.id);
      if (!directLink) {
        throw new Error(LABELS.joinLinkNotFound);
      }

      await chrome.tabs.create({ url: directLink });
      setPostFeedback(feedback, LABELS.joinDirectOpened);
    } catch (fallbackError) {
      console.error(LABELS.joinError, fallbackError);
      setPostFeedback(
        feedback,
        LABELS.joinRecovery.replace('{reason}', failureMessage)
      );
    }
    return false;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function markPostRead(post, button, feedback, elements) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = LABELS.markingRead;
  setPostFeedback(feedback, '');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'MARK_POST_READ',
      postId: Number(post.id)
    });
    if (!response?.success) {
      throw new Error(response?.error || LABELS.markReadFailed);
    }

    showTransientStatus(elements.saveStatus, LABELS.markReadDone);
    return true;
  } catch (error) {
    setPostFeedback(feedback, LABELS.markReadFailed);
    return false;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function setPostFeedback(element, message) {
  if (!element) {
    return;
  }

  element.textContent = message || '';
  element.hidden = !message;
}

function getUserFacingError(error, fallbackMessage) {
  const message = String(error?.message || error || '')
    .replace(/\s+/g, ' ')
    .trim();
  return message ? message.slice(0, 140) : fallbackMessage;
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
    const response = await chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' });
    if (!response?.success) {
      throw new Error(response?.error || LABELS.allReadFailed);
    }

    showTransientStatus(elements.saveStatus, LABELS.allReadDone);
    await refreshDashboard(state, elements, false);
  } catch (error) {
    console.error(LABELS.allReadFailed, error);
    showTransientStatus(elements.saveStatus, LABELS.allReadFailed);
  } finally {
    elements.markAllReadButton.innerHTML = originalLabel;
    elements.markAllReadButton.disabled = state.dashboard.unreadCount === 0;
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

async function addManagedAuthorRecord(elements, state) {
  const nicknameInput = elements.authorManagerNicknameInput;
  const noteInput = elements.authorManagerNoteInput;
  const isBanned = Boolean(elements.authorManagerBanToggle?.checked);
  const nickname = String(nicknameInput?.value || '').trim();
  const note = normalizeAuthorRecordNote(noteInput?.value);
  const status = isBanned ? 'banned' : 'note';

  if (!nickname) {
    showTransientStatus(elements.saveStatus, LABELS.authorBanInvalid);
    nicknameInput?.focus();
    return;
  }
  if (!isBanned && !note) {
    showTransientStatus(elements.saveStatus, LABELS.authorNoteRequired);
    noteInput?.focus();
    return;
  }

  if (nickname === 'ㅇㅇ' && !window.confirm(LABELS.authorBanCommonNicknameConfirm)) {
    return;
  }

  const nextRecord = globalThis.SEAFDomain.createNicknameAuthorRecord(nickname, note, status);
  if (!nextRecord?.key) {
    showTransientStatus(elements.saveStatus, LABELS.authorBanInvalid);
    return;
  }

  try {
    state.settings = await settingsClient.addAuthorRecord({ nickname, note, status });
    if (nicknameInput) {
      nicknameInput.value = '';
    }
    if (noteInput) {
      noteInput.value = '';
    }
    if (elements.authorManagerBanToggle) {
      elements.authorManagerBanToggle.checked = false;
    }
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, isBanned ? LABELS.authorBanSaved : LABELS.authorNoteSaved);
  } catch (error) {
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error));
  }
}

async function updateAuthorRecordNote(key, note, state) {
  const normalizedKey = String(key || '').trim();
  const normalizedNote = normalizeAuthorRecordNote(note);
  if (!normalizedKey) {
    return;
  }

  const currentRecord = getAuthorRecords(state).find((entry) => entry.key === normalizedKey);
  if (!currentRecord || normalizeAuthorRecordNote(currentRecord.note) === normalizedNote) {
    return;
  }

  state.settings = await settingsClient.updateAuthorRecordNote(normalizedKey, normalizedNote);
}

async function editPostAuthorNote(post, record, state, elements) {
  const initialNote = record?.note || '';
  const note = window.prompt(LABELS.authorNoteQuickPrompt, initialNote);
  if (note === null) {
    return;
  }
  const normalizedNote = normalizeAuthorRecordNote(note);
  if (!record?.key && !normalizedNote) {
    showTransientStatus(elements.saveStatus, LABELS.authorNoteRequired);
    return;
  }

  try {
    if (record?.key) {
      await updateAuthorRecordNote(record.key, normalizedNote, state);
    } else {
      state.settings = await settingsClient.addAuthorRecord({
        author: post.author,
        note: normalizedNote,
        status: 'note'
      });
    }
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, LABELS.authorNoteUpdated);
  } catch (error) {
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error));
  }
}

async function addPostAuthorBan(post, state, elements) {
  const note = window.prompt(LABELS.authorBanQuickNotePrompt, '');
  if (note === null) {
    return;
  }

  const nextRecord = globalThis.SEAFDomain.createAuthorRecord(post.author, note, 'banned');
  if (!nextRecord?.key) {
    showTransientStatus(elements.saveStatus, LABELS.authorBanInvalid);
    return;
  }

  try {
    state.settings = await settingsClient.addAuthorRecord({
      author: post.author,
      note,
      status: 'banned'
    });
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, LABELS.authorBanSaved);
  } catch (error) {
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error));
  }
}

async function moveAuthorRecordKeys(keys, targetStatus, state, elements, message) {
  const keySet = new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean));
  const records = getAuthorRecords(state).filter((record) => keySet.has(record.key));
  const movingRecords = records.filter((record) => record.status !== targetStatus);
  if (movingRecords.length === 0) {
    return false;
  }

  const previousStatuses = new Set(movingRecords.map((record) => record.status));
  if (previousStatuses.size !== 1) {
    showTransientStatus(elements.saveStatus, LABELS.authorRecordSwapFailed);
    return false;
  }

  const movingKeys = movingRecords.map((record) => record.key);
  const previousStatus = movingRecords[0].status;
  try {
    state.settings = await settingsClient.setAuthorRecordStatus(movingKeys, targetStatus);
    state.ui.selectedAuthorRecordKeys = (state.ui.selectedAuthorRecordKeys || [])
      .filter((key) => !keySet.has(key));
    state.ui.authorRecordUndo = {
      keys: movingKeys,
      previousStatus,
      targetStatus,
      message,
      isPending: false
    };
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, message);
    if (targetStatus === 'note') {
      focusAuthorRecordNote(elements.authorManagerList, movingKeys[0]);
    }
    return true;
  } catch (error) {
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error, LABELS.authorRecordSwapFailed));
    return false;
  }
}

async function undoLastAuthorRecordMove(state, elements) {
  const undo = state.ui.authorRecordUndo;
  if (!undo || undo.isPending) {
    return;
  }

  undo.isPending = true;
  renderAuthorRecordUndo(elements, state);
  try {
    state.settings = await settingsClient.setAuthorRecordStatus(undo.keys, undo.previousStatus);
    state.ui.selectedAuthorRecordKeys = [];
    state.ui.authorRecordUndo = null;
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, LABELS.authorRecordUndoDone);
  } catch (error) {
    undo.isPending = false;
    renderAuthorRecordUndo(elements, state);
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error, LABELS.authorRecordUndoFailed));
  }
}

function focusAuthorRecordNote(list, key) {
  const input = [...(list?.querySelectorAll('[data-author-record-note-key]') || [])]
    .find((candidate) => candidate.dataset.authorRecordNoteKey === key);
  input?.focus();
  if (input && !input.value) {
    input.select();
  }
}

async function removeAuthorRecordKeys(keys, state, elements, message) {
  const removeSet = new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean));
  if (removeSet.size === 0) {
    showTransientStatus(elements.saveStatus, LABELS.authorBanNoSelection);
    return;
  }

  try {
    state.settings = await settingsClient.removeAuthorRecordKeys([...removeSet]);
    state.ui.selectedAuthorRecordKeys = (state.ui.selectedAuthorRecordKeys || [])
      .filter((key) => !removeSet.has(key));
    state.ui.authorManagerDeletedKeys = [...removeSet];
    if (state.ui.authorManagerDrafts) {
      removeSet.forEach((key) => {
        delete state.ui.authorManagerDrafts[key];
      });
    }
    if (state.ui.authorRecordUndo?.keys?.some((key) => removeSet.has(key))) {
      state.ui.authorRecordUndo = null;
    }
    renderSettings(elements, state);
    renderDashboard(elements, state);
    showTransientStatus(elements.saveStatus, message);
  } catch (error) {
    showTransientStatus(elements.saveStatus, getAuthorRecordErrorMessage(error));
  }
}

function getAuthorRecordErrorMessage(error, fallbackMessage = LABELS.saveWithoutBackground) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('capacity')) {
    return LABELS.authorRecordCapacityReached;
  }
  if (code.includes('duplicate')) {
    return LABELS.authorBanDuplicate;
  }
  if (code.includes('invalid') || code.includes('not-found')) {
    return LABELS.authorBanInvalid;
  }
  return error?.message || fallbackMessage;
}

function toggleAuthorRecordSelection(state, key, isSelected) {
  const selectedSet = new Set(state.ui.selectedAuthorRecordKeys || []);
  if (isSelected) {
    selectedSet.add(key);
  } else {
    selectedSet.delete(key);
  }
  state.ui.selectedAuthorRecordKeys = [...selectedSet];
}

function captureAuthorManagerDrafts(elements, state) {
  const list = elements.authorManagerList;
  if (!list || !state.ui) {
    return;
  }

  const drafts = { ...(state.ui.authorManagerDrafts || {}) };
  const deletedKeys = new Set(state.ui.authorManagerDeletedKeys || []);
  list.querySelectorAll('[data-author-record-key]').forEach((row) => {
    const key = String(row.getAttribute('data-author-record-key') || '').trim();
    if (!key) {
      return;
    }
    if (deletedKeys.has(key)) {
      delete drafts[key];
      return;
    }
    const noteInput = row.querySelector('.seaf-author-record-note-editor');
    if (!noteInput) {
      return;
    }
    const currentValue = String(noteInput.value || '');
    const originalValue = String(noteInput.dataset.originalValue || '');
    if (currentValue !== originalValue) {
      drafts[key] = currentValue;
    } else if (Object.prototype.hasOwnProperty.call(drafts, key)) {
      delete drafts[key];
    }
  });
  state.ui.authorManagerDrafts = drafts;
  state.ui.authorManagerDeletedKeys = [];
}

function getAuthorManagerDraftValue(state, key, fallbackValue) {
  if (!state.ui?.authorManagerDrafts) {
    return fallbackValue;
  }
  return Object.prototype.hasOwnProperty.call(state.ui.authorManagerDrafts, key)
    ? state.ui.authorManagerDrafts[key]
    : fallbackValue;
}

function getVisibleManagedAuthorRecords(state) {
  const query = normalizeAuthorText(state.ui.authorManagerQuery || '');
  const activeFilter = state.ui.authorManagerFilter || 'all';
  return getAuthorRecords(state).filter((entry) => {
    if (activeFilter === 'banned' && entry.status !== 'banned') {
      return false;
    }
    if (activeFilter === 'note' && entry.status !== 'note') {
      return false;
    }
    if (activeFilter === 'empty-note' && normalizeAuthorRecordNote(entry.note)) {
      return false;
    }
    if (activeFilter === 'empty-note' && entry.status !== 'note') {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystacks = [
      entry.displayName,
      entry.label,
      entry.nickname,
      entry.uid,
      entry.ip,
      entry.value,
      entry.key,
      entry.note
    ];
    return haystacks.some((value) => normalizeAuthorText(value).includes(query));
  });
}

function getAuthorDisplayName(author) {
  if (!author || typeof author !== 'object') {
    return LABELS.anonymousAuthor;
  }

  return author.displayName || author.nickname || author.uid || author.ip || LABELS.anonymousAuthor;
}

function getAuthorRecordMeta(entry) {
  if (entry?.type === 'uid') {
    return `계정 기준 · ${entry.value || entry.uid || entry.key}`;
  }

  if (entry?.type === 'anonymous') {
    return `유동닉 기준 · ${entry.label || entry.displayName || entry.value || entry.key}`;
  }

  return '닉네임 기준';
}

function getAuthorRecordMatchSummary(entries, author) {
  const summary = globalThis.SEAFDomain.getAuthorRecordMatchSummary(author, entries);
  const matches = summary?.matches || [];
  const noteRecord = summary?.noteRecord
    || matches.find((record) => normalizeAuthorRecordNote(record.note))
    || null;
  const bannedMatches = matches.filter((record) => record.status === 'banned');
  const banNoteRecord = summary?.banNoteRecord
    || bannedMatches.find((record) => normalizeAuthorRecordNote(record.note))
    || null;
  const note = summary?.note || noteRecord?.note || '';
  const banNote = summary?.banNote ?? banNoteRecord?.note ?? '';
  return {
    ...summary,
    isBanned: Boolean(summary?.isBanned),
    hasNote: Boolean(summary?.hasNote ?? note),
    hasBanNote: Boolean(summary?.hasBanNote ?? banNote),
    matches,
    primaryRecord: summary?.primaryRecord || null,
    primaryBannedRecord: summary?.primaryBannedRecord || null,
    note,
    noteRecord,
    banNote,
    banNoteRecord
  };
}

function getAuthorRecords(state) {
  return globalThis.SEAFDomain.normalizeAuthorRecords(state.settings?.authorRecords || []);
}

function normalizeAuthorText(value) {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
}

function normalizeAuthorRecordNote(value) {
  return globalThis.SEAFDomain.normalizeAuthorNote(value);
}
