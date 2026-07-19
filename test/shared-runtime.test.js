const test = require('node:test');
const assert = require('node:assert/strict');

const fetchModule = require('../scripts/shared/seaf-fetch.js');
const permissionsModule = require('../scripts/shared/seaf-permissions.js');

test('fetch runtime returns response text and always clears its timer', async () => {
  const timerIds = [];
  const clearedTimerIds = [];
  const runtime = fetchModule.createFetchRuntime({
    fetchImpl: async (_url, options) => ({
      ok: true,
      async text() {
        assert.equal(options.cache, 'no-store');
        assert.equal(typeof options.signal, 'object');
        return 'ok';
      }
    }),
    AbortControllerImpl: AbortController,
    setTimeoutImpl(callback) {
      const timerId = { callback };
      timerIds.push(timerId);
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      clearedTimerIds.push(timerId);
    }
  });

  const text = await runtime.fetchText('https://example.com');

  assert.equal(text, 'ok');
  assert.equal(timerIds.length, 1);
  assert.deepEqual(clearedTimerIds, timerIds);
});

test('fetch runtime surfaces a stable timeout contract and clears the timer once', async () => {
  const scheduledCallbacks = [];
  const clearedTimerIds = [];
  const runtime = fetchModule.createFetchRuntime({
    fetchImpl: async (_url, options) => new Promise((resolveUnused, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new Error('fetch aborted'));
      }, { once: true });
    }),
    AbortControllerImpl: AbortController,
    setTimeoutImpl(callback) {
      const timerId = { callback };
      scheduledCallbacks.push({ callback, timerId });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      clearedTimerIds.push(timerId);
    }
  });

  const pendingFetch = runtime.fetchText('https://example.com');
  scheduledCallbacks[0].callback();

  await assert.rejects(
    pendingFetch,
    (error) => {
      assert.equal(fetchModule.isFetchTimeoutError(error), true);
      assert.equal(error.code, fetchModule.FETCH_TIMEOUT_ERROR_CODE);
      assert.equal(error.message, fetchModule.FETCH_TIMEOUT_ERROR);
      return true;
    }
  );
  assert.deepEqual(clearedTimerIds, [scheduledCallbacks[0].timerId]);
});

test('fetch runtime preserves non-timeout fetch failures', async () => {
  const runtime = fetchModule.createFetchRuntime({
    fetchImpl: async () => {
      throw new Error('network down');
    },
    AbortControllerImpl: AbortController
  });

  await assert.rejects(
    runtime.fetchText('https://example.com'),
    /network down/
  );
});

test('permissions helpers normalize origins and saved site-alert settings without storage writes', async () => {
  const calls = [];
  const runtime = permissionsModule.createPermissionsRuntime({
    permissionsApi: {
      async contains(request) {
        calls.push({ type: 'contains', request });
        return false;
      },
      async request(request) {
        calls.push({ type: 'request', request });
        return true;
      },
      async remove(request) {
        calls.push({ type: 'remove', request });
        return true;
      }
    },
    origins: ['https://*/*', 'http://*/*', 'https://*/*']
  });

  assert.deepEqual(runtime.origins, ['https://*/*', 'http://*/*']);
  assert.equal(await runtime.containsOptionalOrigins(), false);
  assert.equal(await runtime.requestOptionalOrigins(), true);
  assert.equal(await runtime.removeOptionalOrigins(), true);

  const normalized = await runtime.normalizeStoredSiteAlertSettings({
    isSiteAlertEnabled: true,
    otherValue: 7
  });
  assert.deepEqual(normalized, {
    settings: {
      isSiteAlertEnabled: false,
      otherValue: 7
    },
    changed: true,
    hasOptionalOrigins: false
  });
  assert.deepEqual(calls, [
    { type: 'contains', request: { origins: ['https://*/*', 'http://*/*'] } },
    { type: 'request', request: { origins: ['https://*/*', 'http://*/*'] } },
    { type: 'remove', request: { origins: ['https://*/*', 'http://*/*'] } },
    { type: 'contains', request: { origins: ['https://*/*', 'http://*/*'] } }
  ]);
});

test('permissions helpers can normalize from injected permission state without calling the API', async () => {
  const runtime = permissionsModule.createPermissionsRuntime({
    permissionsApi: {}
  });

  assert.deepEqual(
    permissionsModule.normalizeSiteAlertSettings({ isSiteAlertEnabled: false, extra: 1 }),
    { isSiteAlertEnabled: false, extra: 1 }
  );
  assert.deepEqual(
    permissionsModule.deriveSiteAlertSettings({ isSiteAlertEnabled: true, extra: 1 }, true),
    {
      settings: { isSiteAlertEnabled: true, extra: 1 },
      changed: false,
      hasOptionalOrigins: true
    }
  );
  assert.deepEqual(
    await runtime.normalizeStoredSiteAlertSettings(
      { isSiteAlertEnabled: true, extra: 1 },
      { hasOptionalOrigins: false }
    ),
    {
      settings: { isSiteAlertEnabled: false, extra: 1 },
      changed: true,
      hasOptionalOrigins: false
    }
  );
});
