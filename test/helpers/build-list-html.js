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
    type = 'icon_txt'
  } = post;

  return `
    <tr class="ub-content us-post" data-no="${id}" data-type="${type}">
      <td class="gall_num">${id}</td>
      <td class="gall_subject">${escapeHtml(subject)}</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=helldiversseries&no=${id}">${escapeHtml(title)}</a>
      </td>
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
