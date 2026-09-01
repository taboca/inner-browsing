import { createClientProjectionMap } from './projectionMap.js';
import { createRefDoc } from './refDoc.js';

export function createNavigator({
  document,
  host,
  onLifecycle = () => {},
  loadClientModule = (specifier) => import(specifier),
  sendAppletOperation = async () => { throw new Error('Applet operations are not connected'); },
  sendProjectionOperation = async () => { throw new Error('Projected applet operations are not connected'); },
}) {
  const records = new Map();
  const projectedRecords = new Map();
  const projectionRecords = new Map();
  const bindingsByHost = new Map();
  const projectionServices = new Map();

  function operationService(path) {
    return Object.freeze({
      send(operation, data = {}) {
        return sendAppletOperation({ path, operation, data });
      },
    });
  }

  function projectedOperationService(projectionKey) {
    return Object.freeze({
      send(operation, data = {}) {
        return sendProjectionOperation({ projectionKey, operation, data });
      },
    });
  }

  function recordsForHost(hostPath) {
    return [...projectionRecords.values()]
      .filter((record) => record.hostPath === hostPath)
      .sort((left, right) => left.projectionKey.localeCompare(right.projectionKey));
  }

  function projectionMapFor(hostPath) {
    if (!projectionServices.has(hostPath)) {
      projectionServices.set(hostPath, createClientProjectionMap({
        hostPath,
        recordsForHost,
        commitBindings(path, bindings) {
          bindingsByHost.set(path, new Map(bindings));
        },
      }));
    }
    return projectionServices.get(hostPath);
  }

  async function mount(node) {
    if (records.has(node.path)) return;
    const parent = node.parentPath ? records.get(node.parentPath) : null;
    if (node.parentPath && !parent) throw new Error(`${node.path} cannot mount before ${node.parentPath}`);
    const target = parent ? parent.refDoc.anchor(node.parentAnchor) : host;
    if (!target) throw new Error(`${node.parentPath} did not register anchor ${node.parentAnchor}`);
    const module = await loadClientModule(node.clientModule);
    const instance = module.createClientApplet();
    const refDoc = createRefDoc({ document, host: target, path: node.path });
    const context = {
      path: node.path,
      state: node.state,
      refDoc,
      appletOperation: operationService(node.path),
      projectionMap: projectionMapFor(node.path),
    };
    await instance.init?.(context);
    onLifecycle({ path: node.path, phase: 'initialized', side: 'client' });
    records.set(node.path, { instance, refDoc, state: node.state, stateHash: node.stateHash });
    await instance.mount?.(context);
    onLifecycle({ path: node.path, phase: 'mounted', side: 'client' });
  }

  async function destroyProjected(projectionKey) {
    const record = projectedRecords.get(projectionKey);
    if (!record) return;
    await record.instance.destroy?.({
      path: record.appletPath,
      projectionKey,
      refDoc: record.refDoc,
    });
    projectedRecords.delete(projectionKey);
    onLifecycle({ path: record.appletPath, projectionKey, phase: 'destroyed', side: 'client-projection' });
  }

  async function destroy(path) {
    for (const projection of [...projectedRecords.values()].filter((item) => item.hostPath === path)) {
      await destroyProjected(projection.projectionKey);
    }
    bindingsByHost.delete(path);
    projectionServices.delete(path);
    const record = records.get(path);
    if (!record) return;
    await record.instance.destroy?.({ path, refDoc: record.refDoc });
    records.delete(path);
    onLifecycle({ path, phase: 'destroyed', side: 'client' });
  }

  async function mountProjected(projection, element) {
    const module = await loadClientModule(projection.clientModule);
    const instance = module.createClientApplet();
    const refDoc = createRefDoc({ document, host: element, path: projection.appletPath });
    const context = {
      path: projection.appletPath,
      projectionKey: projection.projectionKey,
      state: projection.appletState,
      refDoc,
      appletOperation: projectedOperationService(projection.projectionKey),
    };
    await instance.init?.(context);
    onLifecycle({
      path: projection.appletPath,
      projectionKey: projection.projectionKey,
      phase: 'initialized',
      side: 'client-projection',
    });
    projectedRecords.set(projection.projectionKey, {
      projectionKey: projection.projectionKey,
      appletPath: projection.appletPath,
      hostPath: projection.hostPath,
      element,
      instance,
      refDoc,
      stateHash: projection.appletStateHash,
    });
    await instance.mount?.(context);
    onLifecycle({
      path: projection.appletPath,
      projectionKey: projection.projectionKey,
      phase: 'mounted',
      side: 'client-projection',
    });
  }

  function hostChanges(previous, next) {
    const changes = new Map();
    const hosts = new Set([...previous.values(), ...next.values()].map((record) => record.hostPath));
    for (const hostPath of hosts) {
      const before = new Map([...previous.values()].filter((record) => record.hostPath === hostPath)
        .map((record) => [record.projectionKey, record]));
      const after = new Map([...next.values()].filter((record) => record.hostPath === hostPath)
        .map((record) => [record.projectionKey, record]));
      const added = [...after.keys()].filter((key) => !before.has(key));
      const removed = [...before.keys()].filter((key) => !after.has(key));
      const updated = [...after.keys()].filter((key) => (
        before.has(key) && before.get(key).hostDataHash !== after.get(key).hostDataHash
      ));
      if (added.length || removed.length || updated.length) changes.set(hostPath, { added, removed, updated });
    }
    return changes;
  }

  async function reconcileProjected() {
    const desired = new Map();
    for (const projection of projectionRecords.values()) {
      const element = bindingsByHost.get(projection.hostPath)?.get(projection.projectionKey);
      if (element && records.has(projection.hostPath)) desired.set(projection.projectionKey, { projection, element });
    }

    for (const [projectionKey, record] of [...projectedRecords]) {
      const next = desired.get(projectionKey);
      if (!next || next.element !== record.element) await destroyProjected(projectionKey);
    }

    for (const { projection, element } of desired.values()) {
      if (!projectedRecords.has(projection.projectionKey)) await mountProjected(projection, element);
    }

    for (const { projection } of desired.values()) {
      const record = projectedRecords.get(projection.projectionKey);
      if (record.stateHash === projection.appletStateHash) continue;
      await record.instance.update?.({
        path: projection.appletPath,
        projectionKey: projection.projectionKey,
        state: projection.appletState,
        refDoc: record.refDoc,
        appletOperation: projectedOperationService(projection.projectionKey),
      });
      record.stateHash = projection.appletStateHash;
      onLifecycle({
        path: projection.appletPath,
        projectionKey: projection.projectionKey,
        phase: 'updated',
        side: 'client-projection',
      });
    }
  }

  async function reconcile(snapshot) {
    const previousProjections = new Map(projectionRecords);
    const nextProjections = new Map((snapshot.projectionMap?.records || [])
      .map((record) => [record.projectionKey, record]));
    projectionRecords.clear();
    nextProjections.forEach((record, key) => projectionRecords.set(key, record));

    const next = new Map();
    function visit(node) {
      next.set(node.path, node);
      node.children.forEach(visit);
    }
    snapshot.roots.forEach(visit);
    const removed = [...records.keys()]
      .filter((path) => !next.has(path))
      .sort((left, right) => right.split('/').length - left.split('/').length);
    for (const path of removed) await destroy(path);
    const added = [...next.values()]
      .filter((node) => !records.has(node.path))
      .sort((left, right) => left.path.split('/').length - right.path.split('/').length);
    for (const node of added) await mount(node);
    const updated = [...next.values()]
      .filter((node) => records.has(node.path) && records.get(node.path).stateHash !== node.stateHash)
      .sort((left, right) => left.path.split('/').length - right.path.split('/').length);
    for (const node of updated) {
      const record = records.get(node.path);
      await record.instance.update?.({
        path: node.path,
        state: node.state,
        refDoc: record.refDoc,
        appletOperation: operationService(node.path),
        projectionMap: projectionMapFor(node.path),
      });
      record.state = node.state;
      record.stateHash = node.stateHash;
      onLifecycle({ path: node.path, phase: 'updated', side: 'client' });
    }

    for (const [hostPath, changes] of hostChanges(previousProjections, nextProjections)) {
      const record = records.get(hostPath);
      if (!record) continue;
      await record.instance.projectionsChanged?.({
        path: hostPath,
        state: record.state,
        refDoc: record.refDoc,
        projectionMap: projectionMapFor(hostPath),
        changes,
      });
      onLifecycle({ path: hostPath, phase: 'projections-changed', side: 'client' });
    }

    await reconcileProjected();
  }

  return Object.freeze({ reconcile, records, projectedRecords, projectionRecords });
}
