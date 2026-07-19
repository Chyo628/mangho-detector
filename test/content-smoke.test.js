const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { createFakeChrome } = require('./helpers/fake-chrome');
const { installDom } = require('./helpers/dom-env');
const { buildListHtml, buildRow } = require('./helpers/build-list-html');

const MANGHO_SUBJECT = domain.constants.MANGHO_SUBJECTS[0];
const GENERAL_SUBJECT = '\uC77C\uBC18';
const TEST_TOAST_TITLE = '\uD14C\uC2A4\uD2B8 \uC624\uBC84\uB808\uC774\uC785\uB2C8\uB2E4.';

function addAuthorCell(rowHtml, author = {}) {
  const {
    nickname = '',
    uid = '',
    ip = '',
    displayName = ''
  } = author;

  return rowHtml.replace(
    '<td class="gall_date"',
    `<td class="gall_writer" data-nick="${nickname}" data-uid="${uid}" data-ip="${ip}">${displayName}</td><td class="gall_date"`
  );
}

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

function loadFreshJoinGuardModule() {
  const guardPath = require.resolve('../scripts/shared/seaf-join-guard.js');
  delete require.cache[guardPath];
  return require('../scripts/shared/seaf-join-guard.js');
}

function loadFreshContentModule() {
  const contentPath = require.resolve('../scripts/content.js');
  delete require.cache[contentPath];
  return require('../scripts/content.js');
}

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduledTimeouts = new Map();
  let currentTime = 0;
  let nextTimeoutId = 1;

  global.setTimeout = (callback, delay = 0, ...args) => {
    const timeoutId = nextTimeoutId;
    nextTimeoutId += 1;
    scheduledTimeouts.set(timeoutId, {
      callback,
      runAt: currentTime + Math.max(0, Number(delay) || 0),
      args
    });
    return timeoutId;
  };
  global.clearTimeout = (timeoutId) => {
    scheduledTimeouts.delete(timeoutId);
  };

  return {
    tick(duration) {
      const targetTime = currentTime + Math.max(0, Number(duration) || 0);

      while (true) {
        const nextEntry = [...scheduledTimeouts.entries()]
          .filter(([, timeout]) => timeout.runAt <= targetTime)
          .sort((left, right) => left[1].runAt - right[1].runAt || left[0] - right[0])[0];

        if (!nextEntry) {
          break;
        }

        const [timeoutId, timeout] = nextEntry;
        scheduledTimeouts.delete(timeoutId);
        currentTime = timeout.runAt;
        timeout.callback(...timeout.args);
      }

      currentTime = targetTime;
    },
    reset() {
      scheduledTimeouts.clear();
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

function trackStorageAccess(chromeApi) {
  const calls = {
    get: [],
    set: []
  };
  const originalGet = chromeApi.storage.local.get.bind(chromeApi.storage.local);
  const originalSet = chromeApi.storage.local.set.bind(chromeApi.storage.local);

  chromeApi.storage.local.get = async (keys) => {
    calls.get.push(keys);
    return originalGet(keys);
  };
  chromeApi.storage.local.set = async (values) => {
    calls.set.push(values);
    return originalSet(values);
  };

  return calls;
}

function setupContentTest({ html, url, storageData, runtimeSendMessage }) {
  const domHandle = installDom(html, url);
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const activeTimeouts = new Set();

  global.setTimeout = (callback, delay = 0, ...args) => {
    const timeoutId = originalSetTimeout(() => {
      activeTimeouts.delete(timeoutId);
      callback(...args);
    }, delay);
    activeTimeouts.add(timeoutId);
    return timeoutId;
  };
  global.clearTimeout = (timeoutId) => {
    activeTimeouts.delete(timeoutId);
    return originalClearTimeout(timeoutId);
  };

  const fake = createFakeChrome({
    storageData,
    runtimeSendMessage
  });

  // Each test gets an isolated namespace because a few characterization cases
  // replace domain functions to model legacy data without mutating the shared
  // CommonJS export used by later tests.
  global.SEAFDomain = { ...domain };
  global.chrome = fake.chromeApi;
  global.__SEAF_DISABLE_AUTO_INIT__ = true;

  loadFreshJoinGuardModule();
  loadFreshOverlayModule();
  const content = loadFreshContentModule();

  return {
    content,
    fake,
    cleanup() {
      content.state.observer?.disconnect();
      content.state.listBodyObserver?.disconnect();
      activeTimeouts.forEach((timeoutId) => originalClearTimeout(timeoutId));
      activeTimeouts.clear();
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      delete global.chrome;
      delete global.SEAFDomain;
      delete global.SEAFFetch;
      delete global.SEAFJoinGuard;
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

test('content direct fetch aborts after its timeout', async () => {
  const handle = setupContentTest({
    html: '<!doctype html><html><body></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries'
  });
  const timers = installFakeTimers();
  const originalFetch = global.fetch;
  let wasAborted = false;
  global.fetch = (url, options) => {
    options.signal.addEventListener('abort', () => {
      wasAborted = true;
    });
    return new Promise(() => {});
  };

  try {
    const pendingFetch = handle.content.fetchText('https://example.com/pending');
    timers.tick(10000);

    await assert.rejects(pendingFetch, /Request timed out\./);
    assert.equal(wasAborted, true);
  } finally {
    global.fetch = originalFetch;
    timers.reset();
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

test('content connects when the list tbody is created after initialization', async () => {
  const handle = setupContentTest({
    html: '<!doctype html><html><body><table class="gall_list"></table></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: false
      }
    }
  });

  try {
    await handle.content.init();

    assert.equal(handle.content.state.listBody, null);
    assert.ok(handle.content.state.listBodyObserver);

    const table = document.querySelector('.gall_list');
    table.insertAdjacentHTML(
      'beforeend',
      `<tbody class="listwrap2">${buildRow({
        id: 73,
        title: 'delayed list row',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(new Date(Date.now() - 20 * 60 * 1000))
      })}</tbody>`
    );

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(handle.content.state.listBody, document.querySelector('tbody.listwrap2'));
    assert.ok(handle.content.state.observer);
    assert.equal(document.querySelectorAll('.seaf-inline-join-button').length, 1);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 0);
  } finally {
    handle.cleanup();
  }
});

test('content disconnects the old observer and reconnects after the list tbody is replaced', async () => {
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 74, title: 'initial row', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 20 * 60 * 1000)) }
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

    const oldListBody = handle.content.state.listBody;
    const oldObserver = handle.content.state.observer;
    const replacementListBody = document.createElement('tbody');
    replacementListBody.className = 'listwrap2';
    replacementListBody.innerHTML = buildRow({
      id: 75,
      title: 'replacement row',
      subject: MANGHO_SUBJECT,
      fullDateStr: formatKstDate(new Date(Date.now() - 20 * 60 * 1000))
    });
    oldListBody.replaceWith(replacementListBody);

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(handle.content.state.listBody, replacementListBody);
    assert.notStrictEqual(handle.content.state.observer, oldObserver);
    assert.equal(replacementListBody.querySelectorAll('.seaf-inline-join-button').length, 1);

    oldListBody.insertAdjacentHTML('beforeend', buildRow({
      id: 76,
      title: 'detached old row',
      subject: MANGHO_SUBJECT,
      fullDateStr: formatKstDate(new Date(Date.now() - 2 * 60 * 1000))
    }));
    replacementListBody.insertAdjacentHTML('beforeend', buildRow({
      id: 77,
      title: 'new observed row',
      subject: MANGHO_SUBJECT,
      fullDateStr: formatKstDate(new Date(Date.now() - 2 * 60 * 1000))
    }));

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(oldListBody.querySelectorAll('.seaf-inline-join-button').length, 1);
    assert.equal(replacementListBody.querySelectorAll('.seaf-inline-join-button').length, 2);
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
      },
      seaf_unread_post_ids: [92]
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
  const timers = installFakeTimers();

  try {
    await handle.content.init();
    const storageCalls = trackStorageAccess(handle.fake.chromeApi);

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

    timers.tick(0);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 1);

    timers.tick(139);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 1);

    timers.tick(1);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 2);

    timers.tick(140);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 3);

    timers.tick(140);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast').length, 3);
    assert.deepEqual(
      [...document.querySelectorAll('.seaf-overlay-title')].map((title) => title.textContent),
      ['overlay 2', 'overlay 3', 'overlay 4']
    );

    const firstToast = document.querySelector('.seaf-overlay-toast');
    const actionButtons = firstToast.querySelectorAll('.seaf-overlay-button');
    assert.equal(actionButtons[0].textContent, '\uCC38\uAC00');
    assert.equal(actionButtons[1].textContent, '\uCDE8\uC18C');
    assert.equal(actionButtons[2].textContent, '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30');
    assert.equal(actionButtons[3].textContent, '\uB2EB\uAE30');

    actionButtons[2].click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'OPEN_POST');

    actionButtons[0].click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'JOIN_POST');
    assert.equal(storageCalls.get.length, 0);
    assert.equal(storageCalls.set.length, 0);
  } finally {
    timers.reset();
    handle.cleanup();
  }
});

