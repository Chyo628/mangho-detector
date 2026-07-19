(function (global) {
  const ALARM_NAME = 'SEAF_DETECTION';
  const LAST_SEEN_KEY = 'seaf_last_seen_post_id';
  const RECENT_POSTS_KEY = 'seaf_recent_posts';
  const SETTINGS_KEY = 'seaf_settings';
  const UNREAD_POST_IDS_KEY = 'seaf_unread_post_ids';
  const POST_OPEN_STATES_KEY = 'seaf_post_open_states';
  const LAST_SCAN_AT_KEY = 'seaf_last_scan_at';
  const LAST_SURFACE_STATE_KEY = 'seaf_last_surface_state';
  const DEFAULT_FETCH_TIMEOUT_MS = 10000;
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
  const UNSUPPORTED_TEST_TAB_ERROR = '현재 탭에서는 오버레이 테스트를 실행할 수 없습니다.';
  const LIST_PAGE_NOT_READY_ERROR = '목록 페이지가 아직 준비되지 않았습니다.';
  const LOBBY_LINK_NOT_FOUND_ERROR = '로비 링크를 찾지 못했습니다.';
  const FETCH_TIMEOUT_ERROR = 'Request timed out.';
  const OPTIONAL_PERMISSION_REMOVED_MESSAGE = '\uC0AC\uC774\uD2B8 \uC811\uADFC \uAD8C\uD55C\uC774 \uD574\uC81C\uB418\uC5B4 \uBE0C\uB77C\uC6B0\uC800 \uC54C\uB9BC\uC744 \uAECF\uC2B5\uB2C8\uB2E4.';
  const BADGE_COLOR = '#E8C547';
  const MAX_BADGE_COUNT = 99;
  const DEFAULT_SETTINGS = {
    isDetectionActive: true,
    pollingInterval: FIXED_POLLING_INTERVAL_SECONDS,
    toastDuration: DEFAULT_TOAST_DURATION_SECONDS,
    isSiteAlertEnabled: true,
    confirmBannedAuthorJoin: true,
    authorRecords: [],
    authorBanOverlayMode: 'warn',
    recentHistoryLimit: DEFAULT_RECENT_HISTORY_LIMIT,
    recentHistoryRetentionMinutes: DEFAULT_RECENT_HISTORY_RETENTION_MINUTES,
    unreadActiveWindowMinutes: DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES
  };

  function createBackgroundCore({
    chromeApi,
    fetchImpl,
    fetchRuntime: injectedFetchRuntime = null,
    logger = console,
    domain,
    permissionsRuntime: injectedPermissionsRuntime = null,
    now = () => Date.now(),
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS
  }) {
    const {
      constants: DOMAIN_CONSTANTS,
      parsePostsFromHtml,
      filterRecentOpenPosts,
      refreshRelativeTimes,
      mergePosts,
      trimRecentHistoryPosts,
      isOpenRecruitment,
      isUnreadPostActive,
      extractLobbyLinkFromHtml,
      isHelldiversListUrl,
      normalizeAuthorRecords,
      normalizeAuthorBanOverlayMode,
      normalizeConfirmBannedAuthorJoin,
      createAuthorRecord,
      createNicknameAuthorRecord,
      normalizeAuthorNote,
      getAuthorRecordMatchSummary
    } = domain;

    let cachedSettings = null;
    let settingsPromise = null;
    let detectionPromise = null;
    let settingsUpdateTail = Promise.resolve();
    let unreadUpdateTail = Promise.resolve();
    let recentPostsUpdateTail = Promise.resolve();
    const activeFetchTimeoutMs = Number.isFinite(Number(fetchTimeoutMs)) && Number(fetchTimeoutMs) > 0
      ? Number(fetchTimeoutMs)
      : DEFAULT_FETCH_TIMEOUT_MS;
    const fetchRuntime = injectedFetchRuntime
      || global.SEAFFetch?.createFetchRuntime?.({
        fetchImpl,
        defaultTimeoutMs: activeFetchTimeoutMs,
        timeoutErrorMessage: FETCH_TIMEOUT_ERROR
      })
      || null;
    const permissionsRuntime = injectedPermissionsRuntime
      || global.SEAFPermissions?.createPermissionsRuntime?.({
        permissionsApi: chromeApi.permissions
      })
      || null;

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

      if (
        savedSettings &&
        typeof savedSettings.toastDuration === 'number' &&
        savedSettings.toastDuration === LEGACY_TOAST_DURATION_SECONDS
      ) {
        normalizedSettings.toastDuration = DEFAULT_TOAST_DURATION_SECONDS;
      }

      normalizedSettings.isDetectionActive = Boolean(normalizedSettings.isDetectionActive);
      normalizedSettings.isSiteAlertEnabled = Boolean(normalizedSettings.isSiteAlertEnabled);
      normalizedSettings.confirmBannedAuthorJoin = normalizeConfirmBannedAuthorJoin(
        normalizedSettings.confirmBannedAuthorJoin
      );
      normalizedSettings.authorRecords = normalizeAuthorRecords(authorRecordSource);
      normalizedSettings.authorBanOverlayMode = normalizeAuthorBanOverlayMode(
        normalizedSettings.authorBanOverlayMode
      );
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

    function enqueueSettingsUpdate(update) {
      const currentUpdate = settingsUpdateTail.then(update);
      settingsUpdateTail = currentUpdate.catch(() => {});
      return currentUpdate;
    }

    async function persistSettings(nextSettings) {
      const normalizedSettings = normalizeSettings(nextSettings);
      cachedSettings = normalizedSettings;
      await chromeApi.storage.local.set({ [SETTINGS_KEY]: normalizedSettings });
      return normalizedSettings;
    }

    async function finalizeSettingsUpdate(settings) {
      await setupAlarm(settings);
      await syncBadge(settings);
      let surfaceState = await getLastSurfaceState();
      if (
        settings.isSiteAlertEnabled &&
        surfaceState?.message === OPTIONAL_PERMISSION_REMOVED_MESSAGE
      ) {
        surfaceState = await setLastSurfaceState({
          mode: 'normal',
          message: '브라우저 알림 권한이 다시 활성화되었습니다.'
        });
      }

      return {
        success: true,
        settings,
        worker: buildWorkerStatus(settings, surfaceState)
      };
    }

    function buildSettingsError(errorCode, settings, extra = {}) {
      return {
        success: false,
        errorCode,
        settings,
        ...extra
      };
    }

    async function getSettings() {
      const settings = await ensureSettings();
      return {
        success: true,
        settings,
        worker: buildWorkerStatus(settings, await getLastSurfaceState())
      };
    }

    function normalizeSettingsPatch(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return {};
      }

      const allowedKeys = [
        'isDetectionActive',
        'isSiteAlertEnabled',
        'toastDuration',
        'authorBanOverlayMode',
        'confirmBannedAuthorJoin',
        'recentHistoryLimit',
        'recentHistoryRetentionMinutes',
        'unreadActiveWindowMinutes'
      ];

      return allowedKeys.reduce((nextPatch, key) => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          nextPatch[key] = patch[key];
        }
        return nextPatch;
      }, {});
    }

    async function updateSettingsPatch(patch) {
      return enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings();
        const nextSettings = await persistSettings({
          ...settings,
          ...normalizeSettingsPatch(patch)
        });
        return finalizeSettingsUpdate(nextSettings);
      });
    }

    function resolveAuthorRecord(input = {}) {
      const status = input.status === 'banned' ? 'banned' : 'note';
      if (input?.author && typeof input.author === 'object') {
        return createAuthorRecord(input.author, input.note, status);
      }

      if (typeof input?.nickname === 'string' || typeof input?.label === 'string') {
        return createNicknameAuthorRecord(input.nickname ?? input.label, input.note, status);
      }

      return null;
    }

    function normalizeAuthorRecordKeys(recordKeys) {
      return [...new Set(
        (Array.isArray(recordKeys) ? recordKeys : [])
          .map((value) => String(value || ''))
          .filter(Boolean)
      )];
    }

    async function addAuthorRecord(input) {
      return enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings();
        const nextRecord = resolveAuthorRecord(input);
        if (!nextRecord) {
          return buildSettingsError('not-found', settings);
        }
        if (settings.authorRecords.some((record) => record.key === nextRecord.key)) {
          return buildSettingsError('duplicate', settings);
        }
        if (settings.authorRecords.length >= DOMAIN_CONSTANTS.MAX_AUTHOR_RECORDS) {
          return buildSettingsError('capacity', settings);
        }

        const nextSettings = await persistSettings({
          ...settings,
          authorRecords: [...settings.authorRecords, nextRecord]
        });
        return finalizeSettingsUpdate(nextSettings);
      });
    }

    async function updateAuthorRecordNote(recordKey, note) {
      return enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings();
        const normalizedRecordKey = String(recordKey || '');
        const matchingRecord = settings.authorRecords.find((record) => record.key === normalizedRecordKey);
        if (!matchingRecord) {
          return buildSettingsError('not-found', settings);
        }

        const normalizedNote = normalizeAuthorNote(note);
        const nextSettings = await persistSettings({
          ...settings,
          authorRecords: settings.authorRecords.map((record) => {
            if (record.key !== normalizedRecordKey) {
              return record;
            }

            if (!normalizedNote) {
              const { note: unusedNote, ...recordWithoutNote } = record;
              return recordWithoutNote;
            }

            return { ...record, note: normalizedNote };
          })
        });
        return finalizeSettingsUpdate(nextSettings);
      });
    }

    async function setAuthorRecordStatus(recordKeys, status) {
      return enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings();
        const requestedKeys = normalizeAuthorRecordKeys(recordKeys);
        if (status !== 'note' && status !== 'banned') {
          return buildSettingsError('invalid-status', settings);
        }
        if (
          requestedKeys.length === 0
          || requestedKeys.some((key) => !settings.authorRecords.some((record) => record.key === key))
        ) {
          return buildSettingsError('not-found', settings);
        }

        const nextSettings = await persistSettings({
          ...settings,
          authorRecords: settings.authorRecords.map((record) => (
            requestedKeys.includes(record.key)
              ? { ...record, status }
              : record
          ))
        });
        return finalizeSettingsUpdate(nextSettings);
      });
    }

    async function removeAuthorRecordKeys(recordKeys) {
      return enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings();
        const requestedKeys = normalizeAuthorRecordKeys(recordKeys);
        const nextRecords = settings.authorRecords.filter((record) => !requestedKeys.includes(record.key));
        if (nextRecords.length === settings.authorRecords.length) {
          return buildSettingsError('not-found', settings);
        }

        const nextSettings = await persistSettings({
          ...settings,
          authorRecords: nextRecords
        });
        return finalizeSettingsUpdate(nextSettings);
      });
    }

    function addAuthorBan(input = {}) {
      return addAuthorRecord({ ...input, status: 'banned' });
    }

    function updateAuthorBanNote(entryKey, note) {
      return updateAuthorRecordNote(entryKey, note);
    }

    function removeAuthorBanKeys(entryKeys) {
      return removeAuthorRecordKeys(entryKeys);
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

    async function disableSiteAlertsForMissingPermission(settings) {
      let nextSettings = normalizeSettings({
        ...settings,
        isSiteAlertEnabled: false
      });

      if (settings.isSiteAlertEnabled) {
        nextSettings = await persistSettings(nextSettings);
      } else {
        cachedSettings = nextSettings;
      }

      const surfaceState = await setLastSurfaceState({
        mode: 'limited',
        message: OPTIONAL_PERMISSION_REMOVED_MESSAGE
      });

      return { settings: nextSettings, surfaceState };
    }

    async function normalizeOptionalPermissionSettings(settings) {
      if (
        !settings.isSiteAlertEnabled
        || !chromeApi.permissions?.contains
        || !permissionsRuntime?.normalizeStoredSiteAlertSettings
      ) {
        return settings;
      }

      let permissionState = null;
      try {
        permissionState = await permissionsRuntime.normalizeStoredSiteAlertSettings(settings);
      } catch (error) {
        return settings;
      }

      if (!permissionState?.changed) {
        return settings;
      }

      return enqueueSettingsUpdate(async () => {
        const currentSettings = await ensureSettings({ forceRefresh: true });
        if (!currentSettings.isSiteAlertEnabled) {
          return currentSettings;
        }

        const result = await disableSiteAlertsForMissingPermission(currentSettings);
        return result.settings;
      });
    }

    async function handleOptionalPermissionsRemoved(permissions = {}) {
      const removedOrigins = Array.isArray(permissions.origins) ? permissions.origins : [];
      const optionalOrigins = permissionsRuntime?.origins || ['http://*/*', 'https://*/*'];
      const removedOverlayPermission = removedOrigins.some((origin) => optionalOrigins.includes(origin));

      if (!removedOverlayPermission) {
        return { success: true, changed: false };
      }

      const update = await enqueueSettingsUpdate(async () => {
        const settings = await ensureSettings({ forceRefresh: true });
        const result = await disableSiteAlertsForMissingPermission(settings);
        return { previousSettings: settings, ...result };
      });
      const { previousSettings, ...result } = update;
      await syncBadge(result.settings);

      return {
        success: true,
        changed: previousSettings.isSiteAlertEnabled,
        settings: result.settings,
        worker: buildWorkerStatus(result.settings, result.surfaceState)
      };
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

    function normalizeUnreadPostIds(postIds) {
      return [...new Set(
        (Array.isArray(postIds) ? postIds : [])
          .map((value) => Number(value))
          .filter(Number.isFinite)
      )].sort((left, right) => right - left);
    }

    async function setUnreadPostIds(postIds) {
      const normalizedIds = normalizeUnreadPostIds(postIds);

      await chromeApi.storage.local.set({ [UNREAD_POST_IDS_KEY]: normalizedIds });
      return normalizedIds;
    }

    function enqueueUnreadUpdate(update) {
      const currentUpdate = unreadUpdateTail.then(update);
      unreadUpdateTail = currentUpdate.catch(() => {});
      return currentUpdate;
    }

    function normalizePostOpenStates(storedStates) {
      if (!storedStates || typeof storedStates !== 'object' || Array.isArray(storedStates)) {
        return {};
      }

      return Object.entries(storedStates).reduce((states, [postId, isOpen]) => {
        const normalizedPostId = Number(postId);
        if (Number.isFinite(normalizedPostId) && typeof isOpen === 'boolean') {
          states[String(normalizedPostId)] = isOpen;
        }
        return states;
      }, {});
    }

    function buildPostOpenStates(posts, currentTime) {
      return (Array.isArray(posts) ? posts : []).reduce((states, post) => {
        const postId = Number(post?.id);
        if (Number.isFinite(postId)) {
          states[String(postId)] = isOpenRecruitment(post, currentTime);
        }
        return states;
      }, {});
    }

    function arePostOpenStatesEqual(leftStates, rightStates) {
      const leftEntries = Object.entries(leftStates);
      const rightEntries = Object.entries(rightStates);
      return leftEntries.length === rightEntries.length && leftEntries.every(([postId, isOpen]) => (
        rightStates[postId] === isOpen
      ));
    }

    function mergePostOpenStates(previousStates, observedStates) {
      return Object.fromEntries(
        Object.entries({ ...previousStates, ...observedStates })
          .sort(([leftPostId], [rightPostId]) => Number(rightPostId) - Number(leftPostId))
          .slice(0, DOMAIN_CONSTANTS.LIVE_POST_LIMIT * 3)
      );
    }

    function commitDetectedPostState(posts, currentTime) {
      return enqueueUnreadUpdate(async () => {
        const stored = await chromeApi.storage.local.get([
          LAST_SEEN_KEY,
          UNREAD_POST_IDS_KEY,
          POST_OPEN_STATES_KEY
        ]);
        const lastSeenPostId = Number(stored[LAST_SEEN_KEY]) || null;
        const previousOpenStates = normalizePostOpenStates(stored[POST_OPEN_STATES_KEY]);
        const observedOpenStates = buildPostOpenStates(posts, currentTime);
        const nextOpenStates = mergePostOpenStates(previousOpenStates, observedOpenStates);
        const latestPostId = Math.max(
          ...posts.map((post) => Number(post?.id)).filter(Number.isFinite)
        );

        if (!Number.isFinite(latestPostId)) {
          return {
            initialized: false,
            alertPosts: [],
            closedPostIds: [],
            lastSeenPostId
          };
        }

        if (lastSeenPostId === null) {
          await chromeApi.storage.local.set({
            [LAST_SEEN_KEY]: latestPostId,
            [POST_OPEN_STATES_KEY]: observedOpenStates
          });
          return {
            initialized: true,
            alertPosts: [],
            closedPostIds: [],
            lastSeenPostId: latestPostId
          };
        }

        const currentUnreadIds = normalizeUnreadPostIds(stored[UNREAD_POST_IDS_KEY]);
        const alertPosts = posts.filter((post) => {
          const postId = Number(post?.id);
          const stateKey = String(postId);
          const isOpen = observedOpenStates[stateKey] === true;
          return isOpen && (
            postId > lastSeenPostId || previousOpenStates[stateKey] === false
          );
        });
        const currentUnreadIdSet = new Set(currentUnreadIds);
        const closedPostIds = posts
          .filter((post) => {
            const stateKey = String(Number(post?.id));
            return observedOpenStates[stateKey] === false && (
              previousOpenStates[stateKey] === true || currentUnreadIdSet.has(Number(post?.id))
            );
          })
          .map((post) => Number(post.id));
        const closedPostIdSet = new Set(closedPostIds);
        const nextUnreadIds = normalizeUnreadPostIds([
          ...currentUnreadIds.filter((postId) => !closedPostIdSet.has(postId)),
          ...alertPosts.map((post) => post.id)
        ]);
        const nextLastSeenPostId = Math.max(lastSeenPostId, latestPostId);
        const storageUpdate = {};

        if (nextLastSeenPostId !== lastSeenPostId) {
          storageUpdate[LAST_SEEN_KEY] = nextLastSeenPostId;
        }
        if (!arePostOpenStatesEqual(previousOpenStates, nextOpenStates)) {
          storageUpdate[POST_OPEN_STATES_KEY] = nextOpenStates;
        }
        if (
          nextUnreadIds.length !== currentUnreadIds.length ||
          nextUnreadIds.some((postId, index) => postId !== currentUnreadIds[index])
        ) {
          storageUpdate[UNREAD_POST_IDS_KEY] = nextUnreadIds;
        }

        if (Object.keys(storageUpdate).length > 0) {
          await chromeApi.storage.local.set(storageUpdate);
        }

        return {
          initialized: false,
          alertPosts,
          closedPostIds,
          lastSeenPostId: nextLastSeenPostId
        };
      });
    }

    function addUnreadPostIds(postIds) {
      return enqueueUnreadUpdate(async () => {
        const currentIds = await getUnreadPostIds();
        return setUnreadPostIds([...currentIds, ...postIds]);
      });
    }

    function markPostRead(postId) {
      const normalizedPostId = Number(postId);

      return enqueueUnreadUpdate(async () => {
        const unreadIds = await getUnreadPostIds();
        if (!Number.isFinite(normalizedPostId)) {
          return { success: false, unreadIds };
        }

        const nextIds = unreadIds.filter((value) => value !== normalizedPostId);
        await setUnreadPostIds(nextIds);
        return { success: true, unreadIds: nextIds };
      });
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

    async function syncBadgeAfterUnreadCommit(operationLabel) {
      try {
        await syncBadge();
        return true;
      } catch (error) {
        logger.warn(`[SEAF] ${operationLabel} 완료 후 배지 동기화 실패:`, error);
        return false;
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
      if (!fetchRuntime?.fetchText) {
        throw new Error('fetch runtime is unavailable');
      }

      return fetchRuntime.fetchText(url, {
        timeoutMs: activeFetchTimeoutMs,
        timeoutErrorMessage: FETCH_TIMEOUT_ERROR
      });
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

    function enqueueRecentPostsUpdate(update) {
      const currentUpdate = recentPostsUpdateTail.then(update);
      recentPostsUpdateTail = currentUpdate.catch(() => {});
      return currentUpdate;
    }

    async function getRecentPostsOnce(settings = null) {
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

    function getRecentPosts(settings = null) {
      return enqueueRecentPostsUpdate(() => getRecentPostsOnce(settings));
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
          JSON.stringify(leftPost?.author || null) === JSON.stringify(rightPost?.author || null) &&
          String(leftPost?.fullDateStr || '') === String(rightPost?.fullDateStr || '') &&
          String(leftPost?.postUrl || '') === String(rightPost?.postUrl || '')
        );
      });
    }

    function storeRecentPosts(posts, settings = null) {
      if (!Array.isArray(posts) || posts.length === 0) {
        return Promise.resolve();
      }

      return enqueueRecentPostsUpdate(async () => {
        const resolvedSettings = settings || await ensureSettings();
        const existingPosts = await getRecentPostsOnce(resolvedSettings);
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
      });
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
      const authorSummary = getAuthorRecordMatchSummary(
        post?.author,
        settings?.authorRecords ?? settings?.authorBanEntries
      );

      return {
        postId: post.id,
        title: post.title,
        postUrl: post.postUrl,
        relativeTime: post.relativeTime,
        author: post.author || null,
        isBanned: authorSummary.isBanned,
        hasAuthorNote: authorSummary.hasNote,
        authorNote: authorSummary.note,
        isBannedAuthor: authorSummary.isBanned,
        authorBanNote: authorSummary.banNote,
        confirmBannedAuthorJoin: settings.confirmBannedAuthorJoin !== false,
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
        files: [
          'scripts/shared/seaf-join-guard.js',
          'scripts/shared/seaf-overlay.js'
        ]
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
        persistState = true,
        payload: providedPayload = null
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

      const payload = providedPayload || getOverlayPayload(post, settings);

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

    function reconcileUnreadPosts(recentPosts, settings = null) {
      return enqueueUnreadUpdate(async () => {
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
      });
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

    async function performDetectionOnce(settings = null) {
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

      const detectionCommit = await commitDetectedPostState(posts, detectionTime);
      await syncBadge(resolvedSettings);

      if (detectionCommit.initialized) {
        logger.log(`[SEAF] 초기 lastSeenPostId 설정: ${latestPostId}`);
        return;
      }

      const alertPosts = detectionCommit.alertPosts;
      if (alertPosts.length === 0) {
        return;
      }

      if (!resolvedSettings.isSiteAlertEnabled) {
        await setLastSurfaceState({
          mode: 'limited',
          message: '브라우저 알림이 꺼져 있어 읽지 않은 모집은 팝업에만 유지합니다.'
        });
        return;
      }

      const activeTab = await getActiveTab();
      const orderedPosts = [...alertPosts].sort((left, right) => left.id - right.id);
      let surfaceResult = null;

      for (const post of orderedPosts) {
        const payload = getOverlayPayload(post, resolvedSettings);
        if (payload.isBannedAuthor && resolvedSettings.authorBanOverlayMode === 'hide') {
          continue;
        }

        surfaceResult = await surfacePostInActiveTab(post, resolvedSettings, {
          activeTab,
          persistState: false,
          payload
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

    function performDetection(settings = null) {
      if (detectionPromise) {
        return detectionPromise;
      }

      const currentDetection = performDetectionOnce(settings);
      detectionPromise = currentDetection;

      const releaseDetection = () => {
        if (detectionPromise === currentDetection) {
          detectionPromise = null;
        }
      };

      currentDetection.then(releaseDetection, releaseDetection);
      return currentDetection;
    }

    async function extractLobbyLink(postId) {
      const html = await fetchText(buildPostUrl(postId));
      return extractLobbyLinkFromHtml(html);
    }

    function buildPostUrl(postId) {
      return `${DOMAIN_CONSTANTS.VIEW_URL_PREFIX}${postId}`;
    }

    async function openPostPage(postId) {
      return chromeApi.tabs.create({ url: buildPostUrl(postId) });
    }

    async function joinPost(postId, sender) {
      const normalizedPostId = Number(postId);
      const link = await extractLobbyLink(normalizedPostId);
      if (!link) {
        return { success: false, error: LOBBY_LINK_NOT_FOUND_ERROR };
      }

      await markPostRead(normalizedPostId);
      await syncBadgeAfterUnreadCommit('참가 처리');

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
      await syncBadgeAfterUnreadCommit('게시글 열기');
      await openPostPage(postId);
      return { success: true, postId: Number(postId) };
    }

    async function markAllRead() {
      await enqueueUnreadUpdate(() => setUnreadPostIds([]));
      await syncBadgeAfterUnreadCommit('모두 읽음 처리');
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
      let settings = await ensureSettings({ forceRefresh: true });
      settings = await normalizeOptionalPermissionSettings(settings);
      await setupAlarm(settings);
      await syncBadge(settings);
      await performDetection(settings);
    }

    async function handleSettingsUpdated() {
      const settings = await ensureSettings({ forceRefresh: true });
      await setupAlarm(settings);
      await syncBadge(settings);
      let surfaceState = await getLastSurfaceState();
      if (
        settings.isSiteAlertEnabled &&
        surfaceState?.message === OPTIONAL_PERMISSION_REMOVED_MESSAGE
      ) {
        surfaceState = await setLastSurfaceState({
          mode: 'normal',
          message: '브라우저 알림 권한이 활성화되었습니다.'
        });
      }

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
      POST_OPEN_STATES_KEY,
      LAST_SCAN_AT_KEY,
      LAST_SURFACE_STATE_KEY,
      UNSUPPORTED_TEST_TAB_ERROR,
      LIST_PAGE_NOT_READY_ERROR,
      LOBBY_LINK_NOT_FOUND_ERROR,
      clampToastDuration,
      clampRecentHistoryLimit,
      clampRecentHistoryRetentionMinutes,
      clampUnreadActiveWindowMinutes,
      normalizeSettings,
      ensureSettings,
      getSettings,
      updateSettingsPatch,
      addAuthorRecord,
      updateAuthorRecordNote,
      setAuthorRecordStatus,
      removeAuthorRecordKeys,
      addAuthorBan,
      updateAuthorBanNote,
      removeAuthorBanKeys,
      handleStorageChanged,
      normalizeOptionalPermissionSettings,
      handleOptionalPermissionsRemoved,
      setupAlarm,
      getUnreadPostIds,
      setUnreadPostIds,
      addUnreadPostIds,
      markPostRead,
      syncBadge,
      buildWorkerStatus,
      fetchText,
      fetchLivePosts,
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
      openPostPage,
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
