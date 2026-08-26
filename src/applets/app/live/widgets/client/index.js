export function createClientApplet() {
  let element;

  return {
    init({ refDoc, state }) {
      element = refDoc.create('section', { className: 'applet widgets-applet' });
      refDoc.append(refDoc.create('span', { className: 'applet-label', text: 'APP / LIVE / WIDGETS' }), element);
      refDoc.append(refDoc.create('h3', { text: 'Widgets' }), element);
      const list = refDoc.create('ul');
      (state.items || ['Agenda', 'Notes', 'People']).forEach((name) => {
        refDoc.append(refDoc.create('li', { text: name }), list);
      });
      refDoc.append(list, element);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    destroy() {
      element?.remove();
    },
  };
}
