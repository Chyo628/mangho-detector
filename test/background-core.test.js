const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const fetchModule = require('../scripts/shared/seaf-fetch.js');
const permissionsModule = require('../scripts/shared/seaf-permissions.js');
const { createBackgroundCore } = require('../scripts/shared/seaf-background-core.js');
const { createFakeChrome } = require('./helpers/fake-chrome');
const { buildListHtml } = require('./helpers/build-list-html');

const NOW = Date.parse('2026-03-09T01:05:00Z');

function createFetchOk(html) {
  return async () => ({
    ok: true,
    async text() {
      return html;
    }
  });
}

function createFetchSequence(responses) {
  let index = 0;
  return async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response instanceof Error) {
      throw response;
    }

    return {
      ok: true,
      async text() {
        return response;
      }
    };
  };
}

function createFetchFail(message) {
  return async () => {
    throw new Error(message);
  };
}

function createCore(options = {}) {
  const fake = createFakeChrome(options.chromeOptions);
  const fetchRuntime = fetchModule.createFetchRuntime({
    fetchImpl: options.fetchImpl || createFetchOk(buildListHtml([])),
    AbortControllerImpl: AbortController,
    defaultTimeoutMs: options.fetchTimeoutMs
  });
  const permissionsRuntime = permissionsModule.createPermissionsRuntime({
    permissionsApi: fake.chromeApi.permissions
  });
  const core = createBackgroundCore({
    chromeApi: fake.chromeApi,
    logger: options.logger || { log() {}, warn() {}, error() {} },
    domain,
    fetchRuntime,
    permissionsRuntime,
    now: () => NOW,
    fetchTimeoutMs: options.fetchTimeoutMs
  });

  return { core, fake };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function createCoreWithDelayedUnreadAdd() {
  const fake = createFakeChrome({
    storageData: {
      seaf_unread_post_ids: [10]
    }
  });
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  const addWriteStarted = createDeferred();
  const releaseAddWrite = createDeferred();
  let delayedAddWrite = false;

  fake.chromeApi.storage.local.set = async (values) => {
    const unreadIds = values.seaf_unread_post_ids;
    if (!delayedAddWrite && Array.isArray(unreadIds) && unreadIds.includes(20)) {
      delayedAddWrite = true;
      addWriteStarted.resolve();
      await releaseAddWrite.promise;
    }

    return originalSet(values);
  };

  const core = createBackgroundCore({
    chromeApi: fake.chromeApi,
    logger: { log() {}, warn() {}, error() {} },
    domain,
    fetchRuntime: fetchModule.createFetchRuntime({
      fetchImpl: createFetchOk(buildListHtml([])),
      AbortControllerImpl: AbortController
    }),
    permissionsRuntime: permissionsModule.createPermissionsRuntime({
      permissionsApi: fake.chromeApi.permissions
    }),
    now: () => NOW
  });

  return { core, fake, addWriteStarted, releaseAddWrite };
}

test('normalizeSettings applies fixed polling, clamps toast duration, and upgrades legacy values', () => {
  const { core } = createCore();
  const normalized = core.normalizeSettings({
    isDetectionActive: false,
    pollingInterval: 5,
    toastDuration: 6,
    recentHistoryLimit: 99,
    recentHistoryRetentionMinutes: 1,
    unreadActiveWindowMinutes: 999
  });

  assert.equal(normalized.isDetectionActive, false);
  assert.equal(normalized.isSiteAlertEnabled, true);
  assert.equal(normalized.confirmBannedAuthorJoin, true);
  assert.deepEqual(normalized.authorRecords, []);
  assert.equal(Object.hasOwn(normalized, 'authorBanEntries'), false);
  assert.equal(normalized.authorBanOverlayMode, 'warn');
  assert.equal(normalized.pollingInterval, 30);
  assert.equal(normalized.toastDuration, 10);
  assert.equal(normalized.recentHistoryLimit, 30);
  assert.equal(normalized.recentHistoryRetentionMinutes, 5);
  assert.equal(normalized.unreadActiveWindowMinutes, 180);
  assert.equal(core.normalizeSettings({ toastDuration: 99 }).toastDuration, 30);
  assert.equal(core.normalizeSettings({ toastDuration: 1 }).toastDuration, 3);
  assert.equal(core.normalizeSettings({}).recentHistoryLimit, 15);
  assert.equal(core.normalizeSettings({}).recentHistoryRetentionMinutes, 30);
  assert.equal(core.normalizeSettings({}).unreadActiveWindowMinutes, 15);
  assert.equal(core.normalizeSettings({ confirmBannedAuthorJoin: false }).confirmBannedAuthorJoin, false);
  assert.equal(core.normalizeSettings({ unreadActiveWindowMinutes: 0 }).unreadActiveWindowMinutes, 1);
  assert.deepEqual(
    core.normalizeSettings({
      authorBanEntries: [
        { type: 'uid', value: 'fixed123', label: 'fixed-nick' },
        { type: 'uid', value: 'fixed123', label: 'duplicate' },
        { type: 'anonymous', value: 'broken-entry' }
      ],
      authorBanOverlayMode: 'hide'
    }).authorRecords,
    [{
      key: 'uid:fixed123',
      type: 'uid',
      value: 'fixed123',
      label: 'fixed-nick',
      status: 'banned'
    }]
  );
  assert.equal(
    core.normalizeSettings({ authorBanOverlayMode: 'hide' }).authorBanOverlayMode,
    'hide'
  );
});

test('normalizeSettings merges unique legacy bans after canonical author records without re-banning duplicates', () => {
  const { core } = createCore();
  const alphaLegacyBan = domain.createNicknameAuthorBanEntry('Alpha', 'old warning');
  const alphaCanonicalNote = domain.createNicknameAuthorRecord('Alpha', 'trusted', 'note');
  const betaLegacyBan = domain.createNicknameAuthorBanEntry('Beta', 'warning');

  assert.deepEqual(core.normalizeSettings({
    authorRecords: [],
    authorBanEntries: [alphaLegacyBan]
  }).authorRecords, [alphaLegacyBan]);

  assert.deepEqual(core.normalizeSettings({
    authorRecords: [alphaCanonicalNote],
    authorBanEntries: [alphaLegacyBan]
  }).authorRecords, [alphaCanonicalNote]);

  const merged = core.normalizeSettings({
    authorRecords: [alphaCanonicalNote],
    authorBanEntries: [alphaLegacyBan, betaLegacyBan]
  });
  assert.deepEqual(merged.authorRecords, [alphaCanonicalNote, betaLegacyBan]);
  assert.equal(Object.hasOwn(merged, 'authorBanEntries'), false);
});

test('mixed migration above capacity preserves every unique legacy record while blocking new additions', async () => {
  const canonicalRecords = Array.from(
    { length: domain.constants.MAX_AUTHOR_RECORDS },
    (_, index) => domain.createNicknameAuthorRecord(`Canonical ${index}`, `note ${index}`, 'note')
  );
  const duplicateLegacyBan = domain.createNicknameAuthorBanEntry('Canonical 0', 'stale warning');
  const uniqueLegacyBan = domain.createNicknameAuthorBanEntry('Legacy overflow', 'preserve me');
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          authorRecords: canonicalRecords,
          authorBanEntries: [duplicateLegacyBan, uniqueLegacyBan]
        }
      }
    }
  });

  const settings = await core.ensureSettings();

  assert.equal(settings.authorRecords.length, domain.constants.MAX_AUTHOR_RECORDS + 1);
  assert.deepEqual(settings.authorRecords[0], canonicalRecords[0]);
  assert.deepEqual(settings.authorRecords.at(-1), uniqueLegacyBan);
  assert.equal(Object.hasOwn(settings, 'authorBanEntries'), false);
  assert.equal(fake.state.storageData.seaf_settings.authorRecords.length, domain.constants.MAX_AUTHOR_RECORDS + 1);
  assert.equal(Object.hasOwn(fake.state.storageData.seaf_settings, 'authorBanEntries'), false);

  const capacity = await core.addAuthorRecord({ nickname: 'Still blocked', status: 'note' });
  assert.equal(capacity.success, false);
  assert.equal(capacity.errorCode, 'capacity');
  assert.equal(capacity.settings.authorRecords.length, domain.constants.MAX_AUTHOR_RECORDS + 1);
});

