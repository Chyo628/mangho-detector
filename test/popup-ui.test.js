const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createPopupCore } = require('../scripts/shared/seaf-popup-core.js');
const { createFakeChrome } = require('./helpers/fake-chrome');
const { installDom } = require('./helpers/dom-env');
const { loadHtml } = require('./helpers/load-html');

const OPTIONAL_SITE_ORIGINS = ['http://*/*', 'https://*/*'];

function loadFreshPopupModule() {
  const popupPath = require.resolve('../popup/popup.js');
  delete require.cache[popupPath];
  return require('../popup/popup.js');
}

function setupPopupTest({
  storageData = {},
  beforeLoad = null,
  livePostsResponse = null,
  grantedOrigins = OPTIONAL_SITE_ORIGINS,
  requestPermissions = null,
  removePermissions = null,
  runtimeSendMessage = null
} = {}) {
  const domHandle = installDom(loadHtml('popup/popup.html'), 'https://example.com/popup.html');

  if (typeof beforeLoad === 'function') {
    beforeLoad(domHandle.dom.window);
  }

  const fake = createFakeChrome({
    storageData,
    grantedOrigins,
    ...(requestPermissions ? { requestPermissions } : {}),
    ...(removePermissions ? { removePermissions } : {}),
    manifest: { version: '1.2.3' },
    runtimeSendMessage(message, state) {
      if (runtimeSendMessage) {
        const overrideResponse = runtimeSendMessage(message, state);
        if (typeof overrideResponse !== 'undefined') {
          return overrideResponse;
        }
      }

      if (message.type === 'GET_SETTINGS') {
        return {
          success: true,
          settings: domain.normalizeAuthorBanEntries
            ? { ...(state.storageData.seaf_settings || {}) }
            : (state.storageData.seaf_settings || {})
        };
      }

      if (message.type === 'UPDATE_SETTINGS_PATCH') {
        state.storageData.seaf_settings = {
          ...(state.storageData.seaf_settings || {}),
          ...(message.patch || {})
        };
        return { success: true, settings: state.storageData.seaf_settings };
      }

      if (message.type === 'ADD_AUTHOR_RECORD' || message.type === 'ADD_AUTHOR_BAN') {
        const currentSettings = state.storageData.seaf_settings || {};
        const sourceRecords = Object.hasOwn(currentSettings, 'authorRecords')
          ? currentSettings.authorRecords
          : currentSettings.authorBanEntries;
        const currentRecords = domain.normalizeAuthorRecords(sourceRecords);
        const status = message.type === 'ADD_AUTHOR_BAN' ? 'banned' : message.status;
        const nextRecord = message.author
          ? domain.createAuthorRecord(message.author, message.note, status)
          : domain.createNicknameAuthorRecord(message.nickname, message.note, status);
        if (!nextRecord) {
          return { success: false, errorCode: 'AUTHOR_RECORD_INVALID', error: 'invalid author record' };
        }
        if (currentRecords.some((entry) => entry.key === nextRecord.key)) {
          return { success: false, errorCode: 'AUTHOR_RECORD_DUPLICATE', error: 'duplicate author record' };
        }
        if (currentRecords.length >= domain.constants.MAX_AUTHOR_RECORDS) {
          return { success: false, errorCode: 'AUTHOR_RECORD_CAPACITY', error: 'author record capacity reached' };
        }
        const nextSettings = {
          ...currentSettings,
          authorRecords: domain.normalizeAuthorRecords([...currentRecords, nextRecord])
        };
        delete nextSettings.authorBanEntries;
        state.storageData.seaf_settings = nextSettings;
        return { success: true, settings: state.storageData.seaf_settings };
      }

      if (message.type === 'UPDATE_AUTHOR_RECORD_NOTE' || message.type === 'UPDATE_AUTHOR_BAN_NOTE') {
        const currentSettings = state.storageData.seaf_settings || {};
        const sourceRecords = Object.hasOwn(currentSettings, 'authorRecords')
          ? currentSettings.authorRecords
          : currentSettings.authorBanEntries;
        const currentRecords = domain.normalizeAuthorRecords(sourceRecords);
        const target = currentRecords.find((entry) => entry.key === message.key);
        if (!target) {
          return { success: false, errorCode: 'AUTHOR_RECORD_NOT_FOUND', error: 'author record not found' };
        }
        const normalizedNote = domain.normalizeAuthorNote(message.note);
        const nextSettings = {
          ...currentSettings,
          authorRecords: currentRecords.map((entry) => {
            if (entry.key !== message.key) {
              return entry;
            }
            const nextEntry = { ...entry };
            delete nextEntry.note;
            if (normalizedNote) {
              nextEntry.note = normalizedNote;
            }
            return nextEntry;
          })
        };
        delete nextSettings.authorBanEntries;
        state.storageData.seaf_settings = nextSettings;
        return { success: true, settings: state.storageData.seaf_settings };
      }

      if (message.type === 'SET_AUTHOR_RECORD_STATUS') {
        const currentSettings = state.storageData.seaf_settings || {};
        const sourceRecords = Object.hasOwn(currentSettings, 'authorRecords')
          ? currentSettings.authorRecords
          : currentSettings.authorBanEntries;
        const keySet = new Set(message.keys || []);
        const nextSettings = {
          ...currentSettings,
          authorRecords: domain.normalizeAuthorRecords(sourceRecords).map((record) => (
            keySet.has(record.key) ? { ...record, status: message.status } : record
          ))
        };
        delete nextSettings.authorBanEntries;
        state.storageData.seaf_settings = nextSettings;
        return { success: true, settings: state.storageData.seaf_settings };
      }

      if (message.type === 'REMOVE_AUTHOR_RECORD_KEYS' || message.type === 'REMOVE_AUTHOR_BAN_KEYS') {
        const currentSettings = state.storageData.seaf_settings || {};
        const removeSet = new Set(message.keys || []);
        const sourceRecords = Object.hasOwn(currentSettings, 'authorRecords')
          ? currentSettings.authorRecords
          : currentSettings.authorBanEntries;
        const nextSettings = {
          ...currentSettings,
          authorRecords: domain.normalizeAuthorRecords(sourceRecords)
            .filter((record) => !removeSet.has(record.key))
        };
        delete nextSettings.authorBanEntries;
        state.storageData.seaf_settings = nextSettings;
        return { success: true, settings: state.storageData.seaf_settings };
      }

      if (message.type === 'GET_LIVE_POSTS') {
        return livePostsResponse || {
          success: true,
          unreadPosts: [
            {
              id: 100,
              title: '\uD14C\uC2A4\uD2B8 \uBAA8\uC9D1',
              relativeTime: '\uBC29\uAE08',
              subject: '\uD5EC\uB9DD\uD638',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100',
              author: {
                nickname: '\uD14C\uC2A4\uD2B8\uC720\uC800',
                uid: 'user-100',
                displayName: '\uD14C\uC2A4\uD2B8\uC720\uC800 (user-100)',
                key: 'uid:user-100'
              }
            }
          ],
          historyPosts: [
            {
              id: 100,
              title: '\uD14C\uC2A4\uD2B8 \uBAA8\uC9D1',
              relativeTime: '\uBC29\uAE08',
              subject: '\uD5EC\uB9DD\uD638',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100',
              author: {
                nickname: '\uD14C\uC2A4\uD2B8\uC720\uC800',
                uid: 'user-100',
                displayName: '\uD14C\uC2A4\uD2B8\uC720\uC800 (user-100)',
                key: 'uid:user-100'
              }
            }
          ],
          unreadCount: 1,
          lastScanAt: Date.now(),
          source: 'fetch',
          worker: {
            mode: 'normal',
            message: '\uBE0C\uB77C\uC6B0\uC800 \uC624\uBC84\uB808\uC774\uC640 \uBC30\uC9C0\uAC00 \uC815\uC0C1 \uB3D9\uC791 \uC911\uC785\uB2C8\uB2E4.'
          }
        };
      }

      if (message.type === 'SETTINGS_UPDATED' || message.type === 'TEST_ACTIVE_TAB_TOAST') {
        return {
          success: true,
          worker: {
            mode: 'normal',
            message: '\uBE0C\uB77C\uC6B0\uC800 \uC624\uBC84\uB808\uC774\uC640 \uBC30\uC9C0\uAC00 \uC815\uC0C1 \uB3D9\uC791 \uC911\uC785\uB2C8\uB2E4.'
          },
          settings: state.storageData.seaf_settings
        };
      }

      if (
        message.type === 'OPEN_POST' ||
        message.type === 'JOIN_POST' ||
        message.type === 'MARK_POST_READ' ||
        message.type === 'MARK_ALL_READ'
      ) {
        return { success: true };
      }

      throw new Error(`Unexpected runtime message: ${message.type}`);
    }
  });

  global.chrome = fake.chromeApi;
  global.fetch = async () => ({ ok: true, async text() { return ''; } });
  global.SEAFDomain = domain;
  global.SEAFPopupCore = { createPopupCore };

  loadFreshPopupModule();
  document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  return {
    fake,
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    cleanup() {
      delete global.chrome;
      delete global.fetch;
      delete global.SEAFDomain;
      delete global.SEAFPopupCore;
      domHandle.cleanup();
    }
  };
}

