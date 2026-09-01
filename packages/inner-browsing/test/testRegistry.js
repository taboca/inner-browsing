import { createAppletRegistry } from '../src/core/appletRegistry.js';

function server(role) {
  return async () => ({
    init() { return { role }; },
  });
}

export const testDefinitions = Object.freeze([
  Object.freeze({
    path: 'app',
    parentPath: null,
    parentAnchor: 'root',
    clientModule: '/clients/app.js',
    createServer: server('app'),
    accepts: Object.freeze({ workspace: 'content' }),
  }),
  Object.freeze({
    path: 'app/workspace',
    parentPath: 'app',
    parentAnchor: 'content',
    clientModule: '/clients/workspace.js',
    createServer: server('workspace'),
    accepts: Object.freeze({ chat: 'content' }),
  }),
  Object.freeze({
    path: 'app/workspace/chat',
    parentPath: 'app/workspace',
    parentAnchor: 'content',
    clientModule: '/clients/chat.js',
    createServer: server('chat'),
    accepts: Object.freeze({}),
  }),
  Object.freeze({
    path: 'presentation/note',
    instanceMode: 'projected',
    parentPath: null,
    parentAnchor: null,
    clientModule: '/clients/note.js',
    createServer: server('note'),
    accepts: Object.freeze({}),
  }),
]);

export function createTestRegistry(options = {}) {
  return createAppletRegistry({ definitions: testDefinitions, ...options });
}
