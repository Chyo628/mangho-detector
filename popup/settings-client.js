(function initializeSEAFSettingsClient(global) {
  'use strict';

  function createSettingsClient({ chromeApi, popupCore }) {
    if (!chromeApi?.runtime?.sendMessage) {
      throw new Error('A Chrome runtime API is required.');
    }
    if (!popupCore?.normalizeSettings) {
      throw new Error('A popup core is required.');
    }

    async function send(type, payload = {}) {
      const response = await chromeApi.runtime.sendMessage({ type, ...payload });
      if (!response?.success) {
        const error = new Error(response?.error || '설정을 저장하지 못했습니다.');
        error.code = response?.errorCode || 'SETTINGS_REQUEST_FAILED';
        throw error;
      }
      return response;
    }

    async function getSettings() {
      try {
        const response = await send('GET_SETTINGS');
        return popupCore.normalizeSettings(response.settings);
      } catch (error) {
        // Reading can fall back to storage so the popup remains diagnostic when
        // the MV3 service worker is temporarily unavailable. Mutations never do.
        return popupCore.loadSettings();
      }
    }

    async function updateSettingsPatch(patch) {
      const response = await send('UPDATE_SETTINGS_PATCH', { patch });
      return popupCore.normalizeSettings(response.settings);
    }

    async function addAuthorRecord({
      author = null,
      nickname = '',
      note = '',
      status = 'note'
    } = {}) {
      const response = await send('ADD_AUTHOR_RECORD', { author, nickname, note, status });
      return popupCore.normalizeSettings(response.settings);
    }

    async function updateAuthorRecordNote(key, note) {
      const response = await send('UPDATE_AUTHOR_RECORD_NOTE', { key, note });
      return popupCore.normalizeSettings(response.settings);
    }

    async function setAuthorRecordStatus(keys, status) {
      const response = await send('SET_AUTHOR_RECORD_STATUS', { keys, status });
      return popupCore.normalizeSettings(response.settings);
    }

    async function removeAuthorRecordKeys(keys) {
      const response = await send('REMOVE_AUTHOR_RECORD_KEYS', { keys });
      return popupCore.normalizeSettings(response.settings);
    }

    function addAuthorBan({ author = null, nickname = '', note = '' } = {}) {
      return addAuthorRecord({ author, nickname, note, status: 'banned' });
    }

    function updateAuthorBanNote(key, note) {
      return updateAuthorRecordNote(key, note);
    }

    function removeAuthorBanKeys(keys) {
      return removeAuthorRecordKeys(keys);
    }

    return {
      getSettings,
      updateSettingsPatch,
      addAuthorRecord,
      updateAuthorRecordNote,
      setAuthorRecordStatus,
      removeAuthorRecordKeys,
      addAuthorBan,
      updateAuthorBanNote,
      removeAuthorBanKeys
    };
  }

  const exported = { createSettingsClient };
  global.SEAFSettingsClient = exported;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
