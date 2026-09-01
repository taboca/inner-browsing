export function createClientApplet() {
  let element;

  return {
    init({ refDoc }) {
      element = refDoc.create('div', { className: 'samples-root' });
      const content = refDoc.create('div', { className: 'samples-content' });
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
