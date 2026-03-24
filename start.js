#!/usr/bin/env node
/**
 * Start-script med tydelig output.
 * Kør: node start.js
 */

const { spawn } = require('child_process');

console.log('');
console.log('========================================');
console.log('  Friland årsregnskab - Starter server');
console.log('========================================');
console.log('');

const child = spawn('node', ['server.js'], {
  stdio: 'inherit',
  cwd: __dirname,
});

child.on('error', (err) => {
  console.error('Fejl ved start:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error('\nServeren stoppede med kode:', code);
    process.exit(code);
  }
});