test('shared overlay opens directly without mutating unread when background routing is unavailable', async () => {
  const postUrl = 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=101';
  const handle = setupContentTest({
    html: '<!doctype html><html><body></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_unread_post_ids: [101, 102]
    }
  });
  const storageCalls = trackStorageAccess(handle.fake.chromeApi);
  const originalOpen = global.open;
  const openedPages = [];
  global.open = (...args) => {
    openedPages.push(args);
  };

  try {
    const opened = await global.SEAFOverlay.getController().openPost(postUrl, 101);

    assert.equal(opened, true);
    assert.deepEqual(handle.fake.state.runtimeSentMessages, [{ type: 'OPEN_POST', postId: 101 }]);
    assert.equal(storageCalls.get.length, 0);
    assert.equal(storageCalls.set.length, 0);
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [101, 102]);
    assert.deepEqual(openedPages, [[postUrl, '_blank', 'noopener,noreferrer']]);
  } finally {
    if (typeof originalOpen === 'undefined') {
      delete global.open;
    } else {
      global.open = originalOpen;
    }
    handle.cleanup();
  }
});

test('shared overlay keeps a failed join unread without local storage writes', async () => {
  const handle = setupContentTest({
    html: '<!doctype html><html><body></body></html>',
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_unread_post_ids: [111]
    },
    runtimeSendMessage(message) {
      if (message.type === 'JOIN_POST') {
        return { success: false, error: 'join failed' };
      }

      throw new Error(`Unexpected runtime message: ${message.type}`);
    }
  });
  const storageCalls = trackStorageAccess(handle.fake.chromeApi);

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 111,
      title: 'failed join',
      toastDuration: 1000
    });
    const joinButton = toast.querySelector('.seaf-overlay-button[data-kind="primary"]');

    joinButton.click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'JOIN_POST');
    assert.equal(storageCalls.get.length, 0);
    assert.equal(storageCalls.set.length, 0);
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [111]);
    assert.equal(joinButton.disabled, false);
    assert.equal(joinButton.textContent, '\uB2E4\uC2DC \uC2DC\uB3C4');
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
  const timers = installFakeTimers();

  try {
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

    timers.tick(0);
    const toast = document.querySelector('.seaf-overlay-toast');
    assert.equal(toast.querySelector('.seaf-overlay-title').textContent, TEST_TOAST_TITLE);

    timers.tick(10);
    assert.equal(toast.classList.contains('seaf-visible'), true);

    timers.tick(6989);
    assert.equal(toast.classList.contains('seaf-visible'), true);

    timers.tick(1);
    assert.equal(toast.classList.contains('seaf-visible'), false);

    timers.tick(180);
    assert.equal(document.querySelector('.seaf-overlay-toast'), null);
  } finally {
    timers.reset();
    handle.cleanup();
  }
});

