import fs from 'node:fs';
import path from 'node:path';
import { cloneJson, hash, isPlainObject, stable } from './stableJson.js';

const PERSISTENCE = new Set(['durable', 'runtime']);

function normalizeKey(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 240) throw new Error(`${label} must be between 1 and 240 characters`);
  return normalized;
}

function authoredRecord(record) {
  return {
    projectionKey: record.projectionKey,
    hostPath: record.hostPath,
    targetKey: record.targetKey,
    appletPath: record.appletPath,
    hostData: record.hostData,
    appletState: record.appletState,
    persistence: record.persistence,
  };
}

export function createProjectionStore({ projectionRoot, registry, now = () => new Date().toISOString() }) {
  fs.mkdirSync(projectionRoot, { recursive: true });
  const durableFile = path.join(projectionRoot, 'index.json');
  const runtimeRecords = new Map();

  function readDurableRecords() {
    if (!fs.existsSync(durableFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(durableFile, 'utf8'));
    if (!Array.isArray(parsed.records)) throw new Error('Projection store requires a records array');
    return parsed.records;
  }

  let durableRecords = new Map(readDurableRecords().map((record) => {
    const validated = validate(record);
    return [validated.projectionKey, {
      ...validated,
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || ''),
    }];
  }));

  function allRecords() {
    return [...durableRecords.values(), ...runtimeRecords.values()]
      .sort((left, right) => left.projectionKey.localeCompare(right.projectionKey));
  }

  function writeDurableRecords(nextRecords) {
    const serialized = `${JSON.stringify(stable({ version: 1, records: [...nextRecords.values()] }), null, 2)}\n`;
    const temporary = `${durableFile}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized);
      fs.renameSync(temporary, durableFile);
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
  }

  function validate(input, { existing = null } = {}) {
    if (!isPlainObject(input)) throw new Error('Projection record must be a plain object');
    const projectionKey = normalizeKey(input.projectionKey, 'projectionKey');
    const hostPath = normalizeKey(input.hostPath, 'hostPath');
    const targetKey = normalizeKey(input.targetKey, 'targetKey');
    const appletPath = normalizeKey(input.appletPath, 'appletPath');
    const persistence = String(input.persistence || 'durable');
    if (!PERSISTENCE.has(persistence)) throw new Error(`Unknown projection persistence: ${persistence}`);
    const host = registry.get(hostPath);
    const applet = registry.get(appletPath);
    if (!host || host.instanceMode !== 'canonical') throw new Error(`Projection host must be canonical: ${hostPath}`);
    if (!applet || applet.instanceMode !== 'projected') throw new Error(`Projection applet must be projected: ${appletPath}`);
    if (!isPlainObject(input.hostData)) throw new Error('Projection hostData must be a plain object');
    if (!isPlainObject(input.appletState)) throw new Error('Projection appletState must be a plain object');
    const hostData = cloneJson(input.hostData, 'Projection hostData');
    const appletState = cloneJson(input.appletState, 'Projection appletState');
    if (existing) {
      for (const key of ['projectionKey', 'hostPath', 'targetKey', 'appletPath', 'persistence']) {
        if ({ projectionKey, hostPath, targetKey, appletPath, persistence }[key] !== existing[key]) {
          throw new Error(`Projection ${key} is immutable`);
        }
      }
    }
    return { projectionKey, hostPath, targetKey, appletPath, hostData, appletState, persistence };
  }

  function targetConflict(candidate, exceptKey = null) {
    return allRecords().find((record) => (
      record.projectionKey !== exceptKey
      && record.hostPath === candidate.hostPath
      && record.targetKey === candidate.targetKey
    ));
  }

  function persistRecord(record) {
    if (record.persistence === 'durable') {
      const next = new Map(durableRecords);
      next.set(record.projectionKey, record);
      writeDurableRecords(next);
      durableRecords = next;
    } else {
      runtimeRecords.set(record.projectionKey, record);
    }
  }

  function published(record) {
    const definition = registry.get(record.appletPath);
    const hostDataHash = hash(record.hostData);
    const appletStateHash = hash(record.appletState);
    const recordHash = hash({ ...authoredRecord(record), hostDataHash, appletStateHash });
    return {
      version: 1,
      ...cloneJson(record),
      clientModule: definition.clientModule,
      hostDataHash,
      appletStateHash,
      hash: recordHash,
    };
  }

  function read(projectionKey) {
    const key = normalizeKey(projectionKey, 'projectionKey');
    return durableRecords.get(key) || runtimeRecords.get(key) || null;
  }

  function snapshot() {
    const records = allRecords().map(published);
    return { version: 1, hash: hash(records.map((record) => ({ projectionKey: record.projectionKey, hash: record.hash }))), records };
  }

  function register(input) {
    const candidate = validate(input);
    if (read(candidate.projectionKey)) throw new Error(`Projection already exists: ${candidate.projectionKey}`);
    const conflict = targetConflict(candidate);
    if (conflict) throw new Error(`Projection target already occupied: ${candidate.hostPath}:${candidate.targetKey}`);
    const timestamp = now();
    const record = { ...candidate, createdAt: timestamp, updatedAt: timestamp };
    persistRecord(record);
    return { added: [record.projectionKey], updated: [], removed: [], record: published(record), snapshot: snapshot() };
  }

  function ensure(input) {
    const candidate = validate(input);
    const existing = read(candidate.projectionKey);
    if (!existing) return register(candidate);
    if (hash(authoredRecord(existing)) !== hash(candidate)) {
      throw new Error(`Projection differs from existing record: ${candidate.projectionKey}`);
    }
    return { added: [], updated: [], removed: [], record: published(existing), snapshot: snapshot() };
  }

  function replacePart(projectionKey, field, nextValue) {
    const existing = read(projectionKey);
    if (!existing) throw new Error(`Unknown projection: ${projectionKey}`);
    if (!isPlainObject(nextValue)) throw new Error(`Projection ${field} must be a plain object`);
    const next = validate({ ...existing, [field]: nextValue }, { existing });
    if (hash(existing[field]) === hash(next[field])) {
      return { added: [], updated: [], removed: [], record: published(existing), snapshot: snapshot() };
    }
    const record = { ...existing, [field]: next[field], updatedAt: now() };
    persistRecord(record);
    return { added: [], updated: [record.projectionKey], removed: [], record: published(record), snapshot: snapshot() };
  }

  function destroy(projectionKey) {
    const existing = read(projectionKey);
    if (!existing) throw new Error(`Unknown projection: ${projectionKey}`);
    if (existing.persistence === 'durable') {
      const next = new Map(durableRecords);
      next.delete(existing.projectionKey);
      writeDurableRecords(next);
      durableRecords = next;
    } else {
      runtimeRecords.delete(existing.projectionKey);
    }
    return { added: [], updated: [], removed: [existing.projectionKey], record: published(existing), snapshot: snapshot() };
  }

  return Object.freeze({
    register,
    ensure,
    updateState: (projectionKey, state) => replacePart(projectionKey, 'appletState', state),
    updateHostData: (projectionKey, data) => replacePart(projectionKey, 'hostData', data),
    destroy,
    read,
    list: ({ hostPath } = {}) => snapshot().records.filter((record) => !hostPath || record.hostPath === hostPath),
    snapshot,
  });
}