test('settings writer patch keeps a canonical allowlist and returns normalized settings', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          toastDuration: 10,
          confirmBannedAuthorJoin: true
        }
      }
    }
  });

  const response = await core.updateSettingsPatch({
    toastDuration: 99,
    confirmBannedAuthorJoin: false,
    authorRecords: [{ type: 'uid', value: 'ignored', status: 'banned' }]
  });

  assert.equal(response.success, true);
  assert.equal(response.settings.toastDuration, 30);
  assert.equal(response.settings.confirmBannedAuthorJoin, false);
  assert.deepEqual(response.settings.authorRecords, []);
  assert.equal(fake.state.storageData.seaf_settings.confirmBannedAuthorJoin, false);
});

test('author record helpers report duplicate and not-found errors with canonical settings', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          authorBanEntries: [{ type: 'uid', value: 'fixed123', label: 'alpha' }]
        }
      }
    }
  });

  const duplicate = await core.addAuthorRecord({
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    status: 'note'
  });
  const notFound = await core.updateAuthorRecordNote('uid:missing', 'note');

  assert.equal(duplicate.success, false);
  assert.equal(duplicate.errorCode, 'duplicate');
  assert.equal(Array.isArray(duplicate.settings.authorRecords), true);
  assert.equal(Object.hasOwn(duplicate.settings, 'authorBanEntries'), false);
  assert.equal(Object.hasOwn(fake.state.storageData.seaf_settings, 'authorBanEntries'), false);
  assert.equal(fake.state.storageData.seaf_settings.authorRecords[0].status, 'banned');
  assert.equal(notFound.success, false);
  assert.equal(notFound.errorCode, 'not-found');
});

test('author record helpers add, update, atomically swap status, remove, and enforce capacity', async () => {
  const fullRecords = Array.from({ length: domain.constants.MAX_AUTHOR_RECORDS }, (_, index) => ({
    type: 'nickname',
    value: `nick-${index}`,
    label: `nick-${index}`,
    status: 'note'
  }));
  const { core, fake } = createCore();

  const added = await core.addAuthorRecord({
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    note: 'watch list',
    status: 'note'
  });
  assert.equal(added.success, true);
  assert.equal(added.settings.authorRecords[0].key, 'uid:fixed123');
  assert.equal(added.settings.authorRecords[0].note, 'watch list');
  assert.equal(added.settings.authorRecords[0].status, 'note');

  const updated = await core.updateAuthorRecordNote('uid:fixed123', 'updated note');
  assert.equal(updated.success, true);
  assert.equal(updated.settings.authorRecords[0].note, 'updated note');

  const swapped = await core.setAuthorRecordStatus(['uid:fixed123'], 'banned');
  assert.equal(swapped.success, true);
  assert.deepEqual(swapped.settings.authorRecords[0], {
    key: 'uid:fixed123',
    type: 'uid',
    value: 'fixed123',
    label: 'alpha',
    status: 'banned',
    note: 'updated note'
  });

  const second = await core.addAuthorRecord({ nickname: 'second', note: 'keep', status: 'note' });
  const failedAtomicSwap = await core.setAuthorRecordStatus(
    ['uid:fixed123', 'nickname:missing'],
    'note'
  );
  assert.equal(second.success, true);
  assert.equal(failedAtomicSwap.success, false);
  assert.equal(failedAtomicSwap.errorCode, 'not-found');
  assert.equal(failedAtomicSwap.settings.authorRecords[0].status, 'banned');

  const removed = await core.removeAuthorRecordKeys(['uid:fixed123', 'nickname:second']);
  assert.equal(removed.success, true);
  assert.deepEqual(removed.settings.authorRecords, []);

  const legacyAdded = await core.addAuthorBan({ nickname: 'legacy wrapper' });
  assert.equal(legacyAdded.settings.authorRecords[0].status, 'banned');
  await core.removeAuthorBanKeys(['nickname:legacy wrapper']);

  await fake.chromeApi.storage.local.set({
    seaf_settings: {
      ...fake.state.storageData.seaf_settings,
      authorRecords: fullRecords
    }
  });
  await core.handleSettingsUpdated();
  const capacity = await core.addAuthorRecord({
    nickname: 'overflow',
    status: 'note'
  });
  assert.equal(capacity.success, false);
  assert.equal(capacity.errorCode, 'capacity');
});

