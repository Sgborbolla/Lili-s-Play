const path = require('node:path');

const APP_ROOT = path.join(__dirname, '..');

function packaged() {
  if (process.pkg) return true;
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
}

const IS_PACKAGED = packaged();
const STORAGE_ROOT = process.env.LP_STORAGE_ROOT
  ? path.resolve(process.env.LP_STORAGE_ROOT)
  : (IS_PACKAGED ? path.dirname(process.execPath) : APP_ROOT);

module.exports = {
  APP_ROOT,
  STORAGE_ROOT,
  DATA_DIR: path.join(STORAGE_ROOT, 'data'),
  UPLOADS_DIR: path.join(STORAGE_ROOT, 'public', 'uploads'),
  REPORTS_DIR: path.join(STORAGE_ROOT, 'Reportes'),
  IS_PACKAGED,
};
