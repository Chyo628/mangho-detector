const { JSDOM } = require('jsdom');

function installDom(html, url) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true
  });

  const previous = {
    window: global.window,
    document: global.document,
    Node: global.Node,
    Element: global.Element,
    MutationObserver: global.MutationObserver,
    navigator: global.navigator
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.MutationObserver = dom.window.MutationObserver;
  global.navigator = dom.window.navigator;

  return {
    dom,
    cleanup() {
      dom.window.close();

      Object.keys(previous).forEach((key) => {
        if (typeof previous[key] === 'undefined') {
          delete global[key];
          return;
        }

        global[key] = previous[key];
      });
    }
  };
}

module.exports = {
  installDom
};