test('author record mutations stay serialized so concurrent note and status changes are both preserved', async () => {
  const record = domain.createNicknameAuthorRecord('Alpha', 'old note', 'note');
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: { authorRecords: [record] }
      }
    }
  });
  await core.ensureSettings();

  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  const noteWriteStarted = createDeferred();
  const releaseNoteWrite = createDeferred();
  let delayedNoteWrite = false;
  fake.chromeApi.storage.local.set = async (values) => {
    const storedRecord = values.seaf_settings?.authorRecords?.[0];
    if (!delayedNoteWrite && storedRecord?.note === 'new note') {
      delayedNoteWrite = true;
      noteWriteStarted.resolve();
      await releaseNoteWrite.promise;
    }
    return originalSet(values);
  };

  const noteUpdate = core.updateAuthorRecordNote(record.key, 'new note');
  await noteWriteStarted.promise;
  const statusUpdate = core.setAuthorRecordStatus([record.key], 'banned');
  releaseNoteWrite.resolve();
  await Promise.all([noteUpdate, statusUpdate]);

  assert.deepEqual(fake.state.storageData.seaf_settings.authorRecords, [{
    ...record,
    note: 'new note',
    status: 'banned'
  }]);
});

test('handleOptionalPermissionsRemoved disables browser alerts and synchronizes badge and surface state', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true
        },
        seaf_recent_posts: [{
          id: 21,
          title: 'permission removal recruitment',
          subject: '\uD5EC\uB9DD\uD638',
          fullDateStr: '2026-03-09 10:04:00',
          postUrl: `${domain.constants.VIEW_URL_PREFIX}21`,
          detectedAt: NOW
        }],
        seaf_unread_post_ids: [21]
      }
    }
  });

  const response = await core.handleOptionalPermissionsRemoved({
    origins: ['https://*/*']
  });

  assert.equal(response.success, true);
  assert.equal(response.changed, true);
  assert.equal(fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'limited');
  assert.match(fake.state.storageData.seaf_last_surface_state.message, /\uAD8C\uD55C/);
});

test('permission removal queues behind an in-flight settings patch without losing either change', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true,
          toastDuration: 10
        }
      }
    }
  });
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  const patchWriteStarted = createDeferred();
  const releasePatchWrite = createDeferred();
  let delayedPatch = false;

  fake.chromeApi.storage.local.set = async (values) => {
    if (
      !delayedPatch
      && values.seaf_settings?.toastDuration === 17
      && values.seaf_settings?.isSiteAlertEnabled === true
    ) {
      delayedPatch = true;
      patchWriteStarted.resolve();
      await releasePatchWrite.promise;
    }
    return originalSet(values);
  };

  const patchPromise = core.updateSettingsPatch({ toastDuration: 17 });
  await patchWriteStarted.promise;
  const permissionRemovalPromise = core.handleOptionalPermissionsRemoved({
    origins: ['https://*/*']
  });
  releasePatchWrite.resolve();

  await Promise.all([patchPromise, permissionRemovalPromise]);

  assert.equal(fake.state.storageData.seaf_settings.toastDuration, 17);
  assert.equal(fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
});

test('handleSettingsUpdated clears the stale limited state after optional permission is granted again', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true
        }
      }
    }
  });

  await core.handleOptionalPermissionsRemoved({ origins: ['https://*/*'] });
  fake.state.grantedOrigins.add('http://*/*');
  fake.state.grantedOrigins.add('https://*/*');
  await fake.chromeApi.storage.local.set({
    seaf_settings: {
      ...fake.state.storageData.seaf_settings,
      isSiteAlertEnabled: true
    }
  });

  const response = await core.handleSettingsUpdated();

  assert.equal(response.worker.mode, 'normal');
  assert.equal(typeof response.worker.message, 'string');
  assert.notEqual(response.worker.message, '');
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'normal');
});

test('initializeExtension disables a stale browser alert setting when optional origins are unavailable', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true
        }
      }
    }
  });

  await core.initializeExtension();

  assert.deepEqual(fake.state.permissionContainsChecks, [{
    origins: ['http://*/*', 'https://*/*']
  }]);
  assert.equal(fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'limited');
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
});

test('initializeExtension preserves browser alerts when both optional origins remain granted', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      grantedOrigins: ['http://*/*', 'https://*/*'],
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true
        }
      }
    }
  });

  await core.initializeExtension();

  assert.equal(fake.state.storageData.seaf_settings.isSiteAlertEnabled, true);
  assert.equal(fake.state.storageData.seaf_last_surface_state, undefined);
});

test('initializeExtension preserves browser alerts when the permission check is temporarily unavailable', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true
        }
      },
      permissionsContains() {
        throw new Error('permission API unavailable');
      }
    }
  });

  await core.initializeExtension();

  assert.equal(fake.state.storageData.seaf_settings.isSiteAlertEnabled, true);
  assert.equal(fake.state.storageData.seaf_last_surface_state, undefined);
});

test('setupAlarm always creates a fixed 30 second interval', async () => {
  const { core, fake } = createCore();

  await core.setupAlarm(core.normalizeSettings({}));

  assert.deepEqual(fake.state.alarmsCreated, [
    {
      name: 'SEAF_DETECTION',
      info: { periodInMinutes: 0.5 }
    }
  ]);
});

test('areStoredPostsEquivalent ignores detectedAt-only changes', () => {
  const { core } = createCore();
  const left = [{ id: 1, title: 'a', subject: 'mangho', fullDateStr: '', postUrl: 'u', detectedAt: 1 }];
  const right = [{ id: 1, title: 'a', subject: 'mangho', fullDateStr: '', postUrl: 'u', detectedAt: 2 }];

  assert.equal(core.areStoredPostsEquivalent(left, right), true);
});

