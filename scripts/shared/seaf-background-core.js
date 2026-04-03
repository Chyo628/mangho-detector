(function (global) {
  const ALARM_NAME = 'SEAF_DETECTION';
  const LAST_SEEN_KEY = 'seaf_last_seen_post_id';
  const RECENT_POSTS_KEY = 'seaf_recent_posts';
  const SETTINGS_KEY = 'seaf_settings';
  const UNREAD_POST_IDS_KEY = 'seaf_unread_post_ids';
  const LAST_SCAN_AT_KEY = 'seaf_last_scan_at';
  const LAST_SURFACE_STATE_KEY = 'seaf_last_surface_state';
  const FIXED_POLLING_INTERVAL_SECONDS = 30;
  const LEGACY_TOAST_DURATION_SECONDS = 6;
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
  const JOIN_HELPER_PATH = 'helper/join.html';
  const UNSUPPORTED_TEST_TAB_ERROR = '현재 탭에서는 오버레이 테스트를 실행할 수 없습니다.';
  const LIST_PAGE_NOT_READY_ERROR = '목록 페이지가 아직 준비되지 않았습니다.';
  const LOBBY_LINK_NOT_FOUND_ERROR = '로비 링크를 찾지 못했습니다.';
  const BADGE_COLOR = '#E8C547';
  const MAX_BADGE_COUNT = 99;
  const DEFAULT_SETTINGS = {
    isDetectionActive: true,
    pollingInterval: FIXED_POLLING_INTERVAL_SECONDS,
    toastDuration: DEFAULT_TOAST_DURATION_SECONDS,
    isSiteAlertEnabled: true,
    recentHistoryLimit: DEFAULT_RECENT_HISTORY_LIMIT,
    recentHistoryRetentionMinutes: DEFAULT_RECENT_HISTORY_RETENTION_MINUTES,
    unreadActiveWindowMinutes: DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES
  };

  function createBackgroundCore({
    chromeApi,
    fetchImpl,
    logger = console,
    domain,
    now = () => Date.now()
  }) {
    const {
      constants: DOMAIN_CONSTANTS,
      parsePostsFromHtml,
      filterRecentOpenPosts,
      refreshRelativeTimes,
      mergePosts,
      trimRecentHistoryPosts,
      isUnreadPostActive,
      extractLobbyLinkFromHtml,
      isHelldiversListUrl
    } = domain;

    let cachedSettings = null;
    let settingsPromise = null;

    function clampToastDuration(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_TOAST_DURATION_SECONDS;
      }

      return Math.min(
        MAX_TOAST_DURATION_SECONDS,
        Math.max(MIN_TOAST_DURATION_SECONDS, Math.round(numericValue))
      );
    }

    function clampRecentHistoryLimit(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_RECENT_HISTORY_LIMIT;
      }

      return Math.min(
        MAX_RECENT_HISTORY_LIMIT,
        Math.max(MIN_RECENT_HISTORY_LIMIT, Math.round(numericValue))
      );
    }

    function clampRecentHistoryRetentionMinutes(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_RECENT_HISTORY_RETENTION_MINUTES;
      }

      return Math.min(
        MAX_RECENT_HISTORY_RETENTION_MINUTES,
        Math.max(MIN_RECENT_HISTORY_RETENTION_MINUTES, Math.round(numericValue))
      );
    }

    function clampUnreadActiveWindowMinutes(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES;
      }

      return Math.min(
        MAX_UNREAD_ACTIVE_WINDOW_MINUTES,
        Math.max(MIN_UNREAD_ACTIVE_WINDOW_MINUTES, Math.round(numericValue))
      );
    }

    function normalizeSettings(savedSettings) {
      const normalizedSettings = {
        ...DEFAULT_SETTINGS,
        ...savedSettings
      };

      if (
        savedSettings &&
        typeof savedSettings.toastDuration === 'number' &&
        savedSettings.toastDuration === LEGACY_TOAST_DURATION_SECONDS
      ) {
        normalizedSettings.toastDuration = DEFAULT_TOAST_DURATION_SECONDS;
      }

      normalizedSettings.isDetectionActive = Boolean(normalizedSettings.isDetectionActive);
      normalizedSettings.isSiteAlertEnabled = Boolean(normalizedSettings.isSiteAlertEnabled);
      normalizedSettings.pollingInterval = FIXED_POLLING_INTERVAL_SECONDS;
      normalizedSettings.toastDuration = clampToastDuration(normalizedSettings.toastDuration);
      normalizedSettings.recentHistoryLimit = clampRecentHistoryLimit(
        normalizedSettings.recentHistoryLimit
      );
      normalizedSettings.recentHistoryRetentionMinutes = clampRecentHistoryRetentionMinutes(
        normalizedSettings.recentHistoryRetentionMinutes
      );
      normalizedSettings.unreadActiveWindowMinutes = clampUnreadActiveWindowMinutes(
        normalizedSettings.unreadActiveWindowMinutes
      );

      return normalizedSettings;
    }

    function getRecentHistoryOptions(settings, currentTime = now()) {
      const resolvedSettings = normalizeSettings(settings);
      return {
        currentTime,
        maxCount: resolvedSettings.recentHistoryLimit,
        maxAgeMs: resolvedSettings.recentHistoryRetentionMinutes * 60 * 1000,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      };
    }

    async function ensureSettings(options = {}) {
      const { forceRefresh = false } = options;

      if (!forceRefresh && cachedSettings) {
        return cachedSettings;
      }

      if (!forceRefresh && settingsPromise) {
        return settingsPromise;
      }

      settingsPromise = (async () => {
        const { [SETTINGS_KEY]: savedSettings } = await chromeApi.storage.local.get([SETTINGS_KEY]);
        const normalizedSettings = normalizeSettings(savedSettings);

        if (JSON.stringify(savedSettings || {}) !== JSON.stringify(normalizedSettings)) {
          await chromeApi.storage.local.set({ [SETTINGS_KEY]: normalizedSettings });
        }

        cachedSettings = normalizedSettings;
        return normalizedSettings;
      })();

      try {
        return await settingsPromise;
      } finally {
        settingsPromise = null;
      }
    }

    function handleStorageChanged(changes, areaName) {
      if (areaName !== 'local') {
        return;
      }

      if (changes[SETTINGS_KEY]) {
        cachedSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
      }

      if (changes[UNREAD_POST_IDS_KEY] || changes[SETTINGS_KEY]) {
        syncBadge().catch((error) => {
          logger.warn('[SEAF] 배지 동기화 실패:', error);
        });
      }
    }

    async function setupAlarm(settings = null) {
      const resolvedSettings = settings || await ensureSettings();
      await chromeApi.alarms.clear(ALARM_NAME);

      if (!resolvedSettings.isDetectionActive) {
        logger.log('[SEAF] 감지가 꺼져 있습니다.');
        return;
      }

      chromeApi.alarms.create(ALARM_NAME, {
        periodInMinutes: FIXED_POLLING_INTERVAL_SECONDS / 60
      });

      logger.log(`[SEAF] 감지 주기 설정: ${FIXED_POLLING_INTERVAL_SECONDS}초 고정`);
    }

    async function getUnreadPostIds() {
      const { [UNREAD_POST_IDS_KEY]: storedIds } = await chromeApi.storage.local.get([UNREAD_POST_IDS_KEY]);
      if (!Array.isArray(storedIds)) {
        return [];
      }

      return [...new Set(
        storedIds
          .map((value) => Number(value))
          .filter(Number.isFinite)
      )].sort((left, right) => right - left);
    }

    async function setUnreadPostIds(postIds) {
      const normalizedIds = [...new Set(
        (Array.isArray(postIds) ? postIds : [])
          .map((value) => Number(value))
          .filter(Number.isFinite)
      )].sort((left, right) => right - left);

      await chromeApi.storage.local.set({ [UNREAD_POST_IDS_KEY]: normalizedIds });
      return normalizedIds;
    }

    async function addUnreadPostIds(postIds) {
      const currentIds = await getUnreadPostIds();
      return setUnreadPostIds([...currentIds, ...postIds]);
    }

    async function markPostRead(postId) {
      const normalizedPostId = Number(postId);
      if (!Number.isFinite(normalizedPostId)) {
        return { success: false, unreadIds: await getUnreadPostIds() };
      }

      const unreadIds = await getUnreadPostIds();
      const nextIds = unreadIds.filter((value) => value !== normalizedPostId);
      await setUnreadPostIds(nextIds);
      return { success: true, unreadIds: nextIds };
    }

    async function getLastSurfaceState() {
      const { [LAST_SURFACE_STATE_KEY]: state } = await chromeApi.storage.local.get([LAST_SURFACE_STATE_KEY]);
      return state && typeof state === 'object' ? state : null;
    }

    async function setLastSurfaceState(state) {
      const normalizedState = {
        mode: state?.mode || 'normal',
        message: state?.message || '',
        updatedAt: Number(state?.updatedAt) || now()
      };

      await chromeApi.storage.local.set({ [LAST_SURFACE_STATE_KEY]: normalizedState });
      return normalizedState;
    }

    async function syncBadge(settings = null) {
      if (!chromeApi.action?.setBadgeText) {
        return;
      }

      const resolvedSettings = settings || await ensureSettings();
      const recentPosts = await getRecentPosts(resolvedSettings);
      const { unreadIds } = await reconcileUnreadPosts(recentPosts, resolvedSettings);
      const shouldShowBadge = resolvedSettings.isSiteAlertEnabled && unreadIds.length > 0;
      const badgeText = shouldShowBadge
        ? String(Math.min(unreadIds.length, MAX_BADGE_COUNT))
        : '';

      await chromeApi.action.setBadgeBackgroundColor({ color: BADGE_COLOR }).catch(() => {});
      await chromeApi.action.setBadgeText({ text: badgeText }).catch(() => {});

      if (chromeApi.action.setTitle) {
        const title = unreadIds.length > 0
          ? `MANGHO Detector · 읽지 않은 모집 ${unreadIds.length}건`
          : 'MANGHO Detector';
        await chromeApi.action.setTitle({ title }).catch(() => {});
      }
    }

    async function setLastScanAt(timestamp = now()) {
      await chromeApi.storage.local.set({ [LAST_SCAN_AT_KEY]: Number(timestamp) || now() });
    }

    async function getLastScanAt() {
      const { [LAST_SCAN_AT_KEY]: lastScanAt } = await chromeApi.storage.local.get([LAST_SCAN_AT_KEY]);
      return Number(lastScanAt) || null;
    }

    async function fetchText(url) {
      const response = await fetchImpl(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`요청 실패: ${response.status}`);
      }

      return response.text();
    }

    async function fetchLivePosts(options = {}) {
      const { recordScan = true } = options;
      const html = await fetchText(DOMAIN_CONSTANTS.MANGHO_LIST_URL);
      if (recordScan) {
        await setLastScanAt(now());
      }
      return parsePostsFromHtml(html, {
        currentTime: now(),
        limit: DOMAIN_CONSTANTS.LIVE_POST_LIMIT,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      });
    }

    function limitPopupPosts(posts) {
      return filterRecentOpenPosts(posts, {
        currentTime: now(),
        limit: DOMAIN_CONSTANTS.POPUP_POST_LIMIT,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      });
    }

    async function getRecentPosts(settings = null) {
      const { [RECENT_POSTS_KEY]: storedPosts } = await chromeApi.storage.local.get([RECENT_POSTS_KEY]);
      if (!Array.isArray(storedPosts)) {
        return [];
      }

      const resolvedSettings = settings || await ensureSettings();
      const trimmedPosts = trimRecentHistoryPosts(
        storedPosts,
        getRecentHistoryOptions(resolvedSettings)
      ).filter((post) => Number.isFinite(post.id) && post.title);

      if (!areStoredPostsEquivalent(storedPosts, trimmedPosts)) {
        await chromeApi.storage.local.set({ [RECENT_POSTS_KEY]: trimmedPosts });
      }

      return trimmedPosts;
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

    async function storeRecentPosts(posts, settings = null) {
      if (!Array.isArray(posts) || posts.length === 0) {
        return;
      }

      const resolvedSettings = settings || await ensureSettings();
      const existingPosts = await getRecentPosts(resolvedSettings);
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

    function buildWorkerStatus(settings, surfaceState = null, overrides = {}) {
      const resolvedSurfaceState = surfaceState || null;
      const baseMessage = settings.isDetectionActive
        ? `백그라운드 감지가 ${FIXED_POLLING_INTERVAL_SECONDS}초 고정으로 동작 중입니다.`
        : '백그라운드 감지가 꺼져 있습니다.';

      return {
        connected: true,
        mode: resolvedSurfaceState?.mode || 'normal',
        detectionActive: Boolean(settings.isDetectionActive),
        message: resolvedSurfaceState?.message || baseMessage,
        ...overrides
      };
    }

    function getOverlayPayload(post, settings, options = {}) {
      return {
        postId: post.id,
        title: post.title,
        postUrl: post.postUrl,
        relativeTime: post.relativeTime,
        toastDuration: settings.toastDuration * 1000,
        sourceLabel: options.sourceLabel || 'MANGHO 감지',
        isTest: Boolean(options.isTest)
      };
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

    async function getActiveTab() {
      const [activeTab] = await chromeApi.tabs.query({
        active: true,
        lastFocusedWindow: true
      });
      return activeTab || null;
    }

    async function ensureOverlayInjected(tabId) {
      if (!chromeApi.scripting?.executeScript) {
        throw new Error('scripting API is unavailable');
      }

      await chromeApi.scripting.executeScript({
        target: { tabId },
        files: ['scripts/shared/seaf-overlay.js']
      });
    }

    async function showOverlayInInjectedTab(tabId, payload) {
      await ensureOverlayInjected(tabId);
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

    async function showOverlayInListTab(tabId, payload) {
      const response = await chromeApi.tabs.sendMessage(tabId, {
        type: 'SEAF_NEW_POST',
        ...payload
      });

      if (response?.success === false) {
        throw new Error(response.error || LIST_PAGE_NOT_READY_ERROR);
      }
    }

    async function surfacePostInActiveTab(post, settings, options = {}) {
      const {
        activeTab: providedActiveTab = null,
        persistState = true
      } = options;
      const activeTab = providedActiveTab || await getActiveTab();
      if (!activeTab?.id) {
        const nextSurfaceState = {
          mode: 'limited',
          message: '현재 활성 탭이 없어 확장 아이콘 배지로만 알림을 유지합니다.'
        };
        const surfaceState = persistState ? await setLastSurfaceState(nextSurfaceState) : nextSurfaceState;
        return {
          surfaced: false,
          mode: surfaceState.mode,
          reason: 'missing-active-tab',
          message: surfaceState.message
        };
      }

      const payload = getOverlayPayload(post, settings);

      try {
        if (isHelldiversListUrl(activeTab.url || '')) {
          await showOverlayInListTab(activeTab.id, payload);
          const nextSurfaceState = {
            mode: 'normal',
            message: '현재 보고 있는 탭 위에 모집 오버레이를 표시했습니다.'
          };
          const surfaceState = persistState ? await setLastSurfaceState(nextSurfaceState) : nextSurfaceState;
          return { surfaced: true, mode: surfaceState.mode, message: surfaceState.message };
        }

        if (!isInjectableTab(activeTab)) {
          const nextSurfaceState = {
            mode: 'limited',
            message: '현재 탭에는 오버레이를 주입할 수 없어 확장 아이콘 배지로만 알림을 유지합니다.'
          };
          const surfaceState = persistState ? await setLastSurfaceState(nextSurfaceState) : nextSurfaceState;
          return {
            surfaced: false,
            mode: surfaceState.mode,
            reason: 'restricted-tab',
            message: surfaceState.message
          };
        }

        await showOverlayInInjectedTab(activeTab.id, payload);
        const nextSurfaceState = {
          mode: 'normal',
          message: '현재 보고 있는 다른 크롬 탭 위에 모집 오버레이를 표시했습니다.'
        };
        const surfaceState = persistState ? await setLastSurfaceState(nextSurfaceState) : nextSurfaceState;
        return { surfaced: true, mode: surfaceState.mode, message: surfaceState.message };
      } catch (error) {
        const nextSurfaceState = {
          mode: 'limited',
          message: '오버레이 표시가 제한되어 확장 아이콘 배지와 팝업으로만 알림을 유지합니다.'
        };
        const surfaceState = persistState ? await setLastSurfaceState(nextSurfaceState) : nextSurfaceState;
        logger.warn('[SEAF] 오버레이 표시 실패:', error);
        return {
          surfaced: false,
          mode: surfaceState.mode,
          reason: getErrorMessage(error),
          message: surfaceState.message
        };
      }
    }

    function getUnreadHistoryOptions(settings, currentTime = now()) {
      const resolvedSettings = normalizeSettings(settings);
      return {
        currentTime,
        maxAgeMs: resolvedSettings.unreadActiveWindowMinutes * 60 * 1000
      };
    }

    function hydrateUnreadPosts(recentPosts, unreadIds, settings = null) {
      const unreadHistoryOptions = getUnreadHistoryOptions(settings);
      const postById = new Map(recentPosts.map((post) => [Number(post.id), post]));
      return unreadIds
        .map((postId) => postById.get(postId))
        .filter((post) => post && isUnreadPostActive(post, unreadHistoryOptions))
        .slice(0, recentPosts.length);
    }

    async function reconcileUnreadPosts(recentPosts, settings = null) {
      const unreadIds = await getUnreadPostIds();
      const unreadPosts = hydrateUnreadPosts(recentPosts, unreadIds, settings);
      const visibleUnreadIds = unreadPosts.map((post) => Number(post.id)).filter(Number.isFinite);

      if (
        visibleUnreadIds.length !== unreadIds.length ||
        visibleUnreadIds.some((postId, index) => postId !== unreadIds[index])
      ) {
        await setUnreadPostIds(visibleUnreadIds);
      }

      return {
        unreadIds: visibleUnreadIds,
        unreadPosts
      };
    }

    async function buildPopupPayload({ source, fallback = false, error = null }) {
      const settings = await ensureSettings();
      const recentPosts = await getRecentPosts(settings);
      const { unreadIds, unreadPosts } = await reconcileUnreadPosts(recentPosts, settings);
      const lastScanAt = await getLastScanAt();
      const surfaceState = await getLastSurfaceState();

      return {
        success: true,
        posts: unreadPosts.slice(0, DOMAIN_CONSTANTS.POPUP_POST_LIMIT),
        unreadPosts,
        historyPosts: recentPosts,
        unreadCount: unreadPosts.length,
        unreadPostIds: unreadIds,
        lastScanAt,
        cached: source === 'cache',
        source,
        fallback,
        error,
        worker: buildWorkerStatus(settings, surfaceState)
      };
    }

    async function getPopupPosts(options = {}) {
      const { recordScan = false } = options;
      try {
        const settings = await ensureSettings();
        const livePosts = await fetchLivePosts({ recordScan });
        if (livePosts.length > 0) {
          await storeRecentPosts(livePosts, settings);
        }

        return buildPopupPayload({ source: 'fetch' });
      } catch (error) {
        const recentPosts = await getRecentPosts();
        if (recentPosts.length > 0) {
          return buildPopupPayload({
            source: 'cache',
            fallback: true,
            error: getErrorMessage(error)
          });
        }

        throw error;
      }
    }

    async function performDetection(settings = null) {
      const resolvedSettings = settings || await ensureSettings();
      if (!resolvedSettings.isDetectionActive) {
        return;
      }

      const detectionTime = now();
      const posts = await fetchLivePosts();
      if (posts.length > 0) {
        await storeRecentPosts(posts, resolvedSettings);
      }

      if (posts.length === 0) {
        await syncBadge(resolvedSettings);
        return;
      }

      const latestPostId = Number(posts[0].id) || null;
      if (!latestPostId) {
        await syncBadge(resolvedSettings);
        return;
      }

      const { [LAST_SEEN_KEY]: storedLastSeenPostId } = await chromeApi.storage.local.get([LAST_SEEN_KEY]);
      const lastSeenPostId = Number(storedLastSeenPostId) || null;

      if (lastSeenPostId === null) {
        await chromeApi.storage.local.set({ [LAST_SEEN_KEY]: latestPostId });
        await syncBadge(resolvedSettings);
        logger.log(`[SEAF] 초기 lastSeenPostId 설정: ${latestPostId}`);
        return;
      }

      const newPosts = filterRecentOpenPosts(posts, {
        currentTime: detectionTime,
        limit: DOMAIN_CONSTANTS.LIVE_POST_LIMIT,
        viewUrlPrefix: DOMAIN_CONSTANTS.VIEW_URL_PREFIX
      }).filter((post) => post.id > lastSeenPostId);

      if (latestPostId > lastSeenPostId) {
        await chromeApi.storage.local.set({ [LAST_SEEN_KEY]: latestPostId });
      }

      if (newPosts.length === 0) {
        await syncBadge(resolvedSettings);
        return;
      }

      await addUnreadPostIds(newPosts.map((post) => post.id));
      await syncBadge(resolvedSettings);

      if (!resolvedSettings.isSiteAlertEnabled) {
        await setLastSurfaceState({
          mode: 'limited',
          message: '브라우저 알림이 꺼져 있어 읽지 않은 모집만 배지와 팝업에 유지합니다.'
        });
        return;
      }

      const activeTab = await getActiveTab();
      const orderedPosts = [...newPosts].sort((left, right) => left.id - right.id);
      let surfaceResult = null;

      for (const post of orderedPosts) {
        surfaceResult = await surfacePostInActiveTab(post, resolvedSettings, {
          activeTab,
          persistState: false
        });

        if (!surfaceResult?.surfaced) {
          break;
        }
      }

      if (surfaceResult?.message) {
        await setLastSurfaceState({
          mode: surfaceResult.mode,
          message: surfaceResult.message
        });
      }
    }

    async function extractLobbyLink(postId) {
      const html = await fetchText(buildPostUrl(postId));
      return extractLobbyLinkFromHtml(html);
    }

    function buildPostUrl(postId) {
      return `${DOMAIN_CONSTANTS.VIEW_URL_PREFIX}${postId}`;
    }

    function getRuntimeUrl(path) {
      if (chromeApi.runtime?.getURL) {
        return chromeApi.runtime.getURL(path);
      }

      return path;
    }

    async function buildJoinHelperUrl(postId) {
      const helperUrl = new URL(getRuntimeUrl(JOIN_HELPER_PATH));
      const normalizedPostId = Number(postId);
      helperUrl.searchParams.set('postId', String(normalizedPostId));
      helperUrl.searchParams.set('postUrl', buildPostUrl(normalizedPostId));

      try {
        const link = await extractLobbyLink(normalizedPostId);
        if (link) {
          helperUrl.searchParams.set('lobbyLink', link);
        } else {
          helperUrl.searchParams.set('error', LOBBY_LINK_NOT_FOUND_ERROR);
        }
      } catch (error) {
        helperUrl.searchParams.set('error', getErrorMessage(error));
      }

      return helperUrl.toString();
    }

    async function openPostPage(postId) {
      return chromeApi.tabs.create({ url: buildPostUrl(postId) });
    }

    async function openJoinHelperTab(postId) {
      const helperUrl = await buildJoinHelperUrl(postId);

      try {
        return await chromeApi.tabs.create({ url: helperUrl });
      } catch (error) {
        return openPostPage(postId);
      }
    }

    async function joinPost(postId, sender) {
      const normalizedPostId = Number(postId);
      const link = await extractLobbyLink(normalizedPostId);
      if (!link) {
        return { success: false, error: LOBBY_LINK_NOT_FOUND_ERROR };
      }

      await markPostRead(normalizedPostId);
      await syncBadge();

      if (sender.tab?.id) {
        try {
          await chromeApi.tabs.sendMessage(sender.tab.id, {
            type: 'SEAF_JOIN_LINK',
            link
          });

          return { success: true, link };
        } catch (error) {
          if (!isMissingReceiverError(error)) {
            logger.warn('[SEAF] 참가 링크 전달 실패:', error);
          }
        }
      }

      try {
        await chromeApi.tabs.create({ url: link });
        return { success: true, link };
      } catch (error) {
        return { success: true, link, opened: false };
      }
    }

    async function openPost(postId) {
      await markPostRead(postId);
      await syncBadge();
      await openPostPage(postId);
      return { success: true, postId: Number(postId) };
    }

    async function markAllRead() {
      await setUnreadPostIds([]);
      await syncBadge();
      return { success: true, unreadCount: 0, unreadPostIds: [] };
    }

    async function getActiveInjectableTab() {
      const activeTab = await getActiveTab();
      if (!activeTab?.id || !isInjectableTab(activeTab)) {
        throw new Error(UNSUPPORTED_TEST_TAB_ERROR);
      }

      return activeTab;
    }

    async function triggerTestToast(settings) {
      const activeTab = await getActiveInjectableTab();
      const payload = {
        title: '테스트 오버레이입니다',
        relativeTime: '방금 확인',
        toastDuration: settings.toastDuration * 1000,
        sourceLabel: '테스트 알림',
        postUrl: DOMAIN_CONSTANTS.MANGHO_LIST_URL,
        isTest: true
      };

      if (isHelldiversListUrl(activeTab.url || '')) {
        try {
          const response = await chromeApi.tabs.sendMessage(activeTab.id, {
            type: 'SEAF_TEST_TOAST',
            ...payload
          });

          if (response?.success === false) {
            throw new Error(response.error || LIST_PAGE_NOT_READY_ERROR);
          }

          await setLastSurfaceState({
            mode: 'normal',
            message: '현재 탭에서 오버레이 테스트를 표시했습니다.'
          });
          return;
        } catch (error) {
          if (isMissingReceiverError(error)) {
            throw new Error(LIST_PAGE_NOT_READY_ERROR);
          }

          throw error;
        }
      }

      await showOverlayInInjectedTab(activeTab.id, payload);
      await setLastSurfaceState({
        mode: 'normal',
        message: '현재 탭에서 오버레이 테스트를 표시했습니다.'
      });
    }

    async function initializeExtension() {
      const settings = await ensureSettings({ forceRefresh: true });
      await setupAlarm(settings);
      await syncBadge(settings);
      await performDetection(settings);
    }

    async function handleSettingsUpdated() {
      const settings = await ensureSettings({ forceRefresh: true });
      await setupAlarm(settings);
      await syncBadge(settings);
      const surfaceState = await getLastSurfaceState();

      return {
        success: true,
        worker: buildWorkerStatus(settings, surfaceState),
        settings
      };
    }

    async function handleTestActiveTabToast() {
      const settings = await ensureSettings();
      await triggerTestToast(settings);

      return {
        success: true,
        worker: buildWorkerStatus(settings, await getLastSurfaceState()),
        settings
      };
    }

    function isMissingReceiverError(error) {
      return getErrorMessage(error).includes('Receiving end does not exist');
    }

    function getErrorMessage(error) {
      return String(error?.message || error || '알 수 없는 오류');
    }

    return {
      ALARM_NAME,
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
      LAST_SEEN_KEY,
      RECENT_POSTS_KEY,
      SETTINGS_KEY,
      UNREAD_POST_IDS_KEY,
      LAST_SCAN_AT_KEY,
      LAST_SURFACE_STATE_KEY,
      JOIN_HELPER_PATH,
      UNSUPPORTED_TEST_TAB_ERROR,
      LIST_PAGE_NOT_READY_ERROR,
      LOBBY_LINK_NOT_FOUND_ERROR,
      clampToastDuration,
      clampRecentHistoryLimit,
      clampRecentHistoryRetentionMinutes,
      clampUnreadActiveWindowMinutes,
      normalizeSettings,
      ensureSettings,
      handleStorageChanged,
      setupAlarm,
      getUnreadPostIds,
      setUnreadPostIds,
      addUnreadPostIds,
      markPostRead,
      syncBadge,
      buildWorkerStatus,
      fetchText,
      fetchLivePosts,
      limitPopupPosts,
      getRecentPosts,
      areStoredPostsEquivalent,
      storeRecentPosts,
      getPopupPosts,
      getUnreadHistoryOptions,
      hydrateUnreadPosts,
      reconcileUnreadPosts,
      performDetection,
      getOverlayPayload,
      isInjectableTab,
      getActiveTab,
      ensureOverlayInjected,
      showOverlayInInjectedTab,
      showOverlayInListTab,
      surfacePostInActiveTab,
      buildPostUrl,
      extractLobbyLink,
      buildJoinHelperUrl,
      openPostPage,
      openJoinHelperTab,
      joinPost,
      openPost,
      markAllRead,
      getActiveInjectableTab,
      triggerTestToast,
      initializeExtension,
      handleSettingsUpdated,
      handleTestActiveTabToast,
      isMissingReceiverError,
      getErrorMessage
    };
  }

  global.SEAFBackgroundCore = {
    createBackgroundCore
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createBackgroundCore
    };
  }
})(globalThis);