function getStoredAuthorRecords(handle) {
  const settings = handle.fake.state.storageData.seaf_settings || {};
  const source = Object.hasOwn(settings, 'authorRecords')
    ? settings.authorRecords
    : settings.authorBanEntries;
  return domain.normalizeAuthorRecords(source);
}

test('popup renders summary, unread feed, and saved settings', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 5,
        toastDuration: 12,
        isSiteAlertEnabled: false,
        recentHistoryLimit: 18,
        recentHistoryRetentionMinutes: 45,
        unreadActiveWindowMinutes: 20
      }
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-version-display').textContent, 'v1.2.3');
    assert.equal(document.querySelector('.seaf-brand-title').textContent, 'MANGHO Detector');
    assert.equal(document.getElementById('seaf-polling-interval-value').textContent, '30초 고정');
    assert.equal(document.getElementById('seaf-toast-duration-input').value, '12');
    assert.equal(document.getElementById('seaf-history-limit-input').value, '18');
    assert.equal(document.getElementById('seaf-history-retention-input').value, '45');
    assert.equal(document.getElementById('seaf-unread-window-input').value, '20');
    assert.equal(document.getElementById('seaf-master-toggle').checked, false);
    assert.equal(document.getElementById('seaf-master-toggle-label').textContent, 'OFF');
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.equal(document.getElementById('seaf-feed-count').textContent, '1');
    assert.equal(document.querySelector('.seaf-post-title').textContent, '테스트 모집');
  } finally {
    handle.cleanup();
  }
});

test('popup master toggle updates detection and browser alerts together', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    }
  });

  try {
    await handle.settle();

    const masterToggle = document.getElementById('seaf-master-toggle');
    assert.equal(masterToggle.checked, true);
    assert.equal(document.getElementById('seaf-master-toggle-label').textContent, 'ON');

    masterToggle.checked = false;
    masterToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.isDetectionActive, false);
    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
    assert.equal(document.getElementById('seaf-detection-toggle').checked, false);
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.equal(document.getElementById('seaf-master-toggle').checked, false);
    assert.equal(document.getElementById('seaf-master-toggle-label').textContent, 'OFF');
    assert.deepEqual(handle.fake.state.permissionRemovals.at(-1), {
      origins: OPTIONAL_SITE_ORIGINS
    });

    masterToggle.checked = true;
    masterToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.isDetectionActive, true);
    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, true);
    assert.equal(document.getElementById('seaf-detection-toggle').checked, true);
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, true);
    assert.equal(document.getElementById('seaf-master-toggle').checked, true);
    assert.equal(document.getElementById('seaf-master-toggle-label').textContent, 'ON');
    assert.deepEqual(handle.fake.state.permissionRequests.at(-1), {
      origins: OPTIONAL_SITE_ORIGINS
    });
  } finally {
    handle.cleanup();
  }
});

test('popup requests optional site access when browser alerts are enabled and saves after approval', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: false,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    },
    grantedOrigins: []
  });

  try {
    await handle.settle();

    const siteAlertToggle = document.getElementById('seaf-site-alert-toggle');
    siteAlertToggle.checked = true;
    siteAlertToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.permissionRequests, [{ origins: OPTIONAL_SITE_ORIGINS }]);
    assert.equal(handle.fake.state.storageData.seaf_settings.isDetectionActive, true);
    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, true);
    assert.equal(siteAlertToggle.checked, true);
    assert.match(document.getElementById('seaf-permission-status').textContent, /\uAD8C\uD55C\uC744 \uD5C8\uC6A9/);
  } finally {
    handle.cleanup();
  }
});