test('areStoredPostsEquivalent treats author changes as meaningful storage changes', () => {
  const { core } = createCore();
  const left = [{
    id: 1,
    title: 'a',
    subject: 'mangho',
    author: { nickname: '\uACE0\uB2C9', uid: 'fixed123', ip: '', displayName: '\uACE0\uB2C9', key: 'uid:fixed123' },
    fullDateStr: '',
    postUrl: 'u',
    detectedAt: 1
  }];
  const right = [{
    id: 1,
    title: 'a',
    subject: 'mangho',
    author: null,
    fullDateStr: '',
    postUrl: 'u',
    detectedAt: 2
  }];

  assert.equal(core.areStoredPostsEquivalent(left, right), false);
});

test('getPopupPosts returns unread and history data from fetched posts plus stored unread ids', async () => {
  const html = buildListHtml([
    { id: 11, title: '嶺뚣끉裕??嶺뚮ㅄ維곩퐲?1', fullDateStr: '2026-03-09 10:04:00' },
    { id: 10, title: '嶺뚣끉裕??嶺뚮ㅄ維곩퐲?2', fullDateStr: '2026-03-09 10:03:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [10]
      }
    }
  });

  const response = await core.getPopupPosts();

  assert.equal(response.success, true);
  assert.equal(response.source, 'fetch');
  assert.equal(response.unreadCount, 1);
  assert.equal(response.unreadPosts.length, 1);
  assert.equal(response.unreadPosts[0].id, 10);
  assert.equal(response.historyPosts.length, 2);
  assert.ok(Array.isArray(fake.state.storageData.seaf_recent_posts));
  assert.equal(fake.state.storageData.seaf_last_scan_at, undefined);
});

test('getPopupPosts records lastScanAt only for manual refresh requests', async () => {
  const html = buildListHtml([
    { id: 12, title: 'manual refresh', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html)
  });

  await core.getPopupPosts({ recordScan: true });

  assert.equal(fake.state.storageData.seaf_last_scan_at, NOW);
});

test('getPopupPosts falls back to cache when fetch fails', async () => {
  const cachedPosts = domain.parsePostsFromHtml(
    buildListHtml([{ id: 21, title: 'cached recruitment', fullDateStr: '2026-03-09 10:04:00' }]),
    {
      currentTime: NOW,
      limit: domain.constants.LIVE_POST_LIMIT,
      viewUrlPrefix: domain.constants.VIEW_URL_PREFIX
    }
  );
  const { core } = createCore({
    fetchImpl: createFetchFail('network down'),
    chromeOptions: {
      storageData: {
        seaf_recent_posts: cachedPosts,
        seaf_unread_post_ids: [21]
      }
    }
  });

  const response = await core.getPopupPosts();

  assert.equal(response.success, true);
  assert.equal(response.source, 'cache');
  assert.equal(response.unreadPosts[0].id, 21);
});

test('getPopupPosts decodes numeric entities in cached titles', async () => {
  const { core } = createCore({
    fetchImpl: createFetchFail('network down'),
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [{
          id: 22,
          title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
          subject: '\uD5EC\uB9DD\uD638',
          fullDateStr: '2026-03-09 10:04:00',
          relativeTime: '\uBC29\uAE08',
          postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=22',
          detectedAt: NOW
        }],
        seaf_unread_post_ids: [22]
      }
    }
  });

  const response = await core.getPopupPosts();

  assert.equal(response.success, true);
  assert.equal(response.source, 'cache');
  assert.equal(response.unreadPosts[0].title, '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f');
});

test('getRecentPosts trims stored history by count and age and persists the trimmed cache', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [
          {
            id: 31,
            title: 'recent 1',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/31',
            detectedAt: NOW - (5 * 60 * 1000)
          },
          {
            id: 30,
            title: 'recent 2',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/30',
            detectedAt: NOW - (10 * 60 * 1000)
          },
          {
            id: 29,
            title: 'expired',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/29',
            detectedAt: NOW - (45 * 60 * 1000)
          }
        ]
      }
    }
  });

  const recentPosts = await core.getRecentPosts(core.normalizeSettings({
    recentHistoryLimit: 2,
    recentHistoryRetentionMinutes: 30
  }));

  assert.deepEqual(recentPosts.map((post) => post.id), [31, 30]);
  assert.deepEqual(fake.state.storageData.seaf_recent_posts.map((post) => post.id), [31, 30]);
});

test('storeRecentPosts preserves the original detectedAt when the same post is fetched again', async () => {
  const initialDetectedAt = NOW - (2 * 60 * 1000);
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [
          {
            id: 41,
            title: 'existing unread',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/41',
            detectedAt: initialDetectedAt
          }
        ]
      }
    }
  });

  await core.storeRecentPosts([
    {
      id: 41,
      title: 'existing unread',
      subject: '\uD5EC\uB9DD\uD638',
      fullDateStr: '',
      postUrl: 'https://example.com/41',
      detectedAt: NOW
    }
  ], core.normalizeSettings({}));

  assert.equal(fake.state.storageData.seaf_recent_posts[0].detectedAt, initialDetectedAt);
});

test('storeRecentPosts serializes concurrent merges without losing either update', async () => {
  const makePost = (id) => ({
    id,
    title: `post ${id}`,
    subject: '\uD5EC\uB9DD\uD638',
    fullDateStr: '2026-03-09 10:04:00',
    postUrl: `${domain.constants.VIEW_URL_PREFIX}${id}`,
    detectedAt: NOW
  });
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [makePost(10)]
      }
    }
  });
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  const firstWriteStarted = createDeferred();
  const releaseFirstWrite = createDeferred();
  let delayedFirstWrite = false;

  fake.chromeApi.storage.local.set = async (values) => {
    const recentPosts = values.seaf_recent_posts;
    if (
      !delayedFirstWrite &&
      Array.isArray(recentPosts) &&
      recentPosts.some((post) => Number(post.id) === 20)
    ) {
      delayedFirstWrite = true;
      firstWriteStarted.resolve();
      await releaseFirstWrite.promise;
    }

    return originalSet(values);
  };

  const firstStore = core.storeRecentPosts([makePost(20)]);
  await firstWriteStarted.promise;
  const secondStore = core.storeRecentPosts([makePost(30)]);

  await Promise.resolve();
  await Promise.resolve();
  releaseFirstWrite.resolve();
  await Promise.all([firstStore, secondStore]);

  assert.deepEqual(
    fake.state.storageData.seaf_recent_posts.map((post) => post.id),
    [30, 20, 10]
  );
});

