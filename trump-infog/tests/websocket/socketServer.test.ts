import { Server } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createInfogSocketServer, InfogSocketServer } from '../../server/websocket/infogSocketServer';
import { createServer } from 'http';

describe('InfogSocketServer', () => {
  let httpServer: Server;
  let socketServer: InfogSocketServer;
  let clientSocket: ClientSocket;
  const serverPort = 5000;

  beforeAll((done) => {
    httpServer = createServer();
    socketServer = createInfogSocketServer(httpServer);
    httpServer.listen(serverPort, done);
  });

  afterAll((done) => {
    socketServer.shutdown();
    httpServer.close(done);
  });

  beforeEach((done) => {
    // Create a client socket for testing
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      auth: { token: 'test-token' },
      query: { agentId: 'test_agent' }
    });
    
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should handle agent connection', (done) => {
      expect(clientSocket.connected).toBe(true);
      done();
    });

    it('should receive state sync on connection', (done) => {
      const testClient = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'test-token' },
        query: { agentId: 'test_agent_2' }
      });

      testClient.on('state:sync', (state) => {
        expect(state).toBeDefined();
        expect(state.projectMetadata).toBeDefined();
        expect(state.pipelineStages).toBeDefined();
        expect(state.agentStates).toBeDefined();
        testClient.disconnect();
        done();
      });
    });

    it('should handle agent disconnection', (done) => {
      const testAgentId = 'test_disconnect_agent';
      const testClient = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'test-token' },
        query: { agentId: testAgentId }
      });

      socketServer.on('connection:removed', ({ agentId }) => {
        if (agentId === testAgentId) {
          done();
        }
      });

      testClient.on('connect', () => {
        testClient.disconnect();
      });
    });
  });

  describe('Pipeline Events', () => {
    it('should handle data collection complete event', (done) => {
      socketServer.on('pipeline:stage_complete', ({ stage, nextStage }) => {
        expect(stage).toBe('data_collection');
        expect(nextStage).toBe('content_analysis');
        done();
      });

      clientSocket.emit('data:collected', {
        articleCount: 42,
        timestamp: new Date().toISOString()
      });
    });

    it('should broadcast pipeline updates', (done) => {
      const secondClient = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'test-token' },
        query: { agentId: 'observer_agent' }
      });

      secondClient.on('connect', () => {
        secondClient.on('pipeline:update', (data) => {
          expect(data.stage).toBe('content_analysis');
          expect(data.status).toBe('complete');
          expect(data.progress).toBe(100);
          secondClient.disconnect();
          done();
        });

        clientSocket.emit('analysis:complete', {
          themes: ['theme1', 'theme2'],
          sentimentScore: 0.75
        });
      });
    });
  });

  describe('Agent Communication', () => {
    it('should handle inter-agent data requests', (done) => {
      const agent1 = clientSocket;
      const agent2 = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'test-token' },
        query: { agentId: 'agent_2' }
      });

      agent2.on('connect', () => {
        agent2.on('coord:data_requested', (data) => {
          expect(data.requestingAgent).toBe('test_agent');
          expect(data.dataType).toBe('analysis_results');
          agent2.disconnect();
          done();
        });

        agent1.emit('coord:request_data', {
          targetAgent: 'agent_2',
          dataType: 'analysis_results'
        });
      });
    });

    it('should handle agent status updates', (done) => {
      const statusUpdate = {
        agentId: 'test_agent',
        status: 'working' as const,
        currentTask: 'analyzing data',
        lastUpdate: new Date().toISOString()
      };

      socketServer.once('agent:state_updated', ({ agentId, update }) => {
        expect(agentId).toBe('test_agent');
        expect(update.status).toBe('working');
        done();
      });

      clientSocket.emit('agent:status', statusUpdate);
    });
  });

  describe('Error Handling', () => {
    it('should handle pipeline errors', (done) => {
      const errorData = {
        stage: 'data_collection',
        error: 'API rate limit exceeded',
        recoverable: true
      };

      socketServer.on('pipeline:stage_updated', ({ stage, update }) => {
        if (stage === 'data_collection' && update.status === 'error') {
          done();
        }
      });

      clientSocket.emit('agent:error', errorData);
    });
  });

  describe('Health Monitoring', () => {
    it('should handle heartbeat events', (done) => {
      socketServer.on('heartbeat:received', ({ agentId }) => {
        expect(agentId).toBe('test_agent');
        done();
      });

      clientSocket.emit('agent:heartbeat');
    });

    it('should broadcast health updates', (done) => {
      clientSocket.on('health:update', (data) => {
        expect(data.connectedAgents).toBeDefined();
        expect(data.totalConnections).toBeGreaterThan(0);
        expect(data.healthStatus).toBeDefined();
        done();
      });

      // Trigger a health check
      socketServer.broadcast('health:update', {
        connectedAgents: ['test_agent'],
        totalConnections: 1,
        healthStatus: { healthy: 1, warning: 0, critical: 0, disconnected: 0 },
        timestamp: new Date().toISOString()
      });
    });
  });
});