const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
const { buildListHtml } = require('./helpers/build-list-html');
const { loadHtml } = require('./helpers/load-html');

test('isHelldiversListUrl accepts supported list URLs and rejects others', () => {
  assert.equal(
    domain.isHelldiversListUrl('https://gall.dcinside.com/mgallery/board/lists?id=helldiversseries'),
    true
  );
  assert.equal(
    domain.isHelldiversListUrl('https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries'),
    true
  );
  assert.equal(
    domain.isHelldiversListUrl(
      'https://gall.dcinside.com/mgallery/board/lists/?id=helldiversseries&search_head=60&page=2'
    ),
    true
  );
  assert.equal(
    domain.isHelldiversListUrl('https://gall.dcinside.com/mgallery/board/view/?id=helldiversseries&no=1'),
    false
  );
  assert.equal(
    domain.isHelldiversListUrl('https://m.dcinside.com/board/helldiversseries'),
    false
  );
  assert.equal(
    domain.isHelldiversListUrl('https://gall.dcinside.com/mgallery/board/lists/?id=othergallery'),
    false
  );
});

test('parsePostsFromHtml extracts only mangho posts from the base list', () => {
  const html = loadHtml('test/fixtures/live-list-base.html');
  const posts = domain.parsePostsFromHtml(html);

  assert.deepEqual(posts.map((post) => post.id), [102]);
  assert.ok(posts.every((post) => domain.isManghoSubject(post.subject)));
});

test('parsePostsFromHtml extracts mangho posts from the filtered list', () => {
  const html = loadHtml('test/fixtures/live-list-mangho.html');
  const posts = domain.parsePostsFromHtml(html);

  assert.deepEqual(posts.map((post) => post.id), [202, 201]);
  assert.ok(posts.every((post) => domain.isManghoSubject(post.subject)));
});

test('parsePostsFromHtml preserves registered, anonymous, and fallback writer metadata', () => {
  const html = loadHtml('test/fixtures/live-list-authors-ascii.html');
  const posts = domain.parsePostsFromHtml(html);

  assert.deepEqual(
    posts.map((post) => ({
      id: post.id,
      author: post.author
    })),
    [
      {
        id: 403,
        author: {
          nickname: 'fixed-nick',
          uid: 'fixed123',
          ip: '',
          displayName: 'fixed-nick',
          key: 'uid:fixed123'
        }
      },
      {
        id: 402,
        author: {
          nickname: 'anon',
          uid: '',
          ip: '118.235',
          displayName: 'anon(118.235)',
          key: 'anonymous:anon|118.235'
        }
      },
      {
        id: 401,
        author: {
          nickname: 'special',
          uid: '',
          ip: '211.36',
          displayName: 'special(211.36)',
          key: 'anonymous:special|211.36'
        }
      }
    ]
  );
});

test('parsePostsFromHtml tolerates attribute and class variations while preserving exclusions and limits', () => {
  const html = `
    <table>
      <tr data-type='icon_txt' data-no='303' class='us-post ub-content'>
        <td class='gall_num'>303</td>
        <td data-kind='subject' class='tag gall_subject extra'>\uD5EC\uB9DD\uD638</td>
        <td class='ub-word extra gall_tit'><a href='/view/303'>variant 303</a></td>
        <td title='2026-03-09 10:04:00' class='compact gall_date'>10:04</td>
      </tr>
      <tr class = "ub-content us-post" data-no = "302" data-type = "icon_txt">
        <td class = "gall_num">302</td>
        <td class = "extra gall_subject">\uD5EC\uB9DD\uD638</td>
        <td class = "gall_tit extra"><a href = "/view/302">variant 302</a></td>
        <td class = "gall_date extra" title = "2026-03-09 10:03:00">10:03</td>
      </tr>
      <tr data-no='304' class='ub-content us-post'>
        <td class='gall_subject'>\uD5EC\uB9DD\uD638</td>
        <td class='gall_tit'><span class='extra icon_notice'></span><a>notice</a></td>
        <td class='gall_date' title='2026-03-09 10:05:00'>10:05</td>
      </tr>
      <tr data-no='301' class='ub-content us-post'>
        <td class='gall_subject'>\uC77C\uBC18</td>
        <td class='gall_tit'><a>other subject</a></td>
        <td class='gall_date' title='2026-03-09 10:02:00'>10:02</td>
      </tr>
    </table>
  `;

  const posts = domain.parsePostsFromHtml(html);
  const limitedPosts = domain.parsePostsFromHtml(html, { limit: 1 });

  assert.deepEqual(posts.map((post) => post.id), [303, 302]);
  assert.deepEqual(limitedPosts.map((post) => post.id), [303]);
  assert.equal(posts[0].fullDateStr, '2026-03-09 10:04:00');
});