test('content merges legacy bans when canonical author records are present but empty', async () => {
  const bannedAuthor = {
    nickname: 'danger-user',
    uid: 'danger-uid',
    text: '위험 사용자'
  };
  const legacyBannedAuthor = { nickname: 'legacy-user', uid: 'legacy-uid', text: '기존 밴' };
  const note = '<img data-seaf-note-injected="true"> 반복 폭격 유도';
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 91, title: 'banned row', subject: MANGHO_SUBJECT, author: bannedAuthor },
      { id: 92, title: 'normal row', subject: MANGHO_SUBJECT, author: { nickname: 'normal-user', uid: 'normal-uid' } },
      { id: 94, title: 'legacy banned row', subject: MANGHO_SUBJECT, author: legacyBannedAuthor }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorRecords: [],
        authorBanEntries: [
          domain.createAuthorBanEntry(bannedAuthor, note),
          domain.createAuthorBanEntry(legacyBannedAuthor)
        ]
      }
    }
  });

  try {
    await handle.content.init();

    const bannedRow = document.querySelector('.ub-content[data-no="91"]');
    const bannedButton = bannedRow.querySelector('.seaf-inline-join-button');
    const tooltip = bannedRow.querySelector('.seaf-inline-ban-tooltip');
    const normalRow = document.querySelector('.ub-content[data-no="92"]');
    const normalButton = normalRow.querySelector('.seaf-inline-join-button');

    assert.equal(bannedButton.textContent, '주의 · 참가');
    assert.equal(bannedButton.classList.contains('seaf-inline-join-button--banned'), true);
    assert.equal(bannedButton.dataset.authorBanned, 'true');
    assert.equal(tooltip.getAttribute('role'), 'tooltip');
    assert.equal(tooltip.textContent, note);
    assert.equal(bannedButton.getAttribute('aria-describedby'), tooltip.id);
    assert.equal(document.querySelector('[data-seaf-note-injected="true"]'), null);

    assert.equal(normalButton.textContent, '참가');
    assert.equal(normalButton.classList.contains('seaf-inline-join-button--banned'), false);
    assert.equal(normalRow.querySelector('.seaf-inline-ban-tooltip'), null);

    assert.equal(
      document.querySelector('.ub-content[data-no="94"] .seaf-inline-ban-tooltip').textContent,
      '밴 목록에 있는 글쓴이입니다.'
    );
  } finally {
    handle.cleanup();
  }
});

