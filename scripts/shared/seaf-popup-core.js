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
  const DEFAULT_SETTINGS = {
    isDetectionActive: true,
    pollingInterval: FIXED_POLLING_INTERVAL_SECONDS,
    toastDuration: DEFAULT_TOAST_DURATION_SECONDS,
    isSiteAlertEnabled: true,
    recentHistoryLimit: DEFAULT_RECENT_HISTORY_LIMIT,
    recentHistoryRetentionMinutes: DEFAULT_RECENT_HISTORY_RETENTION_MINUTES
  };
  const RECENT_POSTS_KEY = 'seaf_recent_posts';
  const UNREAD_POST_IDS_KEY = 'seaf_unread_post_ids';
  const UNSUPPORTED_TEST_TAB_ERROR = '현재 탭에서는 오버레이 테스트를 실행할 수 없습니다.';
  const LIST_PAGE_NOT_READY_ERROR = '목록 페이지가 아직 준비되지 않았습니다.';

  function createPopupCore({
    chromeApi,
    fetchImpl,
    domain,
    now = () => Date.now()
  }) {
    const {
      constants: DOMAIN_CONSTANTS,
      parsePostsFromHtml,
      filterRecentOpenPosts,
      extractLobbyLinkFromHtml,
      mergePosts,
      trimRecentHistoryPosts,
      isHelldiversListUrl
    } = domain;

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

    function normalizeSettings(savedSettings) {
      const normalizedSettings = {
        ...DEFAULT_SETTINGS,
        ...savedSettings
      };

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
      const response = await fetchImpl(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`요청 실패: ${response.status}`);
      }

      return response.text();
    }

    function areStoredPostsEquivalent(leftPosts, rightPosts) {
      if (leftPosts.length !== rightPosts.length) {
        return false;
      }

      return leftPosts.every((leftPost, index) => {
        const rightPost = rightPosts[index];
        return (
          Number(leftPost?.id) === Number(rightPost?.id) &&
          String(leftPost?.title || '') === String(rightPost?.title || '') &&
          String(leftPost?.subject || '') === String(rightPost?.subject || '') &&
          String(leftPost?.fullDateStr || '') === String(rightPost?.fullDateStr || '') &&
          String(leftPost?.postUrl || '') === String(rightPost?.postUrl || '')
        );
      });
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

      if (!areStoredPostsEquivalent(storedPosts, trimmedPosts)) {
        await chromeApi.storage.local.set({ [RECENT_POSTS_KEY]: trimmedPosts });
      }

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

    async function storeRecentPosts(posts, settings = null) {
      if (!Array.isArray(posts) || posts.length === 0) {
        return;
      }

      const resolvedSettings = settings || await loadSettings();
      const existingPosts = await getStoredRecentPosts(resolvedSettings);
      const mergedPosts = trimRecentHistoryPosts(
        mergePosts(posts, existingPosts, {
          currentTime: now(),
          viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
        }),
        getRecentHistoryOptions(resolvedSettings)
      );

      if (areStoredPostsEquivalent(existingPosts, mergedPosts)) {
        return;
      }

      await chromeApi.storage.local.set({ [RECENT_POSTS_KEY]: mergedPosts });
    }

    function hydrateUnreadPosts(recentPosts, unreadIds) {
      const postById = new Map(recentPosts.map((post) => [Number(post.id), post]));
      return unreadIds
        .map((postId) => postById.get(postId))
        .filter(Boolean);
    }

    async function reconcileUnreadPosts(recentPosts) {
      const unreadIds = await getStoredUnreadPostIds();
      const unreadPosts = hydrateUnreadPosts(recentPosts, unreadIds);
      const visibleUnreadIds = unreadPosts.map((post) => Number(post.id)).filter(Number.isFinite);

      if (
        visibleUnreadIds.length !== unreadIds.length ||
        visibleUnreadIds.some((postId, index) => postId !== unreadIds[index])
      ) {
        await chromeApi.storage.local.set({ [UNREAD_POST_IDS_KEY]: visibleUnreadIds });
      }

      return {
        unreadIds: visibleUnreadIds,
        unreadPosts
      };
    }

    async function buildPopupResponse({ source, fallback = false, error = null }) {
      const settings = await loadSettings();
      const recentPosts = await getStoredRecentPosts(settings);
      const { unreadIds, unreadPosts } = await reconcileUnreadPosts(recentPosts);

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
      await storeRecentPosts(livePosts, settings);
      return buildPopupResponse({ source: 'popup-fetch' });
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
          if (response.unreadPosts.length === 0) {
            response.unreadPosts = cachedPosts;
            response.unreadCount = cachedPosts.length;
          }
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
        files: ['scripts/shared/seaf-overlay.js']
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

    async function markPostRead(postId) {
      const normalizedPostId = Number(postId);
      if (!Number.isFinite(normalizedPostId)) {
        return [];
      }

      const unreadIds = await getStoredUnreadPostIds();
      const nextIds = unreadIds.filter((value) => value !== normalizedPostId);
      await chromeApi.storage.local.set({ [UNREAD_POST_IDS_KEY]: nextIds });
      return nextIds;
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
      RECENT_POSTS_KEY,
      UNREAD_POST_IDS_KEY,
      UNSUPPORTED_TEST_TAB_ERROR,
      LIST_PAGE_NOT_READY_ERROR,
      normalizeToastDuration,
      normalizeRecentHistoryLimit,
      normalizeRecentHistoryRetentionMinutes,
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
      areStoredPostsEquivalent,
      storeRecentPosts,
      hydrateUnreadPosts,
      reconcileUnreadPosts,
      fetchPopupPostsDirectly,
      getCachedPopupPosts,
      fetchPopupPostsWithFallback,
      isInjectableTab,
      injectOverlayIntoTab,
      triggerTestToastDirectly,
      extractLobbyLinkDirectly,
      markPostRead,
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
