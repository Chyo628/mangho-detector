const test = require('node:test');
const assert = require('node:assert/strict');

const { createFakeChrome } = require('./helpers/fake-chrome');
const { installDom } = require('./helpers/dom-env');

function setupOverlayTest(runtimeSendMessage) {
  const domHandle = installDom(
    '<!doctype html><html><body></body></html>',
    'https://example.com/'
  );
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
    storageData: {
      seaf_unread_post_ids: [101]
    },
    runtimeSendMessage
  });
  const storageCalls = { get: 0, set: 0 };
  const originalGet = fake.chromeApi.storage.local.get.bind(fake.chromeApi.storage.local);
  const originalSet = fake.chromeApi.storage.local.set.bind(fake.chromeApi.storage.local);
  fake.chromeApi.storage.local.get = async (...args) => {
    storageCalls.get += 1;
    return originalGet(...args);
  };
  fake.chromeApi.storage.local.set = async (...args) => {
    storageCalls.set += 1;
    return originalSet(...args);
  };

  global.chrome = fake.chromeApi;
  const guardPath = require.resolve('../scripts/shared/seaf-join-guard.js');
  delete require.cache[guardPath];
  require('../scripts/shared/seaf-join-guard.js');
  const overlayPath = require.resolve('../scripts/shared/seaf-overlay.js');
  delete require.cache[overlayPath];
  require('../scripts/shared/seaf-overlay.js');

  return {
    fake,
    storageCalls,
    cleanup() {
      activeTimeouts.forEach((timeoutId) => originalClearTimeout(timeoutId));
      activeTimeouts.clear();
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
      delete global.chrome;
      delete global.SEAFJoinGuard;
      delete global.SEAFOverlay;
      domHandle.cleanup();
    }
  };
}

for (const scenario of [
  {
    name: 'explicit failure',
    respond() {
      return { success: false, error: 'open failed' };
    }
  },
  {
    name: 'missing receiver',
    respond() {
      throw new Error('Receiving end does not exist');
    }
  }
]) {
  test(`overlay direct-open fallback stays read-only after ${scenario.name}`, async () => {
    const postUrl = 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=101';
    const handle = setupOverlayTest((message) => {
      assert.equal(message.type, 'OPEN_POST');
      return scenario.respond();
    });
    const originalOpen = global.open;
    const openedPages = [];
    global.open = (...args) => {
      openedPages.push(args);
    };

    try {
      const opened = await global.SEAFOverlay.getController().openPost(postUrl, 101);

      assert.equal(opened, true);
      assert.equal(handle.storageCalls.get, 0);
      assert.equal(handle.storageCalls.set, 0);
      assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [101]);
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
}

test('overlay join failure keeps unread state and shows open-post recovery guidance', async () => {
  const handle = setupOverlayTest((message) => {
    assert.equal(message.type, 'JOIN_POST');
    return {
      success: false,
      error: '\uB85C\uBE44 \uB9C1\uD06C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'
    };
  });

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 101,
      postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=101',
      title: 'join failure',
      toastDuration: 1000
    });

    toast.querySelector('.seaf-overlay-button[data-kind="primary"]').click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(handle.storageCalls.get, 0);
    assert.equal(handle.storageCalls.set, 0);
    assert.deepEqual(handle.fake.state.storageData.seaf_unread_post_ids, [101]);
    assert.match(toast.querySelector('.seaf-overlay-feedback').textContent, /\uB85C\uBE44 \uB9C1\uD06C/);
    assert.match(toast.querySelector('.seaf-overlay-feedback').textContent, /\uAC8C\uC2DC\uAE00 \uC5F4\uAE30/);
  } finally {
    handle.cleanup();
  }
});