test('content refreshes existing join-button warnings when the ban list changes', async () => {
  const author = { nickname: 'later-banned', uid: 'later-uid', text: '나중에 밴' };
  const banEntry = domain.createAuthorBanEntry(author, '설정 변경 메모');
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 93, title: 'settings update row', subject: MANGHO_SUBJECT, author }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorBanEntries: []
      }
    }
  });

  try {
    await handle.content.init();

    const row = document.querySelector('.ub-content[data-no="93"]');
    const button = row.querySelector('.seaf-inline-join-button');
    assert.equal(button.textContent, '참가');

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorBanEntries: [] },
        newValue: { authorBanEntries: [banEntry] }
      }
    });

    assert.equal(button.textContent, '주의 · 참가');
    assert.equal(row.querySelector('.seaf-inline-ban-tooltip').textContent, '설정 변경 메모');

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorBanEntries: [banEntry] },
        newValue: { authorBanEntries: [] }
      }
    });

    assert.equal(button.textContent, '참가');
    assert.equal(button.classList.contains('seaf-inline-join-button--banned'), false);
    assert.equal(button.hasAttribute('aria-describedby'), false);
    assert.equal(row.querySelector('.seaf-inline-ban-tooltip'), null);
  } finally {
    handle.cleanup();
  }
});

test('content renders note-only authors as safe blue information and joins immediately', async () => {
  const author = { nickname: 'memo-user', uid: 'memo-uid', text: 'memo author' };
  const note = '<img data-seaf-note-injected="true"> remember this author';
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 95,
      title: 'memo row',
      subject: MANGHO_SUBJECT,
      author
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorRecords: [domain.createAuthorRecord(author, note, 'note')],
        authorBanEntries: [domain.createAuthorBanEntry(author, 'stale legacy ban')]
      }
    },
    runtimeSendMessage(message) {
      if (message.type === 'JOIN_POST') {
        return { success: true, opened: true };
      }

      throw new Error(`Unexpected runtime message: ${message.type}`);
    }
  });

  try {
    await handle.content.init();

    const row = document.querySelector('.ub-content[data-no="95"]');
    const button = row.querySelector('.seaf-inline-join-button');
    const tooltip = row.querySelector('.seaf-inline-note-tooltip');

    assert.equal(button.textContent, '\uCC38\uAC00');
    assert.equal(button.classList.contains('seaf-inline-join-button--noted'), true);
    assert.equal(button.classList.contains('seaf-inline-join-button--banned'), false);
    assert.equal(button.dataset.authorStatus, 'note');
    assert.equal(button.dataset.authorBanned, 'false');
    assert.equal(button.dataset.authorNoted, 'true');
    assert.equal(tooltip.textContent, note);
    assert.equal(button.getAttribute('aria-describedby'), tooltip.id);
    assert.equal(row.querySelector('.seaf-inline-ban-tooltip'), null);
    assert.equal(document.querySelector('[data-seaf-note-injected="true"]'), null);

    button.click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      1
    );
    assert.equal(row.querySelector('.seaf-inline-join-confirm'), null);
  } finally {
    handle.cleanup();
  }
});

