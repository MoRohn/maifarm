import path from 'path';

// Directly test the path configuration
const maifarmRoot = process.env.MAIFARM_ROOT || path.resolve(process.cwd());
const varRoot = process.env.MAIFARM_VAR_ROOT || path.join(maifarmRoot, 'var');
const maibarnRoot = process.env.MAIBARN_ROOT || path.join(varRoot, 'maibarn');
const terminalsDir = path.join(maibarnRoot, 'terminals');

console.log('Environment variables:');
console.log('  MAIFARM_ROOT:', process.env.MAIFARM_ROOT);
console.log('  MAIFARM_VAR_ROOT:', process.env.MAIFARM_VAR_ROOT);
console.log('  MAIBARN_ROOT:', process.env.MAIBARN_ROOT);

console.log('\nCalculated paths:');
console.log('  maifarmRoot:', maifarmRoot);
console.log('  varRoot:', varRoot);
console.log('  maibarnRoot:', maibarnRoot);
console.log('  terminalsDir:', terminalsDir);

// Check if the directory exists
import { existsSync, readdirSync } from 'fs';

console.log('\nDirectory check:');
console.log('  terminalsDir exists?', existsSync(terminalsDir));

// Check var directory structure
const varPath = path.join(maifarmRoot, 'var');
console.log('  var/ exists?', existsSync(varPath));
if (existsSync(varPath)) {
  console.log('  var/ contents:', readdirSync(varPath));
}

// Check if maibarn exists
if (existsSync(maibarnRoot)) {
  console.log('  maibarn/ exists:', true);
  console.log('  maibarn/ contents:', readdirSync(maibarnRoot));
}