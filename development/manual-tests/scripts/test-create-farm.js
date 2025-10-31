#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'http://localhost:4567/api';

async function createTestFarm() {
    console.log('Creating test farm with 3 agents...\n');
    
    // Create a farm using Quick Task endpoint
    const response = await fetch(`${API_URL}/tasks/quick`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: 'Create a simple test application with multiple components',
            description: 'Test farm for terminal isolation testing',
            provider: 'claude',
            numAgents: 3
        })
    });
    
    if (!response.ok) {
        console.error('Failed to create farm:', response.status, response.statusText);
        const error = await response.text();
        console.error('Error:', error);
        return null;
    }
    
    const result = await response.json();
    console.log('Farm created successfully!');
    console.log('Farm ID:', result.data?.farmId);
    console.log('Session ID:', result.data?.sessionId);
    console.log('Status:', result.data?.status);
    
    return result.data;
}

async function checkFarmStatus(farmId) {
    const response = await fetch(`${API_URL}/farms/${farmId}`);
    if (!response.ok) {
        console.error('Failed to get farm status');
        return null;
    }
    
    const result = await response.json();
    return result.data;
}

async function main() {
    try {
        // Create the farm
        const farm = await createTestFarm();
        if (!farm) {
            console.error('Failed to create farm');
            return;
        }
        
        console.log('\nWaiting for agents to start...');
        
        // Check farm status after a delay
        setTimeout(async () => {
            const status = await checkFarmStatus(farm.farmId);
            if (status) {
                console.log('\nFarm Status:');
                console.log('- Name:', status.name);
                console.log('- Status:', status.status);
                console.log('- Agents:', status.agents?.length || 0);
                
                if (status.agents && status.agents.length > 0) {
                    console.log('\nAgent Details:');
                    status.agents.forEach((agent, index) => {
                        console.log(`  Agent ${index}:`, agent.name || `Agent ${index}`);
                    });
                }
                
                console.log('\n✅ Test farm created successfully!');
                console.log('View in browser: http://localhost:3000/harvest');
                console.log('Farm ID for testing:', farm.farmId);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();