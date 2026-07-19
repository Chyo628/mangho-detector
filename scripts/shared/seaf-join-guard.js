(function (global) {
  const PHASES = Object.freeze({
    idle: 'idle',
    confirm: 'confirm',
    submitting: 'submitting',
    error: 'error'
  });

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function createJoinGuardController(options = {}) {
    const state = {
      phase: PHASES.idle,
      isBannedAuthor: false,
      confirmBannedAuthorJoin: true,
      authorBanNote: '',
      errorMessage: ''
    };

    function snapshot() {
      return {
        phase: state.phase,
        isBannedAuthor: state.isBannedAuthor,
        confirmBannedAuthorJoin: state.confirmBannedAuthorJoin,
        authorBanNote: state.authorBanNote,
        errorMessage: state.errorMessage,
        needsConfirmation: Boolean(state.isBannedAuthor && state.confirmBannedAuthorJoin)
      };
    }

    function sync(nextOptions = {}) {
      if (Object.hasOwn(nextOptions, 'isBannedAuthor')) {
        state.isBannedAuthor = Boolean(nextOptions.isBannedAuthor);
      }
      if (Object.hasOwn(nextOptions, 'confirmBannedAuthorJoin')) {
        state.confirmBannedAuthorJoin = Boolean(nextOptions.confirmBannedAuthorJoin);
      }
      if (Object.hasOwn(nextOptions, 'authorBanNote')) {
        state.authorBanNote = normalizeText(nextOptions.authorBanNote);
      }

      if (!state.isBannedAuthor || !state.confirmBannedAuthorJoin) {
        if (state.phase === PHASES.confirm || state.phase === PHASES.error) {
          state.phase = PHASES.idle;
          state.errorMessage = '';
        }
      }

      return snapshot();
    }

    function requestJoin() {
      const needsConfirmation = Boolean(state.isBannedAuthor && state.confirmBannedAuthorJoin);
      if (state.phase === PHASES.submitting) {
        return { action: 'blocked', snapshot: snapshot() };
      }

      if (needsConfirmation && state.phase !== PHASES.confirm) {
        state.phase = PHASES.confirm;
        state.errorMessage = '';
        return { action: 'confirm', snapshot: snapshot() };
      }

      state.phase = PHASES.submitting;
      state.errorMessage = '';
      return { action: 'execute', snapshot: snapshot() };
    }

    function cancel() {
      if (state.phase === PHASES.confirm || state.phase === PHASES.error) {
        state.phase = PHASES.idle;
        state.errorMessage = '';
        return { action: 'cancelled', snapshot: snapshot() };
      }

      return { action: 'noop', snapshot: snapshot() };
    }

    function complete() {
      state.phase = PHASES.idle;
      state.errorMessage = '';
      return snapshot();
    }

    function fail(errorMessage = '') {
      state.phase = PHASES.error;
      state.errorMessage = normalizeText(errorMessage);
      return snapshot();
    }

    sync(options);

    return {
      phases: PHASES,
      getSnapshot: snapshot,
      sync,
      requestJoin,
      cancel,
      complete,
      fail
    };
  }

  global.SEAFJoinGuard = {
    PHASES,
    createJoinGuardController
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SEAFJoinGuard;
  }
})(globalThis);
