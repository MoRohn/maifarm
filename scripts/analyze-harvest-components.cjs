#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Directory to analyze
const harvestDir = path.join(__dirname, '../apps/dashboard/src/components/harvest');
const srcDir = path.join(__dirname, '../apps/dashboard/src');

// Get all harvest component files
function getHarvestFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getHarvestFiles(fullPath));
    } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract component/file name from path
function getComponentName(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// Check if a file imports a specific component
function checkFileForImport(filePath, componentName) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check various import patterns
    const patterns = [
      new RegExp(`import.*${componentName}.*from.*harvest`, 'i'),
      new RegExp(`from.*['\"].*/${componentName}['\"]`, 'i'),
      new RegExp(`import.*{.*${componentName}.*}.*from`, 'i'),
      new RegExp(`<${componentName}[\\s/>]`, 'i'), // JSX usage
    ];

    return patterns.some(pattern => pattern.test(content));
  } catch (err) {
    return false;
  }
}

// Find all files that import a component
function findImporters(componentName, searchDir) {
  const importers = [];

  function searchRecursively(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.includes('node_modules') && !item.startsWith('.')) {
        searchRecursively(fullPath);
      } else if ((item.endsWith('.tsx') || item.endsWith('.ts')) && !fullPath.includes('test')) {
        if (checkFileForImport(fullPath, componentName)) {
          importers.push(fullPath.replace(srcDir + '/', ''));
        }
      }
    }
  }

  searchRecursively(searchDir);
  return importers;
}

// Main analysis
console.log('Analyzing Harvest Components Usage...\n');
console.log('=' .repeat(80));

const harvestFiles = getHarvestFiles(harvestDir);
const componentUsage = {};

// Analyze each harvest component
for (const file of harvestFiles) {
  const componentName = getComponentName(file);
  const relativePath = file.replace(srcDir + '/', '');

  // Skip test files and type definitions
  if (file.includes('.test.') || file.includes('.spec.') || file.includes('.d.ts')) {
    continue;
  }

  const importers = findImporters(componentName, srcDir);

  componentUsage[componentName] = {
    path: relativePath,
    importedBy: importers.filter(imp => !imp.includes(componentName)), // Exclude self-imports
    count: importers.filter(imp => !imp.includes(componentName)).length
  };
}

// Sort by usage count
const sorted = Object.entries(componentUsage).sort((a, b) => b[1].count - a[1].count);

// Display results
console.log('\n📊 Component Usage Analysis:\n');

// Used components
console.log('✅ ACTIVELY USED COMPONENTS:');
console.log('-'.repeat(80));
const used = sorted.filter(([name, data]) => data.count > 0);
for (const [name, data] of used) {
  console.log(`  ${name} (${data.count} imports)`);
  if (data.count <= 3) {
    data.importedBy.forEach(imp => console.log(`    └─ ${imp}`));
  }
}

// Unused components
console.log('\n❌ UNUSED COMPONENTS (candidates for removal):');
console.log('-'.repeat(80));
const unused = sorted.filter(([name, data]) => data.count === 0);
for (const [name, data] of unused) {
  console.log(`  ${name}`);
  console.log(`    └─ ${data.path}`);
}

// Summary
console.log('\n📈 SUMMARY:');
console.log('-'.repeat(80));
console.log(`  Total components: ${sorted.length}`);
console.log(`  Used components: ${used.length}`);
console.log(`  Unused components: ${unused.length}`);
console.log(`  Usage rate: ${((used.length / sorted.length) * 100).toFixed(1)}%`);

// Potential duplicates (components with similar names)
console.log('\n🔄 POTENTIAL DUPLICATES:');
console.log('-'.repeat(80));
const nameGroups = {};
for (const [name] of sorted) {
  const baseName = name.replace(/(Modal|View|Page|Dashboard|Card|Panel|List)$/, '');
  if (!nameGroups[baseName]) nameGroups[baseName] = [];
  nameGroups[baseName].push(name);
}

for (const [base, names] of Object.entries(nameGroups)) {
  if (names.length > 1) {
    console.log(`  ${base}* variants:`);
    names.forEach(n => console.log(`    - ${n}`));
  }
}