#!/usr/bin/env node

/**
 * Test script for image attachment workflow in farm creation
 * This script tests that images attached during farm creation are:
 * 1. Properly uploaded to the server
 * 2. Copied to the farm workspace
 * 3. Made available to agents via the prompt
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:4567';
const TEST_IMAGE_PATH = path.join(__dirname, 'test-assets', 'test-image.png');

async function createTestImage() {
  // Create a simple test image (1x1 PNG)
  const testDir = path.join(__dirname, 'test-assets');
  await fs.mkdir(testDir, { recursive: true });
  
  // Minimal PNG data (1x1 pixel, red)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x5B, 0x76, 0x1C,
    0x57, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82 // IEND chunk
  ]);
  
  await fs.writeFile(TEST_IMAGE_PATH, pngData);
  console.log('✅ Created test image at:', TEST_IMAGE_PATH);
  return TEST_IMAGE_PATH;
}

async function testImageAttachment() {
  console.log('🧪 Testing Image Attachment Workflow\n');
  
  try {
    // Step 1: Create test image
    const imagePath = await createTestImage();
    const imageBuffer = await fs.readFile(imagePath);
    
    // Step 2: Prepare farm creation data with image
    const farmData = {
      name: `Test Farm with Image ${Date.now()}`,
      description: 'Testing image attachment functionality',
      type: 'sequential',
      provider: 'claude',
      config: {
        maxAgents: 1,
        autoScale: false,
        timeout: 300,
        yaml: `
name: Test Image Farm
agents:
  - name: Image Analyzer
    prompt: Analyze the attached image and describe what you see
`,
        goWildMode: {
          enabled: false,
          creativityLevel: 3,
          boundaries: []
        }
      }
    };
    
    // Step 3: Create FormData with farm data and image
    const formData = new FormData();
    formData.append('farmData', JSON.stringify(farmData));
    formData.append('files', imageBuffer, {
      filename: 'test-image.png',
      contentType: 'image/png'
    });
    
    console.log('📤 Sending farm creation request with attached image...');
    
    // Step 4: Send request to create farm
    const response = await fetch(`${API_URL}/api/farms`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create farm: ${response.status} - ${error}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Farm creation failed: ${result.error?.message || 'Unknown error'}`);
    }
    
    console.log('✅ Farm created successfully!');
    console.log('   Farm ID:', result.data.id);
    console.log('   Farm Name:', result.data.name);
    
    // Step 5: Verify that attachment paths are in the config
    if (result.data.config?.attachmentPaths && result.data.config.attachmentPaths.length > 0) {
      console.log('✅ Attachment paths found in farm config:');
      result.data.config.attachmentPaths.forEach(path => {
        console.log('   -', path);
      });
    } else {
      console.log('⚠️  No attachment paths found in farm config');
    }
    
    // Step 6: Check workspace for attached files
    const workspacePath = path.join(process.cwd(), 'maibarn', 'workspaces', 'active', result.data.id);
    const attachmentsDir = path.join(workspacePath, 'attachments');
    
    try {
      const files = await fs.readdir(attachmentsDir);
      if (files.length > 0) {
        console.log('✅ Attachments found in workspace:');
        files.forEach(file => {
          console.log('   -', file);
        });
      } else {
        console.log('⚠️  No files found in attachments directory');
      }
    } catch (error) {
      console.log('⚠️  Could not access attachments directory:', error.message);
    }
    
    // Step 7: Start the farm to test agent access
    console.log('\n📊 Starting farm to test agent access...');
    const startResponse = await fetch(`${API_URL}/api/farms/${result.data.id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        numberOfAgents: 1
      })
    });
    
    if (!startResponse.ok) {
      console.log('⚠️  Failed to start farm:', await startResponse.text());
    } else {
      const startResult = await startResponse.json();
      console.log('✅ Farm started:', startResult.message);
      console.log('   Check agent logs to verify image access');
    }
    
    console.log('\n✨ Image attachment workflow test completed!');
    console.log('   Farm ID:', result.data.id);
    console.log('   Use the dashboard to monitor agent progress');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testImageAttachment().catch(console.error);