(function () {
  const params = new URLSearchParams(window.location.search);
  const lobbyLink = params.get('lobbyLink') || '';
  const postUrl = params.get('postUrl') || '';
  const errorMessage = params.get('error') || '';

  const statusElement = document.getElementById('seaf-helper-status');
  const launchButton = document.getElementById('seaf-helper-launch-button');
  const openPostButton = document.getElementById('seaf-helper-open-post-button');

  function updateStatus(message) {
    statusElement.textContent = message;
  }

  function openPost() {
    if (!postUrl) {
      updateStatus('게시글 주소를 찾지 못했습니다.');
      return;
    }

    window.location.href = postUrl;
  }

  function tryLaunchSteam() {
    if (!lobbyLink) {
      updateStatus(errorMessage || '로비 링크를 찾지 못했습니다. 게시글을 열어 직접 참가해 주세요.');
      launchButton.disabled = true;
      return;
    }

    updateStatus('Steam 참가를 실행하는 중입니다...');
    window.location.href = lobbyLink;

    window.setTimeout(() => {
      updateStatus('Steam 실행을 시도했습니다. 반응이 없으면 게시글을 열어 직접 확인해 주세요.');
      try {
        window.close();
      } catch (error) {
        console.warn('[SEAF] helper window close failed:', error);
      }
    }, 1200);
  }

  launchButton.addEventListener('click', tryLaunchSteam);
  openPostButton.addEventListener('click', openPost);

  if (!postUrl) {
    openPostButton.disabled = true;
  }

  if (lobbyLink) {
    tryLaunchSteam();
    return;
  }

  updateStatus(errorMessage || '로비 링크를 찾지 못했습니다. 게시글을 열어 직접 참가해 주세요.');
  launchButton.disabled = true;
})();