test('popup leaves master settings off when optional site access is denied', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: false,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: false,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    },
    grantedOrigins: [],
    requestPermissions() {
      return false;
    }
  });

  try {
    await handle.settle();

    const masterToggle = document.getElementById('seaf-master-toggle');
    masterToggle.checked = true;
    masterToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.permissionRequests, [{ origins: OPTIONAL_SITE_ORIGINS }]);
    assert.equal(handle.fake.state.storageData.seaf_settings.isDetectionActive, false);
    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
    assert.equal(document.getElementById('seaf-master-toggle').checked, false);
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.match(document.getElementById('seaf-permission-status').textContent, /\uAD8C\uD55C\uC744 \uD5C8\uC6A9/);
  } finally {
    handle.cleanup();
  }
});

test('popup safely disables a stale browser alert setting when optional site access is missing', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    },
    grantedOrigins: []
  });

  try {
    await handle.settle();

    assert.deepEqual(handle.fake.state.permissionContainsChecks, [{ origins: OPTIONAL_SITE_ORIGINS }]);
    assert.equal(handle.fake.state.storageData.seaf_settings.isDetectionActive, true);
    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
    assert.equal(document.getElementById('seaf-detection-toggle').checked, true);
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.equal(document.getElementById('seaf-master-toggle').checked, false);
    assert.match(document.getElementById('seaf-permission-status').textContent, /\uAD8C\uD55C\uC744 \uC694\uCCAD/);
  } finally {
    handle.cleanup();
  }
});

test('popup does not claim optional site access was removed when the browser keeps it', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    },
    removePermissions() {
      return false;
    }
  });

  try {
    await handle.settle();

    const siteAlertToggle = document.getElementById('seaf-site-alert-toggle');
    siteAlertToggle.checked = false;
    siteAlertToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.isSiteAlertEnabled, false);
    assert.deepEqual(handle.fake.state.permissionRemovals, [{ origins: OPTIONAL_SITE_ORIGINS }]);
    assert.match(document.getElementById('seaf-permission-status').textContent, /\uBE0C\uB77C\uC6B0\uC800 \uC124\uC815/);
    assert.doesNotMatch(document.getElementById('seaf-permission-status').textContent, /\uAD8C\uD55C\uC744 \uD574\uC81C\uD588/);
  } finally {
    handle.cleanup();
  }
});

test('popup does not rewrite unread storage when background open routing responds with failure', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    },
    runtimeSendMessage(message) {
      if (message.type === 'OPEN_POST') {
        return { success: false, error: 'open failed after background routing' };
      }
    }
  });

  try {
    await handle.settle();
    const unreadWrites = [];
    const originalSet = handle.fake.chromeApi.storage.local.set.bind(handle.fake.chromeApi.storage.local);
    handle.fake.chromeApi.storage.local.set = async (values) => {
      if (Object.hasOwn(values, 'seaf_unread_post_ids')) {
        unreadWrites.push(values.seaf_unread_post_ids);
      }
      return originalSet(values);
    };

    document.querySelector('#seaf-post-list [data-action="open"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(unreadWrites, []);
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.deepEqual(handle.fake.state.createdTabs, [{
      url: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
    }]);
  } finally {
    handle.cleanup();
  }
});

test('popup opens a post without rewriting unread storage when the receiver is missing', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    },
    runtimeSendMessage(message) {
      if (message.type === 'OPEN_POST') {
        throw new Error('Receiving end does not exist');
      }
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="open"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.deepEqual(handle.fake.state.createdTabs, [{
      url: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
    }]);
  } finally {
    handle.cleanup();
  }
});

test('popup marks one post read only through the background message', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="dismiss"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'MARK_POST_READ'),
      [{ type: 'MARK_POST_READ', postId: 100 }]
    );
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.match(document.getElementById('seaf-save-status').textContent, /\uC77D\uC74C \uCC98\uB9AC/);
  } finally {
    handle.cleanup();
  }
});

for (const scenario of [
  {
    name: 'explicit failure',
    respond() {
      return { success: false, error: 'mark failed' };
    }
  },
  {
    name: 'missing receiver',
    respond() {
      throw new Error('Receiving end does not exist');
    }
  }
]) {
  test(`popup keeps a post unread when per-post mark-read has ${scenario.name}`, async () => {
    const handle = setupPopupTest({
      storageData: {
        seaf_unread_post_ids: [100]
      },
      runtimeSendMessage(message) {
        if (message.type === 'MARK_POST_READ') {
          return scenario.respond();
        }
      }
    });

    try {
      await handle.settle();
      const card = document.querySelector('#seaf-post-list .seaf-post-card');

      card.querySelector('[data-action="dismiss"]')
        .dispatchEvent(new window.Event('click', { bubbles: true }));
      await handle.settle();

      assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
      assert.equal(document.querySelector('#seaf-post-list .seaf-post-card'), card);
      assert.match(card.querySelector('.seaf-post-feedback').textContent, /\uC77D\uC74C \uCC98\uB9AC\uD558\uC9C0 \uBABB/);
    } finally {
      handle.cleanup();
    }
  });
}

test('popup shows a join failure reason and points to the existing open-post recovery', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    },
    runtimeSendMessage(message) {
      if (message.type === 'JOIN_POST') {
        return { success: false, error: '\uB85C\uBE44 \uB9C1\uD06C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.' };
      }
    }
  });

  try {
    await handle.settle();
    const card = document.querySelector('#seaf-post-list .seaf-post-card');

    card.querySelector('[data-action="join"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.match(card.querySelector('.seaf-post-feedback').textContent, /\uB85C\uBE44 \uB9C1\uD06C/);
    assert.match(card.querySelector('.seaf-post-feedback').textContent, /\uAC8C\uC2DC\uAE00 \uC5F4\uAE30/);
    assert.equal(card.querySelector('[data-action="open"]').disabled, false);
  } finally {
    handle.cleanup();
  }
});

test('popup keeps unread storage unchanged when background mark-all responds with failure', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    },
    runtimeSendMessage(message) {
      if (message.type === 'MARK_ALL_READ') {
        return { success: false, error: 'clear failed after background routing' };
      }
    }
  });

  try {
    await handle.settle();

    document.getElementById('seaf-mark-all-read-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.match(document.getElementById('seaf-save-status').textContent, /\uC815\uB9AC\uD558\uC9C0 \uBABB/);
    assert.equal(document.getElementById('seaf-mark-all-read-button').disabled, false);
  } finally {
    handle.cleanup();
    console.error = originalConsoleError;
  }
});

