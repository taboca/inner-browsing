import { createRefDoc } from './refDoc.js';

export function createNavigator({
  document,
  host,
  onLifecycle = () => {},
  loadClientModule = (specifier) => import(specifier),
  sendAppletOperation = async () => { throw new Error('Applet operations are not connected'); },
}) {
  const records = new Map();

  function operationService(path) {
    return Object.freeze({
      send(operation, data = {}) {
        return sendAppletOperation({ path, operation, data });
      },
    });
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
    const context = { path: node.path, state: node.state, refDoc, appletOperation: operationService(node.path) };
    await instance.init?.(context);
    onLifecycle({ path: node.path, phase: 'initialized', side: 'client' });
    records.set(node.path, { instance, refDoc, stateHash: node.stateHash });
    await instance.mount?.(context);
    onLifecycle({ path: node.path, phase: 'mounted', side: 'client' });
  }

  async function destroy(path) {
    const record = records.get(path);
    if (!record) return;
    await record.instance.destroy?.({ path, refDoc: record.refDoc });
    records.delete(path);
    onLifecycle({ path, phase: 'destroyed', side: 'client' });
  }

  async function reconcile(snapshot) {
    const next = new Map();
    function visit(node) {
      next.set(node.path, node);
      node.children.forEach(visit);
    }
    snapshot.roots.forEach(visit);
    const removed = [...records.keys()]
      .filter((path) => !next.has(path))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    for (const path of removed) await destroy(path);
    const added = [...next.values()]
      .filter((node) => !records.has(node.path))
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    for (const node of added) await mount(node);
    const updated = [...next.values()]
      .filter((node) => records.has(node.path) && records.get(node.path).stateHash !== node.stateHash)
      .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
    for (const node of updated) {
      const record = records.get(node.path);
      await record.instance.update?.({
        path: node.path,
        state: node.state,
        refDoc: record.refDoc,
        appletOperation: operationService(node.path),
      });
      record.stateHash = node.stateHash;
      onLifecycle({ path: node.path, phase: 'updated', side: 'client' });
    }
  }

  return Object.freeze({ reconcile, records });
}
