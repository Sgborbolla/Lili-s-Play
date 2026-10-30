const fs = require('node:fs');
const path = require('node:path');
const { db } = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 40;

function stamp() {
  const d = new Date();
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${pad(d.getMilliseconds(), 3)}`;
}

function safeReason(reason) {
  return String(reason || 'manual')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'manual';
}

function pruneBackups(limit = MAX_BACKUPS) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.db'))
      .map((name) => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const file of files.slice(limit)) fs.unlinkSync(path.join(BACKUP_DIR, file.name));
  } catch (error) {
    console.error('No se pudieron limpiar los respaldos:', error.message);
  }
}

function backupDatabase(reason = 'manual') {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `lilys-plays-${stamp()}-${safeReason(reason)}.db`);
  const escaped = file.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  pruneBackups();
  return file;
}

function listBackups(limit = 12) {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.db'))
      .map((name) => {
        const info = fs.statSync(path.join(BACKUP_DIR, name));
        return { name, path: path.join(BACKUP_DIR, name), size: info.size, modified: info.mtime };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
  } catch {
    return [];
  }
}

module.exports = { BACKUP_DIR, backupDatabase, listBackups, pruneBackups };
