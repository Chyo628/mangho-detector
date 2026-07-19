(function initializeSEAFBackgroundMessages(global) {
  'use strict';

  function createMessageRouter({ backgroundCore, logger = console }) {
    if (!backgroundCore) {
      throw new Error('A background core is required.');
    }

    function getErrorResponse(error) {
      return {
        success: false,
        error: backgroundCore.getErrorMessage(error)
      };
    }

    function respond(sendResponse, operation, errorLabel, buildErrorResponse = getErrorResponse) {
      Promise.resolve()
        .then(operation)
        .then(sendResponse, async (error) => {
          logger.error(`[SEAF] ${errorLabel}:`, error);
          sendResponse(await buildErrorResponse(error));
        });
      return true;
    }

    function handleMessage(request = {}, sender, sendResponse) {
      if (request.type === 'GET_SETTINGS') {
        return respond(sendResponse, () => backgroundCore.getSettings(), 'settings fetch failed');
      }

      if (request.type === 'SETTINGS_UPDATED') {
        return respond(sendResponse, () => backgroundCore.handleSettingsUpdated(), 'settings update failed');
      }

      if (request.type === 'UPDATE_SETTINGS_PATCH') {
        return respond(
          sendResponse,
          () => backgroundCore.updateSettingsPatch(request.patch),
          'settings patch failed'
        );
      }

      if (request.type === 'ADD_AUTHOR_RECORD') {
        return respond(
          sendResponse,
          () => backgroundCore.addAuthorRecord(request),
          'add author record failed'
        );
      }

      if (request.type === 'UPDATE_AUTHOR_RECORD_NOTE') {
        return respond(
          sendResponse,
          () => backgroundCore.updateAuthorRecordNote(request.key, request.note),
          'update author record note failed'
        );
      }

      if (request.type === 'SET_AUTHOR_RECORD_STATUS') {
        return respond(
          sendResponse,
          () => backgroundCore.setAuthorRecordStatus(request.keys, request.status),
          'set author record status failed'
        );
      }

      if (request.type === 'REMOVE_AUTHOR_RECORD_KEYS') {
        return respond(
          sendResponse,
          () => backgroundCore.removeAuthorRecordKeys(request.keys),
          'remove author record keys failed'
        );
      }

      if (request.type === 'ADD_AUTHOR_BAN') {
        return respond(sendResponse, () => backgroundCore.addAuthorBan(request), 'add author ban failed');
      }

      if (request.type === 'UPDATE_AUTHOR_BAN_NOTE') {
        return respond(
          sendResponse,
          () => backgroundCore.updateAuthorBanNote(request.key, request.note),
          'update author ban note failed'
        );
      }

      if (request.type === 'REMOVE_AUTHOR_BAN_KEYS') {
        return respond(
          sendResponse,
          () => backgroundCore.removeAuthorBanKeys(request.keys),
          'remove author ban keys failed'
        );
      }

      if (request.type === 'GET_LIVE_POSTS') {
        return respond(
          sendResponse,
          () => backgroundCore.getPopupPosts({ recordScan: Boolean(request.manualRefresh) }),
          'live posts fetch failed',
          async (error) => {
            const settings = await backgroundCore.ensureSettings()
              .catch(() => backgroundCore.DEFAULT_SETTINGS);
            return {
              success: false,
              posts: [],
              unreadPosts: [],
              historyPosts: [],
              unreadCount: 0,
              lastScanAt: null,
              error: backgroundCore.getErrorMessage(error),
              worker: backgroundCore.buildWorkerStatus(settings)
            };
          }
        );
      }

      if (request.type === 'OPEN_POST') {
        return respond(sendResponse, () => backgroundCore.openPost(request.postId), 'open post failed');
      }

      if (request.type === 'JOIN_POST') {
        return respond(
          sendResponse,
          () => backgroundCore.joinPost(request.postId, sender),
          'join failed'
        );
      }

      if (request.type === 'MARK_ALL_READ') {
        return respond(sendResponse, () => backgroundCore.markAllRead(), 'unread clear failed');
      }

      if (request.type === 'MARK_POST_READ') {
        return respond(
          sendResponse,
          async () => {
            const result = await backgroundCore.markPostRead(request.postId);
            if (!result.success) {
              return { success: false, error: '유효한 모집 글 번호가 아닙니다.' };
            }

            try {
              await backgroundCore.syncBadge();
            } catch (error) {
              logger.warn('[SEAF] unread item committed but badge sync failed:', error);
            }
            return {
              success: true,
              unreadCount: result.unreadIds.length,
              unreadPostIds: result.unreadIds
            };
          },
          'unread item clear failed'
        );
      }

      if (request.type === 'TEST_ACTIVE_TAB_TOAST') {
        return respond(
          sendResponse,
          () => backgroundCore.handleTestActiveTabToast(),
          'test toast failed'
        );
      }

      return false;
    }

    return { handleMessage };
  }

  const exported = { createMessageRouter };
  global.SEAFBackgroundMessages = exported;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
