export function createServerApplet() {
  return {
    init({ path, state, log }) {
      log('init', { path, present: state.present });
      return { role: 'live-menu' };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
