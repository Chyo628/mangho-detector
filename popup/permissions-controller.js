(function initializeSEAFPopupPermissionsController(global) {
  'use strict';

  function createPermissionsController({
    permissionsApi,
    permissionsModule,
    settingsClient,
    popupCore,
    missingPermissionMessage = ''
  }) {
    if (!permissionsModule?.createPermissionsRuntime) {
      throw new Error('A permissions runtime module is required.');
    }
    if (!settingsClient?.updateSettingsPatch) {
      throw new Error('A settings client is required.');
    }
    if (!popupCore?.normalizeSettings) {
      throw new Error('A popup core is required.');
    }

    const runtime = permissionsModule.createPermissionsRuntime({ permissionsApi });

    async function normalizeOptionalPermissionSettings(settings) {
      const normalizedSettings = popupCore.normalizeSettings(settings);
      if (!normalizedSettings.isSiteAlertEnabled) {
        return { settings: normalizedSettings, message: '' };
      }

      let permissionResult;
      try {
        permissionResult = await runtime.normalizeStoredSiteAlertSettings(normalizedSettings);
      } catch (error) {
        return { settings: normalizedSettings, message: '' };
      }

      if (!permissionResult.changed) {
        return { settings: permissionResult.settings, message: '' };
      }

      let savedSettings = permissionResult.settings;
      try {
        savedSettings = await settingsClient.updateSettingsPatch({ isSiteAlertEnabled: false });
      } catch (error) {
        // Mutations stay background-owned. If the worker is unavailable, keep
        // the popup safe without introducing a second storage writer.
      }

      return {
        settings: popupCore.normalizeSettings(savedSettings),
        message: missingPermissionMessage
      };
    }

    async function requestOptionalSitePermissions() {
      try {
        return await runtime.requestOptionalOrigins();
      } catch (error) {
        return false;
      }
    }

    async function removeOptionalSitePermissions() {
      try {
        return await runtime.removeOptionalOrigins();
      } catch (error) {
        return false;
      }
    }

    return {
      origins: runtime.origins,
      normalizeOptionalPermissionSettings,
      requestOptionalSitePermissions,
      removeOptionalSitePermissions
    };
  }

  const exported = { createPermissionsController };
  global.SEAFPopupPermissionsController = exported;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
