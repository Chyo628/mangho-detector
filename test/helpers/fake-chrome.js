function createEvent() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    listeners
  };
}

async function emitAsync(listeners, ...args) {
  for (const listener of listeners) {
    const result = listener(...args);
    if (result && typeof result.then === 'function') {
      await result;
    }
  }
}

function createFakeChrome(options = {}) {
  const state = {
    storageData: { ...(options.storageData || {}) },
    tabsQueries: [],
    sentMessages: [],
    createdTabs: [],
    alarmsCreated: [],
    alarmsCleared: [],
    runtimeSentMessages: [],
    notificationsCreated: [],
    notificationsCleared: [],
    badgeTexts: [],
    badgeBackgroundColors: [],
    actionTitles: [],
    executedScripts: []
  };

  const storageChangedEvent = createEvent();
  const runtimeMessageEvent = createEvent();
  const runtimeInstalledEvent = createEvent();
  const runtimeStartupEvent = createEvent();
  const alarmsEvent = createEvent();
  const notificationClickedEvent = createEvent();
  const notificationButtonClickedEvent = createEvent();

  const chromeApi = {
    storage: {
      local: {
        async get(keys) {
          if (Array.isArray(keys)) {
            return keys.reduce((result, key) => {
              if (key in state.storageData) {
                result[key] = state.storageData[key];
              }
              return result;
            }, {});
          }

          if (typeof keys === 'string') {
            return { [keys]: state.storageData[keys] };
          }

          if (keys && typeof keys === 'object') {
            return Object.keys(keys).reduce((result, key) => {
              result[key] = key in state.storageData ? state.storageData[key] : keys[key];
              return result;
            }, {});
          }

          return { ...state.storageData };
        },
        async set(values) {
          const changes = {};
          Object.keys(values).forEach((key) => {
            changes[key] = {
              oldValue: state.storageData[key],
              newValue: values[key]
            };
            state.storageData[key] = values[key];
          });

          if (options.emitStorageChanges !== false) {
            storageChangedEvent.listeners.forEach((listener) => listener(changes, 'local'));
          }
        }
      },
      onChanged: storageChangedEvent
    },
    tabs: {
      async query(queryInfo) {
        state.tabsQueries.push(queryInfo);
        if (options.queryTabs) {
          return options.queryTabs(queryInfo, state);
        }

        return [];
      },
      async sendMessage(tabId, payload) {
        state.sentMessages.push({ tabId, payload });
        if (options.sendMessage) {
          return options.sendMessage(tabId, payload, state);
        }

        return { success: true };
      },
      async create(createInfo) {
        state.createdTabs.push(createInfo);
        if (options.createTab) {
          return options.createTab(createInfo, state);
        }

        return { id: state.createdTabs.length, ...createInfo };
      }
    },
    alarms: {
      create(name, info) {
        state.alarmsCreated.push({ name, info });
      },
      async clear(name) {
        state.alarmsCleared.push(name);
        return true;
      },
      onAlarm: alarmsEvent
    },
    notifications: {
      async create(notificationId, optionsData) {
        let resolvedNotificationId = notificationId;
        let resolvedOptions = optionsData;

        if (typeof optionsData === 'undefined') {
          resolvedOptions = notificationId;
          resolvedNotificationId = `notification-${state.notificationsCreated.length + 1}`;
        }

        state.notificationsCreated.push({
          notificationId: resolvedNotificationId,
          options: resolvedOptions
        });

        if (options.createNotification) {
          return options.createNotification(resolvedNotificationId, resolvedOptions, state);
        }

        return resolvedNotificationId;
      },
      async clear(notificationId) {
        state.notificationsCleared.push(notificationId);
        if (options.clearNotification) {
          return options.clearNotification(notificationId, state);
        }

        return true;
      },
      onClicked: notificationClickedEvent,
      onButtonClicked: notificationButtonClickedEvent
    },
    action: {
      async setBadgeText(details) {
        state.badgeTexts.push(details);
        if (options.setBadgeText) {
          return options.setBadgeText(details, state);
        }
      },
      async setBadgeBackgroundColor(details) {
        state.badgeBackgroundColors.push(details);
        if (options.setBadgeBackgroundColor) {
          return options.setBadgeBackgroundColor(details, state);
        }
      },
      async setTitle(details) {
        state.actionTitles.push(details);
        if (options.setActionTitle) {
          return options.setActionTitle(details, state);
        }
      }
    },
    scripting: {
      async executeScript(details) {
        state.executedScripts.push(details);
        if (options.executeScript) {
          return options.executeScript(details, state);
        }

        return [];
      }
    },
    runtime: {
      onInstalled: runtimeInstalledEvent,
      onStartup: runtimeStartupEvent,
      onMessage: runtimeMessageEvent,
      getManifest() {
        return options.manifest || { version: '0.0.0-test' };
      },
      getURL(path) {
        const trimmedPath = String(path || '').replace(/^\/+/, '');
        return `chrome-extension://test-extension/${trimmedPath}`;
      },
      async sendMessage(message) {
        state.runtimeSentMessages.push(message);
        if (options.runtimeSendMessage) {
          return options.runtimeSendMessage(message, state);
        }

        throw new Error('Receiving end does not exist');
      }
    }
  };

  return {
    chromeApi,
    state,
    emitStorageChange(changes, areaName = 'local') {
      storageChangedEvent.listeners.forEach((listener) => listener(changes, areaName));
    },
    async emitRuntimeMessage(message, sender = {}) {
      const responses = [];

      for (const listener of runtimeMessageEvent.listeners) {
        const maybeAsync = listener(message, sender, (response) => {
          responses.push(response);
        });

        if (maybeAsync && typeof maybeAsync.then === 'function') {
          await maybeAsync;
        }
      }

      return responses;
    },
    async emitNotificationClick(notificationId) {
      await emitAsync(notificationClickedEvent.listeners, notificationId);
    },
    async emitNotificationButtonClick(notificationId, buttonIndex) {
      await emitAsync(notificationButtonClickedEvent.listeners, notificationId, buttonIndex);
    }
  };
}

module.exports = {
  createFakeChrome
};
