export const appApplet = Object.freeze({
  path: 'app',
  parentPath: null,
  parentAnchor: 'root',
  clientModule: '/applets/app/client/index.js',
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({
    live: 'content',
  }),
});
