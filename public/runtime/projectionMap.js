function safeRecord(record) {
  return Object.freeze({
    projectionKey: record.projectionKey,
    hostPath: record.hostPath,
    targetKey: record.targetKey,
    appletPath: record.appletPath,
    clientModule: record.clientModule,
    hostData: Object.freeze(structuredClone(record.hostData)),
    persistence: record.persistence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    hostDataHash: record.hostDataHash,
    appletStateHash: record.appletStateHash,
    hash: record.hash,
  });
}

export function createClientProjectionMap({ hostPath, recordsForHost, commitBindings }) {
  return Object.freeze({
    list() {
      return Object.freeze(recordsForHost(hostPath).map(safeRecord));
    },
    beginBindingFrame() {
      const next = new Map();
      let committed = false;
      return Object.freeze({
        bind(projectionKey, element) {
          if (committed) throw new Error('Projection binding frame is already committed');
          const record = recordsForHost(hostPath).find((item) => item.projectionKey === projectionKey);
          if (!record) throw new Error(`Projection is missing or outside ${hostPath}: ${projectionKey}`);
          if (!element || typeof element.append !== 'function') throw new Error('Projection binding requires an element');
          if (next.has(projectionKey)) throw new Error(`Projection is already bound in this frame: ${projectionKey}`);
          next.set(projectionKey, element);
          return element;
        },
        commit() {
          if (committed) throw new Error('Projection binding frame is already committed');
          committed = true;
          commitBindings(hostPath, next);
        },
      });
    },
  });
}