test('isManghoSubject matches only hel-mangho subject labels', () => {
  assert.equal(domain.isManghoSubject('\uD5EC\uB9DD\uD638'), true);
  assert.equal(domain.isManghoSubject(' \uD5EC\uB9DD\uD638 '), true);
  assert.equal(domain.isManghoSubject('\uB9DD\uD638'), false);
  assert.equal(domain.isManghoSubject('\uB9F9\uD638'), false);
});

test('author ban helpers normalize exact rules, dedupe invalid entries, and preserve fail-open behavior', () => {
  const normalizedAuthor = domain.normalizeAuthor({
    nickname: ' Cafe\u0301 ',
    uid: '',
    ip: '118.235',
    displayName: ''
  });
  const authorEntries = domain.normalizeAuthorBanEntries([
    { type: 'nickname', value: 'Caf\u00E9' },
    { type: 'nickname', value: 'Caf\u00E9' },
    { type: 'uid', value: 'fixed123', label: '\uACE0\uB2C9' },
    { type: 'anonymous', value: '\u3147\u3147|118.235', label: '\u3147\u3147(118.235)' },
    { type: 'anonymous', value: 'broken-entry' },
    { type: 'unknown', value: 'ignored' }
  ]);

  assert.deepEqual(normalizedAuthor, {
    nickname: 'Caf\u00E9',
    uid: '',
    ip: '118.235',
    displayName: 'Caf\u00E9 (118.235)',
    key: 'anonymous:Caf\u00E9|118.235'
  });
  assert.equal(domain.normalizeAuthorBanOverlayMode('hide'), 'hide');
  assert.equal(domain.normalizeAuthorBanOverlayMode('other'), 'warn');
  assert.equal(domain.normalizeConfirmBannedAuthorJoin(undefined), true);
  assert.equal(domain.normalizeConfirmBannedAuthorJoin(false), false);
  assert.deepEqual(authorEntries, [
    {
      key: 'nickname:Caf\u00E9',
      type: 'nickname',
      value: 'Caf\u00E9',
      label: 'Caf\u00E9',
      status: 'banned'
    },
    {
      key: 'uid:fixed123',
      type: 'uid',
      value: 'fixed123',
      label: '\uACE0\uB2C9',
      status: 'banned'
    },
    {
      key: 'anonymous:\u3147\u3147|118.235',
      type: 'anonymous',
      value: '\u3147\u3147|118.235',
      label: '\u3147\u3147(118.235)',
      status: 'banned'
    }
  ]);
  assert.deepEqual(
    domain.createAuthorBanEntry({ nickname: '\uACE0\uB2C9', uid: 'fixed123', ip: '' }),
    {
      key: 'uid:fixed123',
      type: 'uid',
      value: 'fixed123',
      label: '\uACE0\uB2C9',
      status: 'banned'
    }
  );
  assert.deepEqual(
    domain.createAuthorBanEntry({ nickname: '\u3147\u3147', uid: '', ip: '118.235' }),
    {
      key: 'anonymous:\u3147\u3147|118.235',
      type: 'anonymous',
      value: '\u3147\u3147|118.235',
      label: '\u3147\u3147 (118.235)',
      status: 'banned'
    }
  );
  assert.deepEqual(
    domain.createNicknameAuthorBanEntry(' \uC218\uB3D9\uB2C9 '),
    {
      key: 'nickname:\uC218\uB3D9\uB2C9',
      type: 'nickname',
      value: '\uC218\uB3D9\uB2C9',
      label: '\uC218\uB3D9\uB2C9',
      status: 'banned'
    }
  );
  assert.equal(
    domain.isAuthorBanned({ nickname: 'alpha', uid: '', ip: '' }, authorEntries),
    false
  );
  assert.equal(
    domain.isAuthorBanned({ nickname: 'Caf\u00E9', uid: '', ip: '' }, authorEntries),
    true
  );
  assert.equal(
    domain.isAuthorBanned({ nickname: '\u3147\u3147', uid: '', ip: '118.235' }, authorEntries),
    true
  );
  assert.equal(
    domain.isAuthorBanned({ nickname: '\u3147\u3147', uid: '', ip: '118.111' }, authorEntries),
    false
  );
  assert.equal(
    domain.isAuthorBanned(null, authorEntries),
    false
  );
  assert.deepEqual(
    domain.getMatchingAuthorBanEntries(
      { nickname: '\uACE0\uB2C9', uid: 'fixed123', ip: '' },
      authorEntries
    ),
    [{
      key: 'uid:fixed123',
      type: 'uid',
      value: 'fixed123',
      label: '\uACE0\uB2C9',
      status: 'banned'
    }]
  );
});