test('popup keeps unread storage unchanged when the mark-all receiver is missing', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_unread_post_ids: [100]
    },
    runtimeSendMessage(message) {
      if (message.type === 'MARK_ALL_READ') {
        throw new Error('Receiving end does not exist');
      }
    }
  });

  try {
    await handle.settle();

    document.getElementById('seaf-mark-all-read-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.match(document.getElementById('seaf-save-status').textContent, /\uC815\uB9AC\uD558\uC9C0 \uBABB/);
    assert.equal(document.getElementById('seaf-mark-all-read-button').disabled, false);
  } finally {
    handle.cleanup();
  }
});

test('popup uses manualRefresh only for explicit refresh clicks', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const liveRequests = handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'GET_LIVE_POSTS');
    assert.equal(liveRequests.length >= 1, true);
    assert.equal(liveRequests[0].manualRefresh, false);

    document.getElementById('seaf-refresh-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    const updatedLiveRequests = handle.fake.state.runtimeSentMessages
      .filter((message) => message.type === 'GET_LIVE_POSTS');
    assert.equal(updatedLiveRequests.at(-1).manualRefresh, true);
  } finally {
    handle.cleanup();
  }
});

test('popup clamps toast duration on save before persisting settings', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    }
  });

  try {
    await handle.settle();

    const toastDurationInput = document.getElementById('seaf-toast-duration-input');

    toastDurationInput.value = '99';
    toastDurationInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.toastDuration, 30);
    assert.equal(toastDurationInput.value, '30');

    toastDurationInput.value = '1';
    toastDurationInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.toastDuration, 3);
    assert.equal(toastDurationInput.value, '3');
  } finally {
    handle.cleanup();
  }
});

test('popup clamps recent history settings on save before persisting settings', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    }
  });

  try {
    await handle.settle();

    const historyLimitInput = document.getElementById('seaf-history-limit-input');
    const historyRetentionInput = document.getElementById('seaf-history-retention-input');

    historyLimitInput.value = '99';
    historyLimitInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.recentHistoryLimit, 30);
    assert.equal(historyLimitInput.value, '30');

    historyRetentionInput.value = '1';
    historyRetentionInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.recentHistoryRetentionMinutes, 5);
    assert.equal(historyRetentionInput.value, '5');
  } finally {
    handle.cleanup();
  }
});

test('popup clamps unread active window on save before persisting settings', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    }
  });

  try {
    await handle.settle();

    const unreadWindowInput = document.getElementById('seaf-unread-window-input');

    unreadWindowInput.value = '999';
    unreadWindowInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.unreadActiveWindowMinutes, 180);
    assert.equal(unreadWindowInput.value, '180');

    unreadWindowInput.value = '0';
    unreadWindowInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.unreadActiveWindowMinutes, 1);
    assert.equal(unreadWindowInput.value, '1');
  } finally {
    handle.cleanup();
  }
});

test('popup persists settings panel collapsed state', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    }
  });

  try {
    await handle.settle();

    const settingsToggleButton = document.getElementById('seaf-settings-toggle-button');
    const settingsBody = document.getElementById('seaf-settings-body');

    assert.equal(settingsBody.hidden, false);
    assert.equal(settingsToggleButton.textContent, '접기');

    settingsToggleButton.dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.equal(settingsBody.hidden, true);
    assert.equal(settingsToggleButton.textContent, '펼치기');
    assert.equal(window.localStorage.getItem('seaf_popup_settings_collapsed'), 'true');
  } finally {
    handle.cleanup();
  }
});

test('popup restores collapsed settings panel from localStorage', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.localStorage.setItem('seaf_popup_settings_collapsed', 'true');
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-settings-body').hidden, true);
    assert.equal(document.getElementById('seaf-settings-toggle-button').textContent, '펼치기');
  } finally {
    handle.cleanup();
  }
});

test('popup renders the ban manager as a separate section from settings', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const settingsBody = document.getElementById('seaf-settings-body');
    const authorBanPanel = document.getElementById('seaf-author-ban-panel');

    assert.equal(settingsBody.contains(authorBanPanel), false);
    assert.equal(document.getElementById('seaf-author-ban-title').textContent, '밴 목록');
    assert.equal(authorBanPanel.parentElement, document.querySelector('.seaf-main'));
  } finally {
    handle.cleanup();
  }
});

test('popup collapses only the ban roster and persists the state', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const toggleButton = document.getElementById('seaf-author-ban-list-toggle-button');
    const rosterBody = document.getElementById('seaf-author-ban-roster-body');
    const compose = document.querySelector('.seaf-author-ban-compose');

    assert.equal(rosterBody.hidden, false);
    assert.equal(toggleButton.textContent, '접기');

    toggleButton.dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.equal(rosterBody.hidden, true);
    assert.equal(toggleButton.textContent, '펼치기');
    assert.equal(toggleButton.getAttribute('aria-expanded'), 'false');
    assert.equal(compose.hidden, false);
    assert.equal(window.localStorage.getItem('seaf_popup_author_ban_list_collapsed'), 'true');
  } finally {
    handle.cleanup();
  }
});

test('popup restores the collapsed ban roster from localStorage', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.localStorage.setItem('seaf_popup_author_ban_list_collapsed', 'true');
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-author-ban-roster-body').hidden, true);
    assert.equal(document.getElementById('seaf-author-ban-list-toggle-button').textContent, '펼치기');
    assert.equal(document.querySelector('.seaf-author-ban-compose').hidden, false);
  } finally {
    handle.cleanup();
  }
});

test('popup preserves existing history collapse behavior', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.localStorage.setItem('seaf_popup_history_collapsed', 'true');
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-history-list').hidden, true);
    assert.equal(document.getElementById('seaf-history-toggle-button').textContent, '펼치기');
  } finally {
    handle.cleanup();
  }
});

