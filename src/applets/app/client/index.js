export function createClientApplet() {
  let element;

  return {
    init({ refDoc }) {
      element = refDoc.create('div', { className: 'app-root' });
      const content = refDoc.create('div', { className: 'app-content' });
      refDoc.append(content, element);
      refDoc.registerAnchor('content', content);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    destroy() {
      element?.remove();
    },
  };
}
