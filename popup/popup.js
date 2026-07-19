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
  collapseAuthorBanList: '접기',
  expandAuthorBanList: '펼치기',
  collapseAuthorNoteList: '접기',
  expandAuthorNoteList: '펼치기',
  alertDisabled: '알림 꺼짐',
  badgeOnly: '배지 중심',
  checkingConnection: '연결 확인 중',
  authorBanSaved: '밴 목록을 저장했습니다.',
  authorBanNoteSaved: '밴 메모를 저장했습니다.',
  authorBanDuplicate: '이미 등록된 글쓴이입니다.',
  authorBanInvalid: '등록할 닉네임이나 글쓴이 정보를 찾지 못했습니다.',
  authorBanRemoved: '밴 항목을 삭제했습니다.',
  authorBanSelectedRemoved: '선택한 밴 항목을 삭제했습니다.',
  authorBanCleared: '밴 목록을 모두 비웠습니다.',
  authorBanNoSelection: '선택된 밴 항목이 없습니다.',
  authorBanWarnModeSaved: '밴 경고 모드를 저장했습니다.',
  authorBanHideModeSaved: '밴 숨김 모드를 저장했습니다.',
  authorBanEmpty: '등록된 밴 항목이 없습니다.',
  authorBanSearchEmpty: '검색 결과가 없습니다.',
  authorBanCommonNicknameConfirm: '"ㅇㅇ"은 매우 넓게 매칭됩니다. 그대로 추가할까요?',
  authorBanClearAllConfirm: '밴 목록을 모두 삭제할까요?',
  authorBanChipWarn: '밴 글쓴이 · 경고',
  authorBanChipHide: '밴 글쓴이 · 배너 숨김',
  authorBanQuickAdd: '밴 추가',
  authorBanQuickRemove: '밴 해제',
  authorBanQuickNotePrompt: '밴 메모를 입력하세요. 비워두면 기본 경고 문구가 표시됩니다.',
  authorBanJoinConfirmSaved: '밴 글쓴이 참가 확인 설정을 저장했습니다.',
  authorBanJoinWarning: '밴 목록에 있는 글쓴이입니다. 참가하기 전에 다시 확인하세요.',
  authorBanContinueJoin: '계속 참가',
  authorBanCancel: '취소',
  authorBanRemovePrimary: '이 규칙만 해제',
  authorBanRemoveAll: '일치 규칙 모두 해제',
  authorBanMultipleMatches: '이 글쓴이와 일치하는 밴 규칙이 여러 개 있습니다.',
  authorBanNoteDirty: '저장되지 않은 변경',
  authorBanNoteSaving: '저장 중…',
  authorBanNoteSaveFailed: '저장하지 못했습니다. 다시 시도하세요.',
  authorBanNoteSave: '저장',
  authorBanCapacityReached: '밴 목록은 최대 200개까지 저장할 수 있습니다.',
  authorNoteSaved: '글쓴이 메모를 저장했습니다.',
  authorNoteUpdated: '글쓴이 메모를 저장했습니다.',
  authorNoteRemoved: '글쓴이 메모를 삭제했습니다.',
  authorNoteSelectedRemoved: '선택한 글쓴이 메모를 삭제했습니다.',
  authorNoteCleared: '글쓴이 메모를 모두 비웠습니다.',
  authorNoteNoSelection: '선택된 글쓴이 메모가 없습니다.',
  authorNoteEmpty: '저장된 글쓴이 메모가 없습니다.',
  authorNoteRequired: '글쓴이 메모를 입력해 주세요.',
  authorNoteClearAllConfirm: '글쓴이 메모를 모두 삭제할까요?',
  authorNoteQuickAdd: '메모 추가',
  authorNoteQuickEdit: '메모 편집',
  authorNoteQuickPrompt: '글쓴이 메모를 입력하세요.',
  authorNoteChip: '글쓴이 메모',
  authorRecordMoveToNote: '메모로 전환',
  authorRecordMoveToBan: '밴으로 전환',
  authorRecordMovedToNote: '메모 목록으로 전환했습니다.',
  authorRecordMovedToBan: '밴 목록으로 전환했습니다.',
  authorRecordMoveSelectedToNote: '선택 항목을 메모 목록으로 전환했습니다.',
  authorRecordMoveSelectedToBan: '선택 항목을 밴 목록으로 전환했습니다.',
  authorRecordUndoDone: '전환을 취소했습니다.',
  authorRecordUndoFailed: '전환을 되돌리지 못했습니다. 다시 시도하세요.',
  authorRecordSwapFailed: '목록을 전환하지 못했습니다. 다시 시도하세요.',
  authorRecordNoteDirty: '저장되지 않은 변경',
  authorRecordNoteSaving: '저장 중…',
  authorRecordNoteSaveFailed: '저장하지 못했습니다. 입력 내용은 유지됩니다.',
  authorRecordNoteSave: '저장',
  authorRecordCapacityReached: '글쓴이 기록은 최대 200개까지 저장할 수 있습니다.',
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
    authorBanInput: document.getElementById('seaf-author-ban-input'),
    authorBanNoteInput: document.getElementById('seaf-author-ban-note-input'),
    authorBanAddButton: document.getElementById('seaf-author-ban-add-button'),
    authorBanSearchInput: document.getElementById('seaf-author-ban-search-input'),
    authorBanSelectVisible: document.getElementById('seaf-author-ban-select-visible'),
    authorBanDeleteSelectedButton: document.getElementById('seaf-author-ban-delete-selected-button'),
    authorBanMoveSelectedButton: document.getElementById('seaf-author-ban-move-selected-button'),
    authorBanClearAllButton: document.getElementById('seaf-author-ban-clear-all-button'),
    authorBanCount: document.getElementById('seaf-author-ban-count'),
    authorBanList: document.getElementById('seaf-author-ban-list'),
    authorBanPanel: document.getElementById('seaf-author-ban-panel'),
    authorBanListToggleButton: document.getElementById('seaf-author-ban-list-toggle-button'),
    authorBanRosterBody: document.getElementById('seaf-author-ban-roster-body'),
    authorBanModeInputs: [...document.querySelectorAll('input[name="seaf-author-ban-mode"]')],
    authorBanJoinConfirmToggle: document.getElementById('seaf-author-ban-join-confirm-toggle'),
    authorNoteInput: document.getElementById('seaf-author-note-input'),
    authorNoteNoteInput: document.getElementById('seaf-author-note-note-input'),
    authorNoteAddButton: document.getElementById('seaf-author-note-add-button'),
    authorNoteSearchInput: document.getElementById('seaf-author-note-search-input'),
    authorNoteSelectVisible: document.getElementById('seaf-author-note-select-visible'),
    authorNoteMoveSelectedButton: document.getElementById('seaf-author-note-move-selected-button'),
    authorNoteDeleteSelectedButton: document.getElementById('seaf-author-note-delete-selected-button'),
    authorNoteClearAllButton: document.getElementById('seaf-author-note-clear-all-button'),
    authorNoteCount: document.getElementById('seaf-author-note-count'),
    authorNoteList: document.getElementById('seaf-author-note-list'),
    authorNotePanel: document.getElementById('seaf-author-note-panel'),
    authorNoteListToggleButton: document.getElementById('seaf-author-note-list-toggle-button'),
    authorNoteRosterBody: document.getElementById('seaf-author-note-roster-body'),
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
    settingsBody: document.getElementById('seaf-settings-body') || document.getElementById('seaf-settings-content'),
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
    return {
      isHistoryCollapsed: localStorage.getItem(HISTORY_COLLAPSED_KEY) === 'true',
      isSettingsCollapsed: localStorage.getItem(SETTINGS_COLLAPSED_KEY) === 'true',
      isAuthorBanListCollapsed: localStorage.getItem(AUTHOR_BAN_LIST_COLLAPSED_KEY) === 'true',
      isAuthorNoteListCollapsed: localStorage.getItem(AUTHOR_NOTE_LIST_COLLAPSED_KEY) === 'true',
      authorBanQuery: '',
      authorNoteQuery: '',
      selectedAuthorBanKeys: [],
      selectedAuthorNoteKeys: [],
      authorRecordUndo: null
    };
  } catch (error) {
    return {
      isHistoryCollapsed: false,
      isSettingsCollapsed: false,
      isAuthorBanListCollapsed: false,
      isAuthorNoteListCollapsed: false,
      authorBanQuery: '',
      authorNoteQuery: '',
      selectedAuthorBanKeys: [],
      selectedAuthorNoteKeys: [],
      authorRecordUndo: null
    };
  }
}