test('content refreshes existing buttons across none, note, banned, note, and none states', async () => {
  const author = { nickname: 'swap-user', uid: 'swap-uid', text: 'swap author' };
  const noteRecord = domain.createAuthorRecord(author, 'ordinary note', 'note');
  const bannedRecord = domain.createAuthorRecord(author, 'banned note', 'banned');
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 96,
      title: 'swap row',
      subject: MANGHO_SUBJECT,
      author
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorRecords: []
      }
    }
  });

  try {
    await handle.content.init();

    const row = document.querySelector('.ub-content[data-no="96"]');
    const button = row.querySelector('.seaf-inline-join-button');
    assert.equal(button.dataset.authorStatus, 'none');

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorRecords: [] },
        newValue: { authorRecords: [noteRecord] }
      }
    });
    assert.equal(button.dataset.authorStatus, 'note');
    assert.equal(button.classList.contains('seaf-inline-join-button--noted'), true);
    assert.equal(row.querySelector('.seaf-inline-note-tooltip').textContent, 'ordinary note');

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorRecords: [noteRecord] },
        newValue: { authorRecords: [bannedRecord] }
      }
    });
    assert.equal(button.dataset.authorStatus, 'banned');
    assert.equal(button.classList.contains('seaf-inline-join-button--banned'), true);
    assert.equal(button.classList.contains('seaf-inline-join-button--noted'), false);
    assert.equal(row.querySelector('.seaf-inline-ban-tooltip').textContent, 'banned note');

    button.click();
    assert.equal(row.querySelector('.seaf-inline-join-confirm').hidden, false);

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorRecords: [bannedRecord] },
        newValue: { authorRecords: [noteRecord] }
      }
    });
    assert.equal(button.dataset.authorStatus, 'note');
    assert.equal(row.querySelector('.seaf-inline-join-confirm'), null);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(row.querySelector('.seaf-inline-note-tooltip').textContent, 'ordinary note');

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: { authorRecords: [noteRecord] },
        newValue: { authorRecords: [] }
      }
    });
    assert.equal(button.dataset.authorStatus, 'none');
    assert.equal(button.classList.contains('seaf-inline-join-button--noted'), false);
    assert.equal(button.classList.contains('seaf-inline-join-button--banned'), false);
    assert.equal(row.querySelector('.seaf-inline-author-tooltip'), null);
  } finally {
    handle.cleanup();
  }
});

test('content keeps a broad ban reason when a more specific note-only record also matches', async () => {
  const author = { nickname: 'overlap-user', uid: 'overlap-uid', text: 'overlap author' };
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 97,
      title: 'overlap row',
      subject: MANGHO_SUBJECT,
      author
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorRecords: [
          domain.createAuthorRecord(author, 'specific ordinary note', 'note'),
          domain.createNicknameAuthorRecord(author.nickname, 'broad ban reason', 'banned')
        ]
      }
    }
  });

  try {
    await handle.content.init();

    const row = document.querySelector('.ub-content[data-no="97"]');
    const button = row.querySelector('.seaf-inline-join-button');
    assert.equal(button.dataset.authorStatus, 'banned');
    assert.equal(button.classList.contains('seaf-inline-join-button--banned'), true);
    assert.equal(button.classList.contains('seaf-inline-join-button--noted'), false);
    assert.equal(row.querySelector('.seaf-inline-note-tooltip'), null);
    assert.equal(row.querySelector('.seaf-inline-ban-tooltip').textContent, 'broad ban reason');

    button.click();
    assert.equal(row.querySelector('.seaf-inline-join-confirm-note').textContent, 'broad ban reason');

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 98,
      title: 'overlap overlay row',
      relativeTime: '\uBC29\uAE08',
      author,
      toastDuration: 1000
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const toast = document.querySelector('.seaf-overlay-toast[data-kind="live"]');
    assert.ok(toast);
    assert.equal(toast.classList.contains('seaf-banned-author'), true);
    assert.equal(toast.querySelector('.seaf-overlay-info'), null);
    assert.equal(toast.querySelector('.seaf-overlay-note').textContent, 'broad ban reason');
  } finally {
    handle.cleanup();
  }
});

test('content never reuses an ordinary author note as a missing ban reason', async () => {
  const author = { nickname: 'no-ban-note-user', uid: 'no-ban-note-uid', text: 'no ban note author' };
  const ordinaryNote = 'ordinary note must not become a ban warning';
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 99,
      title: 'missing ban note row',
      subject: MANGHO_SUBJECT,
      author
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorRecords: [
          domain.createAuthorRecord(author, ordinaryNote, 'note'),
          domain.createNicknameAuthorRecord(author.nickname, '', 'banned')
        ]
      }
    }
  });

  try {
    await handle.content.init();

    const row = document.querySelector('.ub-content[data-no="99"]');
    const button = row.querySelector('.seaf-inline-join-button');
    assert.equal(button.dataset.authorStatus, 'banned');
    assert.equal(
      row.querySelector('.seaf-inline-ban-tooltip').textContent,
      '\uBC34 \uBAA9\uB85D\uC5D0 \uC788\uB294 \uAE00\uC4F4\uC774\uC785\uB2C8\uB2E4.'
    );
    assert.doesNotMatch(row.textContent, /ordinary note must not become a ban warning/);

    button.click();
    assert.equal(
      row.querySelector('.seaf-inline-join-confirm-note').textContent,
      '\uBC34 \uBAA9\uB85D\uC5D0 \uC788\uB294 \uAE00\uC4F4\uC774\uC785\uB2C8\uB2E4.'
    );

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 100,
      title: 'missing ban note overlay',
      relativeTime: '\uBC29\uAE08',
      author,
      toastDuration: 1000
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const toast = document.querySelector('.seaf-overlay-toast[data-kind="live"]');
    assert.ok(toast);
    assert.equal(toast.classList.contains('seaf-banned-author'), true);
    assert.equal(toast.querySelector('.seaf-overlay-info'), null);
    assert.equal(toast.querySelector('.seaf-overlay-note'), null);
    assert.doesNotMatch(toast.textContent, /ordinary note must not become a ban warning/);
  } finally {
    handle.cleanup();
  }
});

