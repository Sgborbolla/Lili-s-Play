#!/usr/bin/env node
const path = require('node:path');
const { refreshReports } = require('../lib/reports');

refreshReports()
  .then((result) => {
    if (!result.excel_ok) {
      console.error(`No se pudo generar el Excel: ${result.excel_error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Excel: ${path.relative(process.cwd(), result.excel_path)}`);
    console.log(`JSON:  ${path.relative(process.cwd(), result.json_path)}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
