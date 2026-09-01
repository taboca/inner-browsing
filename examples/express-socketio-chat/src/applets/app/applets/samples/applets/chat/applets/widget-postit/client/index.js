export function createClientApplet() {
  let element;

  function render(state, refDoc) {
    if (!element) {
      element = refDoc.create('article', { className: 'projected-widget-postit' });
      const content = refDoc.create('em', { className: 'projected-widget-postit-content' });
      refDoc.append(content, element);
    }
    element.children[0].textContent = String(state.text || '');
  }

  return {
    init({ state, refDoc }) {
      render(state, refDoc);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    update({ state, refDoc }) {
      render(state, refDoc);
    },
    destroy() {
      element?.remove();
    },
  };
}
