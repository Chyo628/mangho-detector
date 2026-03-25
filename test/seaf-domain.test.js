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
  const html = loadHtml('live_lists_base.html');
  const posts = domain.parsePostsFromHtml(html);

  assert.ok(posts.length > 0);
  assert.ok(posts.every((post) => domain.isManghoSubject(post.subject)));
});

test('parsePostsFromHtml extracts mangho posts from the filtered list', () => {
  const html = loadHtml('live_lists_mangho.html');
  const posts = domain.parsePostsFromHtml(html);

  assert.ok(posts.length > 0);
  assert.ok(posts.every((post) => domain.isManghoSubject(post.subject)));
});

test('isManghoSubject matches only hel-mangho subject labels', () => {
  assert.equal(domain.isManghoSubject('\uD5EC\uB9DD\uD638'), true);
  assert.equal(domain.isManghoSubject(' \uD5EC\uB9DD\uD638 '), true);
  assert.equal(domain.isManghoSubject('\uB9DD\uD638'), false);
  assert.equal(domain.isManghoSubject('\uB9F9\uD638'), false);
});

test('decodeHtmlEntities decodes named, numeric, and double-encoded numeric entities', () => {
  assert.equal(
    domain.decodeHtmlEntities('&amp;#x267f; &#x267f; &#9855; &amp; &quot;'),
    '\u267f \u267f \u267f & "'
  );
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

test('mergePosts merges duplicates and keeps the latest detection timestamp', () => {
  const merged = domain.mergePosts(
    [
      {
        id: 1,
        title: 'first',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/1',
        detectedAt: 100
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
        title: 'first-updated',
        subject: domain.constants.MANGHO_SUBJECTS[0],
        fullDateStr: '',
        postUrl: 'https://example.com/1',
        detectedAt: 300
      }
    ],
    {
      currentTime: 500,
      viewUrlPrefix: 'https://example.com/'
    }
  );

  assert.deepEqual(merged.map((post) => post.id), [2, 1]);
  assert.equal(merged.find((post) => post.id === 1).detectedAt, 300);
});

test('extractLobbyLinkFromHtml returns a steam lobby link when present', () => {
  const html = '<div>steam://joinlobby/553850/12345678901234567/76561198000000000</div>';
  assert.equal(
    domain.extractLobbyLinkFromHtml(html),
    'steam://joinlobby/553850/12345678901234567/76561198000000000'
  );
  assert.equal(domain.extractLobbyLinkFromHtml('<div>no lobby</div>'), null);
});