test('unread updates serialize a concurrent add and mark without losing either change', async () => {
  const { core, fake, addWriteStarted, releaseAddWrite } = createCoreWithDelayedUnreadAdd();

  const addPromise = core.addUnreadPostIds([20]);
  await addWriteStarted.promise;
  const markPromise = core.markPostRead(10);

  await Promise.resolve();
  await Promise.resolve();
  releaseAddWrite.resolve();
  await Promise.all([addPromise, markPromise]);

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [20]);
});

test('unread update queue releases after a failed write so the next update can run', async () => {
  const fake = createFakeChrome({
    storageData: {
      seaf_unread_post_ids: [10]
    }
  });
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  let shouldFailUnreadWrite = true;

  fake.chromeApi.storage.local.set = async (values) => {
    if (shouldFailUnreadWrite && Array.isArray(values.seaf_unread_post_ids)) {
      shouldFailUnreadWrite = false;
      throw new Error('temporary unread write failure');
    }

    return originalSet(values);
  };

  const core = createBackgroundCore({
    chromeApi: fake.chromeApi,
    logger: { log() {}, warn() {}, error() {} },
    domain,
    fetchRuntime: fetchModule.createFetchRuntime({
      fetchImpl: createFetchOk(buildListHtml([])),
      AbortControllerImpl: AbortController
    }),
    permissionsRuntime: permissionsModule.createPermissionsRuntime({
      permissionsApi: fake.chromeApi.permissions
    }),
    now: () => NOW
  });

  await assert.rejects(
    core.addUnreadPostIds([20]),
    /temporary unread write failure/
  );
  const markResult = await core.markPostRead(10);

  assert.deepEqual(markResult, { success: true, unreadIds: [] });
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
});

test('setUnreadPostIds keeps its direct normalized setter contract', async () => {
  const { core, fake } = createCore();

  const unreadIds = await core.setUnreadPostIds([2, '3', 2, 'invalid', 1]);

  assert.deepEqual(unreadIds, [3, 2, 1]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [3, 2, 1]);
});

test('reconcileUnreadPosts queues pruning behind an in-flight unread add', async () => {
  const { core, fake, addWriteStarted, releaseAddWrite } = createCoreWithDelayedUnreadAdd();
  const retainedPosts = domain.parsePostsFromHtml(
    buildListHtml([{ id: 20, title: 'retained unread', fullDateStr: '2026-03-09 10:04:00' }]),
    {
      currentTime: NOW,
      limit: domain.constants.LIVE_POST_LIMIT,
      viewUrlPrefix: domain.constants.VIEW_URL_PREFIX
    }
  );

  const addPromise = core.addUnreadPostIds([20]);
  await addWriteStarted.promise;
  const reconcilePromise = core.reconcileUnreadPosts(retainedPosts, core.normalizeSettings({}));

  await Promise.resolve();
  await Promise.resolve();
  releaseAddWrite.resolve();
  const [, reconciled] = await Promise.all([addPromise, reconcilePromise]);

  assert.deepEqual(reconciled.unreadIds, [20]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [20]);
});

test('markAllRead queues its clear behind an in-flight unread add', async () => {
  const { core, fake, addWriteStarted, releaseAddWrite } = createCoreWithDelayedUnreadAdd();

  const addPromise = core.addUnreadPostIds([20]);
  await addWriteStarted.promise;
  const markAllPromise = core.markAllRead();

  await Promise.resolve();
  await Promise.resolve();
  releaseAddWrite.resolve();
  await Promise.all([addPromise, markAllPromise]);

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
});

test('syncBadge reconciles stale unread ids against recent cached posts', async () => {
  const recentPosts = domain.parsePostsFromHtml(
    buildListHtml([{ id: 61, title: 'visible unread', fullDateStr: '2026-03-09 10:04:00' }]),
    {
      currentTime: NOW,
      limit: domain.constants.LIVE_POST_LIMIT,
      viewUrlPrefix: domain.constants.VIEW_URL_PREFIX
    }
  );
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_recent_posts: recentPosts,
        seaf_unread_post_ids: [61, 999999]
      }
    }
  });

  await core.syncBadge(core.normalizeSettings({}));

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [61]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '1');
});

test('syncBadge prunes unread ids that exceed unreadActiveWindowMinutes while history remains retained', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          recentHistoryLimit: 15,
          recentHistoryRetentionMinutes: 30,
          unreadActiveWindowMinutes: 15
        },
        seaf_recent_posts: [
          {
            id: 91,
            title: 'still unread',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/91',
            detectedAt: NOW - (10 * 60 * 1000)
          },
          {
            id: 90,
            title: 'history only',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/90',
            detectedAt: NOW - (20 * 60 * 1000)
          }
        ],
        seaf_unread_post_ids: [91, 90]
      }
    }
  });

  await core.syncBadge(core.normalizeSettings({
    recentHistoryLimit: 15,
    recentHistoryRetentionMinutes: 30,
    unreadActiveWindowMinutes: 15
  }));

  assert.deepEqual(fake.state.storageData.seaf_recent_posts.map((post) => post.id), [91, 90]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [91]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '1');
});

test('syncBadge lets recent-history retention win when it is shorter than unreadActiveWindowMinutes', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          recentHistoryLimit: 15,
          recentHistoryRetentionMinutes: 10,
          unreadActiveWindowMinutes: 15
        },
        seaf_recent_posts: [
          {
            id: 95,
            title: 'expired from history first',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/95',
            detectedAt: NOW - (12 * 60 * 1000)
          }
        ],
        seaf_unread_post_ids: [95]
      }
    }
  });

  await core.syncBadge(core.normalizeSettings({
    recentHistoryLimit: 15,
    recentHistoryRetentionMinutes: 10,
    unreadActiveWindowMinutes: 15
  }));

  assert.deepEqual(fake.state.storageData.seaf_recent_posts, []);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
});

