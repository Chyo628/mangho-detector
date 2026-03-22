const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../scripts/shared/seaf-domain.js');
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
