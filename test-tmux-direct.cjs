#!/usr/bin/env node

const { spawn } = require('child_process');

// Test direct tmux command
async function testTmux() {
  console.log('Testing tmux list-sessions...');
  
  const listSessions = spawn('tmux', ['list-sessions', '-F', '#{session_name}']);
  let output = '';
  let errorOutput = '';
  
  listSessions.stdout?.on('data', (data) => {
    output += data.toString();
    console.log('STDOUT:', data.toString());
  });
  
  listSessions.stderr?.on('data', (data) => {
    errorOutput += data.toString();
    console.log('STDERR:', data.toString());
  });
  
  const exitCode = await new Promise(resolve => {
    listSessions.on('exit', (code) => {
      console.log('Exit code:', code);
      resolve(code || 0);
    });
  });
  
  console.log('\nFinal output:', output);
  console.log('Final error:', errorOutput);
  console.log('Sessions found:', output.trim().split('\n').filter(Boolean));
  
  // Now test the exact code from the API
  console.log('\n--- Testing API code ---');
  try {
    const allSessions = output.trim().split('\n').filter(Boolean);
    const relevantSessions = allSessions.filter(line => 
      line.includes('farm_') || line.includes('claude_agents')
    );
    
    console.log('Relevant sessions:', relevantSessions);
    
    // Get details for first session
    if (relevantSessions.length > 0) {
      const sessionName = relevantSessions[0];
      console.log(`\nGetting pane count for ${sessionName}...`);
      
      const paneCount = await new Promise((resolve) => {
        const countPanes = spawn('tmux', ['list-panes', '-t', `${sessionName}:0`, '-F', '#{pane_index}']);
        let paneOutput = '';
        countPanes.stdout?.on('data', (data) => { 
          paneOutput += data.toString();
          console.log('Pane data:', data.toString());
        });
        countPanes.on('exit', (code) => {
          console.log('Pane count exit code:', code);
          if (code === 0) {
            const count = paneOutput.trim().split('\n').filter(Boolean).length;
            resolve(count);
          } else {
            resolve(0);
          }
        });
      });
      
      console.log('Pane count:', paneCount);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testTmux();