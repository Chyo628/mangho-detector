importScripts('./shared/seaf-domain.js', './shared/seaf-background-core.js');

const backgroundCore = globalThis.SEAFBackgroundCore.createBackgroundCore({
  chromeApi: chrome,
  fetchImpl: fetch,
  logger: console,
  domain: globalThis.SEAFDomain
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== backgroundCore.ALARM_NAME) {
    return;
  }

  backgroundCore.performDetection().catch((error) => {
    console.error('[SEAF] detection failed:', error);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SETTINGS_UPDATED') {
    backgroundCore.handleSettingsUpdated().then(sendResponse, (error) => {
      console.error('[SEAF] settings update failed:', error);
      sendResponse({ success: false, error: backgroundCore.getErrorMessage(error) });
    });
    return true;
  }

  if (request.type === 'GET_LOBBY_LINK') {
    backgroundCore.extractLobbyLink(request.postId).then(
      (link) => sendResponse({ success: true, link }),
      (error) => {
        console.error('[SEAF] lobby link fetch failed:', error);
        sendResponse({
          success: false,
          link: null,
          error: backgroundCore.getErrorMessage(error)
        });
      }
    );
    return true;
  }

  if (request.type === 'GET_LIVE_POSTS') {
    backgroundCore.getPopupPosts({
      recordScan: Boolean(request.manualRefresh)
    }).then(sendResponse, async (error) => {
      console.error('[SEAF] live posts fetch failed:', error);
      const settings = await backgroundCore.ensureSettings().catch(() => backgroundCore.DEFAULT_SETTINGS);
      sendResponse({
        success: false,
        posts: [],
        unreadPosts: [],
        historyPosts: [],
        unreadCount: 0,
        lastScanAt: null,
        error: backgroundCore.getErrorMessage(error),
        worker: backgroundCore.buildWorkerStatus(settings)
      });
    });
    return true;
  }

  if (request.type === 'OPEN_POST') {
    backgroundCore.openPost(request.postId).then(sendResponse, (error) => {
      console.error('[SEAF] open post failed:', error);
      sendResponse({ success: false, error: backgroundCore.getErrorMessage(error) });
    });
    return true;
  }

  if (request.type === 'JOIN_POST') {
    backgroundCore.joinPost(request.postId, sender).then(sendResponse, (error) => {
      console.error('[SEAF] join failed:', error);
      sendResponse({ success: false, error: backgroundCore.getErrorMessage(error) });
    });
    return true;
  }

  if (request.type === 'MARK_ALL_READ') {
    backgroundCore.markAllRead().then(sendResponse, (error) => {
      console.error('[SEAF] unread clear failed:', error);
      sendResponse({ success: false, error: backgroundCore.getErrorMessage(error) });
    });
    return true;
  }

  if (request.type === 'TEST_ACTIVE_TAB_TOAST') {
    backgroundCore.handleTestActiveTabToast().then(sendResponse, (error) => {
      sendResponse({ success: false, error: backgroundCore.getErrorMessage(error) });
    });
    return true;
  }

  return false;
});
