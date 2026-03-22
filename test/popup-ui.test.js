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

function setupPopupTest(storageData = {}) {
  const domHandle = installDom(loadHtml('popup/popup.html'), 'https://example.com/popup.html');
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
              title: '새 모집',
              relativeTime: '방금',
              subject: '떡밥',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
            }
          ],
          historyPosts: [
            {
              id: 100,
              title: '새 모집',
              relativeTime: '방금',
              subject: '떡밥',
              postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=100'
            }
          ],
          unreadCount: 1,
          lastScanAt: Date.now(),
          source: 'fetch',
          worker: {
            mode: 'normal',
            message: '브라우저 오버레이와 배지가 정상 동작 중입니다.'
          }
        };
      }

      if (message.type === 'SETTINGS_UPDATED' || message.type === 'TEST_ACTIVE_TAB_TOAST') {
        return {
          success: true,
          worker: {
            mode: 'normal',
            message: '브라우저 오버레이와 배지가 정상 동작 중입니다.'
          },
          settings: state.storageData.seaf_settings
        };
      }

      if (message.type === 'OPEN_POST' || message.type === 'JOIN_POST') {
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
    seaf_settings: {
      isDetectionActive: true,
      pollingInterval: 5,
      toastDuration: 12,
      isSiteAlertEnabled: false
    }
  });

  try {
    await handle.settle();

    assert.equal(document.getElementById('seaf-version-display').textContent, 'v1.2.3');
    assert.equal(document.querySelector('.seaf-brand-title').textContent, 'MANGHO Detector');
    assert.equal(document.getElementById('seaf-polling-interval-value').textContent, '30초 고정');
    assert.equal(document.getElementById('seaf-toast-duration-input').value, '12');
    assert.equal(document.getElementById('seaf-site-alert-toggle').checked, false);
    assert.equal(document.getElementById('seaf-feed-count').textContent, '1');
    assert.equal(document.querySelector('.seaf-post-title').textContent, '새 모집');
  } finally {
    handle.cleanup();
  }
});

test('popup clamps toast duration on save before persisting settings', async () => {
  const handle = setupPopupTest({
    seaf_settings: {
      isDetectionActive: true,
      pollingInterval: 30,
      toastDuration: 10,
      isSiteAlertEnabled: true
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