test('popup renders zero unread while retained history still remains visible', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30,
        unreadActiveWindowMinutes: 15
      }
    },
    livePostsResponse: {
      success: true,
      unreadPosts: [],
      historyPosts: [
        {
          id: 101,
          title: '\uD788\uC2A4\uD1A0\uB9AC\uB9CC \uB0A8\uC740 \uBAA8\uC9D1',
          relativeTime: '\uBC29\uAE08',
          subject: '\uD5EC\uB9DD\uD638',
          postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=101'
        }
      ],
      unreadCount: 0,
      lastScanAt: Date.now(),
      source: 'fetch',
      worker: {
        mode: 'normal',
        message: '\uBE0C\uB77C\uC6B0\uC800 \uC624\uBC84\uB808\uC774\uC640 \uBC30\uC9C0\uAC00 \uC815\uC0C1 \uB3D9\uC791 \uC911\uC785\uB2C8\uB2E4.'
      }
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-unread-count').textContent, '0');
    assert.equal(document.getElementById('seaf-feed-count').textContent, '0');
    assert.equal(document.getElementById('seaf-history-count').textContent, '1');
    assert.equal(
      document.getElementById('seaf-post-list').textContent.includes('\uC9C0\uAE08 \uCC98\uB9AC\uD560 \uBAA8\uC9D1\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'),
      true
    );
    assert.equal(
      document.getElementById('seaf-history-list').textContent.includes('\uD788\uC2A4\uD1A0\uB9AC\uB9CC \uB0A8\uC740 \uBAA8\uC9D1'),
      true
    );
  } finally {
    handle.cleanup();
  }
});

test('popup keeps banned authors and author notes in separate independently collapsible sections', async () => {
  const banned = domain.createNicknameAuthorRecord('BannedUser', '주의', 'banned');
  const noted = domain.createNicknameAuthorRecord('NotedUser', '좋은 팀원', 'note');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: { authorRecords: [banned, noted] }
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '1개');
    assert.equal(document.getElementById('seaf-author-note-count').textContent, '1개');
    assert.match(document.getElementById('seaf-author-ban-list').textContent, /BannedUser/);
    assert.doesNotMatch(document.getElementById('seaf-author-ban-list').textContent, /NotedUser/);
    assert.match(document.getElementById('seaf-author-note-list').textContent, /NotedUser/);
    assert.doesNotMatch(document.getElementById('seaf-author-note-list').textContent, /BannedUser/);

    document.getElementById('seaf-author-note-list-toggle-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.equal(document.getElementById('seaf-author-note-roster-body').hidden, true);
    assert.equal(document.getElementById('seaf-author-ban-roster-body').hidden, false);
    assert.equal(window.localStorage.getItem('seaf_popup_author_note_list_collapsed'), 'true');
  } finally {
    handle.cleanup();
  }
});

test('popup requires a note for manual author-note creation and preserves rejected input', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const nicknameInput = document.getElementById('seaf-author-note-input');
    const noteInput = document.getElementById('seaf-author-note-note-input');
    nicknameInput.value = 'Alpha';
    document.getElementById('seaf-author-note-add-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle).length, 0);
    assert.equal(nicknameInput.value, 'Alpha');
    assert.match(document.getElementById('seaf-save-status').textContent, /메모를 입력/);

    const note = '<img data-author-note-injected="true"> 함께 플레이함';
    noteInput.value = note;
    noteInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => ({ key: record.key, status: record.status, note: record.note })),
      [{ key: 'nickname:Alpha', status: 'note', note }]
    );
    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '0개');
    assert.equal(document.getElementById('seaf-author-note-count').textContent, '1개');
    assert.equal(document.querySelector('[data-author-note-injected="true"]'), null);
  } finally {
    handle.cleanup();
  }
});

test('popup bulk-swaps only searched author notes and undo restores their status', async () => {
  const records = [
    domain.createNicknameAuthorRecord('Alpha', 'alpha', 'note'),
    domain.createNicknameAuthorRecord('Beta', 'beta', 'note'),
    domain.createNicknameAuthorRecord('Betamax', 'betamax', 'note'),
    domain.createNicknameAuthorRecord('Zeta', 'zeta', 'banned')
  ];
  const handle = setupPopupTest({
    storageData: { seaf_settings: { authorRecords: records } }
  });

  try {
    await handle.settle();

    const searchInput = document.getElementById('seaf-author-note-search-input');
    searchInput.value = 'beta';
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const selectVisible = document.getElementById('seaf-author-note-select-visible');
    selectVisible.checked = true;
    selectVisible.dispatchEvent(new window.Event('change', { bubbles: true }));
    document.getElementById('seaf-author-note-move-selected-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => [record.key, record.status]),
      [
        ['nickname:Alpha', 'note'],
        ['nickname:Beta', 'banned'],
        ['nickname:Betamax', 'banned'],
        ['nickname:Zeta', 'banned']
      ]
    );
    assert.equal(document.getElementById('seaf-author-note-search-input').value, 'beta');
    assert.equal(document.getElementById('seaf-author-ban-search-input').value, '');
    assert.equal(document.getElementById('seaf-author-record-undo').hidden, false);

    document.getElementById('seaf-author-record-undo-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => record.status),
      ['note', 'note', 'note', 'banned']
    );
  } finally {
    handle.cleanup();
  }
});

test('popup keeps unsaved note text and selection when a bulk status swap fails', async () => {
  const record = domain.createNicknameAuthorRecord('Alpha', 'saved note', 'note');
  const handle = setupPopupTest({
    storageData: { seaf_settings: { authorRecords: [record] } },
    runtimeSendMessage(message) {
      if (message.type === 'SET_AUTHOR_RECORD_STATUS') {
        return { success: false, errorCode: 'WRITE_FAILED', error: 'write failed' };
      }
      return undefined;
    }
  });

  try {
    await handle.settle();

    const checkbox = document.querySelector('#seaf-author-note-list .seaf-author-record-checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
    const noteInput = document.querySelector('#seaf-author-note-list .seaf-author-record-note-editor');
    noteInput.value = 'unsaved note text';
    noteInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('seaf-author-note-move-selected-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(noteInput.value, 'unsaved note text');
    assert.equal(document.querySelector('#seaf-author-note-list .seaf-author-record-checkbox').checked, true);
    assert.equal(getStoredAuthorRecords(handle)[0].status, 'note');
    assert.match(document.getElementById('seaf-save-status').textContent, /write failed/);
  } finally {
    handle.cleanup();
  }
});

test('popup quick note add and edit never enables banned-author join treatment', async () => {
  const prompts = ['첫 메모', '수정한 메모'];
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.prompt = () => prompts.shift();
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="author-note-add"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle)[0].status, 'note');
    assert.equal(getStoredAuthorRecords(handle)[0].note, '첫 메모');
    assert.equal(document.querySelector('#seaf-post-list [data-author-noted="true"]') !== null, true);
    assert.equal(document.querySelector('#seaf-post-list [data-author-banned="true"]'), null);
    assert.equal(document.querySelector('#seaf-post-list [data-action="join"]').textContent, '참가');

    document.querySelector('#seaf-post-list [data-action="author-note-edit"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle)[0].note, '수정한 메모');
    assert.equal(getStoredAuthorRecords(handle)[0].status, 'note');
  } finally {
    handle.cleanup();
  }
});

