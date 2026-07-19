(function (global) {
  const DEFAULT_FETCH_TIMEOUT_MS = 10000;
  const FETCH_TIMEOUT_ERROR = 'Request timed out.';
  const FETCH_TIMEOUT_ERROR_CODE = 'FETCH_TIMEOUT';

  function normalizeFetchTimeoutMs(value, fallback = DEFAULT_FETCH_TIMEOUT_MS) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return fallback;
    }

    return Math.round(numericValue);
  }

  function createFetchTimeoutError(message = FETCH_TIMEOUT_ERROR) {
    const error = new Error(message || FETCH_TIMEOUT_ERROR);
    error.code = FETCH_TIMEOUT_ERROR_CODE;
    error.name = 'FetchTimeoutError';
    error.isTimeout = true;
    return error;
  }

  function isFetchTimeoutError(error) {
    return error?.code === FETCH_TIMEOUT_ERROR_CODE || error?.isTimeout === true;
  }

  function createFetchRuntime({
    fetchImpl,
    AbortControllerImpl = global.AbortController,
    setTimeoutImpl = global.setTimeout.bind(global),
    clearTimeoutImpl = global.clearTimeout.bind(global),
    defaultTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    timeoutErrorMessage = FETCH_TIMEOUT_ERROR
  }) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetchImpl is required');
    }
    if (typeof AbortControllerImpl !== 'function') {
      throw new Error('AbortController is required');
    }

    const resolvedDefaultTimeoutMs = normalizeFetchTimeoutMs(defaultTimeoutMs);

    async function fetchText(url, options = {}) {
      const abortController = new AbortControllerImpl();
      const timeoutError = createFetchTimeoutError(
        options.timeoutErrorMessage || timeoutErrorMessage
      );
      const timeoutMs = normalizeFetchTimeoutMs(options.timeoutMs, resolvedDefaultTimeoutMs);
      let timeoutId = null;

      const timeoutPromise = new Promise((resolveUnused, reject) => {
        timeoutId = setTimeoutImpl(() => {
          abortController.abort();
          reject(timeoutError);
        }, timeoutMs);
      });

      try {
        const response = await Promise.race([
          fetchImpl(url, {
            ...options,
            cache: options.cache || 'no-store',
            signal: abortController.signal
          }),
          timeoutPromise
        ]);
        if (!response?.ok) {
          throw new Error(`Request failed: ${response?.status}`);
        }

        return await Promise.race([response.text(), timeoutPromise]);
      } catch (error) {
        if (abortController.signal?.aborted && !isFetchTimeoutError(error)) {
          throw timeoutError;
        }

        throw error;
      } finally {
        if (timeoutId !== null) {
          clearTimeoutImpl(timeoutId);
        }
      }
    }

    return {
      defaultTimeoutMs: resolvedDefaultTimeoutMs,
      timeoutErrorMessage,
      fetchText
    };
  }

  global.SEAFFetch = {
    DEFAULT_FETCH_TIMEOUT_MS,
    FETCH_TIMEOUT_ERROR,
    FETCH_TIMEOUT_ERROR_CODE,
    normalizeFetchTimeoutMs,
    createFetchTimeoutError,
    isFetchTimeoutError,
    createFetchRuntime
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SEAFFetch;
  }
})(globalThis);