test('overlay renders banned-author warning styling and author block without affecting actions', async () => {
  const handle = setupOverlayTest(() => ({ success: true, opened: true }));

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 201,
      title: 'banned author toast',
      relativeTime: '\uBC29\uAE08',
      postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=201',
      author: {
        displayName: '경고 대상'
      },
      isBannedAuthor: true,
      toastDuration: 1000
    });

    assert.equal(toast.classList.contains('seaf-banned-author'), true);
    assert.match(toast.textContent, /밴 목록 글쓴이/);
    assert.match(toast.textContent, /경고 대상/);

    const buttons = toast.querySelectorAll('.seaf-overlay-button');
    assert.equal(buttons[0].textContent, '\uCC38\uAC00');
    assert.equal(buttons[1].textContent, '\uCDE8\uC18C');
    assert.equal(buttons[2].textContent, '\uAC8C\uC2DC\uAE00 \uC5F4\uAE30');
    assert.equal(buttons[3].textContent, '\uB2EB\uAE30');
  } finally {
    handle.cleanup();
  }
});

test('overlay omits author layout when author is missing on normal toasts', async () => {
  const handle = setupOverlayTest(() => ({ success: true, opened: true }));

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 202,
      title: 'authorless toast',
      relativeTime: '\uBC29\uAE08',
      toastDuration: 1000
    });

    assert.equal(toast.querySelector('.seaf-overlay-author'), null);
    assert.equal(toast.classList.contains('seaf-banned-author'), false);
  } finally {
    handle.cleanup();
  }
});

test('overlay renders explicit banned-author warning copy in a dedicated DOM node', async () => {
  const handle = setupOverlayTest(() => ({ success: true, opened: true }));

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 203,
      title: 'explicit banned warning',
      relativeTime: '\uBC29\uAE08',
      author: {
        displayName: 'warned author'
      },
      isBannedAuthor: true,
      toastDuration: 1000
    });

    const warning = toast.querySelector('.seaf-overlay-warning');
    assert.ok(warning);
    assert.equal(
      warning.textContent,
      '\uC774 \uAE00\uC4F4\uC774\uB294 \uBC34 \uBAA9\uB85D\uC5D0 \uC788\uC2B5\uB2C8\uB2E4. \uCC38\uAC00 \uC804 \uD655\uC778\uD558\uC138\uC694.'
    );
  } finally {
    handle.cleanup();
  }
});

test('overlay renders a note-only author as blue information and joins on the first click', async () => {
  const handle = setupOverlayTest((message) => {
    assert.equal(message.type, 'JOIN_POST');
    return { success: true, opened: true };
  });
  const note = '<img data-seaf-note-injected="true"> ordinary author note';

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 204,
      title: 'note-only author toast',
      relativeTime: '\uBC29\uAE08',
      author: {
        displayName: 'noted author'
      },
      authorNote: note,
      hasAuthorNote: true,
      isBannedAuthor: false,
      toastDuration: 1000
    });

    assert.equal(toast.classList.contains('seaf-noted-author'), true);
    assert.equal(toast.classList.contains('seaf-banned-author'), false);
    assert.equal(toast.querySelector('.seaf-overlay-warning'), null);
    assert.equal(toast.querySelector('.seaf-overlay-note'), null);
    assert.equal(toast.querySelector('.seaf-overlay-info-note').textContent, note);
    assert.equal(toast.querySelector('[data-seaf-note-injected="true"]'), null);

    const joinButton = toast.querySelector('.seaf-overlay-button[data-kind="primary"]');
    joinButton.click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      1
    );
    assert.equal(toast.dataset.confirmOpen, 'false');
  } finally {
    handle.cleanup();
  }
});

