const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createPopupCore } = require('../scripts/shared/seaf-popup-core.js');
const { createSettingsClient } = require('../popup/settings-client.js');
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

function createFetchFail(message) {
  return async () => {
    throw new Error(message);
  };
}

function createCore(options = {}) {
  const fake = createFakeChrome(options.chromeOptions);
  const core = createPopupCore({
    chromeApi: fake.chromeApi,
    fetchImpl: options.fetchImpl || createFetchOk(buildListHtml([])),
    domain,
    now: () => NOW,
    fetchTimeoutMs: options.fetchTimeoutMs
  });

  return { core, fake };
}

test('normalizeSettings keeps polling fixed and clamps toast/history settings', () => {
  const { core } = createCore();

  assert.deepEqual(core.normalizeSettings({
    pollingInterval: 5,
    toastDuration: 99,
    recentHistoryLimit: 99,
    recentHistoryRetentionMinutes: 1,
    unreadActiveWindowMinutes: 999
  }), {
    isDetectionActive: true,
    pollingInterval: 30,
    toastDuration: 30,
    isSiteAlertEnabled: true,
    recentHistoryLimit: 30,
    recentHistoryRetentionMinutes: 5,
    unreadActiveWindowMinutes: 180,
    authorRecords: [],
    authorBanOverlayMode: 'warn',
    confirmBannedAuthorJoin: true
  });
  assert.equal(core.normalizeToastDuration(1), 3);
  assert.equal(core.normalizeRecentHistoryLimit(0), 1);
  assert.equal(core.normalizeRecentHistoryRetentionMinutes(999), 180);
  assert.equal(core.normalizeSettings({}).unreadActiveWindowMinutes, 15);
  assert.equal(core.normalizeSettings({ unreadActiveWindowMinutes: 0 }).unreadActiveWindowMinutes, 1);
  assert.equal(core.normalizeSettings({ confirmBannedAuthorJoin: false }).confirmBannedAuthorJoin, false);
});

test('normalizeSettings migrates legacy bans into canonical author records', () => {
  const { core } = createCore();
  const alphaEntry = domain.createNicknameAuthorBanEntry('Alpha');

  const normalized = core.normalizeSettings({
    authorBanEntries: [
      null,
      alphaEntry,
      { ...alphaEntry },
      { displayName: 'Missing key' }
    ],
    authorBanOverlayMode: 'unexpected'
  });

  assert.equal(normalized.authorRecords.length, 1);
  assert.deepEqual(normalized.authorRecords[0], alphaEntry);
  assert.equal(Object.hasOwn(normalized, 'authorBanEntries'), false);
  assert.equal(normalized.authorBanOverlayMode, 'warn');

  const emptyCanonicalMergesLegacy = core.normalizeSettings({
    authorRecords: [],
    authorBanEntries: [alphaEntry]
  });
  assert.deepEqual(emptyCanonicalMergesLegacy.authorRecords, [alphaEntry]);

  const canonicalNote = domain.createNicknameAuthorRecord('Alpha', 'trusted', 'note');
  const sameKeyCanonicalWins = core.normalizeSettings({
    authorRecords: [canonicalNote],
    authorBanEntries: [alphaEntry]
  });
  assert.deepEqual(sameKeyCanonicalWins.authorRecords, [canonicalNote]);

  const betaLegacyBan = domain.createNicknameAuthorBanEntry('Beta', 'warning');
  const uniqueLegacyIsPreserved = core.normalizeSettings({
    authorRecords: [canonicalNote],
    authorBanEntries: [alphaEntry, betaLegacyBan]
  });
  assert.deepEqual(uniqueLegacyIsPreserved.authorRecords, [canonicalNote, betaLegacyBan]);
  assert.equal(Object.hasOwn(uniqueLegacyIsPreserved, 'authorBanEntries'), false);

  const fullCanonicalRecords = Array.from(
    { length: domain.constants.MAX_AUTHOR_RECORDS },
    (_, index) => domain.createNicknameAuthorRecord(`Canonical ${index}`, '', 'note')
  );
  const duplicateLegacyBan = domain.createNicknameAuthorBanEntry('Canonical 0', 'stale warning');
  const uniqueOverflowBan = domain.createNicknameAuthorBanEntry('Legacy overflow', 'preserve me');
  const overCapacityMigration = core.normalizeSettings({
    authorRecords: fullCanonicalRecords,
    authorBanEntries: [duplicateLegacyBan, uniqueOverflowBan]
  });

  assert.equal(overCapacityMigration.authorRecords.length, domain.constants.MAX_AUTHOR_RECORDS + 1);
  assert.deepEqual(overCapacityMigration.authorRecords[0], fullCanonicalRecords[0]);
  assert.deepEqual(overCapacityMigration.authorRecords.at(-1), uniqueOverflowBan);
  assert.equal(Object.hasOwn(overCapacityMigration, 'authorBanEntries'), false);
});

