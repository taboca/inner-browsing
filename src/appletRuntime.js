import { isComposerOperation } from './composerOperations.js';

export function createAppletRuntime({ registry, store, publish = () => {}, log = console.log }) {
  const instances = new Map();
  let operationQueue = Promise.resolve();

  function parseCommand(command, state) {
    if (typeof command !== 'string') {
      throw new Error('appComposer.command expects "load path", "update path", or "destroy path"');
    }
    const parts = command.trim().split(/\s+/);
    if (parts.length !== 2) throw new Error(`Invalid app composer command: ${command}`);
    return { operation: parts[0], path: parts[1], state };
  }

  const appComposer = Object.freeze({
    command(command, state = {}) {
      const parsed = parseCommand(command, state);
      return apply(parsed.operation, parsed.path, parsed.state);
    },
  });

  function appletLog(path, phase, detail = {}) {
    log(`[server:${path}] ${phase}`, detail);
  }

  async function start(path) {
    if (instances.has(path)) return;
    const definition = registry.get(path);
    const instance = await definition.createServer();
    const operations = (await definition.createServerOperations?.()) || null;
    const context = {
      path,
      state: store.readState(path),
      appComposer,
      log: (phase, detail) => appletLog(path, phase, detail),
    };
    const value = await instance.init?.(context);
    instances.set(path, { definition, instance, operations, value, state: context.state });
  }

  async function stop(path) {
    const record = instances.get(path);
    if (!record) return;
    await record.instance.destroy?.({
      path,
      value: record.value,
      state: record.state,
      appComposer,
      log: (phase, detail) => appletLog(path, phase, detail),
    });
    instances.delete(path);
  }

  function printSnapshot(snapshot) {
    const treeLines = [];
    function visit(node, prefix = '') {
      treeLines.push(`${prefix}${node.name} ${node.hash.slice(0, 12)}`);
      node.children.forEach((child) => visit(child, `${prefix}  `));
    }
    snapshot.roots.forEach((root) => visit(root));
    log(`\n[state ${snapshot.hash}]`);
    log(treeLines.length ? treeLines.join('\n') : '(empty tree)');
  }

  function apply(operation, path, state = {}) {
    const work = async () => {
      if (!isComposerOperation(operation)) throw new Error(`Unknown operation: ${operation}`);
      const result = operation === 'load'
        ? store.load(path, state)
        : operation === 'update' ? store.update(path, state) : store.destroy(path);
      for (const removed of result.removed) await stop(removed);
      for (const added of result.added) await start(added);
      for (const updated of result.updated || []) {
        const record = instances.get(updated);
        if (record) record.state = store.readState(updated);
      }
      const envelope = {
        type: 'navigator.snapshot',
        operation,
        path,
        hash: result.snapshot.hash,
        snapshot: result.snapshot,
      };
      printSnapshot(result.snapshot);
      publish(envelope);
      return envelope;
    };
    const result = operationQueue.then(work, work);
    operationQueue = result.catch(() => {});
    return result;
  }

  async function restore() {
    const current = store.snapshot();
    for (const path of current.activePaths) await start(path);
    return current;
  }

  async function operate(path, operation, data = {}) {
    const record = instances.get(path);
    if (!record) throw new Error(`Applet is not active: ${path}`);
    if (!record.operations?.handle) throw new Error(`Applet does not accept operations: ${path}`);
    if (typeof operation !== 'string' || !operation.trim()) throw new Error('Applet operation must be a non-empty string');
    return record.operations.handle({
      path,
      operation,
      data,
      state: record.state,
      value: record.value,
      appComposer,
      log: (phase, detail) => appletLog(path, phase, detail),
    });
  }

  async function idle() {
    let pending;
    do {
      pending = operationQueue;
      await pending;
    } while (pending !== operationQueue);
  }

  return {
    load: (path, state) => apply('load', path, state),
    update: (path, state) => apply('update', path, state),
    destroy: (path) => apply('destroy', path),
    snapshot: store.snapshot,
    restore,
    operate,
    idle,
    appComposer,
    instancePaths: () => [...instances.keys()],
  };
}
