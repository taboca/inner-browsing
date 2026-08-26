import { fileURLToPath } from 'node:url';

export const widgetsApplet = Object.freeze({
  path: 'app/live/widgets',
  parentPath: 'app/live',
  parentAnchor: 'right',
  clientModule: '/applets/app/live/widgets/client/index.js',
  clientFile: fileURLToPath(new URL('./client/index.js', import.meta.url)),
  createServer: () => import('./server/index.js').then(({ createServerApplet }) => createServerApplet()),
  accepts: Object.freeze({}),
});