test('overlay gives banned styling and confirmation priority over a neutral author note', async () => {
  const handle = setupOverlayTest((message) => {
    if (message.type === 'JOIN_POST') {
      return { success: true, opened: true };
    }
    throw new Error(`Unexpected runtime message: ${message.type}`);
  });

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 205,
      title: 'banned noted author toast',
      relativeTime: '\uBC29\uAE08',
      author: {
        displayName: 'banned noted author'
      },
      authorNote: 'more specific ordinary note',
      authorBanNote: 'broad ban reason',
      hasAuthorNote: true,
      isBannedAuthor: true,
      confirmBannedAuthorJoin: true,
      toastDuration: 1000
    });

    assert.equal(toast.classList.contains('seaf-banned-author'), true);
    assert.equal(toast.classList.contains('seaf-noted-author'), false);
    assert.ok(toast.querySelector('.seaf-overlay-warning'));
    assert.equal(toast.querySelector('.seaf-overlay-info'), null);
    assert.equal(toast.querySelector('.seaf-overlay-note').textContent, 'broad ban reason');
    assert.doesNotMatch(toast.textContent, /more specific ordinary note/);

    toast.querySelector('.seaf-overlay-button[data-kind="primary"]').click();
    assert.equal(toast.dataset.confirmOpen, 'true');

    const noBanNoteToast = global.SEAFOverlay.showOverlay({
      postId: 206,
      title: 'banned author without ban note',
      author: {
        displayName: 'banned author with ordinary note only'
      },
      authorNote: 'ordinary note must stay neutral',
      authorBanNote: '',
      hasAuthorNote: true,
      isBannedAuthor: true,
      confirmBannedAuthorJoin: true,
      toastDuration: 1000
    });

    assert.ok(noBanNoteToast.querySelector('.seaf-overlay-warning'));
    assert.equal(noBanNoteToast.querySelector('.seaf-overlay-info'), null);
    assert.equal(noBanNoteToast.querySelector('.seaf-overlay-note'), null);
    assert.doesNotMatch(noBanNoteToast.textContent, /ordinary note must stay neutral/);
    noBanNoteToast.querySelector('.seaf-overlay-button[data-kind="primary"]').click();
    assert.equal(noBanNoteToast.dataset.confirmOpen, 'true');
    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      0
    );
  } finally {
    handle.cleanup();
  }
});

test('overlay requires explicit confirmation before joining a banned author and pauses auto-close while confirming', async () => {
  const handle = setupOverlayTest((message) => {
    if (message.type === 'OPEN_POST') {
      return { success: true };
    }
    if (message.type === 'JOIN_POST') {
      return { success: true, opened: true };
    }
    throw new Error(`Unexpected runtime message: ${message.type}`);
  });
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduledTimeouts = new Map();
  let currentTime = 0;
  let nextId = 1;

  global.setTimeout = (callback, delay = 0, ...args) => {
    const timeoutId = nextId;
    nextId += 1;
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

  function tick(duration) {
    const targetTime = currentTime + duration;

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
  }

  try {
    const toast = global.SEAFOverlay.showOverlay({
      postId: 301,
      title: 'guarded overlay toast',
      relativeTime: '\uBC29\uAE08',
      postUrl: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=301',
      author: {
        displayName: 'guarded author'
      },
      authorBanNote: 'overlay confirm note',
      isBannedAuthor: true,
      confirmBannedAuthorJoin: true,
      toastDuration: 1000
    });

    tick(10);
    const buttons = toast.querySelectorAll('.seaf-overlay-button');
    buttons[0].click();

    assert.deepEqual(handle.fake.state.runtimeSentMessages, []);
    assert.equal(toast.dataset.confirmOpen, 'true');
    assert.equal(toast.querySelector('.seaf-overlay-note').textContent, 'overlay confirm note');

    tick(2500);
    assert.notEqual(document.querySelector('.seaf-overlay-toast'), null);

    buttons[2].click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handle.fake.state.runtimeSentMessages.slice(-1)[0].type, 'OPEN_POST');

    buttons[1].click();
    assert.equal(toast.dataset.confirmOpen, 'false');

    buttons[0].click();
    buttons[0].click();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(
      handle.fake.state.runtimeSentMessages.filter((message) => message.type === 'JOIN_POST').length,
      1
    );
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    handle.cleanup();
  }
});
