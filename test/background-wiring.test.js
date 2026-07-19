const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const backgroundMessages = require('../scripts/shared/seaf-background-messages.js');

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function loadBackground(overrides = {}) {
  const events = {
    installed: createEvent(),
    startup: createEvent(),
    storageChanged: createEvent(),
    alarm: createEvent(),
    message: createEvent(),
    permissionsRemoved: createEvent()
  };
  const calls = {
    importScripts: [],
    fetchRuntimeConfigs: [],
    permissionsRuntimeConfigs: [],
    permissionRemovals: [],
    markedPostIds: [],
    badgeSyncs: 0,
    settingsPatches: [],
    addedAuthorRecords: [],
    updatedAuthorRecordNotes: [],
    authorRecordStatusChanges: [],
    removedAuthorRecordKeys: [],
    addedAuthorBans: [],
    updatedAuthorBanNotes: [],
    removedAuthorBanKeys: []
  };
  const core = {
    ALARM_NAME: 'SEAF_DETECTION',
    DEFAULT_SETTINGS: {},
    async initializeExtension() {},
    async getSettings() { return { success: true, settings: { toastDuration: 10 } }; },
    handleStorageChanged() {},
    async performDetection() {},
    async handleSettingsUpdated() { return { success: true }; },
    async updateSettingsPatch(patch) {
      calls.settingsPatches.push(patch);
      return { success: true, settings: { ...patch } };
    },
    async addAuthorRecord(payload) {
      calls.addedAuthorRecords.push(payload);
      return { success: true, settings: { authorRecords: [] } };
    },
    async updateAuthorRecordNote(key, note) {
      calls.updatedAuthorRecordNotes.push({ key, note });
      return { success: true, settings: { authorRecords: [] } };
    },
    async setAuthorRecordStatus(keys, status) {
      calls.authorRecordStatusChanges.push({ keys, status });
      return { success: true, settings: { authorRecords: [] } };
    },
    async removeAuthorRecordKeys(keys) {
      calls.removedAuthorRecordKeys.push(keys);
      return { success: true, settings: { authorRecords: [] } };
    },
    async addAuthorBan(payload) {
      calls.addedAuthorBans.push(payload);
      return { success: true, settings: { authorBanEntries: [] } };
    },
    async updateAuthorBanNote(key, note) {
      calls.updatedAuthorBanNotes.push({ key, note });
      return { success: true, settings: { authorBanEntries: [] } };
    },
    async removeAuthorBanKeys(keys) {
      calls.removedAuthorBanKeys.push(keys);
      return { success: true, settings: { authorBanEntries: [] } };
    },
    async getPopupPosts() { return { success: true }; },
    async openPost() { return { success: true }; },
    async joinPost() { return { success: true }; },
    async markAllRead() { return { success: true }; },
    async handleTestActiveTabToast() { return { success: true }; },
    async handleOptionalPermissionsRemoved(permissions) {
      calls.permissionRemovals.push(permissions);
      return { success: true };
    },
    async markPostRead(postId) {
      calls.markedPostIds.push(postId);
      return { success: true, unreadIds: [12, 11] };
    },
    async syncBadge() {
      calls.badgeSyncs += 1;
    },
    async ensureSettings() { return {}; },
    buildWorkerStatus() { return {}; },
    getErrorMessage(error) { return String(error?.message || error); },
    ...overrides
  };
  const chrome = {
    runtime: {
      onInstalled: events.installed,
      onStartup: events.startup,
      onMessage: events.message
    },
    storage: { onChanged: events.storageChanged },
    alarms: { onAlarm: events.alarm },
    permissions: { onRemoved: events.permissionsRemoved }
  };
  const context = vm.createContext({
    chrome,
    fetch: async () => ({ ok: true, text: async () => '' }),
    importScripts(...args) {
      calls.importScripts.push(args);
    },
    console: { log() {}, warn() {}, error() {} },
    SEAFDomain: {},
    SEAFFetch: {
      createFetchRuntime(config) {
        calls.fetchRuntimeConfigs.push(config);
        return { fetchText: async () => '' };
      }
    },
    SEAFPermissions: {
      createPermissionsRuntime(config) {
        calls.permissionsRuntimeConfigs.push(config);
        return { origins: ['http://*/*', 'https://*/*'] };
      }
    },
    SEAFBackgroundCore: {
      createBackgroundCore(config) {
        calls.backgroundCoreConfig = config;
        return core;
      }
    },
    SEAFBackgroundMessages: {
      createMessageRouter(config) {
        calls.messageRouterConfig = config;
        return backgroundMessages.createMessageRouter(config);
      }
    }
  });
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'background.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'scripts/background.js' });

  return { calls, core, events };
}

function sendMessage(listener, message, sender = {}) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = listener(message, sender, resolve);
    if (keepChannelOpen !== true) {
      reject(new Error(`message channel was not kept open for ${message.type}`));
    }
  });
}

test('background wires optional permission removal into the core', async () => {
  const handle = loadBackground();
  const removed = { origins: ['http://*/*', 'https://*/*'] };

  assert.equal(handle.events.permissionsRemoved.listeners.length, 1);
  handle.events.permissionsRemoved.listeners[0](removed);
  await Promise.resolve();

  assert.deepEqual(handle.calls.permissionRemovals, [removed]);
});

