export function createRefDoc({ document, host, path }) {
  const anchors = new Map();

  return Object.freeze({
    path,
    create(tagName, attributes = {}) {
      const element = document.createElement(tagName);
      Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'text') element.textContent = value;
        else if (key === 'className') element.className = value;
        else element.setAttribute(key, value);
      });
      return element;
    },
    append(element, target = host) {
      target.append(element);
      return element;
    },
    registerAnchor(name, element) {
      if (anchors.has(name)) throw new Error(`${path} already registered anchor ${name}`);
      anchors.set(name, element);
      element.dataset.appletAnchor = `${path}:${name}`;
      return element;
    },
    anchor(name) {
      return anchors.get(name) || null;
    },
    anchorNames() {
      return [...anchors.keys()];
    },
  });
}
