export function createServerApplet() {
  return {
    init({ path, state, log }) {
      log('init', { path, items: state.items || ['Agenda', 'Notes', 'People'] });
      return { role: 'widget-list', itemCount: Array.isArray(state.items) ? state.items.length : 3 };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
