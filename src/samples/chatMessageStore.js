import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function emptyDatabase() {
  return { version: 1, nextSequence: 1, messages: [] };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createChatMessageStore({
  filename,
  now = () => new Date().toISOString(),
  createId = () => `message-${crypto.randomUUID()}`,
} = {}) {
  if (!path.isAbsolute(filename || '')) throw new Error('Chat message filename must be absolute');

  function readDatabase() {
    if (!fs.existsSync(filename)) return emptyDatabase();
    const database = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!Array.isArray(database.messages)) throw new Error('Chat message database requires a messages array');
    const nextSequence = Number(database.nextSequence);
    return {
      version: 1,
      nextSequence: Number.isInteger(nextSequence) && nextSequence > 0
        ? nextSequence
        : database.messages.length + 1,
      messages: database.messages,
    };
  }

  function writeDatabase(database) {
    const serialized = `${JSON.stringify(database, null, 2)}\n`;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, serialized);
      fs.renameSync(temporary, filename);
    } finally {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
  }

  function list() {
    return clone(readDatabase().messages.sort((left, right) => left.sequence - right.sequence));
  }

  function append({ text, actorId = 'sample-self' } = {}) {
    const normalizedText = typeof text === 'string' ? text.trim() : '';
    if (!normalizedText) throw new Error('Message text is required');
    if (normalizedText.length > 500) throw new Error('Message text must be at most 500 characters');
    const database = readDatabase();
    const sequence = database.nextSequence;
    const message = {
      messageId: createId({ sequence }),
      sequence,
      createdAt: now(),
      actorId,
      rendererKey: 'self.text',
      text: normalizedText,
    };
    database.messages.push(message);
    database.nextSequence = sequence + 1;
    writeDatabase(database);
    return clone(message);
  }

  function find(messageId) {
    return list().find((message) => message.messageId === messageId) || null;
  }

  return Object.freeze({ list, append, find });
}