test('author ban notes stay optional, normalize safely, and prefer the most specific matching rule', () => {
  const legacyEntry = domain.createNicknameAuthorBanEntry('Legacy');
  const nicknameEntry = domain.createNicknameAuthorBanEntry('Alpha', '  반복   폭격 유도  ');
  const uidEntry = domain.createAuthorBanEntry(
    { nickname: 'Alpha', uid: 'alpha-uid', ip: '', displayName: 'Alpha' },
    '계정 단위 메모'
  );
  const normalizedEntries = domain.normalizeAuthorBanEntries([
    legacyEntry,
    nicknameEntry,
    uidEntry
  ]);
  const author = { nickname: 'Alpha', uid: 'alpha-uid', ip: '', displayName: 'Alpha' };

  assert.deepEqual(legacyEntry, {
    key: 'nickname:Legacy',
    type: 'nickname',
    value: 'Legacy',
    label: 'Legacy',
    status: 'banned'
  });
  assert.equal(nicknameEntry.note, '반복 폭격 유도');
  assert.equal(domain.getPrimaryAuthorBanEntry(author, normalizedEntries).key, 'uid:alpha-uid');
  assert.equal(domain.getAuthorBanNote(author, normalizedEntries), '계정 단위 메모');
  assert.equal(
    domain.getAuthorBanNote(author, [nicknameEntry, { ...uidEntry, note: '' }]),
    '반복 폭격 유도'
  );
  assert.equal(
    domain.normalizeAuthorBanNote('x'.repeat(domain.constants.MAX_AUTHOR_BAN_NOTE_LENGTH + 20)).length,
    domain.constants.MAX_AUTHOR_BAN_NOTE_LENGTH
  );
  assert.deepEqual(
    domain.getAuthorBanMatchSummary(author, normalizedEntries),
    {
      isBanned: true,
      matches: [uidEntry, nicknameEntry],
      primaryEntry: uidEntry,
      note: '계정 단위 메모'
    }
  );
  assert.deepEqual(
    domain.getAuthorBanRemovalKeys(author, normalizedEntries),
    ['uid:alpha-uid']
  );
  assert.deepEqual(
    domain.getAuthorBanRemovalKeys(author, normalizedEntries, 'all'),
    ['nickname:Alpha', 'uid:alpha-uid']
  );
});

test('author records preserve notes while status swaps and keep specific-match priority', () => {
  const nicknameRecord = domain.createNicknameAuthorRecord('Alpha', 'broad ban note', 'banned');
  const uidRecord = domain.createAuthorRecord(
    { nickname: 'Alpha', uid: 'alpha-uid', ip: '', displayName: 'Alpha' },
    'specific author note',
    'note'
  );
  const author = { nickname: 'Alpha', uid: 'alpha-uid', ip: '', displayName: 'Alpha' };
  const records = domain.normalizeAuthorRecords([
    nicknameRecord,
    uidRecord,
    { ...uidRecord, status: 'banned' },
    { type: 'anonymous', value: 'broken-entry', status: 'note' }
  ]);

  assert.deepEqual(records, [nicknameRecord, uidRecord]);
  assert.deepEqual(domain.getAuthorRecordMatchSummary(author, records), {
    isBanned: true,
    hasNote: true,
    note: 'specific author note',
    hasBanNote: true,
    banNote: 'broad ban note',
    matches: [uidRecord, nicknameRecord],
    primaryRecord: uidRecord,
    primaryBannedRecord: nicknameRecord,
    noteRecord: uidRecord,
    banNoteRecord: nicknameRecord
  });
  assert.deepEqual(domain.getAuthorRecordRemovalKeys(author, records), ['uid:alpha-uid']);
  assert.deepEqual(
    domain.getAuthorRecordRemovalKeys(author, records, 'all'),
    ['nickname:Alpha', 'uid:alpha-uid']
  );
  assert.equal(domain.getAuthorRecordNote(author, records), 'specific author note');
  assert.equal(domain.normalizeAuthorRecords([
    { type: 'nickname', value: 'Legacy ban' }
  ])[0].status, 'banned');
  assert.equal(domain.normalizeAuthorRecordStatus('unexpected', 'note'), 'note');
  assert.equal(
    domain.normalizeAuthorNote('x'.repeat(domain.constants.MAX_AUTHOR_NOTE_LENGTH + 20)).length,
    domain.constants.MAX_AUTHOR_NOTE_LENGTH
  );

  const grandfatheredRecords = domain.normalizeAuthorRecords(Array.from(
    { length: domain.constants.MAX_AUTHOR_RECORDS + 1 },
    (_, index) => domain.createNicknameAuthorRecord(`Migrated ${index}`, '', 'banned')
  ));
  assert.equal(grandfatheredRecords.length, domain.constants.MAX_AUTHOR_RECORDS + 1);
});