test('syncBadge prunes unread ids that fall outside retained recent history', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_settings: {
          recentHistoryLimit: 15,
          recentHistoryRetentionMinutes: 30
        },
        seaf_recent_posts: [
          {
            id: 71,
            title: 'still visible',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/71',
            detectedAt: NOW - (10 * 60 * 1000)
          },
          {
            id: 70,
            title: 'expired unread',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/70',
            detectedAt: NOW - (40 * 60 * 1000)
          }
        ],
        seaf_unread_post_ids: [71, 70]
      }
    }
  });

  await core.syncBadge(core.normalizeSettings({
    recentHistoryLimit: 15,
    recentHistoryRetentionMinutes: 30
  }));

  assert.deepEqual(fake.state.storageData.seaf_recent_posts.map((post) => post.id), [71]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [71]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '1');
});

test('performDetection initializes lastSeen on first run without creating unread items', async () => {
  const html = buildListHtml([
    { id: 31, title: 'first recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html)
  });

  await core.performDetection();

  assert.equal(fake.state.storageData.seaf_last_seen_post_id, 31);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, undefined);
  assert.equal(fake.state.executedScripts.length, 0);
  assert.equal(fake.state.badgeTexts.at(-1)?.text || '', '');
});

test('performDetection commits unread before advancing lastSeen so a failed write can retry safely', async () => {
  const html = buildListHtml([
    { id: 41, title: 'durable cursor recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 40,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  let shouldFailUnreadCommit = true;

  fake.chromeApi.storage.local.set = async (values) => {
    if (shouldFailUnreadCommit && Array.isArray(values.seaf_unread_post_ids)) {
      shouldFailUnreadCommit = false;
      throw new Error('unread commit failed');
    }

    return originalSet(values);
  };

  await assert.rejects(core.performDetection(), /unread commit failed/);
  assert.equal(fake.state.storageData.seaf_last_seen_post_id, 40);

  await core.performDetection();

  assert.equal(fake.state.storageData.seaf_last_seen_post_id, 41);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [41]);
});

test('performDetection times out a pending fetch and releases detection for a later retry', async () => {
  const html = buildListHtml([
    { id: 51, title: 'timeout retry recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  let fetchCalls = 0;
  const { core, fake } = createCore({
    fetchTimeoutMs: 5,
    fetchImpl: async (_url, options = {}) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Promise((resolve, reject) => {
          const fallbackTimer = setTimeout(() => {
            reject(new Error('pending fetch was not aborted'));
          }, 30);

          options.signal?.addEventListener('abort', () => {
            clearTimeout(fallbackTimer);
            reject(new Error('fetch aborted'));
          }, { once: true });
        });
      }

      return {
        ok: true,
        async text() {
          return html;
        }
      };
    },
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 50,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });

  await assert.rejects(core.performDetection(), /timed out/i);
  assert.equal(fake.state.storageData.seaf_last_seen_post_id, 50);

  await core.performDetection();

  assert.equal(fetchCalls, 2);
  assert.equal(fake.state.storageData.seaf_last_seen_post_id, 51);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [51]);
});

test('performDetection removes unread when an existing recruitment changes from open to closed', async () => {
  const html = buildListHtml([
    { id: 61, title: '4/4 closed recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 61,
        seaf_unread_post_ids: [61],
        seaf_post_open_states: { 61: true },
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.deepEqual(fake.state.storageData.seaf_post_open_states, { 61: false });
});

test('performDetection removes a closed unread item while migrating storage without open-state history', async () => {
  const html = buildListHtml([
    { id: 62, title: '4/4 closed migration recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 62,
        seaf_unread_post_ids: [62],
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.deepEqual(fake.state.storageData.seaf_post_open_states, { 62: false });
});

test('performDetection re-alerts a closed-to-open recruitment once and persists the transition', async () => {
  const html = buildListHtml([
    { id: 71, title: 'reopened recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 71,
        seaf_unread_post_ids: [],
        seaf_post_open_states: { 71: false }
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }

        return [];
      }
    }
  });

  await core.performDetection();
  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [71]);
  assert.deepEqual(fake.state.storageData.seaf_post_open_states, { 71: true });
  assert.equal(fake.state.executedScripts.length, 2);
});

test('performDetection shares one in-flight detection across concurrent callers', async () => {
  const html = buildListHtml([
    { id: 41, title: 'durable cursor recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  let releaseFetch;
  let fetchCalls = 0;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const { core, fake } = createCore({
    fetchImpl: async () => {
      fetchCalls += 1;
      await fetchGate;
      return {
        ok: true,
        async text() {
          return html;
        }
      };
    },
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 40
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }

        return [];
      }
    }
  });

  const firstDetection = core.performDetection();
  const concurrentDetection = core.performDetection();

  assert.strictEqual(concurrentDetection, firstDetection);
  releaseFetch();
  await Promise.all([firstDetection, concurrentDetection]);

  const laterDetection = core.performDetection();
  assert.notStrictEqual(laterDetection, firstDetection);
  await laterDetection;

  assert.equal(fetchCalls, 2);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [41]);
  assert.equal(fake.state.executedScripts.length, 2);
});

test('performDetection releases the in-flight detection after failure so a later call can retry', async () => {
  const html = buildListHtml([
    { id: 51, title: 'retry recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  let fetchCalls = 0;
  const { core, fake } = createCore({
    fetchImpl: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        throw new Error('temporary fetch failure');
      }

      return {
        ok: true,
        async text() {
          return html;
        }
      };
    },
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 50,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });

  const failedDetection = core.performDetection();
  const concurrentDetection = core.performDetection();

  assert.strictEqual(concurrentDetection, failedDetection);
  await assert.rejects(failedDetection, /temporary fetch failure/);

  const retryDetection = core.performDetection();
  assert.notStrictEqual(retryDetection, failedDetection);
  await retryDetection;

  assert.equal(fetchCalls, 2);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [51]);
});

test('performDetection injects an overlay into the current active normal tab and updates badge state', async () => {
  const html = buildListHtml([
    { id: 41, title: '??嶺뚮ㅄ維곩퐲?1', fullDateStr: '2026-03-09 10:04:00' },
    { id: 40, title: '??嶺뚮ㅄ維곩퐲?2', fullDateStr: '2026-03-09 10:03:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 39
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }

        return [];
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [41, 40]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '2');
  assert.equal(fake.state.executedScripts.length, 4);
  assert.deepEqual(
    fake.state.executedScripts.map((entry) => ({
      files: entry.files || null,
      hasFunc: typeof entry.func === 'function',
      target: entry.target
    })),
    [
      {
        files: ['scripts/shared/seaf-join-guard.js', 'scripts/shared/seaf-overlay.js'],
        hasFunc: false,
        target: { tabId: 7 }
      },
      { files: null, hasFunc: true, target: { tabId: 7 } },
      {
        files: ['scripts/shared/seaf-join-guard.js', 'scripts/shared/seaf-overlay.js'],
        hasFunc: false,
        target: { tabId: 7 }
      },
      { files: null, hasFunc: true, target: { tabId: 7 } }
    ]
  );
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'normal');
  assert.equal(fake.state.tabsQueries.filter((query) => query.active).length, 1);
});

test('overlay routing stops when the required join guard cannot be injected', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }
        return [];
      },
      executeScript(details) {
        if (details.files?.includes('scripts/shared/seaf-join-guard.js')) {
          throw new Error('guard injection failed');
        }
        return [];
      }
    }
  });

  const result = await core.surfacePostInActiveTab({
    id: 44,
    title: 'guarded overlay',
    relativeTime: '방금',
    postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=44'
  }, core.DEFAULT_SETTINGS);

  assert.equal(result.surfaced, false);
  assert.equal(result.mode, 'limited');
  assert.match(result.reason, /guard injection failed/);
  assert.deepEqual(fake.state.executedScripts.map((entry) => entry.files), [
    ['scripts/shared/seaf-join-guard.js', 'scripts/shared/seaf-overlay.js']
  ]);
});

