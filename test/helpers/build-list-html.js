function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRow(post) {
  const {
    id,
    title,
    subject = '\uD5EC\uB9DD\uD638',
    fullDateStr = '2026-03-09 10:00:00',
    type = 'icon_txt',
    author = null
  } = post;
  const authorAttributes = [];
  const authorText = (() => {
    if (!author || typeof author !== 'object') {
      return '';
    }

    if (typeof author.nickname === 'string' && author.nickname) {
      authorAttributes.push(`data-nick="${escapeHtml(author.nickname)}"`);
    }
    if (typeof author.uid === 'string' && author.uid) {
      authorAttributes.push(`data-uid="${escapeHtml(author.uid)}"`);
    }
    if (typeof author.ip === 'string' && author.ip) {
      authorAttributes.push(`data-ip="${escapeHtml(author.ip)}"`);
    }

    if (typeof author.text === 'string') {
      return author.text;
    }

    if (author.nickname && author.ip && !author.uid) {
      return `${author.nickname}(${author.ip})`;
    }

    return author.nickname || '';
  })();

  return `
    <tr class="ub-content us-post" data-no="${id}" data-type="${type}">
      <td class="gall_num">${id}</td>
      <td class="gall_subject">${escapeHtml(subject)}</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=helldiversseries&no=${id}">${escapeHtml(title)}</a>
      </td>
      <td class="gall_writer ub-writer" ${authorAttributes.join(' ')}>${escapeHtml(authorText)}</td>
      <td class="gall_date" title="${escapeHtml(fullDateStr)}">${escapeHtml(fullDateStr)}</td>
    </tr>
  `;
}

function buildListHtml(posts) {
  return `
    <!doctype html>
    <html lang="ko">
      <body>
        <table class="gall_list">
          <tbody class="listwrap2">
            ${posts.map((post) => buildRow(post)).join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;
}

module.exports = {
  buildRow,
  buildListHtml
};
