(function (global) {
  const FIXED_POLLING_INTERVAL_SECONDS = 30;
  const DEFAULT_TOAST_DURATION_SECONDS = 10;
  const MIN_TOAST_DURATION_SECONDS = 3;
  const MAX_TOAST_DURATION_SECONDS = 30;
  const DEFAULT_RECENT_HISTORY_LIMIT = 15;
  const MIN_RECENT_HISTORY_LIMIT = 1;
  const MAX_RECENT_HISTORY_LIMIT = 30;
  const DEFAULT_RECENT_HISTORY_RETENTION_MINUTES = 30;
  const MIN_RECENT_HISTORY_RETENTION_MINUTES = 5;
  const MAX_RECENT_HISTORY_RETENTION_MINUTES = 180;
  const DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES = 15;
  const MIN_UNREAD_ACTIVE_WINDOW_MINUTES = 1;
  const MAX_UNREAD_ACTIVE_WINDOW_MINUTES = 180;
  const DEFAULT_AUTHOR_BAN_OVERLAY_MODE = 'warn';
  const DEFAULT_CONFIRM_BANNED_AUTHOR_JOIN = true;
  const DEFAULT_FETCH_TIMEOUT_MS = 10000;
  const DEFAULT_SETTINGS = {
    isDetectionActive: true,
    pollingInterval: FIXED_POLLING_INTERVAL_SECONDS,
    toastDuration: DEFAULT_TOAST_DURATION_SECONDS,
    isSiteAlertEnabled: true,
    recentHistoryLimit: DEFAULT_RECENT_HISTORY_LIMIT,
    recentHistoryRetentionMinutes: DEFAULT_RECENT_HISTORY_RETENTION_MINUTES,
    unreadActiveWindowMinutes: DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES,
    authorRecords: [],
    authorBanOverlayMode: DEFAULT_AUTHOR_BAN_OVERLAY_MODE,
    confirmBannedAuthorJoin: DEFAULT_CONFIRM_BANNED_AUTHOR_JOIN
  };
  const RECENT_POSTS_KEY = 'seaf_recent_posts';
  const UNREAD_POST_IDS_KEY = 'seaf_unread_post_ids';
  const UNSUPPORTED_TEST_TAB_ERROR = '현재 탭에서는 오버레이 테스트를 실행할 수 없습니다.';
  const LIST_PAGE_NOT_READY_ERROR = '목록 페이지가 아직 준비되지 않았습니다.';

  function createPopupCore({
    chromeApi,
    fetchImpl,
    domain,
    now = () => Date.now(),
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    fetchRuntime = null
  }) {
    const {
      constants: DOMAIN_CONSTANTS,
      parsePostsFromHtml,
      filterRecentOpenPosts,
      extractLobbyLinkFromHtml,
      mergePosts,
      trimRecentHistoryPosts,
      isUnreadPostActive,
      isHelldiversListUrl,
      normalizeAuthorRecords: normalizeDomainAuthorRecords,
      normalizeAuthorBanEntries: normalizeDomainAuthorBanEntries,
      normalizeAuthorBanOverlayMode: normalizeDomainAuthorBanOverlayMode,
      normalizeConfirmBannedAuthorJoin: normalizeDomainConfirmBannedAuthorJoin
    } = domain;
    const fetchModule = global.SEAFFetch
      || (typeof module !== 'undefined' && module.exports ? require('./seaf-fetch.js') : null);
    const activeFetchRuntime = fetchRuntime || fetchModule?.createFetchRuntime({
      fetchImpl,
      defaultTimeoutMs: fetchTimeoutMs
    });
    if (!activeFetchRuntime?.fetchText) {
      throw new Error('A shared fetch runtime is required.');
    }

    function normalizeToastDuration(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_TOAST_DURATION_SECONDS;
      }

      return Math.min(
        MAX_TOAST_DURATION_SECONDS,
        Math.max(MIN_TOAST_DURATION_SECONDS, Math.round(numericValue))
      );
    }

    function normalizeRecentHistoryLimit(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_RECENT_HISTORY_LIMIT;
      }

      return Math.min(
        MAX_RECENT_HISTORY_LIMIT,
        Math.max(MIN_RECENT_HISTORY_LIMIT, Math.round(numericValue))
      );
    }

    function normalizeRecentHistoryRetentionMinutes(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_RECENT_HISTORY_RETENTION_MINUTES;
      }

      return Math.min(
        MAX_RECENT_HISTORY_RETENTION_MINUTES,
        Math.max(MIN_RECENT_HISTORY_RETENTION_MINUTES, Math.round(numericValue))
      );
    }

    function normalizeUnreadActiveWindowMinutes(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES;
      }

      return Math.min(
        MAX_UNREAD_ACTIVE_WINDOW_MINUTES,
        Math.max(MIN_UNREAD_ACTIVE_WINDOW_MINUTES, Math.round(numericValue))
      );
    }

    function normalizeAuthorBanOverlayMode(value) {
      return normalizeDomainAuthorBanOverlayMode(value);
    }

    function normalizeConfirmBannedAuthorJoin(value) {
      return normalizeDomainConfirmBannedAuthorJoin(value);
    }

    function normalizeAuthorBanEntries(entries) {
      return normalizeDomainAuthorBanEntries(entries);
    }

    function normalizeAuthorRecords(records) {
      return normalizeDomainAuthorRecords(records);
    }

    function normalizeSettings(savedSettings) {
      const savedSettingsObject = savedSettings
        && typeof savedSettings === 'object'
        && !Array.isArray(savedSettings)
        ? savedSettings
        : {};
      const canonicalAuthorRecords = Array.isArray(savedSettingsObject.authorRecords)
        ? savedSettingsObject.authorRecords
        : [];
      const legacyAuthorBanRecords = (Array.isArray(savedSettingsObject.authorBanEntries)
        ? savedSettingsObject.authorBanEntries
        : [])
        .map((record) => (
          record && typeof record === 'object'
            ? { ...record, status: 'banned' }
            : record
        ));
      const authorRecordSource = [...canonicalAuthorRecords, ...legacyAuthorBanRecords];
      const normalizedSettings = {
        ...DEFAULT_SETTINGS,
        ...savedSettingsObject
      };

      delete normalizedSettings.authorBanEntries;

      normalizedSettings.isDetectionActive = Boolean(normalizedSettings.isDetectionActive);
      normalizedSettings.isSiteAlertEnabled = Boolean(normalizedSettings.isSiteAlertEnabled);
      normalizedSettings.pollingInterval = FIXED_POLLING_INTERVAL_SECONDS;
      normalizedSettings.toastDuration = normalizeToastDuration(normalizedSettings.toastDuration);
      normalizedSettings.recentHistoryLimit = normalizeRecentHistoryLimit(
        normalizedSettings.recentHistoryLimit
      );
      normalizedSettings.recentHistoryRetentionMinutes = normalizeRecentHistoryRetentionMinutes(
        normalizedSettings.recentHistoryRetentionMinutes
      );
      normalizedSettings.unreadActiveWindowMinutes = normalizeUnreadActiveWindowMinutes(
        normalizedSettings.unreadActiveWindowMinutes
      );
      normalizedSettings.authorRecords = normalizeAuthorRecords(authorRecordSource);
      normalizedSettings.authorBanOverlayMode = normalizeAuthorBanOverlayMode(
        normalizedSettings.authorBanOverlayMode
      );
      normalizedSettings.confirmBannedAuthorJoin = normalizeConfirmBannedAuthorJoin(
        normalizedSettings.confirmBannedAuthorJoin
      );

      return normalizedSettings;
    }

    function getRecentHistoryOptions(settings, currentTime = now()) {
      const normalizedSettings = normalizeSettings(settings);
      return {
        currentTime,
        maxCount: normalizedSettings.recentHistoryLimit,
        maxAgeMs: normalizedSettings.recentHistoryRetentionMinutes * 60 * 1000,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      };
    }

    async function loadSettings() {
      const { seaf_settings: savedSettings } = await chromeApi.storage.local.get(['seaf_settings']);
      return normalizeSettings(savedSettings);
    }

    function createCheckingWorkerStatus() {
      return {
        mode: 'checking',
        label: '백그라운드 연결 확인 필요',
        message: '백그라운드 연결 상태를 확인하는 중입니다.'
      };
    }

    function createLimitedWorkerStatus(message) {
      return {
        mode: 'limited',
        label: '탭 오버레이 제한됨',
        message: message || '현재 환경에서는 배지와 팝업만으로 알림을 유지합니다.'
      };
    }

    function normalizeWorkerStatus(worker) {
      if (worker?.mode === 'normal') {
        return {
          mode: 'normal',
          label: '정상 감지 중',
          message: worker.message || '브라우저 오버레이와 배지가 정상 동작 중입니다.'
        };
      }

      if (worker?.mode === 'limited') {
        return createLimitedWorkerStatus(worker.message);
      }

      return createCheckingWorkerStatus();
    }

    function describePostSource(response) {
      if (!response) {
        return '';
      }

      if (response.source === 'fetch') {
        return '실시간 목록을 새로 불러왔습니다.';
      }

      if (response.source === 'popup-fetch') {
        return '백그라운드 연결 없이 팝업이 직접 목록을 불러왔습니다.';
      }

      if (response.source === 'cache') {
        return '실시간 조회에 실패해 저장된 최근 기록을 보여줍니다.';
      }

      return '';
    }

    function formatLastScanLabel(lastScanAt, response = null) {
      const numericValue = Number(lastScanAt);
      if (!Number.isFinite(numericValue)) {
        return response?.cached ? '캐시' : '대기 중';
      }

      const diffMs = Math.max(0, now() - numericValue);
      if (diffMs < 60 * 1000) {
        return '방금';
      }

      const diffMinutes = Math.floor(diffMs / (60 * 1000));
      if (diffMinutes < 60) {
        return `${diffMinutes}분 전`;
      }

      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return `${diffHours}시간 전`;
      }

      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}일 전`;
    }

    async function fetchText(url) {
      return activeFetchRuntime.fetchText(url);
    }

    async function getStoredRecentPosts(settings = null) {
      const { [RECENT_POSTS_KEY]: storedPosts } = await chromeApi.storage.local.get([RECENT_POSTS_KEY]);
      if (!Array.isArray(storedPosts)) {
        return [];
      }

      const resolvedSettings = settings || await loadSettings();
      const trimmedPosts = trimRecentHistoryPosts(
        storedPosts,
        getRecentHistoryOptions(resolvedSettings)
      ).filter((post) => Number.isFinite(post.id) && post.title);

      return trimmedPosts;
    }

    async function getStoredUnreadPostIds() {
      const { [UNREAD_POST_IDS_KEY]: unreadIds } = await chromeApi.storage.local.get([UNREAD_POST_IDS_KEY]);
      if (!Array.isArray(unreadIds)) {
        return [];
      }

      return [...new Set(
        unreadIds
          .map((value) => Number(value))
          .filter(Number.isFinite)
      )].sort((left, right) => right - left);
    }

    function getUnreadHistoryOptions(settings, currentTime = now()) {
      const normalizedSettings = normalizeSettings(settings);
      return {
        currentTime,
        maxAgeMs: normalizedSettings.unreadActiveWindowMinutes * 60 * 1000
      };
    }

    function hydrateUnreadPosts(recentPosts, unreadIds, settings = null) {
      const unreadHistoryOptions = getUnreadHistoryOptions(settings);
      const postById = new Map(recentPosts.map((post) => [Number(post.id), post]));
      return unreadIds
        .map((postId) => postById.get(postId))
        .filter((post) => post && isUnreadPostActive(post, unreadHistoryOptions));
    }

    async function reconcileUnreadPosts(recentPosts, settings = null) {
      const unreadIds = await getStoredUnreadPostIds();
      const unreadPosts = hydrateUnreadPosts(recentPosts, unreadIds, settings);
      const visibleUnreadIds = unreadPosts.map((post) => Number(post.id)).filter(Number.isFinite);

      return {
        unreadIds: visibleUnreadIds,
        unreadPosts
      };
    }

    async function buildPopupResponse({
      source,
      fallback = false,
      error = null,
      recentPosts: providedRecentPosts = null
    }) {
      const settings = await loadSettings();
      const recentPosts = Array.isArray(providedRecentPosts)
        ? providedRecentPosts
        : await getStoredRecentPosts(settings);
      const { unreadIds, unreadPosts } = await reconcileUnreadPosts(recentPosts, settings);

      return {
        success: true,
        posts: unreadPosts.slice(0, DOMAIN_CONSTANTS.POPUP_POST_LIMIT),
        unreadPosts,
        historyPosts: recentPosts,
        unreadCount: unreadPosts.length,
        unreadPostIds: unreadIds,
        cached: source === 'cache',
        source,
        fallback,
        error
      };
    }

    async function fetchPopupPostsDirectly() {
      const settings = await loadSettings();
      const html = await fetchText(DOMAIN_CONSTANTS.MANGHO_LIST_URL);
      const livePosts = parsePostsFromHtml(html, {
        currentTime: now(),
        limit: DOMAIN_CONSTANTS.LIVE_POST_LIMIT,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      });
      const storedPosts = await getStoredRecentPosts(settings);
      const recentPosts = trimRecentHistoryPosts(
        mergePosts(livePosts, storedPosts, {
          currentTime: now(),
          viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
        }),
        getRecentHistoryOptions(settings)
      );
      return buildPopupResponse({ source: 'popup-fetch', recentPosts });
    }

    async function getCachedPopupPosts(settings = null) {
      const storedPosts = await getStoredRecentPosts(settings);
      return filterRecentOpenPosts(storedPosts, {
        currentTime: now(),
        limit: DOMAIN_CONSTANTS.POPUP_POST_LIMIT,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      });
    }

    async function fetchPopupPostsWithFallback() {
      try {
        return await fetchPopupPostsDirectly();
      } catch (error) {
        const settings = await loadSettings();
        const cachedPosts = await getCachedPopupPosts(settings);
        if (cachedPosts.length > 0) {
          const response = await buildPopupResponse({
            source: 'cache',
            fallback: true,
            error: error.message || String(error)
          });
          response.posts = cachedPosts;
          return response;
        }

        throw error;
      }
    }

    function isInjectableTab(tab) {
      if (!tab?.id || !tab.url) {
        return false;
      }

      try {
        const parsedUrl = new URL(tab.url);
        return /^https?:$/.test(parsedUrl.protocol);
      } catch (error) {
        return false;
      }
    }

    async function injectOverlayIntoTab(tabId, payload) {
      if (!chromeApi.scripting?.executeScript) {
        throw new Error(UNSUPPORTED_TEST_TAB_ERROR);
      }

      await chromeApi.scripting.executeScript({
        target: { tabId },
        files: [
          'scripts/shared/seaf-join-guard.js',
          'scripts/shared/seaf-overlay.js'
        ]
      });

      await chromeApi.scripting.executeScript({
        target: { tabId },
        func: (overlayPayload) => {
          if (!globalThis.SEAFOverlay?.showOverlay) {
            throw new Error('overlay runtime is unavailable');
          }

          globalThis.SEAFOverlay.showOverlay(overlayPayload);
        },
        args: [payload]
      });
    }

    async function triggerTestToastDirectly(settings) {
      const activeSettings = normalizeSettings(settings);
      const [activeTab] = await chromeApi.tabs.query({
        active: true,
        lastFocusedWindow: true
      });

      if (!activeTab?.id || !isInjectableTab(activeTab)) {
        return { success: false, error: UNSUPPORTED_TEST_TAB_ERROR };
      }

      if (isHelldiversListUrl(activeTab.url || '')) {
        try {
          const response = await chromeApi.tabs.sendMessage(activeTab.id, {
            type: 'SEAF_TEST_TOAST',
            title: '테스트 오버레이입니다.',
            relativeTime: '방금 확인',
            toastDuration: activeSettings.toastDuration * 1000
          });

          if (response?.success === false) {
            return {
              success: false,
              error: response.error || LIST_PAGE_NOT_READY_ERROR
            };
          }
        } catch (error) {
          if (isMissingReceiverError(error)) {
            return { success: false, error: LIST_PAGE_NOT_READY_ERROR };
          }

          throw error;
        }

        return { success: true, source: 'popup-test' };
      }

      await injectOverlayIntoTab(activeTab.id, {
        title: '테스트 오버레이입니다.',
        relativeTime: '방금 확인',
        toastDuration: activeSettings.toastDuration * 1000,
        sourceLabel: '테스트 알림',
        postUrl: DOMAIN_CONSTANTS.MANGHO_LIST_URL,
        isTest: true
      });

      return { success: true, source: 'popup-test' };
    }

    async function extractLobbyLinkDirectly(postId) {
      const html = await fetchText(`${DOMAIN_CONSTANTS.VIEW_URL_PREFIX}${postId}`);
      return extractLobbyLinkFromHtml(html);
    }

    function isMissingReceiverError(error) {
      return String(error?.message || error || '').includes('Receiving end does not exist');
    }

    function isExpectedToastTestError(error) {
      const message = String(error?.message || error || '');
      return (
        message.includes(UNSUPPORTED_TEST_TAB_ERROR) ||
        message.includes(LIST_PAGE_NOT_READY_ERROR)
      );
    }

    return {
      DEFAULT_SETTINGS,
      FIXED_POLLING_INTERVAL_SECONDS,
      MIN_TOAST_DURATION_SECONDS,
      MAX_TOAST_DURATION_SECONDS,
      DEFAULT_RECENT_HISTORY_LIMIT,
      MIN_RECENT_HISTORY_LIMIT,
      MAX_RECENT_HISTORY_LIMIT,
      DEFAULT_RECENT_HISTORY_RETENTION_MINUTES,
      MIN_RECENT_HISTORY_RETENTION_MINUTES,
      MAX_RECENT_HISTORY_RETENTION_MINUTES,
      DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES,
      MIN_UNREAD_ACTIVE_WINDOW_MINUTES,
      MAX_UNREAD_ACTIVE_WINDOW_MINUTES,
      DEFAULT_AUTHOR_BAN_OVERLAY_MODE,
      DEFAULT_CONFIRM_BANNED_AUTHOR_JOIN,
      RECENT_POSTS_KEY,
      UNREAD_POST_IDS_KEY,
      UNSUPPORTED_TEST_TAB_ERROR,
      LIST_PAGE_NOT_READY_ERROR,
      normalizeToastDuration,
      normalizeRecentHistoryLimit,
      normalizeRecentHistoryRetentionMinutes,
      normalizeUnreadActiveWindowMinutes,
      normalizeAuthorRecords,
      normalizeAuthorBanEntries,
      normalizeAuthorBanOverlayMode,
      normalizeConfirmBannedAuthorJoin,
      normalizeSettings,
      loadSettings,
      createCheckingWorkerStatus,
      createLimitedWorkerStatus,
      normalizeWorkerStatus,
      describePostSource,
      formatLastScanLabel,
      fetchText,
      getStoredRecentPosts,
      getStoredUnreadPostIds,
      getUnreadHistoryOptions,
      hydrateUnreadPosts,
      reconcileUnreadPosts,
      fetchPopupPostsDirectly,
      getCachedPopupPosts,
      fetchPopupPostsWithFallback,
      isInjectableTab,
      injectOverlayIntoTab,
      triggerTestToastDirectly,
      extractLobbyLinkDirectly,
      isMissingReceiverError,
      isExpectedToastTestError
    };
  }

  global.SEAFPopupCore = {
    createPopupCore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createPopupCore
    };
  }
})(globalThis);