test('settings client exposes generic author record mutations and keeps ban wrappers compatible', async () => {
  const sentMessages = [];
  const normalizedSettings = { authorRecords: [] };
  const client = createSettingsClient({
    chromeApi: {
      runtime: {
        async sendMessage(message) {
          sentMessages.push(message);
          return { success: true, settings: normalizedSettings };
        }
      }
    },
    popupCore: {
      normalizeSettings(settings) {
        return settings;
      }
    }
  });

  assert.equal(await client.addAuthorRecord({ nickname: 'Alpha', note: 'memo', status: 'note' }), normalizedSettings);
  await client.updateAuthorRecordNote('nickname:Alpha', 'updated');
  await client.setAuthorRecordStatus(['nickname:Alpha'], 'banned');
  await client.removeAuthorRecordKeys(['nickname:Alpha']);
  await client.addAuthorBan({ nickname: 'Legacy', note: 'warning' });

  assert.deepEqual(sentMessages, [
    {
      type: 'ADD_AUTHOR_RECORD',
      author: null,
      nickname: 'Alpha',
      note: 'memo',
      status: 'note'
    },
    { type: 'UPDATE_AUTHOR_RECORD_NOTE', key: 'nickname:Alpha', note: 'updated' },
    { type: 'SET_AUTHOR_RECORD_STATUS', keys: ['nickname:Alpha'], status: 'banned' },
    { type: 'REMOVE_AUTHOR_RECORD_KEYS', keys: ['nickname:Alpha'] },
    {
      type: 'ADD_AUTHOR_RECORD',
      author: null,
      nickname: 'Legacy',
      note: 'warning',
      status: 'banned'
    }
  ]);
});

test('fetchText aborts a pending popup fallback request after its timeout', async () => {
  let wasAborted = false;
  const { core } = createCore({
    fetchTimeoutMs: 5,
    fetchImpl(url, options) {
      options.signal.addEventListener('abort', () => {
        wasAborted = true;
      });
      return new Promise(() => {});
    }
  });

  await assert.rejects(core.fetchText('https://example.com/pending'), /Request timed out\./);
  assert.equal(wasAborted, true);
});

test('getStoredRecentPosts trims stored history for display without rewriting the cache', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [
          {
            id: 53,
            title: 'recent 1',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/53',
            detectedAt: NOW - (5 * 60 * 1000)
          },
          {
            id: 52,
            title: 'recent 2',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/52',
            detectedAt: NOW - (15 * 60 * 1000)
          },
          {
            id: 51,
            title: 'expired',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/51',
            detectedAt: NOW - (45 * 60 * 1000)
          }
        ]
      }
    }
  });

  const recentPosts = await core.getStoredRecentPosts(core.normalizeSettings({
    recentHistoryLimit: 2,
    recentHistoryRetentionMinutes: 30
  }));

  assert.deepEqual(recentPosts.map((post) => post.id), [53, 52]);
  assert.deepEqual(fake.state.storageData.seaf_recent_posts.map((post) => post.id), [53, 52, 51]);
});

test('fetchPopupPostsDirectly hydrates display data without writing recent or unread storage', async () => {
  const html = buildListHtml([
    { id: 51, title: '\uD31D\uC5C5 \uBAA8\uC9D1', fullDateStr: '2026-03-09 10:04:00' }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [51]
      }
    }
  });

  const response = await core.fetchPopupPostsDirectly();

  assert.equal(response.success, true);
  assert.equal(response.source, 'popup-fetch');
  assert.equal(response.unreadPosts[0].id, 51);
  assert.equal(fake.state.storageData.seaf_recent_posts, undefined);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [51]);
});

test('fetchPopupPostsDirectly decodes numeric entities in fetched titles', async () => {
  const expectedTitle = '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f';
  const html = buildListHtml([
    {
      id: 52,
      title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
      fullDateStr: '2026-03-09 10:04:00'
    }
  ]);
  const { core, fake } = createCore({
    fetchImpl: createFetchOk(html),
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [52]
      }
    }
  });

  const response = await core.fetchPopupPostsDirectly();

  assert.equal(response.unreadPosts[0].title, expectedTitle);
  assert.equal(fake.state.storageData.seaf_recent_posts, undefined);
});

