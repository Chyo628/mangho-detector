const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createPopupCore } = require('../scripts/shared/seaf-popup-core.js');
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
    now: () => NOW
  });

  return { core, fake };
}

test('normalizeSettings keeps polling fixed and clamps toast duration', () => {
  const { core } = createCore();

  assert.deepEqual(core.normalizeSettings({ pollingInterval: 5, toastDuration: 99 }), {
    isDetectionActive: true,
    pollingInterval: 30,
    toastDuration: 30,
    isSiteAlertEnabled: true
  });
  assert.equal(core.normalizeToastDuration(1), 3);
});

test('fetchPopupPostsDirectly updates recent-post cache and hydrates unread posts', async () => {
  const html = buildListHtml([
    { id: 51, title: '팝업 모집', fullDateStr: '2026-03-09 10:04:00' }
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
  assert.ok(Array.isArray(fake.state.storageData.seaf_recent_posts));
});

test('fetchPopupPostsWithFallback returns cached posts when direct fetch fails', async () => {
  const cachedPosts = domain.parsePostsFromHtml(
    buildListHtml([{ id: 61, title: '캐시 팝업 모집', fullDateStr: '2026-03-09 10:04:00' }]),
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

test('areStoredPostsEquivalent ignores detectedAt-only changes', () => {
  const { core } = createCore();
  const left = [{ id: 1, title: 'a', subject: '맹호', fullDateStr: '', postUrl: 'u', detectedAt: 1 }];
  const right = [{ id: 1, title: 'a', subject: '맹호', fullDateStr: '', postUrl: 'u', detectedAt: 5 }];

  assert.equal(core.areStoredPostsEquivalent(left, right), true);
});

test('markPostRead removes ids from unread storage', async () => {
  const { core, fake } = createCore({
    chromeOptions: {
      storageData: {
        seaf_unread_post_ids: [3, 2, 1]
      }
    }
  });

  const unreadIds = await core.markPostRead(2);

  assert.deepEqual(unreadIds, [3, 1]);
  assert.deepEqual(fake.state.storageData.seaf_unread_post_ids, [3, 1]);
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
    error: '현재 탭에는 오버레이 테스트를 표시할 수 없습니다.'
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
  assert.deepEqual(fake.state.executedScripts[0].files, ['scripts/shared/seaf-overlay.js']);
  assert.equal(typeof fake.state.executedScripts[1].func, 'function');
});

test('describePostSource returns user-facing copy for each source', () => {
  const { core } = createCore();

  assert.equal(core.describePostSource({ source: 'fetch' }), '실시간 목록을 새로 불러왔습니다.');
  assert.equal(
    core.describePostSource({ source: 'popup-fetch' }),
    '백그라운드 연결 없이 팝업이 직접 목록을 불러왔습니다.'
  );
  assert.equal(
    core.describePostSource({ source: 'cache' }),
    '실시간 조회에 실패해 저장된 기록을 보여주고 있습니다.'
  );
});