test('performDetection warn mode forwards banned-author metadata in overlay payloads', async () => {
  const html = buildListHtml([
    {
      id: 42,
      title: 'warned author recruitment',
      fullDateStr: '2026-03-09 10:04:00',
      author: { nickname: '\uACE0\uB2C9', uid: 'fixed123', ip: '' }
    }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 41,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true,
          authorBanEntries: [{ type: 'uid', value: 'fixed123', label: '\uACE0\uB2C9' }],
          authorBanOverlayMode: 'warn'
        }
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }

        return [];
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [42]);
  assert.equal(fake.state.executedScripts.length, 2);
  assert.equal(fake.state.executedScripts[1].args[0].isBanned, true);
  assert.equal(fake.state.executedScripts[1].args[0].isBannedAuthor, true);
  assert.equal(fake.state.executedScripts[1].args[0].hasAuthorNote, false);
  assert.equal(fake.state.executedScripts[1].args[0].authorNote, '');
  assert.equal(fake.state.executedScripts[1].args[0].authorBanNote, '');
  assert.equal(fake.state.executedScripts[1].args[0].confirmBannedAuthorJoin, true);
  assert.deepEqual(fake.state.executedScripts[1].args[0].author, {
    nickname: '\uACE0\uB2C9',
    uid: 'fixed123',
    ip: '',
    displayName: '\uACE0\uB2C9',
    key: 'uid:fixed123'
  });
});

test('getOverlayPayload fails open for old cached posts without author metadata', () => {
  const { core } = createCore();
  const payload = core.getOverlayPayload({
    id: 50,
    title: 'old cached post',
    postUrl: 'https://example.com/50',
    relativeTime: 'just now'
  }, core.normalizeSettings({
    authorBanEntries: [{ type: 'nickname', value: 'old cached post', label: 'old cached post' }]
  }));

  assert.equal(payload.author, null);
  assert.equal(payload.isBanned, false);
  assert.equal(payload.isBannedAuthor, false);
  assert.equal(payload.hasAuthorNote, false);
  assert.equal(payload.authorNote, '');
  assert.equal(payload.authorBanNote, '');
  assert.equal(payload.confirmBannedAuthorJoin, true);
});

test('getOverlayPayload exposes general author notes without marking the author banned', () => {
  const { core } = createCore();
  const author = { nickname: 'noted', uid: 'noted-uid', ip: '' };
  const payload = core.getOverlayPayload({
    id: 53,
    title: 'noted author post',
    postUrl: 'https://example.com/53',
    relativeTime: 'just now',
    author
  }, core.normalizeSettings({
    authorRecords: [domain.createAuthorRecord(author, 'helpful teammate', 'note')]
  }));

  assert.equal(payload.isBanned, false);
  assert.equal(payload.isBannedAuthor, false);
  assert.equal(payload.hasAuthorNote, true);
  assert.equal(payload.authorNote, 'helpful teammate');
  assert.equal(payload.authorBanNote, '');
});

test('getOverlayPayload separates a specific general note from a broader banned-rule warning note', () => {
  const { core } = createCore();
  const author = { nickname: 'mixed', uid: 'mixed-uid', ip: '' };
  const payload = core.getOverlayPayload({
    id: 54,
    title: 'mixed author post',
    postUrl: 'https://example.com/54',
    relativeTime: 'just now',
    author
  }, core.normalizeSettings({
    authorRecords: [
      domain.createAuthorRecord(author, 'specific trusted note', 'note'),
      domain.createNicknameAuthorRecord('mixed', 'broad ban warning', 'banned')
    ]
  }));

  assert.equal(payload.isBanned, true);
  assert.equal(payload.isBannedAuthor, true);
  assert.equal(payload.hasAuthorNote, true);
  assert.equal(payload.authorNote, 'specific trusted note');
  assert.equal(payload.authorBanNote, 'broad ban warning');
});

