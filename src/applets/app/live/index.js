export const liveApplet = Object.freeze({
  path: 'app/live',
  parentPath: 'app',
  parentAnchor: 'content',
  clientModule: '/applets/app/live/client/index.js',
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({
    menu: 'left',
    widgets: 'right',
  }),
});
