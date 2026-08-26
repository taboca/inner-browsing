export function createServerApplet() {
  return {
    init({ path, state, log }) {
      log('init', { path, layout: 'two-columns', present: state.present });
      return { role: 'live-layout', columns: ['left', 'right'] };
    },
    destroy({ path, log }) {
      log('destroy', { path });
    },
  };
}
