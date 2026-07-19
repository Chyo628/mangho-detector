const test = require('node:test');
const assert = require('node:assert/strict');

const permissionsModule = require('../scripts/shared/seaf-permissions.js');
const { createPermissionsController } = require('../popup/permissions-controller.js');

function createHarness({
  hasPermission = true,
  containsError = null,
  requestResult = true,
  removeResult = true,
  patchError = null
} = {}) {
  const patches = [];
  const popupCore = {
    normalizeSettings(settings = {}) {
      return {
        isSiteAlertEnabled: settings.isSiteAlertEnabled !== false,
        ...settings
      };
    }
  };
  const settingsClient = {
    async updateSettingsPatch(patch) {
      patches.push(patch);
      if (patchError) {
        throw patchError;
      }
      return { isSiteAlertEnabled: false };
    }
  };
  const permissionsApi = {
    async contains() {
      if (containsError) {
        throw containsError;
      }
      return hasPermission;
    },
    async request() {
      return requestResult;
    },
    async remove() {
      return removeResult;
    }
  };

  return {
    patches,
    controller: createPermissionsController({
      permissionsApi,
      permissionsModule,
      settingsClient,
      popupCore,
      missingPermissionMessage: 'permission missing'
    })
  };
}

test('keeps enabled site alerts when optional origins are present', async () => {
  const { controller, patches } = createHarness({ hasPermission: true });

  const result = await controller.normalizeOptionalPermissionSettings({
    isSiteAlertEnabled: true
  });

  assert.equal(result.settings.isSiteAlertEnabled, true);
  assert.equal(result.message, '');
  assert.deepEqual(patches, []);
});

test('routes missing-permission normalization through the settings writer', async () => {
  const { controller, patches } = createHarness({ hasPermission: false });

  const result = await controller.normalizeOptionalPermissionSettings({
    isSiteAlertEnabled: true
  });

  assert.equal(result.settings.isSiteAlertEnabled, false);
  assert.equal(result.message, 'permission missing');
  assert.deepEqual(patches, [{ isSiteAlertEnabled: false }]);
});

test('stays safe without a direct storage write when the settings writer fails', async () => {
  const { controller, patches } = createHarness({
    hasPermission: false,
    patchError: new Error('worker unavailable')
  });

  const result = await controller.normalizeOptionalPermissionSettings({
    isSiteAlertEnabled: true
  });

  assert.equal(result.settings.isSiteAlertEnabled, false);
  assert.equal(result.message, 'permission missing');
  assert.deepEqual(patches, [{ isSiteAlertEnabled: false }]);
});

test('preserves the current setting when the permission API is temporarily unavailable', async () => {
  const { controller, patches } = createHarness({
    containsError: new Error('permission API unavailable')
  });

  const result = await controller.normalizeOptionalPermissionSettings({
    isSiteAlertEnabled: true
  });

  assert.equal(result.settings.isSiteAlertEnabled, true);
  assert.equal(result.message, '');
  assert.deepEqual(patches, []);
});

test('delegates permission request and removal to the shared runtime', async () => {
  const { controller } = createHarness({ requestResult: false, removeResult: true });

  assert.equal(await controller.requestOptionalSitePermissions(), false);
  assert.equal(await controller.removeOptionalSitePermissions(), true);
});
