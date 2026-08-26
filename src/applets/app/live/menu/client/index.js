export function createClientApplet() {
  let element;

  return {
    init({ refDoc }) {
      element = refDoc.create('nav', { className: 'applet menu-applet' });
      refDoc.append(refDoc.create('span', { className: 'applet-label', text: 'APP / LIVE / MENU' }), element);
      refDoc.append(refDoc.create('h3', { text: 'Menu' }), element);
      refDoc.append(refDoc.create('button', { type: 'button', text: 'Add widgets' }), element);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    destroy() {
      element?.remove();
    },
  };
}
