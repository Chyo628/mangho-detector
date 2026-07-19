(function (global) {
  const OPTIONAL_ORIGINS = ['http://*/*', 'https://*/*'];

  function normalizeOptionalOrigins(origins) {
    const normalizedOrigins = Array.isArray(origins) ? origins : OPTIONAL_ORIGINS;
    return [...new Set(
      normalizedOrigins
        .map((origin) => String(origin || '').trim())
        .filter(Boolean)
    )];
  }

  function normalizeSiteAlertSettings(savedSettings, options = {}) {
    const normalizedSettings = {
      ...(savedSettings && typeof savedSettings === 'object' ? savedSettings : {})
    };
    const preferredValue = options.preferredValue;

    if (typeof preferredValue === 'boolean') {
      normalizedSettings.isSiteAlertEnabled = preferredValue;
    } else {
      normalizedSettings.isSiteAlertEnabled = normalizedSettings.isSiteAlertEnabled !== false;
    }

    return normalizedSettings;
  }

  function deriveSiteAlertSettings(savedSettings, hasOptionalOrigins, options = {}) {
    const normalizedSettings = normalizeSiteAlertSettings(savedSettings, options);
    const normalizedHasOptionalOrigins = Boolean(hasOptionalOrigins);

    return {
      settings: {
        ...normalizedSettings,
        isSiteAlertEnabled: normalizedSettings.isSiteAlertEnabled && normalizedHasOptionalOrigins
      },
      changed: normalizedSettings.isSiteAlertEnabled && !normalizedHasOptionalOrigins,
      hasOptionalOrigins: normalizedHasOptionalOrigins
    };
  }

  function createPermissionsRuntime({
    permissionsApi,
    origins = OPTIONAL_ORIGINS
  }) {
    const normalizedOrigins = normalizeOptionalOrigins(origins);

    async function containsOptionalOrigins() {
      if (!permissionsApi?.contains) {
        return false;
      }

      return Boolean(await permissionsApi.contains({ origins: normalizedOrigins }));
    }

    async function requestOptionalOrigins() {
      if (!permissionsApi?.request) {
        return false;
      }

      return Boolean(await permissionsApi.request({ origins: normalizedOrigins }));
    }

    async function removeOptionalOrigins() {
      if (!permissionsApi?.remove) {
        return false;
      }

      return Boolean(await permissionsApi.remove({ origins: normalizedOrigins }));
    }

    async function normalizeStoredSiteAlertSettings(savedSettings, options = {}) {
      const hasOptionalOrigins = Object.prototype.hasOwnProperty.call(options, 'hasOptionalOrigins')
        ? Boolean(options.hasOptionalOrigins)
        : await containsOptionalOrigins();

      return deriveSiteAlertSettings(savedSettings, hasOptionalOrigins, options);
    }

    return {
      origins: normalizedOrigins,
      containsOptionalOrigins,
      requestOptionalOrigins,
      removeOptionalOrigins,
      normalizeStoredSiteAlertSettings
    };
  }

  global.SEAFPermissions = {
    OPTIONAL_ORIGINS,
    normalizeOptionalOrigins,
    normalizeSiteAlertSettings,
    deriveSiteAlertSettings,
    createPermissionsRuntime
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SEAFPermissions;
  }
})(globalThis);
