const fs = require('node:fs');
const path = require('node:path');

function loadHtml(filename) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', filename), 'utf8');
}

module.exports = {
  loadHtml
};
