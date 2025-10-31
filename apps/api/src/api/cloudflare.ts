import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';

const router = Router();

// Active tunnels storage
const activeTunnels = new Map<string, {
  url: string;
  process: any;
  createdAt: Date;
  farmId: string;
  sessionId: string;
}>();

// Cleanup old tunnels periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour
  
  for (const [id, tunnel] of activeTunnels.entries()) {
    if (now - tunnel.createdAt.getTime() > maxAge) {
      logger.info(`Cleaning up expired tunnel: ${id}`);
      tunnel.process?.kill();
      activeTunnels.delete(id);
    }
  }
}, 60000); // Check every minute

/**
 * Create Cloudflare tunnel for remote access
 */
router.post('/tunnel', async (req: Request, res: Response) => {
  try {
    const { farmId, sessionId } = req.body;
    
    if (!farmId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: farmId and sessionId'
      });
    }
    
    // Generate unique tunnel ID
    const tunnelId = crypto.randomBytes(8).toString('hex');
    
    // Check if tunnel already exists for this farm
    const existingTunnel = Array.from(activeTunnels.values()).find(
      t => t.farmId === farmId && t.sessionId === sessionId
    );
    
    if (existingTunnel) {
      // Generate QR code for existing tunnel
      const qrCode = await QRCode.toDataURL(existingTunnel.url);
      
      return res.json({
        success: true,
        tunnelUrl: existingTunnel.url,
        tunnelId,
        qrCode,
        message: 'Using existing tunnel'
      });
    }
    
    // Create new Cloudflare tunnel
    const tunnelUrl = await createCloudflareTunnel(tunnelId, farmId, sessionId);
    
    // Generate QR code for mobile scanning
    const qrCode = await QRCode.toDataURL(tunnelUrl);
    
    res.json({
      success: true,
      tunnelUrl,
      tunnelId,
      qrCode,
      expiresIn: 3600 // seconds
    });
    
  } catch (error) {
    logger.error('Error creating Cloudflare tunnel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create tunnel'
    });
  }
});

/**
 * Get tunnel status
 */
router.get('/tunnel/:tunnelId', (req: Request, res: Response) => {
  const { tunnelId } = req.params;
  const tunnel = activeTunnels.get(tunnelId);
  
  if (!tunnel) {
    return res.status(404).json({
      success: false,
      error: 'Tunnel not found'
    });
  }
  
  res.json({
    success: true,
    status: 'active',
    url: tunnel.url,
    createdAt: tunnel.createdAt,
    farmId: tunnel.farmId,
    sessionId: tunnel.sessionId
  });
});

/**
 * Close tunnel
 */
router.delete('/tunnel/:tunnelId', (req: Request, res: Response) => {
  const { tunnelId } = req.params;
  const tunnel = activeTunnels.get(tunnelId);
  
  if (!tunnel) {
    return res.status(404).json({
      success: false,
      error: 'Tunnel not found'
    });
  }
  
  // Kill tunnel process
  tunnel.process?.kill();
  activeTunnels.delete(tunnelId);
  
  logger.info(`Closed tunnel: ${tunnelId}`);
  
  res.json({
    success: true,
    message: 'Tunnel closed successfully'
  });
});

/**
 * Create Cloudflare tunnel using cloudflared
 */
async function createCloudflareTunnel(
  tunnelId: string,
  farmId: string,
  sessionId: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const port = process.env.PORT || 4567;
    
    // Use cloudflared to create tunnel
    // Note: cloudflared must be installed on the system
    const cloudflared = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${port}`,
      '--no-autoupdate'
    ]);
    
    let tunnelUrl = '';
    
    cloudflared.stdout.on('data', (data) => {
      const output = data.toString();
      logger.debug('Cloudflared output:', output);
      
      // Parse tunnel URL from output
      const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch) {
        tunnelUrl = urlMatch[0];
        
        // Store tunnel info
        activeTunnels.set(tunnelId, {
          url: tunnelUrl,
          process: cloudflared,
          createdAt: new Date(),
          farmId,
          sessionId
        });
        
        logger.info(`Created tunnel ${tunnelId}: ${tunnelUrl}`);
        resolve(tunnelUrl);
      }
    });
    
    cloudflared.stderr.on('data', (data) => {
      const error = data.toString();
      
      // Check if it's actually the tunnel URL (sometimes comes through stderr)
      const urlMatch = error.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0];
        
        activeTunnels.set(tunnelId, {
          url: tunnelUrl,
          process: cloudflared,
          createdAt: new Date(),
          farmId,
          sessionId
        });
        
        logger.info(`Created tunnel ${tunnelId}: ${tunnelUrl}`);
        resolve(tunnelUrl);
      } else if (!error.includes('Thank you for using')) {
        logger.error('Cloudflared error:', error);
      }
    });
    
    cloudflared.on('error', (error) => {
      logger.error('Failed to start cloudflared:', error);
      reject(new Error('Failed to start cloudflared. Is it installed?'));
    });
    
    cloudflared.on('close', (code) => {
      if (code !== 0 && !tunnelUrl) {
        reject(new Error(`Cloudflared exited with code ${code}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (!tunnelUrl) {
        cloudflared.kill();
        reject(new Error('Timeout creating tunnel'));
      }
    }, 30000);
  });
}

