const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
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
  const core = createBackgroundCore({
    chromeApi: fake.chromeApi,
    fetchImpl: options.fetchImpl || createFetchOk(buildListHtml([])),
    logger: options.logger || { log() {}, warn() {}, error() {} },
    domain,
    now: () => NOW
  });

  return { core, fake };
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
  assert.equal(core.normalizeSettings({ unreadActiveWindowMinutes: 0 }).unreadActiveWindowMinutes, 1);
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
  const left = [{ id: 1, title: 'a', subject: '맹호', fullDateStr: '', postUrl: 'u', detectedAt: 1 }];
  const right = [{ id: 1, title: 'a', subject: '맹호', fullDateStr: '', postUrl: 'u', detectedAt: 2 }];

  assert.equal(core.areStoredPostsEquivalent(left, right), true);
});

test('getPopupPosts returns unread and history data from fetched posts plus stored unread ids', async () => {
  const html = buildListHtml([
    { id: 11, title: '최근 모집 1', fullDateStr: '2026-03-09 10:04:00' },
    { id: 10, title: '최근 모집 2', fullDateStr: '2026-03-09 10:03:00' }
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
    buildListHtml([{ id: 21, title: '캐시 모집', fullDateStr: '2026-03-09 10:04:00' }]),
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
    { id: 31, title: '첫 모집', fullDateStr: '2026-03-09 10:04:00' }
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

test('performDetection injects an overlay into the current active normal tab and updates badge state', async () => {
  const html = buildListHtml([
    { id: 41, title: '새 모집 1', fullDateStr: '2026-03-09 10:04:00' },
    { id: 40, title: '새 모집 2', fullDateStr: '2026-03-09 10:03:00' }
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
      { files: ['scripts/shared/seaf-overlay.js'], hasFunc: false, target: { tabId: 7 } },
      { files: null, hasFunc: true, target: { tabId: 7 } },
      { files: ['scripts/shared/seaf-overlay.js'], hasFunc: false, target: { tabId: 7 } },
      { files: null, hasFunc: true, target: { tabId: 7 } }
    ]
  );
  assert.equal(fake.state.storageData.seaf_last_surface_state.mode, 'normal');
  assert.equal(fake.state.tabsQueries.filter((query) => query.active).length, 1);
});

test('performDetection uses badge and popup fallback on restricted tabs without injecting overlays', async () => {
  const html = buildListHtml([
    { id: 51, title: '제한 탭 모집', fullDateStr: '2026-03-09 10:04:00' }
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
    /현재 탭에서는 오버레이 테스트를 실행할 수 없습니다/
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
