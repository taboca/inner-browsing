export function createClientApplet() {
  let element;

  return {
    init({ refDoc }) {
      element = refDoc.create('section', { className: 'applet samples-applet' });
      const label = refDoc.create('span', { className: 'applet-label', text: 'APP / SAMPLES' });
      const heading = refDoc.create('h2', { text: 'Inner Browsing samples' });
      const content = refDoc.create('div', { className: 'samples-content' });
      refDoc.append(label, element);
      refDoc.append(heading, element);
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