test('decodeHtmlEntities decodes named, numeric, and double-encoded numeric entities', () => {
  assert.equal(
    domain.decodeHtmlEntities('&amp;#x267f; &#x267f; &#9855; &amp; &quot;'),
    '\u267f \u267f \u267f & "'
  );
});

test('parsePostDate uses its reference time for time-only values across KST midnight', () => {
  const referenceTime = Date.parse('2026-03-09T15:05:00Z');

  assert.equal(
    domain.parsePostDate('23:59', referenceTime).toISOString(),
    '2026-03-09T14:59:00.000Z'
  );
  assert.equal(
    domain.parsePostDate('00:03', referenceTime).toISOString(),
    '2026-03-09T15:03:00.000Z'
  );
});

test('parsePostDate rejects calendar and clock values that JavaScript would normalize', () => {
  assert.equal(domain.parsePostDate('2026-02-30 10:00:00'), null);
  assert.equal(domain.parsePostDate('2026-03-09 24:00:00'), null);
  assert.equal(domain.parsePostDate('25:00', Date.parse('2026-03-09T01:05:00Z')), null);
});

test('parsePostsFromHtml decodes numeric entities in titles', () => {
  const posts = domain.parsePostsFromHtml(
    buildListHtml([{
      id: 99,
      title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
      fullDateStr: '2026-03-09 10:04:00'
    }]),
    {
      currentTime: Date.parse('2026-03-09T01:05:00Z'),
      limit: domain.constants.LIVE_POST_LIMIT,
      viewUrlPrefix: domain.constants.VIEW_URL_PREFIX
    }
  );

  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f');
});

test('refreshRelativeTimes decodes cached titles that still contain numeric entities', () => {
  const posts = domain.refreshRelativeTimes(
    [{
      id: 100,
      title: '&#x267f;&#x267f;&#x267f; \uC77C\uC7A5\uC5F0 10 &#x267f;&#x267f;&#x267f;',
      subject: '\uD5EC\uB9DD\uD638',
      fullDateStr: '2026-03-09 10:04:00',
      postUrl: 'https://example.com/100',
      detectedAt: Date.parse('2026-03-09T01:04:00Z')
    }],
    {
      currentTime: Date.parse('2026-03-09T01:05:00Z')
    }
  );

  assert.equal(posts[0].title, '\u267f\u267f\u267f \uC77C\uC7A5\uC5F0 10 \u267f\u267f\u267f');
});

test('trimRecentHistoryPosts enforces age and count limits together', () => {
  const currentTime = Date.parse('2026-03-09T01:05:00Z');
  const posts = domain.trimRecentHistoryPosts(
    [
      {
        id: 13,
        title: 'newest',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/13',
        detectedAt: currentTime - 2 * 60 * 1000
      },
      {
        id: 12,
        title: 'second',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/12',
        detectedAt: currentTime - 10 * 60 * 1000
      },
      {
        id: 11,
        title: 'expired',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/11',
        detectedAt: currentTime - 40 * 60 * 1000
      }
    ],
    {
      currentTime,
      maxCount: 2,
      maxAgeMs: 30 * 60 * 1000,
      viewUrlPrefix: 'https://example.com/'
    }
  );

  assert.deepEqual(posts.map((post) => post.id), [13, 12]);
});

test('trimRecentHistoryPosts enforces default count and retention windows', () => {
  const currentTime = Date.parse('2026-03-09T01:30:00Z');
  const posts = Array.from({ length: 18 }, (_, index) => ({
    id: 200 - index,
    title: `history ${200 - index}`,
    subject: domain.constants.MANGHO_SUBJECTS[0],
    fullDateStr: '',
    postUrl: `https://example.com/${200 - index}`,
    detectedAt: currentTime - (index * 60 * 1000)
  }));

  const trimmed = domain.trimRecentHistoryPosts(posts, { currentTime });

  assert.equal(trimmed.length, 15);
  assert.equal(trimmed[0].id, 200);
  assert.equal(trimmed.at(-1).id, 186);
});

