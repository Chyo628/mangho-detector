(function (global) {
  const constants = {
    MANGHO_LIST_URL: 'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries',
    VIEW_URL_PREFIX: 'https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=',
    MANGHO_SUBJECTS: [
      '\uD5EC\uB9DD\uD638'
    ],
    RECENT_POST_WINDOW_MS: 10 * 60 * 1000,
    DEFAULT_RECENT_HISTORY_LIMIT: 15,
    MIN_RECENT_HISTORY_LIMIT: 1,
    MAX_RECENT_HISTORY_LIMIT: 30,
    LIVE_POST_LIMIT: 20,
    POPUP_POST_LIMIT: 3,
    RECENT_POST_LIMIT: 15,
    DEFAULT_RECENT_HISTORY_RETENTION_MINUTES: 30,
    MIN_RECENT_HISTORY_RETENTION_MINUTES: 5,
    MAX_RECENT_HISTORY_RETENTION_MINUTES: 180,
    RECENT_HISTORY_RETENTION_MINUTES: 30,
    DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES: 15,
    MIN_UNREAD_ACTIVE_WINDOW_MINUTES: 1,
    MAX_UNREAD_ACTIVE_WINDOW_MINUTES: 180,
    UNREAD_ACTIVE_WINDOW_MINUTES: 15,
    KST_OFFSET_MS: 9 * 60 * 60 * 1000,
    CLOSED_RECRUITMENT_REGEX: /4\/4|\uD480\uBC29|\uB9C8\uAC10|\uC644\uB8CC|\uC885\uB8CC/i
  };

  const normalizedSubjectSet = new Set(
    constants.MANGHO_SUBJECTS.map((subject) => normalizeSubject(subject))
  );

  function normalizeSubject(subject) {
    return String(subject || '')
      .normalize('NFC')
      .replace(/\s+/g, '')
      .trim();
  }

  function stripHtml(value) {
    return String(value || '').replace(/<[^>]*>/g, '');
  }

  function decodeNumericHtmlEntity(match, hexDigits, decimalDigits) {
    const codePoint = Number.parseInt(
      hexDigits || decimalDigits,
      hexDigits ? 16 : 10
    );

    if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
      return match;
    }

    try {
      return String.fromCodePoint(codePoint);
    } catch (error) {
      return match;
    }
  }

  function decodeHtmlEntities(value) {
    let decodedValue = String(value || '');

    for (let passIndex = 0; passIndex < 3; passIndex += 1) {
      const nextValue = decodedValue
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(
          /&#(?:x([0-9a-fA-F]+)|([0-9]+));/g,
          (match, hexDigits, decimalDigits) => decodeNumericHtmlEntity(match, hexDigits, decimalDigits)
        );

      if (nextValue === decodedValue) {
        break;
      }

      decodedValue = nextValue;
    }

    return decodedValue;
  }

  function isManghoSubject(subject) {
    return normalizedSubjectSet.has(normalizeSubject(subject));
  }

  function isHelldiversListUrl(url) {
    try {
      const parsedUrl = new URL(String(url || ''));
      const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, '');
      return (
        /^https?:$/.test(parsedUrl.protocol) &&
        parsedUrl.hostname === 'gall.dcinside.com' &&
        normalizedPathname === '/mgallery/board/lists' &&
        parsedUrl.searchParams.get('id') === 'helldiversseries'
      );
    } catch (error) {
      return false;
    }
  }

  function parsePostsFromHtml(html, options = {}) {
    const {
      currentTime = Date.now(),
      limit = Number.POSITIVE_INFINITY,
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;
    const postRegex = /<tr[^>]*data-no="(\d+)"[^>]*>[\s\S]*?<td class="gall_subject">([\s\S]*?)<\/td>[\s\S]*?<td class="gall_tit[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td class="gall_date"(?: title="([^"]+)")?>([\s\S]*?)<\/td>/g;
    const matches = [...String(html || '').matchAll(postRegex)];

    return matches
      .filter((match) => !match[0].includes('icon_notice') && !match[0].includes('icon_fnews'))
      .map((match) => {
        const subject = stripHtml(match[2]).trim();
        if (!isManghoSubject(subject)) {
          return null;
        }

        const id = Number.parseInt(match[1], 10);
        const title = decodeHtmlEntities(stripHtml(match[3]).trim());
        const fullDateStr = match[4] || stripHtml(match[5]).trim();

        if (!Number.isFinite(id) || !title) {
          return null;
        }

        return normalizePost({
          id,
          title,
          subject,
          fullDateStr,
          postUrl: `${viewUrlPrefix}${id}`
        }, { currentTime, viewUrlPrefix });
      })
      .filter(Boolean)
      .sort((left, right) => right.id - left.id)
      .slice(0, Number.isFinite(limit) ? limit : undefined);
  }

  function parsePostDate(fullDateStr) {
    if (!fullDateStr) {
      return null;
    }

    const trimmedValue = String(fullDateStr).trim();

    const dateTimeMatch = trimmedValue.match(
      /^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (dateTimeMatch) {
      const [, year, month, day, hour, minute, second = '00'] = dateTimeMatch;
      return createKstDate(year, month, day, hour, minute, second);
    }

    const timeOnlyMatch = trimmedValue.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (timeOnlyMatch) {
      const nowInKst = new Date(Date.now() + constants.KST_OFFSET_MS);
      const [, hour, minute, second = '00'] = timeOnlyMatch;

      return createKstDate(
        nowInKst.getUTCFullYear(),
        nowInKst.getUTCMonth() + 1,
        nowInKst.getUTCDate(),
        hour,
        minute,
        second
      );
    }

    const shortDateMatch = trimmedValue.match(/^(\d{2})[-/.](\d{2})[-/.](\d{2})$/);
    if (shortDateMatch) {
      const [, shortYear, month, day] = shortDateMatch;
      return createKstDate(2000 + Number(shortYear), month, day, 0, 0, 0);
    }

    return null;
  }

  function createKstDate(year, month, day, hour, minute, second) {
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      ) - constants.KST_OFFSET_MS
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRelativeTime(fullDateStr, currentTime = Date.now()) {
    const postDate = parsePostDate(fullDateStr);
    if (!postDate) {
      return '\uBC29\uAE08';
    }

    const diffMs = currentTime - postDate.getTime();
    if (diffMs < 60 * 1000) {
      return '\uBC29\uAE08';
    }

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 60) {
      return `${diffMinutes}\uBD84 \uC804`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}\uC2DC\uAC04 \uC804`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}\uC77C \uC804`;
  }

  function formatDetectedTime(detectedAt, currentTime = Date.now()) {
    if (!detectedAt) {
      return '\uBC29\uAE08';
    }

    const diffMs = currentTime - detectedAt;
    if (diffMs < 60 * 1000) {
      return '\uBC29\uAE08';
    }

    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    if (diffMinutes < 60) {
      return `${diffMinutes}\uBD84 \uC804 \uAC10\uC9C0`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}\uC2DC\uAC04 \uC804 \uAC10\uC9C0`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}\uC77C \uC804 \uAC10\uC9C0`;
  }

  function isOpenRecruitment(post, currentTime = Date.now()) {
    if (!post?.title) {
      return false;
    }

    const normalizedTitle = String(post.title).replace(/\s+/g, '');
    if (constants.CLOSED_RECRUITMENT_REGEX.test(normalizedTitle)) {
      return false;
    }

    const postDate = parsePostDate(post.fullDateStr);
    if (!postDate) {
      return false;
    }

    const diffMs = currentTime - postDate.getTime();
    return diffMs >= 0 && diffMs <= constants.RECENT_POST_WINDOW_MS;
  }

  function normalizePost(post, options = {}) {
    const {
      currentTime = Date.now(),
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;
    const normalizedId = Number(post?.id);

    return {
      id: normalizedId,
      title: decodeHtmlEntities(String(post?.title || '')),
      subject: decodeHtmlEntities(String(post?.subject || '')),
      fullDateStr: String(post?.fullDateStr || ''),
      relativeTime: post?.fullDateStr
        ? formatRelativeTime(post.fullDateStr, currentTime)
        : formatDetectedTime(Number(post?.detectedAt), currentTime),
      postUrl: post?.postUrl || `${viewUrlPrefix}${normalizedId}`,
      detectedAt: Number(post?.detectedAt) || currentTime
    };
  }

  function mergePosts(primaryPosts, secondaryPosts, options = {}) {
    const {
      currentTime = Date.now(),
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;
    const mergedMap = new Map();

    [...primaryPosts, ...secondaryPosts].forEach((post) => {
      if (!Number.isFinite(Number(post?.id))) {
        return;
      }

      const normalizedPost = normalizePost(post, { currentTime, viewUrlPrefix });
      const existingPost = mergedMap.get(normalizedPost.id);
      if (!existingPost) {
        mergedMap.set(normalizedPost.id, normalizedPost);
        return;
      }

      const existingDetectedAt = Number(existingPost.detectedAt);
      const nextDetectedAt = Number(normalizedPost.detectedAt);
      const mergedDetectedAt = Number.isFinite(existingDetectedAt) && Number.isFinite(nextDetectedAt)
        ? Math.min(existingDetectedAt, nextDetectedAt)
        : (Number.isFinite(existingDetectedAt) ? existingDetectedAt : nextDetectedAt);

      mergedMap.set(normalizedPost.id, {
        ...normalizedPost,
        ...existingPost,
        detectedAt: mergedDetectedAt
      });
    });

    return refreshRelativeTimes(
      [...mergedMap.values()].sort((left, right) => {
        if (right.id !== left.id) {
          return right.id - left.id;
        }

        return (right.detectedAt || 0) - (left.detectedAt || 0);
      }),
      { currentTime }
    );
  }

  function refreshRelativeTimes(posts, options = {}) {
    const { currentTime = Date.now() } = options;

    return posts.map((post) => normalizePost(post, { currentTime }));
  }

  function filterRecentOpenPosts(posts, options = {}) {
    const {
      currentTime = Date.now(),
      limit = Number.POSITIVE_INFINITY,
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;

    return mergePosts(posts, [], { currentTime, viewUrlPrefix })
      .filter((post) => isOpenRecruitment(post, currentTime))
      .slice(0, Number.isFinite(limit) ? limit : undefined);
  }

  function trimRecentHistoryPosts(posts, options = {}) {
    const {
      currentTime = Date.now(),
      maxCount = constants.DEFAULT_RECENT_HISTORY_LIMIT,
      maxAgeMs = constants.DEFAULT_RECENT_HISTORY_RETENTION_MINUTES * 60 * 1000,
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;
    const normalizedMaxCount = Number.isFinite(Number(maxCount))
      ? Math.min(
        constants.MAX_RECENT_HISTORY_LIMIT,
        Math.max(constants.MIN_RECENT_HISTORY_LIMIT, Math.round(Number(maxCount)))
      )
      : constants.DEFAULT_RECENT_HISTORY_LIMIT;
    const normalizedMaxAgeMs = Number.isFinite(Number(maxAgeMs))
      ? Math.min(
        constants.MAX_RECENT_HISTORY_RETENTION_MINUTES * 60 * 1000,
        Math.max(constants.MIN_RECENT_HISTORY_RETENTION_MINUTES * 60 * 1000, Number(maxAgeMs))
      )
      : constants.DEFAULT_RECENT_HISTORY_RETENTION_MINUTES * 60 * 1000;

    return mergePosts(posts, [], { currentTime, viewUrlPrefix })
      .filter((post) => {
        const detectedAt = Number(post?.detectedAt);
        const detectedAgeMs = currentTime - detectedAt;
        return Number.isFinite(detectedAt) && detectedAgeMs >= 0 && detectedAgeMs <= normalizedMaxAgeMs;
      })
      .sort((left, right) => {
        const detectedAtDiff = (Number(right?.detectedAt) || 0) - (Number(left?.detectedAt) || 0);
        if (detectedAtDiff !== 0) {
          return detectedAtDiff;
        }

        return (Number(right?.id) || 0) - (Number(left?.id) || 0);
      })
      .slice(0, normalizedMaxCount);
  }

  function isUnreadPostActive(post, options = {}) {
    const {
      currentTime = Date.now(),
      maxAgeMs = constants.DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES * 60 * 1000
    } = options;
    const normalizedMaxAgeMs = Number.isFinite(Number(maxAgeMs))
      ? Math.min(
        constants.MAX_UNREAD_ACTIVE_WINDOW_MINUTES * 60 * 1000,
        Math.max(constants.MIN_UNREAD_ACTIVE_WINDOW_MINUTES * 60 * 1000, Number(maxAgeMs))
      )
      : constants.DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES * 60 * 1000;
    const detectedAt = Number(post?.detectedAt);
    const detectedAgeMs = currentTime - detectedAt;

    return Number.isFinite(detectedAt)
      && detectedAgeMs >= 0
      && detectedAgeMs <= normalizedMaxAgeMs;
  }

  function extractLobbyLinkFromHtml(html) {
    const lobbyMatch = String(html || '').match(/steam:\/\/joinlobby\/\d+\/\d+\/\d+/);
    return lobbyMatch ? lobbyMatch[0] : null;
  }

  global.SEAFDomain = {
    constants,
    normalizeSubject,
    stripHtml,
    decodeHtmlEntities,
    isManghoSubject,
    isHelldiversListUrl,
    parsePostsFromHtml,
    parsePostDate,
    formatRelativeTime,
    formatDetectedTime,
    isOpenRecruitment,
    normalizePost,
    mergePosts,
    refreshRelativeTimes,
    filterRecentOpenPosts,
    trimRecentHistoryPosts,
    isUnreadPostActive,
    extractLobbyLinkFromHtml
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SEAFDomain;
  }
})(globalThis);
