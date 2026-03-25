const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createPopupCore } = require('../scripts/shared/seaf-popup-core.js');
const { createFakeChrome } = require('./helpers/fake-chrome');
const { installDom } = require('./helpers/dom-env');
const { loadHtml } = require('./helpers/load-html');

function loadFreshPopupModule() {
  const popupPath = require.resolve('../popup/popup.js');
  delete require.cache[popupPath];
  return require('../popup/popup.js');
}

function setupPopupTest({ storageData = {}, beforeLoad = null } = {}) {
  const domHandle = installDom(loadHtml('popup/popup.html'), 'https://example.com/popup.html');

  if (typeof beforeLoad === 'function') {
    beforeLoad(domHandle.dom.window);
  }

  const fake = createFakeChrome({
    storageData,
    manifest: { version: '1.2.3' },
    runtimeSendMessage(message, state) {
      if (message.type === 'GET_LIVE_POSTS') {
        return {
          success: true,
          unreadPosts: [
            {
              id: 100,
              title: '\uD14C\uC2A4\uD2B8 \uBAA8\uC9D1',
              relativeTime: '\uBC29\uAE08',
              subject: '\uD5EC\uB9DD\uD638',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
            }
          ],
          historyPosts: [
            {
              id: 100,
              title: '\uD14C\uC2A4\uD2B8 \uBAA8\uC9D1',
              relativeTime: '\uBC29\uAE08',
              subject: '\uD5EC\uB9DD\uD638',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
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

      if (message.type === 'OPEN_POST' || message.type === 'JOIN_POST' || message.type === 'MARK_ALL_READ') {
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

test('popup renders summary, unread feed, and saved settings', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 5,
        toastDuration: 12,
        isSiteAlertEnabled: false,
        recentHistoryLimit: 18,
        recentHistoryRetentionMinutes: 45
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
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.equal(document.getElementById('seaf-feed-count').textContent, '1');
    assert.equal(document.querySelector('.seaf-post-title').textContent, '테스트 모집');
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
        recentHistoryRetentionMinutes: 30
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
        recentHistoryRetentionMinutes: 30
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

test('popup persists settings panel collapsed state', async () => {
  const handle = setupPopupTest({
    storageData: {
      seaf_settings: {
        isDetectionActive: true,
        pollingInterval: 30,
        toastDuration: 10,
        isSiteAlertEnabled: true,
        recentHistoryLimit: 15,
        recentHistoryRetentionMinutes: 30
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
