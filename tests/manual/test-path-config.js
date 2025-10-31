const path = require('path');

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

// Also try to import and test the actual module
(async () => {
  try {
    console.log('\nTrying to import the paths module...');
    // Since it's TypeScript, we need to import the compiled version
    const pathsModule = await import('./apps/api/dist/config/paths.js').catch(() => null);

    if (pathsModule) {
      console.log('Module imported successfully!');
      const terminalsPath = pathsModule.getPath('TERMINALS_DIR');
      console.log('TERMINALS_DIR from module:', terminalsPath);
    } else {
      console.log('Could not import compiled module (may not be built)');
    }
  } catch (error) {
    console.error('Error testing paths module:', error.message);
  }
})();