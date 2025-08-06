import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { initializeDatabase } from './database/connection.js'

// Import routers
import infographicsRouter from './api/infographics.js'
import datacollectionRouter from './api/datacollection.js'
import articlesRouter from './api/articles.js'
import analysisRouter from './api/analysis.js'
import pipelineRouter from './api/pipeline.js'

// Import agent integration
import { setupInfographRoutes } from './infographAgentIntegration.js'

// Import WebSocket infrastructure
import { createInfogSocketServer } from './websocket/infogSocketServer.js'
import PipelineWebSocketIntegration from './services/pipelineWebSocketIntegration.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const httpServer = createServer(app)

// Create InfogSocketServer instance
const infogSocketServer = createInfogSocketServer(httpServer)

// Legacy Socket.io server for compatibility
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  },
  path: process.env.SOCKET_PATH || '/socket.io'
})

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}))
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}))
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  })
})

// API Routes
app.use('/api/infographics', infographicsRouter)
app.use('/api/datacollection', datacollectionRouter)
app.use('/api/articles', articlesRouter)
app.use('/api/analysis', analysisRouter)
app.use('/api/pipeline', pipelineRouter)

// Setup infograph agent routes
setupInfographRoutes(app, io)

// Make io and infogSocketServer available globally for services
(global as any).io = io
(global as any).infogSocketServer = infogSocketServer

// Initialize pipeline WebSocket integration
const pipelineWSIntegration = new PipelineWebSocketIntegration(io)

// WebSocket handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Join room based on user ID or session
  socket.on('join:user', (userId: string) => {
    socket.join(`user:${userId}`)
    console.log(`Socket ${socket.id} joined room user:${userId}`)
  })

  // Handle infographic generation events
  socket.on('infographic:generate', async (data) => {
    const room = `user:${data.userId}`
    
    // Emit progress updates
    socket.to(room).emit('infographic:progress', {
      id: data.id,
      status: 'processing',
      progress: 0
    })

    // Simulate progress updates (replace with actual processing)
    const progressIntervals = [25, 50, 75, 100]
    progressIntervals.forEach((progress, index) => {
      setTimeout(() => {
        socket.to(room).emit('infographic:progress', {
          id: data.id,
          status: progress === 100 ? 'completed' : 'processing',
          progress
        })
      }, (index + 1) * 1000)
    })
  })

  // Handle agent coordination events
  socket.on('agent:status', (data) => {
    io.emit('agent:update', data)
  })

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not found' } })
})

// Start server
const PORT = process.env.PORT || 4567

// Initialize database before starting server
initializeDatabase()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`)
      console.log(`📱 WebSocket server ready`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`)
      console.log(`💾 Database initialized`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error)
    process.exit(1)
  })