test('content warns on banned authors from the DOM path and keeps general and authorless overlays normal', async () => {
  const now = new Date(Date.now() - 2 * 60 * 1000);
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 101, title: 'existing post', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 30 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10,
        authorBanEntries: ['fixed-user'],
        authorBanOverlayMode: 'warn'
      }
    }
  });

  try {
    global.SEAFDomain.normalizeAuthor = (author) => {
      const displayName = String(author?.displayName || '').trim();
      const nickname = String(author?.nickname || '').trim();
      const uid = String(author?.uid || '').trim();
      const ip = String(author?.ip || '').trim();
      const key = uid || nickname || ip || displayName;
      return key ? { nickname, uid, ip, displayName, key } : null;
    };
    global.SEAFDomain.normalizeAuthorBanEntries = (entries) => (
      Array.isArray(entries) ? entries.filter(Boolean) : []
    );
    global.SEAFDomain.normalizeAuthorBanOverlayMode = (mode) => (mode === 'hide' ? 'hide' : 'warn');
    global.SEAFDomain.isAuthorBanned = (author, entries) => Boolean(author?.key && entries.includes(author.key));

    await handle.content.init();

    const listBody = document.querySelector('tbody.listwrap2');
    listBody.insertAdjacentHTML(
      'beforeend',
      addAuthorCell(buildRow({
        id: 102,
        title: 'banned fixed user',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(now)
      }), {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: '고정닉'
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      addAuthorCell(buildRow({
        id: 103,
        title: 'floating user',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(now)
      }), {
        ip: '1.2',
        displayName: '유동'
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      buildRow({
        id: 104,
        title: 'authorless user',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(now)
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 600));

    const liveToasts = [...document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]')];
    assert.equal(liveToasts.length, 3);

    const bannedToast = liveToasts.find((toast) => /banned fixed user/.test(toast.textContent));
    assert.ok(bannedToast);
    assert.equal(bannedToast.classList.contains('seaf-banned-author'), true);
    assert.match(bannedToast.textContent, /밴 목록 글쓴이/);
    assert.match(bannedToast.textContent, /고정닉/);

    const floatingToast = liveToasts.find((toast) => /floating user/.test(toast.textContent));
    assert.ok(floatingToast);
    assert.equal(floatingToast.classList.contains('seaf-banned-author'), false);
    assert.match(floatingToast.textContent, /작성자/);
    assert.match(floatingToast.textContent, /유동/);

    const authorlessToast = liveToasts.find((toast) => /authorless user/.test(toast.textContent));
    assert.ok(authorlessToast);
    assert.equal(authorlessToast.querySelector('.seaf-overlay-author'), null);
  } finally {
    handle.cleanup();
  }
});

test('content hide mode suppresses future banned-author overlays while keeping join buttons and runtime/test overlays working', async () => {
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 111, title: 'existing post', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 30 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10,
        authorBanEntries: ['fixed-user'],
        authorBanOverlayMode: 'hide'
      }
    }
  });

  try {
    global.SEAFDomain.normalizeAuthor = (author) => {
      const displayName = String(author?.displayName || '').trim();
      const nickname = String(author?.nickname || '').trim();
      const uid = String(author?.uid || '').trim();
      const ip = String(author?.ip || '').trim();
      const key = uid || nickname || ip || displayName;
      return key ? { nickname, uid, ip, displayName, key } : null;
    };
    global.SEAFDomain.normalizeAuthorBanEntries = (entries) => (
      Array.isArray(entries) ? entries.filter(Boolean) : []
    );
    global.SEAFDomain.normalizeAuthorBanOverlayMode = (mode) => (mode === 'hide' ? 'hide' : 'warn');
    global.SEAFDomain.isAuthorBanned = (author, entries) => Boolean(author?.key && entries.includes(author.key));

    await handle.content.init();

    const listBody = document.querySelector('tbody.listwrap2');
    listBody.insertAdjacentHTML(
      'beforeend',
      addAuthorCell(buildRow({
        id: 112,
        title: 'hidden banned user',
        subject: MANGHO_SUBJECT,
        fullDateStr: formatKstDate(new Date(Date.now() - 2 * 60 * 1000))
      }), {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: '숨김 대상'
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(document.querySelectorAll('.seaf-inline-join-button').length, 2);
    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 0);

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 113,
      title: 'runtime hidden user',
      relativeTime: '\uBC29\uAE08',
      author: {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: '런타임 숨김'
      },
      toastDuration: 1000
    });

    assert.equal(document.querySelectorAll('.seaf-overlay-toast[data-kind="live"]').length, 0);

    handle.fake.emitStorageChange({
      seaf_settings: {
        oldValue: {
          isSiteAlertEnabled: true,
          toastDuration: 10,
          authorBanEntries: ['fixed-user'],
          authorBanOverlayMode: 'hide'
        },
        newValue: {
          isSiteAlertEnabled: true,
          toastDuration: 10,
          authorBanEntries: ['fixed-user'],
          authorBanOverlayMode: 'warn'
        }
      }
    });

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_NEW_POST',
      postId: 114,
      title: 'runtime warned user',
      relativeTime: '\uBC29\uAE08',
      author: {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: '런타임 경고'
      },
      toastDuration: 1000
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const warnedToast = document.querySelector('.seaf-overlay-toast[data-kind="live"]');
    assert.ok(warnedToast);
    assert.equal(warnedToast.classList.contains('seaf-banned-author'), true);
    assert.match(warnedToast.textContent, /런타임 경고/);

    await handle.fake.emitRuntimeMessage({
      type: 'SEAF_TEST_TOAST'
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const testToast = document.querySelector('.seaf-overlay-toast[data-kind="test"]');
    assert.ok(testToast);
    assert.equal(testToast.classList.contains('seaf-banned-author'), false);
    assert.equal(testToast.querySelector('.seaf-overlay-author'), null);
  } finally {
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

test('content surfaces later visible posts when hidden banned posts consume higher ids', async () => {
  const recentDate = formatKstDate(new Date(Date.now() - 2 * 60 * 1000));
  const handle = setupContentTest({
    html: buildListHtml([
      { id: 130, title: 'existing post', subject: MANGHO_SUBJECT, fullDateStr: formatKstDate(new Date(Date.now() - 30 * 60 * 1000)) }
    ]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        isSiteAlertEnabled: true,
        toastDuration: 10,
        authorBanEntries: ['fixed-user'],
        authorBanOverlayMode: 'hide'
      }
    }
  });

  try {
    global.SEAFDomain.normalizeAuthor = (author) => {
      const displayName = String(author?.displayName || '').trim();
      const nickname = String(author?.nickname || '').trim();
      const uid = String(author?.uid || '').trim();
      const ip = String(author?.ip || '').trim();
      const key = uid || nickname || ip || displayName;
      return key ? { nickname, uid, ip, displayName, key } : null;
    };
    global.SEAFDomain.normalizeAuthorBanEntries = (entries) => (
      Array.isArray(entries) ? entries.filter(Boolean) : []
    );
    global.SEAFDomain.normalizeAuthorBanOverlayMode = (mode) => (mode === 'hide' ? 'hide' : 'warn');
    global.SEAFDomain.isAuthorBanned = (author, entries) => Boolean(author?.key && entries.includes(author.key));

    await handle.content.init();

    const listBody = document.querySelector('tbody.listwrap2');
    listBody.insertAdjacentHTML(
      'beforeend',
      addAuthorCell(buildRow({
        id: 135,
        title: 'hidden banned newest',
        subject: MANGHO_SUBJECT,
        fullDateStr: recentDate
      }), {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: 'hidden one'
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      addAuthorCell(buildRow({
        id: 134,
        title: 'hidden banned next',
        subject: MANGHO_SUBJECT,
        fullDateStr: recentDate
      }), {
        nickname: 'fixed-user',
        uid: 'fixed-user',
        displayName: 'hidden two'
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      buildRow({
        id: 133,
        title: 'visible post one',
        subject: MANGHO_SUBJECT,
        fullDateStr: recentDate
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      buildRow({
        id: 132,
        title: 'visible post two',
        subject: MANGHO_SUBJECT,
        fullDateStr: recentDate
      })
    );
    listBody.insertAdjacentHTML(
      'beforeend',
      buildRow({
        id: 131,
        title: 'visible post three',
        subject: MANGHO_SUBJECT,
        fullDateStr: recentDate
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 800));

    const liveTitles = [...document.querySelectorAll('.seaf-overlay-toast[data-kind="live"] .seaf-overlay-title')]
      .map((node) => node.textContent);
    assert.deepEqual(liveTitles, [
      'visible post one',
      'visible post two',
      'visible post three'
    ]);
    assert.equal(handle.content.hasSurfacedPost(135), true);
    assert.equal(handle.content.hasSurfacedPost(134), true);
  } finally {
    handle.cleanup();
  }
});

test('content requires a second explicit step before joining banned authors and restores focus on cancel', async () => {
  const bannedAuthor = { nickname: 'guard-user', uid: 'guard-uid', text: 'guarded' };
  const banEntry = domain.createAuthorBanEntry(bannedAuthor, 'confirm note');
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 140,
      title: 'guarded row',
      subject: MANGHO_SUBJECT,
      fullDateStr: formatKstDate(new Date(Date.now() - 2 * 60 * 1000)),
      author: bannedAuthor
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorBanEntries: [banEntry],
        confirmBannedAuthorJoin: true
      }
    },
    runtimeSendMessage(message) {
      if (message.type === 'JOIN_POST') {
        return { success: true, opened: true };
      }

      throw new Error(`Unexpected runtime message: ${message.type}`);
    }
  });

  try {
    const row = document.querySelector('.ub-content[data-no="140"]');
    await handle.content.loadSettings();
    const parsedRow = handle.content.parseRow(row);
    handle.content.ensureJoinButton(row, parsedRow.titleLink, parsedRow.post.id, parsedRow.post.author);
    const button = row.querySelector('.seaf-inline-join-button');
    const wrapper = button.closest('.seaf-inline-join-wrap');
    delete wrapper.__seafJoinGuard;
    handle.content.updateInlineJoinButton(button, parsedRow.post.id, parsedRow.post.author);
    button.focus();
    const firstAttempt = handle.content.requestInlineJoin(
      wrapper,
      button,
      parsedRow.post.id,
      parsedRow.post.author
    );

    assert.equal(firstAttempt.action, 'confirm');
    assert.deepEqual(handle.fake.state.runtimeSentMessages, []);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(row.querySelector('.seaf-inline-join-confirm-note').textContent, 'confirm note');

    wrapper.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, button);

    const secondAttempt = handle.content.requestInlineJoin(
      wrapper,
      button,
      parsedRow.post.id,
      parsedRow.post.author
    );
    assert.equal(secondAttempt.action, 'confirm');
    await handle.content.executeInlineJoin(wrapper, button, parsedRow.post.id, parsedRow.post.author);

    assert.equal(handle.fake.state.runtimeSentMessages.length, 1);
    assert.equal(handle.fake.state.runtimeSentMessages[0].type, 'JOIN_POST');
  } finally {
    handle.cleanup();
  }
});

test('content repositions the banned-author tooltip when it would overflow the viewport', async () => {
  const bannedAuthor = { nickname: 'edge-user', uid: 'edge-uid', text: 'edge' };
  const recentDate = formatKstDate(new Date(Date.now() - 2 * 60 * 1000));
  const handle = setupContentTest({
    html: buildListHtml([{
      id: 141,
      title: 'edge row',
      subject: MANGHO_SUBJECT,
      fullDateStr: recentDate,
      author: bannedAuthor
    }]),
    url: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    storageData: {
      seaf_settings: {
        authorBanEntries: [domain.createAuthorBanEntry(bannedAuthor, 'edge note')]
      }
    }
  });

  try {
    await handle.content.loadSettings();
    const row = document.querySelector('.ub-content[data-no="141"]');
    const parsedRow = handle.content.parseRow(row);
    handle.content.ensureJoinButton(row, parsedRow.titleLink, parsedRow.post.id, parsedRow.post.author);
    const button = row.querySelector('.seaf-inline-join-button');
    const wrapper = button.closest('.seaf-inline-join-wrap');
    delete wrapper.__seafJoinGuard;
    handle.content.updateInlineJoinButton(button, parsedRow.post.id, parsedRow.post.author);
    const tooltip = wrapper.querySelector('.seaf-inline-ban-tooltip');
    tooltip.getBoundingClientRect = () => ({
      left: -12,
      right: 180,
      top: -4,
      bottom: 20,
      width: 192,
      height: 24
    });

    handle.content.updateInlineTooltipPlacement(wrapper);

    assert.equal(tooltip.classList.contains('seaf-inline-ban-tooltip--align-left'), true);
    assert.equal(tooltip.classList.contains('seaf-inline-ban-tooltip--below'), true);
  } finally {
    handle.cleanup();
  }
});