test('performDetection hide mode skips banned overlays but preserves unread and surfaces later normal posts', async () => {
  const html = buildListHtml([
    {
      id: 52,
      title: 'hidden banned recruitment',
      fullDateStr: '2026-03-09 10:04:00',
      author: { nickname: '\u3147\u3147', uid: '', ip: '118.235' }
    },
    {
      id: 51,
      title: 'visible normal recruitment',
      fullDateStr: '2026-03-09 10:03:00',
      author: { nickname: '\uC815\uC0C1\uB2C9', uid: 'visible123', ip: '' }
    }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 50,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: true,
          authorBanEntries: [{ type: 'anonymous', value: '\u3147\u3147|118.235', label: '\u3147\u3147(118.235)' }],
          authorBanOverlayMode: 'hide'
        }
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'https://example.com/news' }];
        }

        return [];
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [52, 51]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '2');
  assert.equal(fake.state.executedScripts.length, 2);
  assert.deepEqual(fake.state.executedScripts[0].files, [
    'scripts/shared/seaf-join-guard.js',
    'scripts/shared/seaf-overlay.js'
  ]);
  assert.equal(fake.state.executedScripts[1].args[0].postId, 51);
  assert.equal(fake.state.executedScripts[1].args[0].isBannedAuthor, false);
  assert.deepEqual(fake.state.storageData.seaf_recent_posts.map((post) => post.id), [52, 51]);
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'normal');
});

test('performDetection uses badge and popup fallback on restricted tabs without injecting overlays', async () => {
  const html = buildListHtml([
    { id: 51, title: 'restricted recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 50
      },
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 9, url: 'chrome://extensions/' }];
        }

        return [];
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [51]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '1');
  assert.equal(fake.state.executedScripts.length, 0);
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'limited');
});

test('performDetection keeps unread posts in the popup without a badge when browser alerts are disabled', async () => {
  const html = buildListHtml([
    { id: 61, title: 'disabled-alert recruitment', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_last_seen_post_id: 60,
        seaf_settings: {
          isDetectionActive: true,
          isSiteAlertEnabled: false
        }
      }
    }
  });

  await core.performDetection();

  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [61]);
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
  const surfaceState = fake.state.storageData.seaf_last_surface_state;
  assert.equal(surfaceState.mode, 'limited');
  assert.equal(surfaceState.message, '브라우저 알림이 꺼져 있어 읽지 않은 모집은 팝업에만 유지합니다.');
  assert.equal(Number.isFinite(surfaceState.updatedAt), true);
});

test('joinPost clears the joined unread item and reconciles against retained history before opening the join flow', async () => {
  const steamLink = 'steam://joinlobby/553850/12345678901234567/76561198000000000';
  const { core, fake } = createCore({
    fetchImpl: createFetchSequence([`<div>${steamLink}</div>`]),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [71, 70]
      }
    }
  });

  const response = await core.joinPost(71, {});

  assert.equal(response.success, true);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
  assert.deepEqual(fake.state.createdTabs, [{ url: steamLink }]);
});

test('openPost clears unread state and opens the post page', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [81]
      }
    }
  });

  const response = await core.openPost(81);

  assert.deepEqual(response, { success: true, postId: 81 });
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.equal(fake.state.badgeTexts.at(-1).text, '');
  assert.deepEqual(fake.state.createdTabs, [
    { url: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=81' }
  ]);
});

test('committed unread changes still succeed when badge synchronization fails', async () => {
  const steamLink = 'steam://joinlobby/553850/12345678901234567/76561198000000000';
  const warnings = [];
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(`<div>${steamLink}</div>`),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [92, 91, 90]
      }
    },
    logger: {
      log() {},
      warn(...args) { warnings.push(args); },
      error() {}
    }
  });
  const originalGet = fake.chromeApi.storage.local.get.bind(fake.chromeApi.storage.local);
  fake.chromeApi.storage.local.get = async (keys) => {
    if (Array.isArray(keys) && keys.includes('seaf_settings')) {
      throw new Error('badge settings read failed');
    }
    return originalGet(keys);
  };

  const markAllResponse = await core.markAllRead();
  assert.deepEqual(markAllResponse, { success: true, unreadCount: 0, unreadPostIds: [] });
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);

  fake.state.storageData.seaf_unread_post_ids = [91];
  const openResponse = await core.openPost(91);
  assert.deepEqual(openResponse, { success: true, postId: 91 });
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);

  fake.state.storageData.seaf_unread_post_ids = [92];
  const joinResponse = await core.joinPost(92, {});
  assert.equal(joinResponse.success, true);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, []);
  assert.deepEqual(fake.state.createdTabs, [
    { url: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=91' },
    { url: steamLink }
  ]);
  assert.equal(warnings.length, 3);
});

test('triggerTestToast rejects unsupported active tabs', async () => {
  const { core } = createCore({
    chromeOptions: {
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 7, url: 'chrome://settings/' }];
        }

        return [];
      }
    }
  });

  await assert.rejects(
    () => core.triggerTestToast({ toastDuration: 10 }),
    /./
  );
});

test('triggerTestToast sends a test message to the active helldivers list tab', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 5, url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries' }];
        }

        return [];
      }
    }
  });

  await core.triggerTestToast({ toastDuration: 7 });

  assert.equal(fake.state.sentMessages.length, 1);
  assert.equal(fake.state.sentMessages[0].tabId, 5);
  assert.equal(fake.state.sentMessages[0].payload.type, 'SEAF_TEST_TOAST');
  assert.equal(fake.state.sentMessages[0].payload.toastDuration, 7000);
});

test('getPopupPosts decodes numeric entities in fetched titles', async () => {
  const expectedTitle = '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f';
  const html = buildListHtml([
    {
      id: 12,
      title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
      fullDateStr: '2026-03-09 10:04:00'
    }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [12]
      }
    }
  });

  const response = await core.getPopupPosts();

  assert.equal(response.unreadPosts[0].title, expectedTitle);
  assert.equal(response.historyPosts[0].title, expectedTitle);
  assert.equal(fake.state.storageData.seaf_recent_posts[0].title, expectedTitle);
});
