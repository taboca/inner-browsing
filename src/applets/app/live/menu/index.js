export const menuApplet = Object.freeze({
  path: 'app/live/menu',
  parentPath: 'app/live',
  parentAnchor: 'left',
  clientModule: '/applets/app/live/menu/client/index.js',
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({}),
});
