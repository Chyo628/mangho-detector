importScripts(
  './shared/seaf-domain.js',
  './shared/seaf-fetch.js',
  './shared/seaf-permissions.js',
  './shared/seaf-background-core.js',
  './shared/seaf-background-messages.js'
);

const fetchRuntime = globalThis.SEAFFetch.createFetchRuntime({
  fetchImpl: fetch
});

const permissionsRuntime = globalThis.SEAFPermissions.createPermissionsRuntime({
  permissionsApi: chrome.permissions
});

const backgroundCore = globalThis.SEAFBackgroundCore.createBackgroundCore({
  chromeApi: chrome,
  logger: console,
  domain: globalThis.SEAFDomain,
  fetchRuntime,
  permissionsRuntime
});
const backgroundMessages = globalThis.SEAFBackgroundMessages.createMessageRouter({
  backgroundCore,
  logger: console
});

chrome.runtime.onInstalled.addListener(() => {
  backgroundCore.initializeExtension().catch((error) => {
    console.error('[SEAF] install init failed:', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  backgroundCore.initializeExtension().catch((error) => {
    console.error('[SEAF] startup init failed:', error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  backgroundCore.handleStorageChanged(changes, areaName);
});

if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener((permissions) => {
    backgroundCore.handleOptionalPermissionsRemoved(permissions).catch((error) => {
      console.error('[SEAF] optional permission removal sync failed:', error);
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== backgroundCore.ALARM_NAME) {
    return;
  }

  backgroundCore.performDetection().catch((error) => {
    console.error('[SEAF] detection failed:', error);
  });
});

chrome.runtime.onMessage.addListener(backgroundMessages.handleMessage);