/**
 * Mobile-optimized terminal endpoint
 */
router.get('/mobile/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  // Return mobile-optimized HTML
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>MaiFarm Mobile Terminal</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          background: #0a0a0a;
          color: #00ff00;
          font-family: 'Courier New', monospace;
          overflow: hidden;
          touch-action: none;
        }
        
        #terminal {
          width: 100vw;
          height: 100vh;
          padding: 10px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        .terminal-line {
          white-space: pre-wrap;
          word-wrap: break-word;
          margin-bottom: 2px;
          animation: glow 2s ease-in-out infinite alternate;
        }
        
        @keyframes glow {
          from { text-shadow: 0 0 5px #00ff00; }
          to { text-shadow: 0 0 10px #00ff00, 0 0 15px #00ff00; }
        }
        
        .status-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.9);
          padding: 10px;
          border-top: 1px solid #00ff00;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .agent-selector {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        .agent-btn {
          padding: 5px 10px;
          background: rgba(0, 255, 0, 0.1);
          border: 1px solid #00ff00;
          color: #00ff00;
          border-radius: 3px;
          white-space: nowrap;
        }
        
        .agent-btn.active {
          background: rgba(0, 255, 0, 0.3);
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00ff00;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      </style>
    </head>
    <body>
      <div id="terminal">
        <div class="terminal-line">HARVEST TERMINAL PRO - MOBILE</div>
        <div class="terminal-line">Session: ${sessionId}</div>
        <div class="terminal-line">Connecting...</div>
      </div>
      
      <div class="status-bar">
        <div class="agent-selector" id="agentSelector">
          <!-- Agent buttons will be added here -->
        </div>
        <div class="connection-status">
          <div class="status-dot"></div>
          <span>Connected</span>
        </div>
      </div>
      
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        const terminal = document.getElementById('terminal');
        const agentSelector = document.getElementById('agentSelector');
        let currentAgent = 0;
        
        // Join session
        socket.emit('terminal:join_session', {
          sessionId: '${sessionId}',
          mobile: true
        });
        
        // Handle terminal output
        socket.on('terminal:output', (data) => {
          if (data.agentId === currentAgent) {
            const line = document.createElement('div');
            line.className = 'terminal-line';
            line.textContent = data.output;
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;
          }
        });
        
        // Handle session info
        socket.on('session:info', (data) => {
          // Create agent buttons
          agentSelector.innerHTML = '';
          for (let i = 0; i < data.agentCount; i++) {
            const btn = document.createElement('button');
            btn.className = 'agent-btn';
            btn.textContent = 'Agent ' + i;
            btn.onclick = () => selectAgent(i);
            if (i === 0) btn.classList.add('active');
            agentSelector.appendChild(btn);
          }
        });
        
        function selectAgent(id) {
          currentAgent = id;
          document.querySelectorAll('.agent-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx === id);
          });
          
          // Clear terminal and request agent output
          terminal.innerHTML = '<div class="terminal-line">Switching to Agent ' + id + '...</div>';
          socket.emit('terminal:request_output', {
            sessionId: '${sessionId}',
            agentId: id
          });
        }
        
        // Touch gestures for agent switching
        let touchStartX = 0;
        terminal.addEventListener('touchstart', (e) => {
          touchStartX = e.touches[0].clientX;
        });
        
        terminal.addEventListener('touchend', (e) => {
          const touchEndX = e.changedTouches[0].clientX;
          const diff = touchStartX - touchEndX;
          
          if (Math.abs(diff) > 50) {
            if (diff > 0) {
              // Swipe left - next agent
              selectAgent(Math.min(currentAgent + 1, agentSelector.children.length - 1));
            } else {
              // Swipe right - previous agent
              selectAgent(Math.max(currentAgent - 1, 0));
            }
          }
        });
      </script>
    </body>
    </html>
  `);
});

export default router;