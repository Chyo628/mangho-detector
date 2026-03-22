const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createFakeChrome } = require('./helpers/fake-chrome');
const { installDom } = require('./helpers/dom-env');
const { buildListHtml, buildRow } = require('./helpers/build-list-html');

const MANGHO_SUBJECT = domain.constants.MANGHO_SUBJECTS[0];
const GENERAL_SUBJECT = '\uC77C\uBC18';
const TEST_TOAST_TITLE = '\uD14C\uC2A4\uD2B8 \uC624\uBC84\uB808\uC774\uC785\uB2C8\uB2E4.';

function formatKstDate(date) {
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstDate.getUTCDate()).padStart(2, '0');
  const hour = String(kstDate.getUTCHours()).padStart(2, '0');
  const minute = String(kstDate.getUTCMinutes()).padStart(2, '0');
  const second = String(kstDate.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function loadFreshOverlayModule() {
  const overlayPath = require.resolve('../scripts/shared/seaf-overlay.js');
  delete require.cache[overlayPath];
  return require('../scripts/shared/seaf-overlay.js');
}

function loadFreshContentModule() {
  const contentPath = require.resolve('../scripts/content.js');
  delete require.cache[contentPath];
  return require('../scripts/content.js');
}

function setupContentTest({ html, url, storageData, runtimeSendMessage }) {
  const domHandle = installDom(html, url);
  const fake = createFakeChrome({
    storageData,
    runtimeSendMessage
  });

  global.SEAFDomain = domain;
  global.chrome = fake.chromeApi;
  global.__SEAF_DISABLE_AUTO_INIT__ = true;

  loadFreshOverlayModule();
  const content = loadFreshContentModule();

  return {
    content,
    fake,
    cleanup() {
      delete global.chrome;
      delete global.SEAFDomain;
      delete global.SEAFOverlay;
      delete global.__SEAF_DISABLE_AUTO_INIT__;
      domHandle.cleanup();
    }
  };
}

test('content init exits early on unsupported URLs', async () => {
  const handle = setupContentTest({
    html: '<!doctype html><html><body></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=othergallery'
  });

  try {
    await handle.content.init();
    assert.equal(handle.content.state.listBody, null);
    assert.equal(handle.content.state.observer, null);
  } finally {
    handle.cleanup();
  }
});

test('content init adds join buttons only to matching mangho rows without replaying existing overlays', async () => {
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 71, title: 'matching row', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 20 * 60 * 1000)) },
      { id: 72, title: 'general row', subject: GENERAL_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 20 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: false
      }
    }
  });

  try {
    await handle.content.init();
    assert.equal(document.querySelectorAll('.seaf-inline-join-button').length, 1);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 0);
    assert.equal(document.querySelector('.ub-content[data-no="71"]').hasAttribute('data-seaf-processed'), true);
    assert.equal(document.querySelector('.ub-content[data-no="72"]').hasAttribute('data-seaf-processed'), false);
  } finally {
    handle.cleanup();
  }
});

test('content observer processes added rows and dedupes repeated runtime overlays by post id', async () => {
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 81, title: 'existing post', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 30 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10
      }
    }
  });

  try {
    await handle.content.init();

    const listBody = document.querySelector('tbody.listwrap2');
    listBody.insertAdjacentHTML(
      'beforeend',
      buildRow({
        id: 82,
        title: 'new post',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(new Date(Date.now() - 2 * 60 * 1000))
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(document.querySelectorAll('.seaf-inline-join-button').length, 2);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 1);

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 82,
      title: 'new post',
      relativeTime: '\uBC29\uAE08',
      toastDuration: 1000
    });

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 82,
      title: 'new post',
      relativeTime: '\uBC29\uAE08',
      toastDuration: 1000
    });

    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 1);
  } finally {
    handle.cleanup();
  }
});

test('shared overlay supports join, open, and visible limit handling', async () => {
  const handle = setupContentTest({
    html: '<!doctype html><html><body></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10
      }
    },
    runtimeSendMessage(message) {
      if (message.type === 'JOIN_POST') {
        return {
          success: true,
          link: 'steam://joinlobby/553850/12345678901234567/76561198000000000',
          opened: true
        };
      }

      if (message.type === 'OPEN_POST') {
        return {
          success: true,
          postId: message.postId
        };
      }

      throw new Error(`Unexpected runtime message: ${message.type}`);
    }
  });

  try {
    await handle.content.init();

    global.SEAFOverlay.render({
      source: 'injected',
      sourceLabel: 'browser alert',
      posts: [
        { id: 91, title: 'overlay 1', relativeTime: '\uBC29\uAE08', postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=91' },
        { id: 92, title: 'overlay 2', relativeTime: '\uBC29\uAE08', postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=92' },
        { id: 93, title: 'overlay 3', relativeTime: '\uBC29\uAE08', postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=93' },
        { id: 94, title: 'overlay 4', relativeTime: '\uBC29\uAE08', postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=94' }
      ],
      toastDuration: 1000
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 3);

    const firstToast = document.querySelector('.seaf-overlay-toast');
    const actionButtons = firstToast.querySelectorAll('.seaf-overlay-button');
    assert.equal(actionButtons[0].textContent, '\uCC38\uAC00');
    assert.equal(actionButtons[1].textContent, '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30');
    assert.equal(actionButtons[2].textContent, '\uB2EB\uAE30');

    actionButtons[1].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'OPEN_POST');

    actionButtons[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'JOIN_POST');
  } finally {
    handle.cleanup();
  }
});

test('content updates toast duration from storage changes for future overlays', async () => {
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 91, title: 'previous post', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 40 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10
      }
    }
  });

  const originalSetTimeout = window.setTimeout;
  const recordedDelays = [];

  try {
    window.setTimeout = global.setTimeout = (callback, delay = 0) => {
      recordedDelays.push(delay);
      return 1;
    };

    await handle.content.init();

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { isSiteAlertEnabled: true, toastDuration: 10 },
        newValue: { isSiteAlertEnabled: true, toastDuration: 7 }
      }
    });

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_TEST_TOAST'
    });

    assert.ok(recordedDelays.includes(7000));
    assert.equal(document.querySelector('.seaf-overlay-title').textContent, TEST_TOAST_TITLE);
  } finally {
    window.setTimeout = originalSetTimeout;
    global.setTimeout = originalSetTimeout;
    handle.cleanup();
  }
});

test('content prunes surfaced post ids by age and capacity', async () => {
  const handle = setupContentTest({
    html: buildListHtml([]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries'
  });

  try {
    const now = Date.now();
    handle.content.markPostSurfaced(1, now - (21 * 60 * 1000));
    handle.content.markPostSurfaced(2, now);
    handle.content.pruneSurfacedPostIds(now);

    assert.equal(handle.content.hasSurfacedPost(1, now), false);
    assert.equal(handle.content.hasSurfacedPost(2, now), true);

    for (let index = 3; index <= 210; index += 1) {
      handle.content.markPostSurfaced(index, now + index);
    }

    assert.equal(handle.content.state.surfacedPostIds.size <= 200, true);
  } finally {
    handle.cleanup();
  }
});