test('popup edits an author-note inline and deletes it without touching banned records', async () => {
  const noted = domain.createNicknameAuthorRecord('Alpha', 'old note', 'note');
  const banned = domain.createNicknameAuthorRecord('Bravo', 'keep banned', 'banned');
  const handle = setupPopupTest({
    storageData: { seaf_settings: { authorRecords: [noted, banned] } }
  });

  try {
    await handle.settle();

    const row = document.querySelector('#seaf-author-note-list .seaf-author-record-entry');
    const noteInput = row.querySelector('.seaf-author-record-note-editor');
    noteInput.value = '';
    noteInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    row.querySelector('.seaf-author-record-note-save')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    const savedNoteRecord = getStoredAuthorRecords(handle)
      .find((record) => record.key === noted.key);
    assert.equal(savedNoteRecord.status, 'note');
    assert.equal(Object.hasOwn(savedNoteRecord, 'note'), false);

    row.querySelector('.seaf-author-record-entry-actions .seaf-danger-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => [record.key, record.status, record.note]),
      [[banned.key, 'banned', 'keep banned']]
    );
    assert.equal(document.getElementById('seaf-author-note-count').textContent, '0개');
    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '1개');
  } finally {
    handle.cleanup();
  }
});

test('popup adds manual nickname author bans with Enter and blocks duplicates', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const input = document.getElementById('seaf-author-ban-input');
    const noteInput = document.getElementById('seaf-author-ban-note-input');
    input.value = '\uB9DD\uD638';
    noteInput.value = '  \uBC18\uBCF5   \uD3ED\uACA9 \uC720\uB3C4  ';
    noteInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle).length, 1);
    assert.equal(getStoredAuthorRecords(handle)[0].key, 'nickname:\uB9DD\uD638');
    assert.equal(getStoredAuthorRecords(handle)[0].note, '\uBC18\uBCF5 \uD3ED\uACA9 \uC720\uB3C4');
    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '1개');
    assert.equal(input.value, '');
    assert.equal(noteInput.value, '');

    input.value = '\uB9DD\uD638';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle).length, 1);
    assert.match(document.getElementById('seaf-save-status').textContent, /\uC774\uBBF8 \uB4F1\uB85D/);
  } finally {
    handle.cleanup();
  }
});

test('popup edits and searches author ban notes without rendering note HTML', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [
          domain.createNicknameAuthorBanEntry('Alpha'),
          domain.createNicknameAuthorBanEntry('Beta')
        ]
      }
    }
  });

  try {
    await handle.settle();

    const note = '<img data-author-ban-note-injected="true"> \uD3ED\uACA9 \uC720\uB3C4';
    const noteInput = document.querySelector('[data-author-ban-note-key="nickname:Alpha"]');
    noteInput.value = note;
    noteInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.match(noteInput.closest('.seaf-author-ban-entry').textContent, /\uC800\uC7A5\uB418\uC9C0 \uC54A\uC740 \uBCC0\uACBD/);
    noteInput.closest('.seaf-author-ban-entry').querySelector('.seaf-author-ban-note-save')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle)[0].note, note);
    assert.equal(document.querySelector('[data-author-ban-note-injected="true"]'), null);

    const searchInput = document.getElementById('seaf-author-ban-search-input');
    searchInput.value = '\uD3ED\uACA9 \uC720\uB3C4';
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    const visibleRows = [...document.querySelectorAll('.seaf-author-ban-entry')];
    assert.equal(visibleRows.length, 1);
    assert.match(visibleRows[0].textContent, /Alpha/);

    const visibleNoteInput = visibleRows[0].querySelector('.seaf-author-ban-note-editor');
    visibleNoteInput.value = '';
    visibleNoteInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    visibleRows[0].querySelector('.seaf-author-ban-note-save')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(
      Object.hasOwn(getStoredAuthorRecords(handle)[0], 'note'),
      false
    );
  } finally {
    handle.cleanup();
  }
});

test('popup confirms broad anonymous nickname before adding it', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.confirm = () => false;
    }
  });

  try {
    await handle.settle();

    const input = document.getElementById('seaf-author-ban-input');
    input.value = '\u3147\u3147';
    document.getElementById('seaf-author-ban-add-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle).length, 0);
    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '0개');
  } finally {
    handle.cleanup();
  }
});

test('popup filters, selects, and deletes searched author bans without touching unread or recent storage', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [
          domain.createNicknameAuthorBanEntry('Alpha'),
          domain.createNicknameAuthorBanEntry('Beta'),
          domain.createNicknameAuthorBanEntry('Betamax')
        ]
      },
      seaf_unread_post_ids: [100],
      seaf_recent_posts: [{ id: 99, title: 'keep', detectedAt: Date.now() }]
    }
  });

  try {
    await handle.settle();

    const searchInput = document.getElementById('seaf-author-ban-search-input');
    searchInput.value = 'beta';
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    const visibleRows = [...document.querySelectorAll('.seaf-author-ban-entry')];
    assert.equal(visibleRows.length, 2);
    assert.equal(document.getElementById('seaf-author-ban-select-visible').checked, false);

    const selectVisible = document.getElementById('seaf-author-ban-select-visible');
    selectVisible.checked = true;
    selectVisible.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    document.getElementById('seaf-author-ban-delete-selected-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((entry) => entry.key),
      ['nickname:Alpha']
    );
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [100]);
    assert.equal(handle.fake.state.storageData.seaf_recent_posts.length, 1);
    assert.equal(handle.fake.state.storageData.seaf_recent_posts[0].id, 99);
  } finally {
    handle.cleanup();
  }
});

test('popup renders an unmatched author-ban search query as text instead of HTML', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [domain.createNicknameAuthorBanEntry('Alpha')]
      }
    }
  });

  try {
    await handle.settle();

    const query = '<img data-author-ban-injected="true">';
    const searchInput = document.getElementById('seaf-author-ban-search-input');
    searchInput.value = query;
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    assert.equal(document.querySelector('[data-author-ban-injected="true"]'), null);
    assert.equal(document.querySelector('.seaf-author-ban-list .seaf-empty-card span').textContent, query);
  } finally {
    handle.cleanup();
  }
});