test('fetchPopupPostsWithFallback returns cached posts when direct fetch fails', async () => {
  const cachedPosts = domain.parsePostsFromHtml(
    buildListHtml([{ id: 61, title: '\uCE90\uC2DC \uD31D\uC5C5 \uBAA8\uC9D1', fullDateStr: '2026-03-09 10:04:00' }]),
    {
      currentTime: NOW,
      limit: domain.constants.LIVE_POST_LIMIT,
      viewUrlPrefix: domain.constants.VIEW_URL_PREFIX
    }
  );
  const { core } = createCore({
    fetchImpl: createFetchFail('popup offline'),
    chromeOptions: {
      storageData: {
        seaf_recent_posts: cachedPosts,
        seaf_unread_post_ids: [61]
      }
    }
  });

  const response = await core.fetchPopupPostsWithFallback();

  assert.equal(response.success, true);
  assert.equal(response.source, 'cache');
  assert.equal(response.unreadPosts[0].id, 61);
});

test('fetchPopupPostsWithFallback decodes numeric entities in cached titles', async () => {
  const { core } = createCore({
    fetchImpl: createFetchFail('popup offline'),
    chromeOptions: {
      storageData: {
        seaf_recent_posts: [{
          id: 62,
          title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
          subject: '\uD5EC\uB9DD\uD638',
          fullDateStr: '2026-03-09 10:04:00',
          relativeTime: '\uBC29\uAE08',
          postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=62',
          detectedAt: NOW
        }],
        seaf_unread_post_ids: [62]
      }
    }
  });

  const response = await core.fetchPopupPostsWithFallback();

  assert.equal(response.success, true);
  assert.equal(response.source, 'cache');
  assert.equal(response.unreadPosts[0].title, '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f');
});

test('reconcileUnreadPosts filters stale ids for display without rewriting unread storage', async () => {
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
            id: 64,
            title: 'still unread',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/64',
            detectedAt: NOW - (8 * 60 * 1000)
          },
          {
            id: 63,
            title: 'history only',
            subject: '\uD5EC\uB9DD\uD638',
            fullDateStr: '',
            postUrl: 'https://example.com/63',
            detectedAt: NOW - (20 * 60 * 1000)
          }
        ],
        seaf_unread_post_ids: [64, 63]
      }
    }
  });

  const settings = core.normalizeSettings({
    recentHistoryLimit: 15,
    recentHistoryRetentionMinutes: 30,
    unreadActiveWindowMinutes: 15
  });
  const historyPosts = await core.getStoredRecentPosts(settings);
  const response = await core.reconcileUnreadPosts(historyPosts);

  assert.deepEqual(historyPosts.map((post) => post.id), [64, 63]);
  assert.deepEqual(response.unreadPosts.map((post) => post.id), [64]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [64, 63]);
});

test('triggerTestToastDirectly rejects unsupported tabs', async () => {
  const { core } = createCore({
    chromeOptions: {
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 2, url: 'chrome://settings/' }];
        }

        return [];
      }
    }
  });

  const response = await core.triggerTestToastDirectly({ toastDuration: 10 });
  assert.deepEqual(response, {
    success: false,
    error: '\uD604\uC7AC \uD0ED\uC5D0\uC11C\uB294 \uC624\uBC84\uB808\uC774 \uD14C\uC2A4\uD2B8\uB97C \uC2E4\uD589\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'
  });
});

test('triggerTestToastDirectly injects overlay into a generic active tab', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      queryTabs(queryInfo) {
        if (queryInfo.active) {
          return [{ id: 8, url: 'https://example.com/' }];
        }

        return [];
      }
    }
  });

  const response = await core.triggerTestToastDirectly({ toastDuration: 7 });

  assert.deepEqual(response, { success: true, source: 'popup-test' });
  assert.equal(fake.state.executedScripts.length, 2);
  assert.deepEqual(fake.state.executedScripts[0].files, [
    'scripts/shared/seaf-join-guard.js',
    'scripts/shared/seaf-overlay.js'
  ]);
  assert.equal(typeof fake.state.executedScripts[1].func, 'function');
});

test('describePostSource returns user-facing copy for each source', () => {
  const { core } = createCore();

  assert.equal(core.describePostSource({ source: 'fetch' }), '\uC2E4\uC2DC\uAC04 \uBAA9\uB85D\uC744 \uC0C8\uB85C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.');
  assert.equal(
    core.describePostSource({ source: 'popup-fetch' }),
    '\uBC31\uADF8\uB77C\uC6B4\uB4DC \uC5F0\uACB0 \uC5C6\uC774 \uD31D\uC5C5\uC774 \uC9C1\uC811 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.'
  );
  assert.equal(
    core.describePostSource({ source: 'cache' }),
    '\uC2E4\uC2DC\uAC04 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD574 \uC800\uC7A5\uB41C \uCD5C\uADFC \uAE30\uB85D\uC744 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.'
  );
});
