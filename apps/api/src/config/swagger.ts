/**
 * Swagger/OpenAPI Configuration for MaiFarm API
 *
 * This file configures swagger-jsdoc to generate OpenAPI documentation
 * from JSDoc comments in the API route files.
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { config } from './index.js';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'MaiFarm API',
    version: '2.0.0',
    description: `
# MaiFarm API Documentation

MaiFarm is a multi-agent AI orchestration platform that enables running collaborative AI agent farms.

## Key Features
- **Farm Management**: Create, launch, monitor, and harvest AI agent farms
- **Multi-Agent Orchestration**: Coordinate multiple AI agents working together
- **Terminal Streaming**: Real-time terminal output from running agents
- **Harvest & Barn**: Collect and store outputs from completed farms
- **Analytics**: Track performance, costs, and usage metrics

## Authentication
Most endpoints require authentication via JWT token in the Authorization header:
\`\`\`
Authorization: Bearer <token>
\`\`\`

Or via session cookie for browser-based clients.

## Execution Modes
| Mode | Duration | Agents | Use Case |
|------|----------|--------|----------|
| Quick Task | 5 min | 1 | Bug fixes, reviews |
| Farm | 1-6 hours | 2-10 | Features, refactoring |
| GoWild | 30 min - 2 hours | 2-3 | Research, exploration |

## WebSocket Events
Real-time updates are delivered via Socket.IO on the same port.
- \`farm:created\`, \`farm:status\`, \`farm:creation-progress\`
- \`agent:updated\`, \`agent:status\`, \`agent:registered\`
- \`harvest:started\`, \`harvest:progress\`, \`harvest:completed\`
- \`terminal:output\`, \`terminal:joined\`
    `,
    contact: {
      name: 'MaiFarm Support',
      url: 'https://github.com/MoRohn/maifarm'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server'
    },
    {
      url: 'https://api.maifarm.app',
      description: 'Production server'
    }
  ],
  tags: [
    { name: 'Health', description: 'System health and readiness checks' },
    { name: 'Authentication', description: 'User authentication (Apple Sign-In)' },
    { name: 'Farms', description: 'Farm management operations' },
    { name: 'Agents', description: 'AI agent operations' },
    { name: 'Tasks', description: 'Task queue and distribution' },
    { name: 'Harvest', description: 'Farm output collection' },
    { name: 'Barn', description: 'Stored harvests and outputs' },
    { name: 'Analytics', description: 'Metrics and analytics' },
    { name: 'Settings', description: 'User and system settings' },
    { name: 'AI Engines', description: 'AI provider configuration' },
    { name: 'Terminal', description: 'Terminal streaming' },
    { name: 'GoWild', description: 'GoWild autonomous mode' },
    { name: 'Quick Task', description: 'Quick 5-minute tasks' },
    { name: 'Device Hardware', description: 'Device hardware detection and AI engine limits' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token from Apple Sign-In authentication'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: 'Session cookie for browser clients'
      }
    },
    schemas: {
      Farm: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Unique farm identifier' },
          name: { type: 'string', description: 'Farm name' },
          description: { type: 'string', description: 'Farm description' },
          status: {
            type: 'string',
            enum: ['idle', 'launching', 'running', 'active', 'completed', 'failed'],
            description: 'Current farm status'
          },
          provider: {
            type: 'string',
            enum: ['claude', 'openai', 'ollama', 'gpt_oss'],
            description: 'AI provider'
          },
          agents: {
            type: 'array',
            items: { $ref: '#/components/schemas/Agent' },
            description: 'Agents in this farm'
          },
          config: { type: 'object', description: 'Farm configuration' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          role: { type: 'string' },
          status: {
            type: 'string',
            enum: ['idle', 'initializing', 'working', 'completed', 'failed']
          },
          farmId: { type: 'string', format: 'uuid' },
          sessionName: { type: 'string', description: 'Tmux session name' }
        }
      },
      Harvest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          farmId: { type: 'string', format: 'uuid' },
          farmName: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'collecting', 'completed', 'failed'] },
          outputs: { type: 'array', items: { type: 'object' } },
          summary: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          farmId: { type: 'string', format: 'uuid' },
          prompt: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'assigned', 'in_progress', 'completed', 'failed'] },
          priority: { type: 'integer', minimum: 0, maximum: 100 },
          result: { type: 'object' }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          displayName: { type: 'string' },
          isAdmin: { type: 'boolean' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' }
            }
          }
        }
      },
      HealthCheck: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          timestamp: { type: 'string', format: 'date-time' },
          uptime: { type: 'number' },
          checks: { type: 'object' },
          system: { type: 'object' }
        }
      },
      HardwareCapabilities: {
        type: 'object',
        description: 'Device hardware capabilities',
        properties: {
          cpu: {
            type: 'object',
            properties: {
              model: { type: 'string' },
              cores: { type: 'integer' },
              threads: { type: 'integer' },
              frequency: { type: 'number', description: 'GHz' },
              vendor: { type: 'string', enum: ['intel', 'amd', 'apple', 'unknown'] },
              isAppleSilicon: { type: 'boolean' }
            }
          },
          gpu: {
            type: 'object',
            nullable: true,
            properties: {
              name: { type: 'string' },
              vramGB: { type: 'number' },
              vendor: { type: 'string', enum: ['nvidia', 'amd', 'apple', 'intel', 'unknown'] },
              metalSupport: { type: 'boolean' },
              computeCapability: { type: 'string' }
            }
          },
          memory: {
            type: 'object',
            properties: {
              totalGB: { type: 'number' },
              availableGB: { type: 'number' },
              swapGB: { type: 'number' }
            }
          },
          platform: { type: 'string' },
          arch: { type: 'string' },
          hasNvidiaGPU: { type: 'boolean' },
          hasAMDGPU: { type: 'boolean' },
          hasAppleSilicon: { type: 'boolean' },
          computeScore: { type: 'integer', minimum: 0, maximum: 100 },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      ModelRecommendation: {
        type: 'object',
        description: 'Recommended AI model based on hardware',
        properties: {
          modelName: { type: 'string' },
          modelSize: { type: 'string', example: '7B' },
          quantization: { type: 'string', example: 'Q4_K_M' },
          backend: { type: 'string', enum: ['vllm', 'llama-cpp'] },
          estimatedVRAM: { type: 'number', description: 'GB' },
          estimatedRAM: { type: 'number', description: 'GB' },
          contextWindow: { type: 'integer' },
          downloadURL: { type: 'string' },
          downloadSizeGB: { type: 'number' },
          recommendationScore: { type: 'integer', minimum: 0, maximum: 100 },
          performanceCategory: { type: 'string', enum: ['optimal', 'good', 'acceptable', 'minimal'] },
          reason: { type: 'string' }
        }
      },
      CompatibleEngine: {
        type: 'object',
        description: 'AI engine compatibility information',
        properties: {
          provider: { type: 'string', enum: ['claude', 'openai', 'ollama', 'gpt_oss'] },
          model_id: { type: 'string' },
          model_name: { type: 'string' },
          is_cloud_based: { type: 'boolean' },
          performance_tier: { type: 'string', enum: ['minimal', 'standard', 'performance', 'premium'] },
          compatibility_level: { type: 'string', enum: ['full', 'compatible', 'partial', 'incompatible'] },
          estimated_performance: { type: 'string', enum: ['optimal', 'acceptable', 'degraded'] }
        }
      }
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'UNAUTHORIZED' },
                    message: { type: 'string', example: 'Authentication required' }
                  }
                }
              }
            }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'NOT_FOUND' },
                    message: { type: 'string', example: 'Resource not found' }
                  }
                }
              }
            }
          }
        }
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: {
                  type: 'object',
                  properties: {
                    code: { type: 'string', example: 'INTERNAL_ERROR' },
                    message: { type: 'string', example: 'An unexpected error occurred' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  paths: {
    // Health Endpoints
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Comprehensive health check',
        description: 'Returns detailed health status of all system components',
        responses: {
          '200': {
            description: 'System is healthy',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' }
              }
            }
          },
          '503': {
            description: 'System is unhealthy or degraded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthCheck' }
              }
            }
          }
        }
      }
    },
    '/api/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Simple check that the process is alive (Kubernetes liveness probe)',
        responses: {
          '200': {
            description: 'Process is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'alive' },
                    timestamp: { type: 'string', format: 'date-time' },
                    pid: { type: 'integer' },
                    uptime: { type: 'number' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe',
        description: 'Check if the server is ready to accept traffic (Kubernetes readiness probe)',
        responses: {
          '200': {
            description: 'Server is ready',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ready' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '503': {
            description: 'Server is not ready',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'not ready' },
                    timestamp: { type: 'string', format: 'date-time' },
                    websocket: { type: 'boolean' },
                    coordination: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Authentication
    '/api/auth/apple': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with Apple Sign-In',
        description: 'Authenticate user with Apple identity token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['identityToken'],
                properties: {
                  identityToken: { type: 'string', description: 'Apple identity token' },
                  authorizationCode: { type: 'string', description: 'Apple authorization code' },
                  user: {
                    type: 'object',
                    properties: {
                      email: { type: 'string', format: 'email' },
                      name: {
                        type: 'object',
                        properties: {
                          firstName: { type: 'string' },
                          lastName: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        token: { type: 'string' },
                        isNewUser: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          },
          '401': { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    // Farms
    '/api/farms': {
      get: {
        tags: ['Farms'],
        summary: 'List all farms',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by status' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Max results' },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Offset for pagination' }
        ],
        responses: {
          '200': {
            description: 'List of farms',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Farm' }
                    },
                    total: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Farms'],
        summary: 'Create a new farm',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', description: 'Farm name' },
                  description: { type: 'string', description: 'Farm description' },
                  provider: { type: 'string', enum: ['claude', 'openai', 'ollama', 'gpt_oss'], default: 'claude' },
                  config: {
                    type: 'object',
                    properties: {
                      maxAgents: { type: 'integer', default: 3, minimum: 1, maximum: 10 },
                      timeout: { type: 'integer', description: 'Timeout in seconds' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Farm created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Farm' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/farms/{farmId}': {
      get: {
        tags: ['Farms'],
        summary: 'Get farm by ID',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'farmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '200': {
            description: 'Farm details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Farm' }
                  }
                }
              }
            }
          },
          '404': { $ref: '#/components/responses/NotFound' }
        }
      },
      delete: {
        tags: ['Farms'],
        summary: 'Delete a farm',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'farmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '200': {
            description: 'Farm deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Farm deleted successfully' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/farms/{farmId}/launch': {
      post: {
        tags: ['Farms'],
        summary: 'Launch a farm',
        description: 'Start the farm and spawn AI agents',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'farmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '200': {
            description: 'Farm launched',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        farmId: { type: 'string' },
                        status: { type: 'string', example: 'launching' },
                        agents: { type: 'array', items: { $ref: '#/components/schemas/Agent' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/farms/{farmId}/harvest': {
      post: {
        tags: ['Farms', 'Harvest'],
        summary: 'Harvest farm outputs',
        description: 'Collect all outputs from a completed farm',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: 'farmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '200': {
            description: 'Harvest initiated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Harvest' }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Quick Task
    '/api/quicktask': {
      post: {
        tags: ['Quick Task'],
        summary: 'Create a quick task',
        description: 'Create a 5-minute quick task with a single agent',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
                  metadata: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Quick task created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        taskId: { type: 'string' },
                        farmId: { type: 'string' },
                        sessionName: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // GoWild
    '/api/gowild/sessions': {
      post: {
        tags: ['GoWild'],
        summary: 'Start a GoWild session',
        description: 'Create an autonomous exploration session',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['config'],
                properties: {
                  config: {
                    type: 'object',
                    properties: {
                      creativityLevel: { type: 'integer', minimum: 0, maximum: 100 },
                      boundaries: { type: 'object' },
                      focusAreas: { type: 'array', items: { type: 'string' } },
                      explorationDepth: { type: 'integer' },
                      maxDuration: { type: 'integer', description: 'Duration in minutes' },
                      seedPrompt: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'GoWild session started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    session: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        farmId: { type: 'string' },
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Harvests
    '/api/harvests': {
      get: {
        tags: ['Harvest'],
        summary: 'List all harvests',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          '200': {
            description: 'List of harvests',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Harvest' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Barn
    '/api/barn/items': {
      get: {
        tags: ['Barn'],
        summary: 'List barn items',
        description: 'Get all stored items in the barn',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          '200': {
            description: 'List of barn items',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Analytics
    '/api/analytics': {
      get: {
        tags: ['Analytics'],
        summary: 'Get analytics overview',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Analytics data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        totalFarms: { type: 'integer' },
                        activeFarms: { type: 'integer' },
                        completedFarms: { type: 'integer' },
                        totalAgents: { type: 'integer' },
                        totalTasks: { type: 'integer' },
                        tokenUsage: { type: 'object' },
                        costs: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Tasks
    '/api/tasks/submit': {
      post: {
        tags: ['Tasks'],
        summary: 'Submit a task',
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['farmId', 'prompt'],
                properties: {
                  farmId: { type: 'string', format: 'uuid' },
                  prompt: { type: 'string' },
                  priority: { type: 'integer', minimum: 0, maximum: 100, default: 50 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Task submitted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        taskIds: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // AI Engines
    '/api/ai-engines': {
      get: {
        tags: ['AI Engines'],
        summary: 'List available AI engines',
        responses: {
          '200': {
            description: 'List of AI engines',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          provider: { type: 'string' },
                          isConfigured: { type: 'boolean' },
                          isAvailable: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Device Hardware
    '/api/device-hardware/detect': {
      get: {
        tags: ['Device Hardware'],
        summary: 'Detect device hardware capabilities',
        description: 'Detects CPU, GPU, and memory capabilities of the current device',
        responses: {
          '200': {
            description: 'Hardware detection successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    deviceId: { type: 'string' },
                    capabilities: { $ref: '#/components/schemas/HardwareCapabilities' },
                    recommendation: { $ref: '#/components/schemas/ModelRecommendation' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/device-hardware/register': {
      post: {
        tags: ['Device Hardware'],
        summary: 'Register device hardware',
        description: 'Records device hardware profile for the authenticated user',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  deviceName: { type: 'string', description: 'Custom name for this device' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Device registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    device: { type: 'object' },
                    capabilities: { $ref: '#/components/schemas/HardwareCapabilities' }
                  }
                }
              }
            }
          },
          '401': { description: 'Authentication required' }
        }
      }
    },
    '/api/device-hardware/compatible-engines': {
      get: {
        tags: ['Device Hardware'],
        summary: 'Get compatible AI engines',
        description: 'Returns AI engines compatible with the current device hardware',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Compatible engines list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    deviceId: { type: 'string' },
                    computeScore: { type: 'integer', minimum: 0, maximum: 100 },
                    engines: {
                      type: 'object',
                      properties: {
                        recommended: { type: 'array', items: { $ref: '#/components/schemas/CompatibleEngine' } },
                        usable: { type: 'array', items: { $ref: '#/components/schemas/CompatibleEngine' } },
                        notRecommended: { type: 'array', items: { $ref: '#/components/schemas/CompatibleEngine' } }
                      }
                    },
                    totalEngines: { type: 'integer' },
                    compatibleCount: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/device-hardware/limits': {
      get: {
        tags: ['Device Hardware'],
        summary: 'Get device resource limits',
        description: 'Returns recommended resource limits based on device hardware',
        responses: {
          '200': {
            description: 'Resource limits',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    deviceId: { type: 'string' },
                    computeScore: { type: 'integer' },
                    limits: {
                      type: 'object',
                      properties: {
                        maxConcurrentAgents: { type: 'integer' },
                        maxContextWindow: { type: 'integer' },
                        maxTokensPerRequest: { type: 'integer' },
                        recommendedBatchSize: { type: 'integer' },
                        maxParallelRequests: { type: 'integer' },
                        maxModelSizeGB: { type: 'number' },
                        availableTiers: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    hardware: { $ref: '#/components/schemas/HardwareCapabilities' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Options for swagger-jsdoc
const options: swaggerJsdoc.Options = {
  swaggerDefinition,
  // Look for JSDoc comments in API files (currently using inline spec above)
  apis: []
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI on the Express app
 */
export function setupSwagger(app: Express): void {
  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #10b981 }
    `,
    customSiteTitle: 'MaiFarm API Documentation',
    customfavIcon: '/favicon.ico'
  }));

  // Serve raw OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

export { swaggerSpec };
