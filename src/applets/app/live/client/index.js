export function createClientApplet() {
  let element;

  return {
    init({ refDoc }) {
      element = refDoc.create('section', { className: 'applet live-applet' });
      const label = refDoc.create('span', { className: 'applet-label', text: 'APP / LIVE' });
      const heading = refDoc.create('h2', { text: 'Live two-column layout' });
      const columns = refDoc.create('div', { className: 'live-columns' });
      const left = refDoc.create('div', { className: 'live-column', text: 'Live surface' });
      const right = refDoc.create('aside', { className: 'live-column live-widgets' });
      refDoc.append(left, columns);
      refDoc.append(right, columns);
      refDoc.append(label, element);
      refDoc.append(heading, element);
      refDoc.append(columns, element);
      refDoc.registerAnchor('left', left);
      refDoc.registerAnchor('right', right);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    destroy() {
      element?.remove();
    },
  };
}
