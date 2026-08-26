import { createRefDoc } from './refDoc.js';

export function createNavigator({ document, host, onLifecycle = () => {} }) {
  const records = new Map();

  async function mount(node) {
    if (records.has(node.path)) return;
    const parent = node.parentPath ? records.get(node.parentPath) : null;
    if (node.parentPath && !parent) throw new Error(`${node.path} cannot mount before ${node.parentPath}`);
    const target = parent ? parent.refDoc.anchor(node.parentAnchor) : host;
    if (!target) throw new Error(`${node.parentPath} did not register anchor ${node.parentAnchor}`);
    const module = await import(node.clientModule);
    const instance = module.createClientApplet();
    const refDoc = createRefDoc({ document, host: target, path: node.path });
    const context = { path: node.path, state: node.state, refDoc };
    await instance.init?.(context);
    onLifecycle({ path: node.path, phase: 'initialized', side: 'client' });
    records.set(node.path, { instance, refDoc });
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
  }

  return Object.freeze({ reconcile, records });
}
