export function createClientApplet() {
  let element;
  let button;
  let status;
  let onAddWidgets;

  return {
    init({ refDoc, appletOperation }) {
      element = refDoc.create('nav', { className: 'applet menu-applet' });
      refDoc.append(refDoc.create('span', { className: 'applet-label', text: 'APP / LIVE / MENU' }), element);
      refDoc.append(refDoc.create('h3', { text: 'Menu' }), element);
      button = refDoc.create('button', { type: 'button', text: 'Add widgets' });
      status = refDoc.create('p', { className: 'operation-status', text: 'Widgets are loaded by the menu server companion.' });
      onAddWidgets = async () => {
        button.disabled = true;
        status.textContent = 'Adding widgets…';
        try {
          await appletOperation.send('Add widgets');
          status.textContent = 'Widgets added.';
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
      button.addEventListener('click', onAddWidgets);
      refDoc.append(button, element);
      refDoc.append(status, element);
    },
    mount({ refDoc }) {
      refDoc.append(element);
    },
    destroy() {
      button?.removeEventListener('click', onAddWidgets);
      element?.remove();
    },
  };
}