test('trimRecentHistoryPosts respects explicit count and age settings', () => {
  const currentTime = Date.parse('2026-03-09T01:30:00Z');
  const posts = [
    {
      id: 51,
      title: 'recent 1',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '',
      postUrl: 'https://example.com/51',
      detectedAt: currentTime - (5 * 60 * 1000)
    },
    {
      id: 50,
      title: 'recent 2',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '',
      postUrl: 'https://example.com/50',
      detectedAt: currentTime - (20 * 60 * 1000)
    },
    {
      id: 49,
      title: 'expired',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '',
      postUrl: 'https://example.com/49',
      detectedAt: currentTime - (40 * 60 * 1000)
    }
  ];

  const trimmed = domain.trimRecentHistoryPosts(posts, {
    currentTime,
    maxCount: 2,
    maxAgeMs: 30 * 60 * 1000
  });

  assert.deepEqual(trimmed.map((post) => post.id), [51, 50]);
});

test('isUnreadPostActive uses a 15 minute default window and respects overrides', () => {
  const currentTime = Date.parse('2026-03-09T01:30:00Z');

  assert.equal(
    domain.isUnreadPostActive(
      { detectedAt: currentTime - (15 * 60 * 1000) },
      { currentTime }
    ),
    true
  );
  assert.equal(
    domain.isUnreadPostActive(
      { detectedAt: currentTime - (15 * 60 * 1000) - 1 },
      { currentTime }
    ),
    false
  );
  assert.equal(
    domain.isUnreadPostActive(
      { detectedAt: currentTime - (6 * 60 * 1000) },
      { currentTime, maxAgeMs: 5 * 60 * 1000 }
    ),
    false
  );
});

test('filterRecentOpenPosts excludes closed and stale posts', () => {
  const currentTime = Date.parse('2026-03-09T01:05:00Z');
  const posts = [
    {
      id: 11,
      title: 'open lobby 2/4',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '2026-03-09 10:03:00',
      postUrl: 'https://example.com/11'
    },
    {
      id: 10,
      title: '\uD480\uBC29 \uB9C8\uAC10',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '2026-03-09 10:04:00',
      postUrl: 'https://example.com/10'
    },
    {
      id: 9,
      title: 'stale lobby',
      subject: domain.constants.MANGHO_SUBJECTS[0],
      fullDateStr: '2026-03-09 09:40:00',
      postUrl: 'https://example.com/9'
    }
  ];

  const filtered = domain.filterRecentOpenPosts(posts, {
    currentTime,
    viewUrlPrefix: 'https://example.com/'
  });

  assert.deepEqual(filtered.map((post) => post.id), [11]);
});

test('isOpenRecruitment treats mangho shorthand as closed after whitespace normalization', () => {
  const currentTime = Date.parse('2026-03-09T01:05:00Z');
  const createPost = (title) => ({
    title,
    fullDateStr: '2026-03-09 10:04:00'
  });

  assert.equal(domain.isOpenRecruitment(createPost('\u3141\u3131'), currentTime), false);
  assert.equal(domain.isOpenRecruitment(createPost('\u3141 \u3131'), currentTime), false);
  assert.equal(domain.isOpenRecruitment(createPost('open lobby 2/4'), currentTime), true);
});

test('mergePosts merges duplicates, preserves first-seen detection time, and keeps fresher fields', () => {
  const merged = domain.mergePosts(
    [
      {
        id: 1,
        title: 'first-live',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        author: {
          nickname: 'live author',
          uid: 'live123',
          ip: ''
        },
        fullDateStr: '',
        postUrl: 'https://example.com/1',
        detectedAt: 300
      }
    ],
    [
      {
        id: 2,
        title: 'second',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/2',
        detectedAt: 200
      },
      {
        id: 1,
        title: 'first-cached',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        author: null,
        fullDateStr: '',
        postUrl: 'https://example.com/1',
        detectedAt: 100
      }
    ],
    {
      currentTime: 500,
      viewUrlPrefix: 'https://example.com/'
    }
  );

  assert.deepEqual(merged.map((post) => post.id), [2, 1]);
  assert.equal(merged.find((post) => post.id === 1).detectedAt, 100);
  assert.equal(merged.find((post) => post.id === 1).title, 'first-live');
  assert.deepEqual(merged.find((post) => post.id === 1).author, {
    nickname: 'live author',
    uid: 'live123',
    ip: '',
    displayName: 'live author',
    key: 'uid:live123'
  });
});

test('extractLobbyLinkFromHtml returns a steam lobby link when present', () => {
  const html = '<div>steam://joinlobby/553850/12345678901234567/76561198000000000</div>';
  assert.equal(
    domain.extractLobbyLinkFromHtml(html),
    'steam://joinlobby/553850/12345678901234567/76561198000000000'
  );
  assert.equal(domain.extractLobbyLinkFromHtml('<div>no lobby</div>'), null);
});
