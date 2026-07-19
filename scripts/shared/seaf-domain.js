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
    DEFAULT_RECENT_HISTORY_RETENTION_MINUTES: 30,
    MIN_RECENT_HISTORY_RETENTION_MINUTES: 5,
    MAX_RECENT_HISTORY_RETENTION_MINUTES: 180,
    DEFAULT_UNREAD_ACTIVE_WINDOW_MINUTES: 15,
    MIN_UNREAD_ACTIVE_WINDOW_MINUTES: 1,
    MAX_UNREAD_ACTIVE_WINDOW_MINUTES: 180,
    KST_OFFSET_MS: 9 * 60 * 60 * 1000,
    CLOSED_RECRUITMENT_REGEX: /4\/4|\uD480\uBC29|\uB9C8\uAC10|\uC644\uB8CC|\uC885\uB8CC|\u3141\u3131/i,
    DEFAULT_AUTHOR_BAN_OVERLAY_MODE: 'warn',
    DEFAULT_CONFIRM_BANNED_AUTHOR_JOIN: true,
    MAX_AUTHOR_RECORDS: 200,
    MAX_AUTHOR_NOTE_LENGTH: 240,
    MAX_AUTHOR_BAN_ENTRIES: 200,
    MAX_AUTHOR_BAN_NOTE_LENGTH: 240
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

  function getHtmlAttribute(openingTag, attributeName) {
    const escapedAttributeName = String(attributeName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attributeMatch = String(openingTag || '').match(
      new RegExp(`(?:^|\\s)${escapedAttributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
    );

    return attributeMatch ? (attributeMatch[1] ?? attributeMatch[2] ?? '') : null;
  }

  function hasClassToken(openingTag, className) {
    const classValue = getHtmlAttribute(openingTag, 'class');
    return classValue !== null && classValue.split(/\s+/).includes(className);
  }

  function findTableCellByClass(rowHtml, className) {
    const cellRegex = /(<td\b[^>]*>)([\s\S]*?)<\/td\s*>/gi;

    for (const cellMatch of String(rowHtml || '').matchAll(cellRegex)) {
      if (hasClassToken(cellMatch[1], className)) {
        return {
          openingTag: cellMatch[1],
          content: cellMatch[2]
        };
      }
    }

    return null;
  }

  function getFirstAttributeFromHtml(html, attributeName) {
    const escapedAttributeName = String(attributeName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attributeMatch = String(html || '').match(
      new RegExp(`${escapedAttributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
    );

    return attributeMatch ? (attributeMatch[1] ?? attributeMatch[2] ?? '') : null;
  }

  function normalizeAuthorTextValue(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeAuthorNickname(value) {
    return normalizeAuthorTextValue(value);
  }

  function normalizeAuthorUid(value) {
    return normalizeAuthorTextValue(value);
  }

  function normalizeAuthorIp(value) {
    return normalizeAuthorTextValue(value);
  }

  function normalizeAuthorNote(value) {
    return normalizeAuthorTextValue(value).slice(0, constants.MAX_AUTHOR_NOTE_LENGTH);
  }

  function normalizeAuthorBanNote(value) {
    return normalizeAuthorNote(value);
  }

  function normalizeAuthorRecordStatus(value, fallbackStatus = 'banned') {
    if (value === 'note' || value === 'banned') {
      return value;
    }

    return fallbackStatus === 'note' ? 'note' : 'banned';
  }

  function withAuthorNote(entry, note) {
    const normalizedNote = normalizeAuthorNote(note);
    return normalizedNote
      ? { ...entry, note: normalizedNote }
      : entry;
  }

  function buildAnonymousAuthorValue(nickname, ip) {
    const normalizedNickname = normalizeAuthorNickname(nickname);
    const normalizedIp = normalizeAuthorIp(ip);
    return normalizedNickname && normalizedIp
      ? `${normalizedNickname}|${normalizedIp}`
      : '';
  }

  function parseAnonymousAuthorValue(value) {
    const separatorIndex = String(value || '').indexOf('|');
    if (separatorIndex <= 0) {
      return null;
    }

    const nickname = normalizeAuthorNickname(String(value).slice(0, separatorIndex));
    const ip = normalizeAuthorIp(String(value).slice(separatorIndex + 1));
    if (!nickname || !ip) {
      return null;
    }

    return { nickname, ip };
  }

  function normalizeAuthor(author) {
    if (!author || typeof author !== 'object') {
      return null;
    }

    const nickname = normalizeAuthorNickname(author.nickname);
    const uid = normalizeAuthorUid(author.uid);
    const ip = normalizeAuthorIp(author.ip);
    const displayName = normalizeAuthorTextValue(author.displayName)
      || (nickname && ip && !uid ? `${nickname} (${ip})` : '')
      || nickname
      || uid
      || ip;
    const key = uid
      ? `uid:${uid}`
      : (nickname && ip ? `anonymous:${buildAnonymousAuthorValue(nickname, ip)}` : '')
        || (nickname ? `nickname:${nickname}` : '');

    if (!nickname && !uid && !ip && !displayName) {
      return null;
    }

    return {
      nickname,
      uid,
      ip,
      displayName,
      key
    };
  }

  function createNicknameAuthorRecord(nickname, note = '', status = 'note') {
    const normalizedNickname = normalizeAuthorNickname(nickname);
    if (!normalizedNickname) {
      return null;
    }

    return withAuthorNote({
      key: `nickname:${normalizedNickname}`,
      type: 'nickname',
      value: normalizedNickname,
      label: normalizedNickname,
      status: normalizeAuthorRecordStatus(status, 'note')
    }, note);
  }

  function createAuthorRecord(author, note = '', status = 'note') {
    const normalizedAuthor = normalizeAuthor(author);
    if (!normalizedAuthor) {
      return null;
    }

    if (normalizedAuthor.uid) {
      return withAuthorNote({
        key: `uid:${normalizedAuthor.uid}`,
        type: 'uid',
        value: normalizedAuthor.uid,
        label: normalizedAuthor.displayName || normalizedAuthor.uid,
        status: normalizeAuthorRecordStatus(status, 'note')
      }, note);
    }

    if (normalizedAuthor.nickname && normalizedAuthor.ip) {
      const value = buildAnonymousAuthorValue(normalizedAuthor.nickname, normalizedAuthor.ip);
      return withAuthorNote({
        key: `anonymous:${value}`,
        type: 'anonymous',
        value,
        label: normalizedAuthor.displayName || `${normalizedAuthor.nickname} (${normalizedAuthor.ip})`,
        status: normalizeAuthorRecordStatus(status, 'note')
      }, note);
    }

    return createNicknameAuthorRecord(normalizedAuthor.nickname, note, status);
  }

  function normalizeAuthorRecord(entry, fallbackStatus = 'banned') {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const status = normalizeAuthorRecordStatus(entry.status, fallbackStatus);

    if (entry.type === 'nickname') {
      return createNicknameAuthorRecord(entry.value ?? entry.label ?? entry.key, entry.note, status);
    }

    if (entry.type === 'uid') {
      const value = normalizeAuthorUid(entry.value);
      if (!value) {
        return null;
      }

      return withAuthorNote({
        key: `uid:${value}`,
        type: 'uid',
        value,
        label: normalizeAuthorTextValue(entry.label) || value,
        status
      }, entry.note);
    }

    if (entry.type === 'anonymous') {
      const parsedValue = parseAnonymousAuthorValue(entry.value);
      if (!parsedValue) {
        return null;
      }

      return withAuthorNote({
        key: `anonymous:${buildAnonymousAuthorValue(parsedValue.nickname, parsedValue.ip)}`,
        type: 'anonymous',
        value: buildAnonymousAuthorValue(parsedValue.nickname, parsedValue.ip),
        label: normalizeAuthorTextValue(entry.label) || `${parsedValue.nickname} (${parsedValue.ip})`,
        status
      }, entry.note);
    }

    return null;
  }

  function normalizeAuthorRecords(records) {
    const normalizedRecords = [];
    const seenKeys = new Set();

    for (const record of Array.isArray(records) ? records : []) {
      const normalizedRecord = normalizeAuthorRecord(record);
      if (!normalizedRecord || seenKeys.has(normalizedRecord.key)) {
        continue;
      }

      seenKeys.add(normalizedRecord.key);
      normalizedRecords.push(normalizedRecord);
    }

    return normalizedRecords;
  }

  function createNicknameAuthorBanEntry(nickname, note = '') {
    return createNicknameAuthorRecord(nickname, note, 'banned');
  }

  function createAuthorBanEntry(author, note = '') {
    return createAuthorRecord(author, note, 'banned');
  }

  function normalizeAuthorBanEntries(entries) {
    return normalizeAuthorRecords(entries)
      .filter((entry) => entry.status === 'banned')
      .slice(0, constants.MAX_AUTHOR_BAN_ENTRIES);
  }

  function normalizeAuthorBanOverlayMode(value) {
    return value === 'hide' ? 'hide' : constants.DEFAULT_AUTHOR_BAN_OVERLAY_MODE;
  }

  function normalizeConfirmBannedAuthorJoin(value) {
    return value !== false;
  }

  function getMatchingAuthorRecords(author, records) {
    const normalizedAuthor = normalizeAuthor(author);
    if (!normalizedAuthor?.key) {
      return [];
    }

    return normalizeAuthorRecords(records).filter((record) => {
      if (record.type === 'uid') {
        return normalizedAuthor.uid && record.value === normalizedAuthor.uid;
      }

      if (record.type === 'anonymous') {
        return normalizedAuthor.nickname
          && normalizedAuthor.ip
          && record.value === buildAnonymousAuthorValue(normalizedAuthor.nickname, normalizedAuthor.ip);
      }

      return normalizedAuthor.nickname && record.value === normalizedAuthor.nickname;
    });
  }

  function getMatchingAuthorBanEntries(author, entries) {
    return getMatchingAuthorRecords(author, entries)
      .filter((record) => record.status === 'banned');
  }

  function isAuthorBanned(author, records) {
    return getMatchingAuthorRecords(author, records)
      .some((record) => record.status === 'banned');
  }

  function getAuthorRecordTypePriority(type) {
    if (type === 'uid') {
      return 3;
    }
    if (type === 'anonymous') {
      return 2;
    }
    return type === 'nickname' ? 1 : 0;
  }

  function getPrimaryAuthorRecord(author, records) {
    const matchingRecords = getMatchingAuthorRecords(author, records);
    return matchingRecords.reduce((bestRecord, record) => (
      !bestRecord || getAuthorRecordTypePriority(record.type) > getAuthorRecordTypePriority(bestRecord.type)
        ? record
        : bestRecord
    ), null);
  }

  function getAuthorRecordNote(author, records) {
    return [...getMatchingAuthorRecords(author, records)]
      .sort((left, right) => getAuthorRecordTypePriority(right.type) - getAuthorRecordTypePriority(left.type))
      .find((record) => normalizeAuthorNote(record.note))
      ?.note || '';
  }

  function getAuthorRecordMatchSummary(author, records) {
    const matches = getMatchingAuthorRecords(author, records)
      .sort((left, right) => getAuthorRecordTypePriority(right.type) - getAuthorRecordTypePriority(left.type));
    const primaryRecord = matches[0] || null;
    const primaryBannedRecord = matches.find((record) => record.status === 'banned') || null;
    const noteRecord = matches.find((record) => normalizeAuthorNote(record.note)) || null;
    const banNoteRecord = matches.find((record) => (
      record.status === 'banned' && normalizeAuthorNote(record.note)
    )) || null;
    const note = noteRecord?.note || '';
    const banNote = banNoteRecord?.note || '';

    return {
      isBanned: Boolean(primaryBannedRecord),
      hasNote: Boolean(note),
      note,
      hasBanNote: Boolean(banNote),
      banNote,
      matches,
      primaryRecord,
      primaryBannedRecord,
      noteRecord,
      banNoteRecord
    };
  }

  function getAuthorRecordRemovalKeys(author, records, mode = 'primary') {
    const matchingRecords = getMatchingAuthorRecords(author, records);
    if (mode === 'all') {
      return matchingRecords.map((record) => record.key);
    }

    const primaryRecord = getPrimaryAuthorRecord(author, records);
    return primaryRecord ? [primaryRecord.key] : [];
  }

  function getPrimaryAuthorBanEntry(author, entries) {
    const matchingEntries = getMatchingAuthorBanEntries(author, entries);
    return matchingEntries.reduce((bestEntry, entry) => (
      !bestEntry || getAuthorRecordTypePriority(entry.type) > getAuthorRecordTypePriority(bestEntry.type)
        ? entry
        : bestEntry
    ), null);
  }

  function getAuthorBanNote(author, entries) {
    return [...getMatchingAuthorBanEntries(author, entries)]
      .sort((left, right) => getAuthorRecordTypePriority(right.type) - getAuthorRecordTypePriority(left.type))
      .find((entry) => normalizeAuthorNote(entry.note))
      ?.note || '';
  }

  function getAuthorBanMatchSummary(author, entries) {
    const matchingEntries = getMatchingAuthorBanEntries(author, entries)
      .sort((left, right) => getAuthorRecordTypePriority(right.type) - getAuthorRecordTypePriority(left.type));
    const primaryEntry = matchingEntries[0] || null;

    return {
      isBanned: matchingEntries.length > 0,
      matches: matchingEntries,
      primaryEntry,
      note: matchingEntries.find((entry) => normalizeAuthorNote(entry.note))?.note || ''
    };
  }

  function getAuthorBanRemovalKeys(author, entries, mode = 'primary') {
    const matchingEntries = getMatchingAuthorBanEntries(author, entries);
    if (mode === 'all') {
      return matchingEntries.map((entry) => entry.key);
    }

    const primaryEntry = getPrimaryAuthorBanEntry(author, entries);
    return primaryEntry ? [primaryEntry.key] : [];
  }

  function parseAuthorFromWriterCell(writerCell) {
    if (!writerCell) {
      return null;
    }

    const nickname = normalizeAuthorNickname(
      getFirstAttributeFromHtml(writerCell.openingTag, 'data-nick')
      || getFirstAttributeFromHtml(writerCell.content, 'data-nick')
    );
    const uid = normalizeAuthorUid(
      getFirstAttributeFromHtml(writerCell.openingTag, 'data-uid')
      || getFirstAttributeFromHtml(writerCell.content, 'data-uid')
    );
    const ip = normalizeAuthorIp(
      getFirstAttributeFromHtml(writerCell.openingTag, 'data-ip')
      || getFirstAttributeFromHtml(writerCell.content, 'data-ip')
    );
    const fallbackText = normalizeAuthorTextValue(stripHtml(writerCell.content));
    const fallbackAnonymousMatch = fallbackText.match(/^(.+?)\s*\(([\d.:*]+)\)$/);

    return normalizeAuthor({
      nickname: nickname || (fallbackAnonymousMatch ? fallbackAnonymousMatch[1] : fallbackText),
      uid,
      ip: ip || (fallbackAnonymousMatch ? fallbackAnonymousMatch[2] : ''),
      displayName: fallbackText
    });
  }

  function hasExcludedPostMarker(rowOpeningTag, rowHtml) {
    const excludedMarkers = new Set(['icon_notice', 'icon_fnews']);
    const dataType = getHtmlAttribute(rowOpeningTag, 'data-type');
    if (excludedMarkers.has(dataType)) {
      return true;
    }

    const openingTags = String(rowHtml || '').match(/<[a-z][^>]*>/gi) || [];
    return openingTags.some((openingTag) => (
      [...excludedMarkers].some((marker) => hasClassToken(openingTag, marker))
    ));
  }

  function parsePostsFromHtml(html, options = {}) {
    const {
      currentTime = Date.now(),
      limit = Number.POSITIVE_INFINITY,
      viewUrlPrefix = constants.VIEW_URL_PREFIX
    } = options;
    const rowRegex = /(<tr\b[^>]*>)([\s\S]*?)<\/tr\s*>/gi;
    const posts = [];

    for (const rowMatch of String(html || '').matchAll(rowRegex)) {
      const rowOpeningTag = rowMatch[1];
      const rowHtml = rowMatch[2];
      const id = Number.parseInt(getHtmlAttribute(rowOpeningTag, 'data-no'), 10);
      if (!Number.isFinite(id) || hasExcludedPostMarker(rowOpeningTag, rowHtml)) {
        continue;
      }

      const subjectCell = findTableCellByClass(rowHtml, 'gall_subject');
      const titleCell = findTableCellByClass(rowHtml, 'gall_tit');
      const writerCell = findTableCellByClass(rowHtml, 'gall_writer');
      const dateCell = findTableCellByClass(rowHtml, 'gall_date');
      if (!subjectCell || !titleCell || !dateCell) {
        continue;
      }

      const subject = decodeHtmlEntities(stripHtml(subjectCell.content).trim());
      if (!isManghoSubject(subject)) {
        continue;
      }

      const titleMatch = titleCell.content.match(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/i);
      const title = decodeHtmlEntities(stripHtml(titleMatch?.[1]).trim());
      const fullDateStr = getHtmlAttribute(dateCell.openingTag, 'title')
        || stripHtml(dateCell.content).trim();
      if (!title) {
        continue;
      }

      posts.push(normalizePost({
        id,
        title,
        subject,
        author: parseAuthorFromWriterCell(writerCell),
        fullDateStr,
        postUrl: `${viewUrlPrefix}${id}`
      }, { currentTime, viewUrlPrefix }));
    }

    return posts
      .filter(Boolean)
      .sort((left, right) => right.id - left.id)
      .slice(0, Number.isFinite(limit) ? limit : undefined);
  }

  function parsePostDate(fullDateStr, referenceTime = Date.now()) {
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
      const nowInKst = new Date(referenceTime + constants.KST_OFFSET_MS);
      const [, hour, minute, second = '00'] = timeOnlyMatch;
      const candidate = createKstDate(
        nowInKst.getUTCFullYear(),
        nowInKst.getUTCMonth() + 1,
        nowInKst.getUTCDate(),
        hour,
        minute,
        second
      );

      if (candidate && candidate.getTime() > referenceTime) {
        return new Date(candidate.getTime() - 24 * 60 * 60 * 1000);
      }

      return candidate;
    }

    const shortDateMatch = trimmedValue.match(/^(\d{2})[-/.](\d{2})[-/.](\d{2})$/);
    if (shortDateMatch) {
      const [, shortYear, month, day] = shortDateMatch;
      return createKstDate(2000 + Number(shortYear), month, day, 0, 0, 0);
    }

    return null;
  }

  function createKstDate(year, month, day, hour, minute, second) {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    const numericHour = Number(hour);
    const numericMinute = Number(minute);
    const numericSecond = Number(second);
    const numericParts = [
      numericYear,
      numericMonth,
      numericDay,
      numericHour,
      numericMinute,
      numericSecond
    ];

    if (
      !numericParts.every(Number.isInteger) ||
      numericMonth < 1 || numericMonth > 12 ||
      numericDay < 1 || numericDay > new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate() ||
      numericHour < 0 || numericHour > 23 ||
      numericMinute < 0 || numericMinute > 59 ||
      numericSecond < 0 || numericSecond > 59
    ) {
      return null;
    }

    const date = new Date(
      Date.UTC(
        numericYear,
        numericMonth - 1,
        numericDay,
        numericHour,
        numericMinute,
        numericSecond
      ) - constants.KST_OFFSET_MS
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatRelativeTime(fullDateStr, currentTime = Date.now()) {
    const postDate = parsePostDate(fullDateStr, currentTime);
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

    const postDate = parsePostDate(post.fullDateStr, currentTime);
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
      author: normalizeAuthor(post?.author),
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
    normalizeAuthor,
    normalizeAuthorNote,
    normalizeAuthorBanNote,
    normalizeAuthorRecordStatus,
    normalizeAuthorRecords,
    normalizeAuthorBanEntries,
    normalizeAuthorBanOverlayMode,
    normalizeConfirmBannedAuthorJoin,
    createNicknameAuthorRecord,
    createAuthorRecord,
    createNicknameAuthorBanEntry,
    createAuthorBanEntry,
    getMatchingAuthorRecords,
    getPrimaryAuthorRecord,
    getAuthorRecordNote,
    getAuthorRecordMatchSummary,
    getAuthorRecordRemovalKeys,
    getMatchingAuthorBanEntries,
    getPrimaryAuthorBanEntry,
    getAuthorBanNote,
    getAuthorBanMatchSummary,
    getAuthorBanRemovalKeys,
    isAuthorBanned,
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
