#!/usr/bin/env node
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildReportData } = require('../lib/reports');

const root = path.join(__dirname, '..');
const data = buildReportData();

assert.ok(Array.isArray(data.all_orders), 'all_orders debe ser una lista');
assert.ok(Array.isArray(data.orders), 'orders debe ser una lista');
assert.ok(data.summary && typeof data.summary === 'object', 'summary debe existir');
assert.ok(data.periods && data.periods.diario && data.periods.semanal && data.periods.mensual && data.periods.anual, 'faltan períodos');
assert.ok(fs.existsSync(path.join(root, 'scripts', 'build_reports.py')), 'falta build_reports.py');
assert.ok(fs.existsSync(path.join(root, 'views', 'admin', 'reports.ejs')), 'falta la vista de reportes');
assert.ok(fs.existsSync(path.join(root, 'lib', 'backup.js')), 'falta lib/backup.js');
console.log('Smoke test OK');