test('popup clears all author bans only after confirm', async () => {
  let confirmCalls = 0;
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [
          domain.createNicknameAuthorBanEntry('Alpha')
        ]
      }
    },
    beforeLoad(windowHandle) {
      windowHandle.confirm = () => {
        confirmCalls += 1;
        return confirmCalls > 1;
      };
    }
  });

  try {
    await handle.settle();

    const clearButton = document.getElementById('seaf-author-ban-clear-all-button');
    clearButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();
    assert.equal(getStoredAuthorRecords(handle).length, 1);

    clearButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();
    assert.deepEqual(getStoredAuthorRecords(handle), []);
  } finally {
    handle.cleanup();
  }
});

test('popup persists author ban mode selection', async () => {
  const handle = setupPopupTest();

  try {
    await handle.settle();

    const hideInput = document.getElementById('seaf-author-ban-mode-hide');
    hideInput.checked = true;
    hideInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.authorBanOverlayMode, 'hide');
    assert.equal(document.getElementById('seaf-author-ban-mode-hide').checked, true);
  } finally {
    handle.cleanup();
  }
});

test('popup quick ban and swap uses current author identity and preserves its note', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.prompt = () => '\uBE60\uB978 \uBC34 \uBA54\uBAA8';
    }
  });

  try {
    await handle.settle();

    const quickBanButton = document.querySelector('#seaf-post-list [data-action="author-ban"]');
    quickBanButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((entry) => entry.key),
      ['uid:user-100']
    );
    assert.equal(
      getStoredAuthorRecords(handle)[0].note,
      '\uBE60\uB978 \uBC34 \uBA54\uBAA8'
    );
    assert.equal(getStoredAuthorRecords(handle)[0].status, 'banned');
    assert.match(document.querySelector('#seaf-post-list').textContent, /\uBC34 \uAE00\uC4F4\uC774 \u00B7 \uACBD\uACE0/);
    assert.equal(document.querySelector('#seaf-post-list [data-action="author-record-swap"]').textContent, '메모로 전환');

    document.querySelector('#seaf-post-list [data-action="author-record-swap"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle)[0].status, 'note');
    assert.equal(getStoredAuthorRecords(handle)[0].note, '\uBE60\uB978 \uBC34 \uBA54\uBAA8');
    assert.equal(document.getElementById('seaf-author-note-count').textContent, '1개');
    assert.equal(document.getElementById('seaf-author-record-undo').hidden, false);
  } finally {
    handle.cleanup();
  }
});

test('popup quick swap atomically changes every matching record in the source status', async () => {
  const nickname = '\uD14C\uC2A4\uD2B8\uC720\uC800';
  const nicknameEntry = domain.createNicknameAuthorBanEntry(nickname, '\uB113\uC740 \uB2C9\uB124\uC784 \uBA54\uBAA8');
  const uidEntry = domain.createAuthorBanEntry({
    nickname,
    uid: 'user-100',
    displayName: `${nickname} (user-100)`
  }, '\uAD6C\uCCB4\uC801\uC778 UID \uBA54\uBAA8');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [nicknameEntry, uidEntry]
      }
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="author-record-swap"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => [record.key, record.status]),
      [
        [nicknameEntry.key, 'note'],
        [uidEntry.key, 'note']
      ]
    );
    assert.equal(document.getElementById('seaf-author-ban-count').textContent, '0개');
    assert.equal(document.getElementById('seaf-author-note-count').textContent, '2개');
    assert.equal(document.querySelector('#seaf-post-list [data-author-banned="true"]'), null);
  } finally {
    handle.cleanup();
  }
});

test('popup quick note edit targets the matching record that supplies the displayed note', async () => {
  const nickname = '\uD14C\uC2A4\uD2B8\uC720\uC800';
  const nicknameRecord = domain.createNicknameAuthorRecord(nickname, 'broad saved note', 'banned');
  const uidRecord = domain.createAuthorRecord({
    nickname,
    uid: 'user-100',
    displayName: `${nickname} (user-100)`
  }, '', 'banned');
  let promptInitial = null;
  const handle = setupPopupTest({
    storageData: { seaf_settings: { authorRecords: [nicknameRecord, uidRecord] } },
    beforeLoad(windowHandle) {
      windowHandle.prompt = (_message, initialValue) => {
        promptInitial = initialValue;
        return 'edited broad note';
      };
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="author-note-edit"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(promptInitial, 'broad saved note');
    assert.equal(
      getStoredAuthorRecords(handle).find((record) => record.key === nicknameRecord.key).note,
      'edited broad note'
    );
    assert.equal(
      Object.hasOwn(getStoredAuthorRecords(handle).find((record) => record.key === uidRecord.key), 'note'),
      false
    );
  } finally {
    handle.cleanup();
  }
});

test('popup keeps a broad banned reason ahead of a more specific general author note', async () => {
  const nickname = '\uD14C\uC2A4\uD2B8\uC720\uC800';
  const bannedNicknameRecord = domain.createNicknameAuthorRecord(
    nickname,
    '밴 사유: 반복적인 폭격 유도',
    'banned'
  );
  const generalUidRecord = domain.createAuthorRecord({
    nickname,
    uid: 'user-100',
    displayName: `${nickname} (user-100)`
  }, '일반 메모: 이전에 함께 플레이함', 'note');
  let promptInitial = null;
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorRecords: [generalUidRecord, bannedNicknameRecord],
        confirmBannedAuthorJoin: true
      }
    },
    beforeLoad(windowHandle) {
      windowHandle.prompt = (_message, initialValue) => {
        promptInitial = initialValue;
        return '수정된 밴 사유';
      };
    }
  });

  try {
    await handle.settle();

    const authorName = document.querySelector('#seaf-post-list .seaf-post-author');
    assert.equal(authorName.title, '밴 사유: 반복적인 폭격 유도');
    assert.doesNotMatch(authorName.title, /일반 메모/);

    document.querySelector('#seaf-post-list [data-action="join"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    const confirmPanel = document.querySelector('[data-confirm-kind="join"]');
    assert.match(confirmPanel.textContent, /밴 사유: 반복적인 폭격 유도/);
    assert.doesNotMatch(confirmPanel.textContent, /일반 메모/);
    confirmPanel.querySelector('[data-action="join-confirm-cancel"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));

    document.querySelector('#seaf-post-list [data-action="author-note-edit"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(promptInitial, '밴 사유: 반복적인 폭격 유도');
    assert.equal(
      getStoredAuthorRecords(handle).find((record) => record.key === bannedNicknameRecord.key).note,
      '수정된 밴 사유'
    );
    assert.equal(
      getStoredAuthorRecords(handle).find((record) => record.key === generalUidRecord.key).note,
      '일반 메모: 이전에 함께 플레이함'
    );
    assert.equal(document.querySelector('#seaf-post-list .seaf-post-author').title, '수정된 밴 사유');
  } finally {
    handle.cleanup();
  }
});

test('popup undo restores a quick author-record status swap', async () => {
  const nickname = '\uD14C\uC2A4\uD2B8\uC720\uC800';
  const nicknameEntry = domain.createNicknameAuthorBanEntry(nickname, 'broad note');
  const uidEntry = domain.createAuthorBanEntry({
    nickname,
    uid: 'user-100',
    displayName: `${nickname} (user-100)`
  }, 'specific note');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [nicknameEntry, uidEntry]
      }
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="author-record-swap"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(getStoredAuthorRecords(handle).map((record) => record.status), ['note', 'note']);
    document.getElementById('seaf-author-record-undo-button')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.deepEqual(
      getStoredAuthorRecords(handle).map((record) => [record.key, record.status]),
      [
        [nicknameEntry.key, 'banned'],
        [uidEntry.key, 'banned']
      ]
    );
    assert.equal(document.getElementById('seaf-author-record-undo').hidden, true);
  } finally {
    handle.cleanup();
  }
});

