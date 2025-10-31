#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Required directories for MaiFarm operation
const requiredDirs = [
  'var/maibarn',
  'var/maibarn/coordination',
  'var/maibarn/harvests',
  'var/maibarn/workspaces',
  'var/maibarn/terminals',
  'var/maibarn/logs',
  'var/data',
  'var/data/storage',
  'var/data/storage/barn',
  'var/data/storage/barn/items',
  'var/data/temp',
  'public',
  'dist'
];

// Required files with default content
const requiredFiles = [
  {
    path: 'var/maibarn/coordination/agent_registrations.json',
    content: '{}'
  },
  {
    path: 'var/maibarn/coordination/task_queue.json',
    content: '[]'
  },
  {
    path: 'var/data/storage/barn/catalog.json',
    content: '{"items": [], "categories": []}'
  }
];

console.log('🔧 Fixing startup path issues...\n');

// Create required directories
requiredDirs.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`✓ Directory exists: ${dir}`);
  }
});

console.log('\n📄 Creating required files...\n');

// Create required files
requiredFiles.forEach(file => {
  const fullPath = path.join(process.cwd(), file.path);
  const dir = path.dirname(fullPath);
  
  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, file.content);
    console.log(`✅ Created file: ${file.path}`);
  } else {
    console.log(`✓ File exists: ${file.path}`);
  }
});

// Set proper permissions
console.log('\n🔐 Setting permissions...\n');

const dirsToChmod = [
  'var/maibarn',
  'var/maibarn/logs'
];

dirsToChmod.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    try {
      fs.chmodSync(fullPath, 0o755);
      console.log(`✅ Set permissions for: ${dir}`);
    } catch (err) {
      console.warn(`⚠️  Could not set permissions for ${dir}: ${err.message}`);
    }
  }
});

// Clean up any invalid symlinks
console.log('\n🧹 Cleaning up invalid symlinks...\n');

const checkSymlinks = (dir) => {
  if (!fs.existsSync(dir)) return;
  
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    try {
      const stats = fs.lstatSync(itemPath);
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(itemPath);
        if (!fs.existsSync(target)) {
          fs.unlinkSync(itemPath);
          console.log(`🗑️  Removed broken symlink: ${itemPath}`);
        }
      } else if (stats.isDirectory() && !item.startsWith('.')) {
        checkSymlinks(itemPath);
      }
    } catch (err) {
      // Ignore errors
    }
  });
};

checkSymlinks(path.join(process.cwd(), 'var/maibarn/workspaces'));

console.log('\n✨ Path fixes completed!\n');