function persistUiState(state) {
  try {
    localStorage.setItem(HISTORY_COLLAPSED_KEY, String(Boolean(state.ui?.isHistoryCollapsed)));
    localStorage.setItem(SETTINGS_COLLAPSED_KEY, String(Boolean(state.ui?.isSettingsCollapsed)));
    localStorage.setItem(
      AUTHOR_BAN_LIST_COLLAPSED_KEY,
      String(Boolean(state.ui?.isAuthorBanListCollapsed))
    );
    localStorage.setItem(
      AUTHOR_NOTE_LIST_COLLAPSED_KEY,
      String(Boolean(state.ui?.isAuthorNoteListCollapsed))
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

  renderAuthorBanManager(elements, state);
  renderAuthorNoteManager(elements, state);
  renderAuthorBanListVisibility(elements, state);
  renderAuthorNoteListVisibility(elements, state);
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

function renderAuthorBanListVisibility(elements, state) {
  if (!elements.authorBanRosterBody || !elements.authorBanListToggleButton) {
    return;
  }

  const isCollapsed = Boolean(state.ui?.isAuthorBanListCollapsed);
  elements.authorBanRosterBody.hidden = isCollapsed;
  if (elements.authorBanPanel) {
    elements.authorBanPanel.dataset.listCollapsed = String(isCollapsed);
  }
  elements.authorBanListToggleButton.dataset.collapsed = String(isCollapsed);
  elements.authorBanListToggleButton.textContent = isCollapsed
    ? LABELS.expandAuthorBanList
    : LABELS.collapseAuthorBanList;
  elements.authorBanListToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
}

function renderAuthorNoteListVisibility(elements, state) {
  if (!elements.authorNoteRosterBody || !elements.authorNoteListToggleButton) {
    return;
  }

  const isCollapsed = Boolean(state.ui?.isAuthorNoteListCollapsed);
  elements.authorNoteRosterBody.hidden = isCollapsed;
  if (elements.authorNotePanel) {
    elements.authorNotePanel.dataset.listCollapsed = String(isCollapsed);
  }
  elements.authorNoteListToggleButton.dataset.collapsed = String(isCollapsed);
  elements.authorNoteListToggleButton.textContent = isCollapsed
    ? LABELS.expandAuthorNoteList
    : LABELS.collapseAuthorNoteList;
  elements.authorNoteListToggleButton.setAttribute('aria-expanded', String(!isCollapsed));
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

function renderAuthorBanManager(elements, state) {
  renderAuthorRecordManager(elements, state, 'banned');
}

function renderAuthorNoteManager(elements, state) {
  renderAuthorRecordManager(elements, state, 'note');
}

function renderAuthorRecordManager(elements, state, status) {
  const config = getAuthorRecordManagerConfig(elements, status);
  if (!config.list) {
    return;
  }

  const entries = getAuthorRecords(state).filter((entry) => entry.status === status);
  const visibleEntries = getVisibleAuthorRecords(state, status);
  const visibleKeySet = new Set(visibleEntries.map((entry) => entry.key));
  const selectedSet = new Set(
    (state.ui[config.selectedKey] || []).filter((key) => visibleKeySet.has(key))
  );
  state.ui[config.selectedKey] = [...selectedSet];

  config.count.textContent = `${entries.length}개`;
  config.searchInput.value = state.ui[config.queryKey] || '';
  config.moveSelectedButton.disabled = selectedSet.size === 0;
  config.deleteSelectedButton.disabled = selectedSet.size === 0;
  config.clearAllButton.disabled = entries.length === 0;
  config.selectVisible.checked = visibleEntries.length > 0 && selectedSet.size === visibleEntries.length;
  config.selectVisible.indeterminate = selectedSet.size > 0 && selectedSet.size < visibleEntries.length;
  config.selectVisible.disabled = visibleEntries.length === 0;

  config.list.replaceChildren();

  if (visibleEntries.length === 0) {
    const emptyCard = document.createElement('article');
    emptyCard.className = 'seaf-empty-card';
    const emptyTitle = document.createElement('strong');
    const emptyBody = document.createElement('span');
    emptyTitle.textContent = state.ui[config.queryKey]
      ? LABELS.authorBanSearchEmpty
      : config.emptyLabel;
    emptyBody.textContent = state.ui[config.queryKey]
      ? state.ui[config.queryKey]
      : config.emptyHint;
    emptyCard.append(emptyTitle, document.createElement('br'), emptyBody);
    config.list.appendChild(emptyCard);
    return;
  }

  visibleEntries.forEach((entry, index) => {
    const isBanned = status === 'banned';
    const row = document.createElement('div');
    row.className = isBanned
      ? 'seaf-author-record-entry seaf-author-ban-entry'
      : 'seaf-author-record-entry';
    row.dataset.status = status;
    row.dataset.authorRecordKey = entry.key;

    const main = document.createElement('div');
    main.className = isBanned
      ? 'seaf-author-record-entry-main seaf-author-ban-entry-main'
      : 'seaf-author-record-entry-main';

    const selectionLabel = document.createElement('label');
    selectionLabel.className = isBanned
      ? 'seaf-author-record-entry-select seaf-author-ban-entry-select'
      : 'seaf-author-record-entry-select';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.id = `seaf-author-${status}-check-${index}`;
    check.className = isBanned
      ? 'seaf-author-record-checkbox seaf-author-ban-checkbox'
      : 'seaf-author-record-checkbox';
    check.checked = selectedSet.has(entry.key);
    selectionLabel.htmlFor = check.id;
    check.addEventListener('change', () => {
      toggleAuthorRecordSelection(state, status, entry.key, check.checked);
      renderAuthorRecordManager(elements, state, status);
    });

    const copy = document.createElement('div');
    copy.className = isBanned
      ? 'seaf-author-record-entry-copy seaf-author-ban-entry-copy'
      : 'seaf-author-record-entry-copy';

    const title = document.createElement('div');
    title.className = isBanned
      ? 'seaf-author-record-entry-title seaf-author-ban-entry-title'
      : 'seaf-author-record-entry-title';
    title.textContent = entry.label || entry.displayName || entry.nickname
      || entry.uid || entry.ip || entry.value || entry.key;

    const meta = document.createElement('div');
    meta.className = isBanned
      ? 'seaf-author-record-entry-meta seaf-author-ban-entry-meta'
      : 'seaf-author-record-entry-meta';
    meta.textContent = getAuthorRecordMeta(entry);

    copy.append(title, meta);
    selectionLabel.append(check, copy);

    const entryActions = document.createElement('div');
    entryActions.className = 'seaf-author-record-entry-actions';

    const swapButton = document.createElement('button');
    swapButton.type = 'button';
    swapButton.className = 'seaf-secondary-button seaf-author-swap-button';
    swapButton.dataset.action = 'author-record-swap';
    swapButton.textContent = isBanned
      ? LABELS.authorRecordMoveToNote
      : LABELS.authorRecordMoveToBan;
    swapButton.addEventListener('click', async () => {
      await moveAuthorRecordKeys(
        [entry.key],
        isBanned ? 'note' : 'banned',
        state,
        elements,
        isBanned ? LABELS.authorRecordMovedToNote : LABELS.authorRecordMovedToBan
      );
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'seaf-secondary-button seaf-danger-button';
    removeButton.textContent = '삭제';
    removeButton.addEventListener('click', async (event) => {
      event.preventDefault();
      await removeAuthorRecordKeys(
        [entry.key],
        state,
        elements,
        isBanned ? LABELS.authorBanRemoved : LABELS.authorNoteRemoved
      );
    });

    entryActions.append(swapButton, removeButton);
    main.append(selectionLabel, entryActions);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = isBanned
      ? 'seaf-text-input seaf-author-record-note-editor seaf-author-ban-note-editor'
      : 'seaf-text-input seaf-author-record-note-editor';
    noteInput.value = entry.note || '';
    noteInput.placeholder = isBanned ? '메모 없음' : '메모를 입력하세요';
    noteInput.maxLength = MAX_AUTHOR_NOTE_LENGTH;
    noteInput.dataset.authorRecordNoteKey = entry.key;
    if (isBanned) {
      noteInput.dataset.authorBanNoteKey = entry.key;
    }
    noteInput.dataset.originalValue = entry.note || '';
    noteInput.setAttribute('aria-label', `${title.textContent} 메모`);

    const noteSaveButton = document.createElement('button');
    noteSaveButton.type = 'button';
    noteSaveButton.className = isBanned
      ? 'seaf-secondary-button seaf-author-record-note-save seaf-author-ban-note-save'
      : 'seaf-secondary-button seaf-author-record-note-save';
    noteSaveButton.textContent = LABELS.authorRecordNoteSave;
    noteSaveButton.disabled = true;

    const noteStatus = document.createElement('div');
    noteStatus.className = isBanned
      ? 'seaf-author-record-note-status seaf-author-ban-note-status'
      : 'seaf-author-record-note-status';
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
        noteStatus.textContent = isBanned ? LABELS.authorBanNoteSaved : LABELS.authorNoteUpdated;
        noteStatus.dataset.tone = 'success';
        renderDashboard(elements, state);
      } catch (error) {
        noteStatus.textContent = LABELS.authorRecordNoteSaveFailed;
        noteStatus.dataset.tone = 'error';
        noteSaveButton.disabled = false;
      } finally {
        noteInput.disabled = false;
      }
    };

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

    const noteRow = document.createElement('div');
    noteRow.className = isBanned
      ? 'seaf-author-record-note-row seaf-author-ban-note-row'
      : 'seaf-author-record-note-row';
    noteRow.append(noteInput, noteSaveButton);
    row.append(main, noteRow, noteStatus);
    config.list.appendChild(row);
  });
}

function getAuthorRecordManagerConfig(elements, status) {
  if (status === 'banned') {
    return {
      status,
      queryKey: 'authorBanQuery',
      selectedKey: 'selectedAuthorBanKeys',
      count: elements.authorBanCount,
      searchInput: elements.authorBanSearchInput,
      selectVisible: elements.authorBanSelectVisible,
      moveSelectedButton: elements.authorBanMoveSelectedButton,
      deleteSelectedButton: elements.authorBanDeleteSelectedButton,
      clearAllButton: elements.authorBanClearAllButton,
      list: elements.authorBanList,
      emptyLabel: LABELS.authorBanEmpty,
      emptyHint: `${LABELS.authorBanQuickAdd} 또는 직접 입력으로 등록하세요.`
    };
  }

  return {
    status,
    queryKey: 'authorNoteQuery',
    selectedKey: 'selectedAuthorNoteKeys',
    count: elements.authorNoteCount,
    searchInput: elements.authorNoteSearchInput,
    selectVisible: elements.authorNoteSelectVisible,
    moveSelectedButton: elements.authorNoteMoveSelectedButton,
    deleteSelectedButton: elements.authorNoteDeleteSelectedButton,
    clearAllButton: elements.authorNoteClearAllButton,
    list: elements.authorNoteList,
    emptyLabel: LABELS.authorNoteEmpty,
    emptyHint: `${LABELS.authorNoteQuickAdd} 또는 직접 입력으로 등록하세요.`
  };
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

  wireAuthorRecordManager(elements, state, 'banned');
  wireAuthorRecordManager(elements, state, 'note');

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

  elements.authorBanListToggleButton.addEventListener('click', () => {
    state.ui.isAuthorBanListCollapsed = !state.ui.isAuthorBanListCollapsed;
    persistUiState(state);
    renderAuthorBanListVisibility(elements, state);
  });

  elements.authorNoteListToggleButton.addEventListener('click', () => {
    state.ui.isAuthorNoteListCollapsed = !state.ui.isAuthorNoteListCollapsed;
    persistUiState(state);
    renderAuthorNoteListVisibility(elements, state);
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

function wireAuthorRecordManager(elements, state, status) {
  const config = getAuthorRecordManagerConfig(elements, status);
  const input = status === 'banned' ? elements.authorBanInput : elements.authorNoteInput;
  const noteInput = status === 'banned' ? elements.authorBanNoteInput : elements.authorNoteNoteInput;
  const addButton = status === 'banned' ? elements.authorBanAddButton : elements.authorNoteAddButton;

  addButton.addEventListener('click', async () => {
    await addManualAuthorRecord(elements, state, status);
  });

  [input, noteInput].forEach((field) => {
    field.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      await addManualAuthorRecord(elements, state, status);
    });
  });

  config.searchInput.addEventListener('input', (event) => {
    state.ui[config.queryKey] = String(event.target.value || '');
    state.ui[config.selectedKey] = [];
    renderAuthorRecordManager(elements, state, status);
  });

  config.selectVisible.addEventListener('change', () => {
    const visibleKeys = getVisibleAuthorRecords(state, status).map((entry) => entry.key);
    const selectedSet = new Set(state.ui[config.selectedKey] || []);
    if (config.selectVisible.checked) {
      visibleKeys.forEach((key) => selectedSet.add(key));
    } else {
      visibleKeys.forEach((key) => selectedSet.delete(key));
    }
    state.ui[config.selectedKey] = [...selectedSet];
    renderAuthorRecordManager(elements, state, status);
  });

  config.moveSelectedButton.addEventListener('click', async () => {
    const keys = state.ui[config.selectedKey] || [];
    if (keys.length === 0) {
      showTransientStatus(
        elements.saveStatus,
        status === 'banned' ? LABELS.authorBanNoSelection : LABELS.authorNoteNoSelection
      );
      return;
    }
    await moveAuthorRecordKeys(
      keys,
      status === 'banned' ? 'note' : 'banned',
      state,
      elements,
      status === 'banned'
        ? LABELS.authorRecordMoveSelectedToNote
        : LABELS.authorRecordMoveSelectedToBan
    );
  });

  config.deleteSelectedButton.addEventListener('click', async () => {
    const keys = state.ui[config.selectedKey] || [];
    if (keys.length === 0) {
      showTransientStatus(
        elements.saveStatus,
        status === 'banned' ? LABELS.authorBanNoSelection : LABELS.authorNoteNoSelection
      );
      return;
    }
    await removeAuthorRecordKeys(
      keys,
      state,
      elements,
      status === 'banned' ? LABELS.authorBanSelectedRemoved : LABELS.authorNoteSelectedRemoved
    );
  });

  config.clearAllButton.addEventListener('click', async () => {
    const keys = getAuthorRecords(state)
      .filter((entry) => entry.status === status)
      .map((entry) => entry.key);
    if (keys.length === 0) {
      return;
    }
    if (!window.confirm(
      status === 'banned' ? LABELS.authorBanClearAllConfirm : LABELS.authorNoteClearAllConfirm
    )) {
      return;
    }
    await removeAuthorRecordKeys(
      keys,
      state,
      elements,
      status === 'banned' ? LABELS.authorBanCleared : LABELS.authorNoteCleared
    );
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

async function addManualAuthorRecord(elements, state, status) {
  const isBanned = status === 'banned';
  const nicknameInput = isBanned ? elements.authorBanInput : elements.authorNoteInput;
  const noteInput = isBanned ? elements.authorBanNoteInput : elements.authorNoteNoteInput;
  const nickname = String(nicknameInput.value || '').trim();
  const note = normalizeAuthorRecordNote(noteInput.value);
  if (!nickname) {
    showTransientStatus(elements.saveStatus, LABELS.authorBanInvalid);
    nicknameInput.focus();
    return;
  }
  if (!isBanned && !note) {
    showTransientStatus(elements.saveStatus, LABELS.authorNoteRequired);
    noteInput.focus();
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
    nicknameInput.value = '';
    noteInput.value = '';
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
    state.ui.selectedAuthorBanKeys = (state.ui.selectedAuthorBanKeys || [])
      .filter((key) => !keySet.has(key));
    state.ui.selectedAuthorNoteKeys = (state.ui.selectedAuthorNoteKeys || [])
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
      focusAuthorRecordNote(elements.authorNoteList, movingKeys[0]);
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
    state.ui.selectedAuthorBanKeys = (state.ui.selectedAuthorBanKeys || [])
      .filter((key) => !removeSet.has(key));
    state.ui.selectedAuthorNoteKeys = (state.ui.selectedAuthorNoteKeys || [])
      .filter((key) => !removeSet.has(key));
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

function toggleAuthorRecordSelection(state, status, key, isSelected) {
  const selectedKey = status === 'banned' ? 'selectedAuthorBanKeys' : 'selectedAuthorNoteKeys';
  const selectedSet = new Set(state.ui[selectedKey] || []);
  if (isSelected) {
    selectedSet.add(key);
  } else {
    selectedSet.delete(key);
  }
  state.ui[selectedKey] = [...selectedSet];
}

function getVisibleAuthorRecords(state, status) {
  const queryKey = status === 'banned' ? 'authorBanQuery' : 'authorNoteQuery';
  const query = normalizeAuthorText(state.ui[queryKey] || '');
  const entries = getAuthorRecords(state).filter((entry) => entry.status === status);
  if (!query) {
    return entries;
  }

  return entries.filter((entry) => {
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
