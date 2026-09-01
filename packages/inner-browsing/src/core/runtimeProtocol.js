import { isComposerOperation } from './composerOperations.js';

// Transport-neutral request handlers. HTTP, Socket.IO, WebSocket, tests, or
// an in-process caller can adapt these functions to their own envelopes.
export function createRuntimeProtocol({ runtime } = {}) {
  if (!runtime) throw new Error('Runtime protocol requires a runtime');

  return Object.freeze({
    snapshot() {
      return runtime.snapshot();
    },
    async composerCommand(payload = {}) {
      const { operation, path, state = {} } = payload;
      if (!isComposerOperation(operation)) throw new Error(`Unknown operation: ${operation}`);
      const envelope = await runtime[operation](path, state);
      return {
        hash: envelope.hash,
        treeHash: envelope.treeHash,
        projectionHash: envelope.projectionHash,
        activePaths: envelope.snapshot.activePaths,
        snapshot: envelope.snapshot,
      };
    },
    async appletOperation(payload = {}) {
      const { path, operation, data = {} } = payload;
      return runtime.operate(path, operation, data);
    },
    async projectionOperation(payload = {}) {
      const { projectionKey, operation, data = {} } = payload;
      return runtime.operateProjection(projectionKey, operation, data);
    },
  });
}