test('popup requires a second action before joining a banned author and shows the saved note', async () => {
  const entry = domain.createAuthorBanEntry({
    nickname: '\uD14C\uC2A4\uD2B8\uC720\uC800',
    uid: 'user-100',
    displayName: '\uD14C\uC2A4\uD2B8\uC720\uC800 (user-100)'
  }, '\uD3ED\uACA9 \uC720\uB3C4 \uC8FC\uC758');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [entry],
        confirmBannedAuthorJoin: true
      }
    }
  });

  try {
    await handle.settle();

    const joinButton = document.querySelector('#seaf-post-list [data-action="join"]');
    assert.equal(joinButton.textContent, '\uC8FC\uC758 \u00B7 \uCC38\uAC00');
    joinButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      0
    );
    const panel = document.querySelector('[data-confirm-kind="join"]');
    assert.match(panel.textContent, /\uD3ED\uACA9 \uC720\uB3C4 \uC8FC\uC758/);

    panel.querySelector('[data-action="join-confirm-cancel"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(document.querySelector('[data-confirm-kind="join"]'), null);

    joinButton.dispatchEvent(new window.Event('click', { bubbles: true }));
    document.querySelector('[data-action="join-confirm-continue"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      1
    );
  } finally {
    handle.cleanup();
  }
});

test('popup persists the banned-author join confirmation toggle through the settings writer', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        confirmBannedAuthorJoin: true
      }
    }
  });

  try {
    await handle.settle();

    const toggle = document.getElementById('seaf-author-ban-join-confirm-toggle');
    assert.equal(toggle.checked, true);
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
    await handle.settle();

    assert.equal(handle.fake.state.storageData.seaf_settings.confirmBannedAuthorJoin, false);
    assert.equal(
      handle.fake.state.runtimeSentMessages.some((message) => (
        message.type === 'UPDATE_SETTINGS_PATCH'
        && message.patch?.confirmBannedAuthorJoin === false
      )),
      true
    );
  } finally {
    handle.cleanup();
  }
});

test('popup joins a banned author directly when the extra confirmation setting is disabled', async () => {
  const entry = domain.createAuthorBanEntry({
    nickname: '\uD14C\uC2A4\uD2B8\uC720\uC800',
    uid: 'user-100',
    displayName: '\uD14C\uC2A4\uD2B8\uC720\uC800 (user-100)'
  }, 'direct join note');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [entry],
        confirmBannedAuthorJoin: false
      }
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="join"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(document.querySelector('[data-confirm-kind="join"]'), null);
    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      1
    );
  } finally {
    handle.cleanup();
  }
});

test('popup keeps an edited note visible when the background rejects the save', async () => {
  const entry = domain.createNicknameAuthorBanEntry('Alpha', 'old note');
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        authorBanEntries: [entry]
      }
    },
    runtimeSendMessage(message) {
      if (message.type === 'UPDATE_AUTHOR_RECORD_NOTE') {
        return { success: false, errorCode: 'WRITE_FAILED', error: 'write failed' };
      }
      return undefined;
    }
  });

  try {
    await handle.settle();

    const row = document.querySelector('.seaf-author-ban-entry');
    const noteInput = row.querySelector('.seaf-author-ban-note-editor');
    noteInput.value = 'new unsaved note';
    noteInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    row.querySelector('.seaf-author-ban-note-save')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(noteInput.value, 'new unsaved note');
    assert.equal(getStoredAuthorRecords(handle)[0].note, 'old note');
    assert.match(row.querySelector('.seaf-author-ban-note-status').textContent, /\uC800\uC7A5\uD558\uC9C0 \uBABB/);
  } finally {
    handle.cleanup();
  }
});

test('popup cancels a quick ban when the note prompt is cancelled', async () => {
  const handle = setupPopupTest({
    beforeLoad(windowHandle) {
      windowHandle.prompt = () => null;
    }
  });

  try {
    await handle.settle();

    document.querySelector('#seaf-post-list [data-action="author-ban"]')
      .dispatchEvent(new window.Event('click', { bubbles: true }));
    await handle.settle();

    assert.equal(getStoredAuthorRecords(handle).length, 0);
    assert.equal(document.querySelector('#seaf-post-list [data-action="author-ban"]').textContent, '밴 추가');
  } finally {
    handle.cleanup();
  }
});

test('popup does not render quick author-ban controls for authorless old posts', async () => {
  const handle = setupPopupTest({
    livePostsResponse: {
      success: true,
      unreadPosts: [
        {
          id: 102,
          title: '\uC61B \uAE00',
          relativeTime: '\uBC29\uAE08',
          subject: '\uD5EC\uB9DD\uD638',
          postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=102'
        }
      ],
      historyPosts: [],
      unreadCount: 1,
      lastScanAt: Date.now(),
      source: 'fetch',
      worker: {
        mode: 'normal',
        message: '\uBE0C\uB77C\uC6B0\uC800 \uC624\uBC84\uB808\uC774\uC640 \uBC30\uC9C0\uAC00 \uC815\uC0C1 \uB3D9\uC791 \uC911\uC785\uB2C8\uB2E4.'
      }
    }
  });

  try {
    await handle.settle();
    assert.equal(document.querySelector('#seaf-post-list [data-action="author-ban"]'), null);
    assert.equal(document.querySelector('#seaf-post-list [data-action="author-unban"]'), null);
  } finally {
    handle.cleanup();
  }
});
