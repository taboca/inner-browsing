import { isComposerOperation } from './composerOperations.js';

const EMPTY_PROJECTION_MAP = Object.freeze({ version: 1, hash: '0'.repeat(64), records: Object.freeze([]) });

export function createAppletRuntime({ registry, store, projectionStore = null, publish = () => {}, log = console.log }) {
  const instances = new Map();
  const projectionInstances = new Map();
  let operationQueue = Promise.resolve();

  function snapshot() {
    const tree = store.snapshot();
    return { ...tree, treeHash: tree.hash, projectionMap: projectionStore?.snapshot() || EMPTY_PROJECTION_MAP };
  }

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
      return applyComposer(parsed.operation, parsed.path, parsed.state);
    },
  });

  function appletLog(identity, phase, detail = {}) {
    log(`[server:${identity}] ${phase}`, detail);
  }

  function enqueue(work) {
    const result = operationQueue.then(work, work);
    operationQueue = result.catch(() => {});
    return result;
  }

  function printSnapshot(current) {
    const treeLines = [];
    function visit(node, prefix = '') {
      treeLines.push(`${prefix}${node.name} ${node.hash.slice(0, 12)}`);
      node.children.forEach((child) => visit(child, `${prefix}  `));
    }
    current.roots.forEach((root) => visit(root));
    log(`\n[state ${current.treeHash} projections ${current.projectionMap.hash}]`);
    log(treeLines.length ? treeLines.join('\n') : '(empty tree)');
  }

  function publishSnapshot({ operation, path = null, projectionKey = null }) {
    const current = snapshot();
    const envelope = {
      type: 'navigator.snapshot',
      operation,
      path,
      projectionKey,
      hash: current.hash,
      treeHash: current.treeHash,
      projectionHash: current.projectionMap.hash,
      snapshot: current,
    };
    printSnapshot(current);
    publish(envelope);
    return envelope;
  }

  function projectionService(hostPath) {
    if (!projectionStore) return null;
    const withHost = (record) => ({ ...record, hostPath });
    return Object.freeze({
      register: (record) => applyProjection('register', withHost(record)),
      ensure: (record) => applyProjection('ensure', withHost(record)),
      updateState: (projectionKey, state) => applyProjection('updateState', { projectionKey, state, hostPath }),
      updateHostData: (projectionKey, data) => applyProjection('updateHostData', { projectionKey, data, hostPath }),
      destroy: (projectionKey) => applyProjection('destroy', { projectionKey, hostPath }),
      list: () => projectionStore.list({ hostPath }),
    });
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
      projectionManager: projectionService(path),
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
      projectionManager: projectionService(path),
      log: (phase, detail) => appletLog(path, phase, detail),
    });
    instances.delete(path);
  }

  async function startProjection(record) {
    if (projectionInstances.has(record.projectionKey)) return;
    const definition = registry.get(record.appletPath);
    const instance = await definition.createServer();
    const operations = (await definition.createServerOperations?.()) || null;
    const context = {
      path: record.appletPath,
      projectionKey: record.projectionKey,
      state: record.appletState,
      appComposer,
      log: (phase, detail) => appletLog(record.projectionKey, phase, detail),
    };
    const value = await instance.init?.(context);
    projectionInstances.set(record.projectionKey, {
      definition,
      instance,
      operations,
      value,
      state: record.appletState,
      hostPath: record.hostPath,
    });
  }

  async function stopProjection(projectionKey, projection = null) {
    const record = projectionInstances.get(projectionKey);
    if (!record) return;
    await record.instance.destroy?.({
      path: record.definition.path,
      projectionKey,
      value: record.value,
      state: record.state,
      projection,
      appComposer,
      log: (phase, detail) => appletLog(projectionKey, phase, detail),
    });
    projectionInstances.delete(projectionKey);
  }

  function applyComposer(operation, path, state = {}) {
    return enqueue(async () => {
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
      return publishSnapshot({ operation, path });
    });
  }

  function applyProjection(operation, input) {
    if (!projectionStore) return Promise.reject(new Error('Projection Manager is not configured'));
    return enqueue(async () => {
      let result;
      if (operation === 'register' || operation === 'ensure') {
        result = projectionStore[operation](input);
        try {
          await startProjection(result.record);
        } catch (error) {
          if (result.added.length) projectionStore.destroy(result.record.projectionKey);
          throw error;
        }
      } else {
        const existing = projectionStore.read(input.projectionKey);
        if (!existing) throw new Error(`Unknown projection: ${input.projectionKey}`);
        if (existing.hostPath !== input.hostPath) throw new Error(`Projection is not owned by ${input.hostPath}`);
        if (operation === 'updateState') {
          result = projectionStore.updateState(input.projectionKey, input.state);
          const runtimeRecord = projectionInstances.get(input.projectionKey);
          if (runtimeRecord && result.updated.length) runtimeRecord.state = result.record.appletState;
        } else if (operation === 'updateHostData') {
          result = projectionStore.updateHostData(input.projectionKey, input.data);
        } else if (operation === 'destroy') {
          result = projectionStore.destroy(input.projectionKey);
          await stopProjection(input.projectionKey, result.record);
        } else {
          throw new Error(`Unknown projection operation: ${operation}`);
        }
      }
      if (!result.added.length && !result.updated.length && !result.removed.length) {
        const current = snapshot();
        return {
          type: 'navigator.snapshot',
          operation: `projection.${operation}`,
          projectionKey: result.record.projectionKey,
          hash: current.hash,
          treeHash: current.treeHash,
          projectionHash: current.projectionMap.hash,
          snapshot: current,
        };
      }
      return publishSnapshot({ operation: `projection.${operation}`, projectionKey: result.record.projectionKey });
    });
  }

  async function restore() {
    const current = snapshot();
    for (const path of current.activePaths) await start(path);
    for (const projection of current.projectionMap.records) await startProjection(projection);
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
      projectionManager: projectionService(path),
      log: (phase, detail) => appletLog(path, phase, detail),
    });
  }

  async function operateProjection(projectionKey, operation, data = {}) {
    const record = projectionInstances.get(projectionKey);
    if (!record) throw new Error(`Projected applet is not active: ${projectionKey}`);
    if (!record.operations?.handle) throw new Error(`Projected applet does not accept operations: ${projectionKey}`);
    if (typeof operation !== 'string' || !operation.trim()) throw new Error('Projected operation must be a non-empty string');
    return record.operations.handle({
      path: record.definition.path,
      projectionKey,
      operation,
      data,
      state: record.state,
      value: record.value,
      appComposer,
      log: (phase, detail) => appletLog(projectionKey, phase, detail),
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
    load: (path, state) => applyComposer('load', path, state),
    update: (path, state) => applyComposer('update', path, state),
    destroy: (path) => applyComposer('destroy', path),
    snapshot,
    restore,
    operate,
    operateProjection,
    idle,
    appComposer,
    projectionManagerFor: projectionService,
    instancePaths: () => [...instances.keys()],
    projectionInstanceKeys: () => [...projectionInstances.keys()],
  };
}