test('background loads shared runtimes in the expected order and injects them into the core', () => {
  const handle = loadBackground();

  assert.deepEqual(handle.calls.importScripts, [[
    './shared/seaf-domain.js',
    './shared/seaf-fetch.js',
    './shared/seaf-permissions.js',
    './shared/seaf-background-core.js',
    './shared/seaf-background-messages.js'
  ]]);
  assert.equal(handle.calls.fetchRuntimeConfigs.length, 1);
  assert.equal(handle.calls.permissionsRuntimeConfigs.length, 1);
  assert.equal(typeof handle.calls.backgroundCoreConfig.fetchRuntime.fetchText, 'function');
  assert.deepEqual(handle.calls.backgroundCoreConfig.permissionsRuntime.origins, ['http://*/*', 'https://*/*']);
  assert.equal(handle.calls.messageRouterConfig.backgroundCore, handle.core);
});

test('MARK_POST_READ routes through the background writer and refreshes the badge', async () => {
  const handle = loadBackground();
  const listener = handle.events.message.listeners[0];

  const response = await sendMessage(listener, { type: 'MARK_POST_READ', postId: 13 });

  assert.deepEqual(handle.calls.markedPostIds, [13]);
  assert.equal(handle.calls.badgeSyncs, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    success: true,
    unreadCount: 2,
    unreadPostIds: [12, 11]
  });
});

test('MARK_POST_READ stays successful after storage commits even when badge synchronization fails', async () => {
  const handle = loadBackground({
    async syncBadge() {
      throw new Error('badge failed');
    }
  });
  const listener = handle.events.message.listeners[0];

  const response = await sendMessage(listener, { type: 'MARK_POST_READ', postId: 13 });

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    success: true,
    unreadCount: 2,
    unreadPostIds: [12, 11]
  });
});

test('legacy GET_LOBBY_LINK is no longer an active background message', () => {
  const handle = loadBackground();
  const listener = handle.events.message.listeners[0];

  assert.equal(listener({ type: 'GET_LOBBY_LINK', postId: 13 }, {}, () => {}), false);
});

test('GET_SETTINGS routes to the background settings reader', async () => {
  const handle = loadBackground();
  const listener = handle.events.message.listeners[0];

  const response = await sendMessage(listener, { type: 'GET_SETTINGS' });

  assert.deepEqual(JSON.parse(JSON.stringify(response)), {
    success: true,
    settings: { toastDuration: 10 }
  });
});

test('author record and settings patch messages route through the core helpers', async () => {
  const handle = loadBackground();
  const listener = handle.events.message.listeners[0];

  await sendMessage(listener, {
    type: 'UPDATE_SETTINGS_PATCH',
    patch: { toastDuration: 12, confirmBannedAuthorJoin: false }
  });
  await sendMessage(listener, {
    type: 'ADD_AUTHOR_RECORD',
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    note: 'watch',
    status: 'note'
  });
  await sendMessage(listener, {
    type: 'UPDATE_AUTHOR_RECORD_NOTE',
    key: 'uid:fixed123',
    note: 'updated'
  });
  await sendMessage(listener, {
    type: 'SET_AUTHOR_RECORD_STATUS',
    keys: ['uid:fixed123'],
    status: 'banned'
  });
  await sendMessage(listener, {
    type: 'REMOVE_AUTHOR_RECORD_KEYS',
    keys: ['uid:fixed123']
  });

  assert.deepEqual(handle.calls.settingsPatches, [
    { toastDuration: 12, confirmBannedAuthorJoin: false }
  ]);
  assert.deepEqual(handle.calls.addedAuthorRecords, [{
    type: 'ADD_AUTHOR_RECORD',
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    note: 'watch',
    status: 'note'
  }]);
  assert.deepEqual(handle.calls.updatedAuthorRecordNotes, [{
    key: 'uid:fixed123',
    note: 'updated'
  }]);
  assert.deepEqual(handle.calls.authorRecordStatusChanges, [{
    keys: ['uid:fixed123'],
    status: 'banned'
  }]);
  assert.deepEqual(handle.calls.removedAuthorRecordKeys, [['uid:fixed123']]);
});

test('legacy author ban messages remain routed through compatibility helpers', async () => {
  const handle = loadBackground();
  const listener = handle.events.message.listeners[0];

  await sendMessage(listener, {
    type: 'ADD_AUTHOR_BAN',
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    note: 'watch'
  });
  await sendMessage(listener, {
    type: 'UPDATE_AUTHOR_BAN_NOTE',
    key: 'uid:fixed123',
    note: 'updated'
  });
  await sendMessage(listener, {
    type: 'REMOVE_AUTHOR_BAN_KEYS',
    keys: ['uid:fixed123']
  });

  assert.deepEqual(handle.calls.addedAuthorBans, [{
    type: 'ADD_AUTHOR_BAN',
    author: { nickname: 'alpha', uid: 'fixed123', ip: '' },
    note: 'watch'
  }]);
  assert.deepEqual(handle.calls.updatedAuthorBanNotes, [{
    key: 'uid:fixed123',
    note: 'updated'
  }]);
  assert.deepEqual(handle.calls.removedAuthorBanKeys, [['uid:fixed123']]);
});
