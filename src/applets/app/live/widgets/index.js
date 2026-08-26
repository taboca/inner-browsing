export const widgetsApplet = Object.freeze({
  path: 'app/live/widgets',
  parentPath: 'app/live',
  parentAnchor: 'right',
  clientModule: '/applets/app/live/widgets/client/index.js',
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({}),
});
