import { v4 as uuidv4 } from 'uuid';

// In-memory storage for development/testing when PostgreSQL is unavailable
class InMemoryDatabase {
  private farms: Map<string, any> = new Map();
  private seeds: Map<string, any> = new Map();
  private agents: Map<string, any> = new Map();
  private harvests: Map<string, any> = new Map();
  private barn: Map<string, any> = new Map();
  private users: Map<string, any> = new Map();
  private migrations: Map<string, any> = new Map();
  private tasks: Map<string, any> = new Map();

  constructor() {
    // Initialize with a dev user
    const devUserId = 'maifarm-user';
    this.users.set(devUserId, {
      id: devUserId,
      email: 'dev@maifarm.local',
      name: 'Development User',
      role: 'admin',
      created_at: new Date(),
      updated_at: new Date()
    });

    // Initialize with default seeds
    this.initializeDefaultSeeds();
  }

  private initializeDefaultSeeds() {
    const defaultSeeds = [
      {
        id: 'seed-1',
        name: 'Code Review Assistant',
        description: 'Multi-agent team for comprehensive code reviews',
        category: 'development',
        yaml: `agents:
  - name: lead-reviewer
    role: Lead code reviewer and coordinator
    tasks:
      - Coordinate review process
      - Identify critical issues
      - Assign specific areas to other reviewers
  - name: security-reviewer
    role: Security and vulnerability analysis
    tasks:
      - Check for security vulnerabilities
      - Review authentication and authorization
      - Identify potential attack vectors
  - name: performance-reviewer
    role: Performance and optimization analysis
    tasks:
      - Identify performance bottlenecks
      - Suggest optimization strategies
      - Review resource usage`,
        config: {
          maxAgents: 3,
          orchestrationStrategy: 'collaborative'
        },
        tags: ['code-review', 'development', 'quality'],
        is_public: true,
        user_id: 'system',
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'seed-2',
        name: 'Data Processing Pipeline',
        description: 'Agents for data extraction, transformation, and loading',
        category: 'data',
        yaml: `agents:
  - name: data-extractor
    role: Extract data from various sources
    tasks:
      - Connect to data sources
      - Extract raw data
      - Validate data integrity
  - name: data-transformer
    role: Transform and clean data
    tasks:
      - Clean and normalize data
      - Apply business rules
      - Handle edge cases
  - name: data-loader
    role: Load data into target systems
    tasks:
      - Load to database
      - Generate reports
      - Send notifications`,
        config: {
          maxAgents: 3,
          orchestrationStrategy: 'pipeline'
        },
        tags: ['data', 'etl', 'pipeline'],
        is_public: true,
        user_id: 'system',
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 'seed-3',
        name: 'AI Research Assistant',
        description: 'Team for conducting research and generating insights',
        category: 'research',
        yaml: `agents:
  - name: research-lead
    role: Lead researcher and coordinator
    tasks:
      - Define research objectives
      - Coordinate research efforts
      - Synthesize findings
  - name: data-analyst
    role: Analyze data and generate insights
    tasks:
      - Analyze research data
      - Create visualizations
      - Identify patterns
  - name: report-writer
    role: Document findings and create reports
    tasks:
      - Write comprehensive reports
      - Create executive summaries
      - Prepare presentations`,
        config: {
          maxAgents: 3,
          orchestrationStrategy: 'collaborative'
        },
        tags: ['research', 'analysis', 'reporting'],
        is_public: true,
        user_id: 'system',
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    defaultSeeds.forEach(seed => {
      this.seeds.set(seed.id, seed);
    });
  }

  async query(text: string, params?: any[]): Promise<any> {
    const queryLower = text.toLowerCase().trim();
    
    // Parse query type
    if (queryLower.startsWith('select')) {
      return this.handleSelect(text, params);
    } else if (queryLower.startsWith('insert')) {
      return this.handleInsert(text, params);
    } else if (queryLower.startsWith('update')) {
      return this.handleUpdate(text, params);
    } else if (queryLower.startsWith('delete')) {
      return this.handleDelete(text, params);
    } else if (queryLower.startsWith('create table')) {
      // Ignore table creation in memory mode
      return { rows: [] };
    }
    
    // Default response
    return { rows: [] };
  }

  private handleSelect(query: string, params?: any[]): any {
    const queryLower = query.toLowerCase();
    
    // Health check queries
    if (queryLower.includes('select 1') || queryLower.includes('select now()')) {
      return { rows: [{ '?column?': 1, now: new Date() }] };
    }

    // Count queries
    if (queryLower.includes('count(*)')) {
      if (queryLower.includes('from farms')) {
        return { rows: [{ count: this.farms.size.toString() }] };
      }
      if (queryLower.includes('from agents')) {
        return { rows: [{ count: this.agents.size.toString() }] };
      }
      if (queryLower.includes('from seeds')) {
        return { rows: [{ count: this.seeds.size.toString() }] };
      }
      if (queryLower.includes('from harvests')) {
        return { rows: [{ count: this.harvests.size.toString() }] };
      }
      if (queryLower.includes('from barn_items')) {
        return { rows: [{ count: this.barn.size.toString() }] };
      }
    }

    // Farms queries
    if (queryLower.includes('from farms')) {
      const farms = Array.from(this.farms.values());
      
      if (queryLower.includes('where id =')) {
        const id = params?.[0];
        const farm = this.farms.get(id);
        if (farm) {
          // Map to database column names for consistency
          const mappedFarm = {
            id: farm.id,
            name: farm.name,
            description: farm.description,
            status: farm.status,
            type: farm.type,
            config: farm.config,
            agents: farm.agents,
            metrics: farm.metrics,
            tags: farm.tags,
            created_by: farm.created_by || farm.createdBy,
            created_at: farm.created_at || farm.createdAt,
            updated_at: farm.updated_at || farm.updatedAt
          };
          return { rows: [mappedFarm] };
        }
        return { rows: [] };
      }
      
      // Handle pagination
      let result = farms;
      if (params && params.length >= 2) {
        const limit = parseInt(params[params.length - 2]) || 20;
        const offset = parseInt(params[params.length - 1]) || 0;
        result = farms.slice(offset, offset + limit);
      }
      
      return { rows: result };
    }

    // Seeds queries
    if (queryLower.includes('from seeds')) {
      const seeds = Array.from(this.seeds.values());
      
      if (queryLower.includes('where id =')) {
        const id = params?.[0];
        const seed = this.seeds.get(id);
        return { rows: seed ? [seed] : [] };
      }
      
      if (queryLower.includes('where category =')) {
        const category = params?.[0];
        const filtered = seeds.filter(s => s.category === category);
        return { rows: filtered };
      }
      
      return { rows: seeds };
    }

    // Agents queries
    if (queryLower.includes('from agents')) {
      let agents = Array.from(this.agents.values());
      let paramIndex = 0;
      
      // Handle WHERE clauses
      if (queryLower.includes('where')) {
        if (queryLower.includes('where id =')) {
          const id = params?.[paramIndex++];
          const agent = this.agents.get(id);
          return { rows: agent ? [agent] : [] };
        }
        
        // Handle multiple WHERE conditions
        if (queryLower.includes('status =')) {
          const status = params?.[paramIndex++];
          agents = agents.filter(a => a.status === status);
        }
        
        if (queryLower.includes('farm_id =')) {
          const farmId = params?.[paramIndex++];
          agents = agents.filter(a => a.farm_id === farmId);
        }
        
        if (queryLower.includes('type =')) {
          const type = params?.[paramIndex++];
          agents = agents.filter(a => a.type === type);
        }
      }
      
      // Handle pagination (LIMIT and OFFSET are usually the last parameters)
      if (queryLower.includes('limit')) {
        const limit = parseInt(params?.[params.length - 2]) || 20;
        const offset = parseInt(params?.[params.length - 1]) || 0;
        agents = agents.slice(offset, offset + limit);
      }
      
      return { rows: agents };
    }

    // Harvests queries
    if (queryLower.includes('from harvests')) {
      const harvests = Array.from(this.harvests.values());
      
      if (queryLower.includes('where farm_id =')) {
        const farmId = params?.[0];
        const filtered = harvests.filter(h => h.farm_id === farmId);
        return { rows: filtered };
      }
      
      return { rows: harvests };
    }

    // Barn queries
    if (queryLower.includes('from barn_items')) {
      const items = Array.from(this.barn.values());
      
      if (queryLower.includes('where category =')) {
        const category = params?.[0];
        const filtered = items.filter(item => item.category === category);
        return { rows: filtered };
      }
      
      return { rows: items };
    }

    // Default empty result
    return { rows: [] };
  }

  private handleInsert(query: string, params?: any[]): any {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('into farms')) {
      // Check which format is being used based on the query
      const hasType = queryLower.includes('type');
      const hasMetadata = queryLower.includes('metadata');
      
      let farm: any = {
        id: params?.[0] || uuidv4(),
        name: params?.[1],
        description: params?.[2]
      };
      
      if (hasType && hasMetadata) {
        // Format: (id, name, description, type, status, config, metadata)
        farm.type = params?.[3];
        farm.status = params?.[4] || 'active';
        farm.config = typeof params?.[5] === 'string' ? JSON.parse(params[5]) : (params?.[5] || {});
        farm.metadata = typeof params?.[6] === 'string' ? JSON.parse(params[6]) : (params?.[6] || {});
        farm.agents = [];
        farm.metrics = {};
        farm.tags = [];
        farm.created_by = farm.metadata?.createdBy || 'maifarm-user';
        farm.created_at = farm.metadata?.createdAt || new Date();
        farm.updated_at = new Date();
      } else {
        // Format: (id, name, description, status, config, agents, metrics, tags, created_by, created_at, updated_at)
        farm.status = params?.[3] || 'active';
        farm.config = typeof params?.[4] === 'string' ? JSON.parse(params[4]) : (params?.[4] || {});
        farm.agents = typeof params?.[5] === 'string' ? JSON.parse(params[5]) : (params?.[5] || []);
        farm.metrics = typeof params?.[6] === 'string' ? JSON.parse(params[6]) : (params?.[6] || {});
        farm.tags = params?.[7] || [];
        farm.created_by = params?.[8] || 'maifarm-user';
        farm.created_at = params?.[9] || new Date();
        farm.updated_at = params?.[10] || new Date();
        farm.type = 'collaborative'; // Default type
      }
      
      this.farms.set(farm.id, farm);
      return { rows: [farm] };
    }

    if (queryLower.includes('into agents')) {
      const agent = {
        id: params?.[0] || uuidv4(),
        farm_id: params?.[1],
        name: params?.[2],
        type: params?.[3] || 'secondary',
        status: params?.[4] || 'idle',
        capabilities: params?.[5] || [],
        resources: params?.[6] || { cpu: 1, memory: 1024 },
        metrics: params?.[7] || { tasksCompleted: 0, tasksFailed: 0, averageExecutionTime: 0, uptime: 0, efficiency: 0 },
        config: params?.[8] || {},
        last_heartbeat: params?.[9] || new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      
      this.agents.set(agent.id, agent);
      return { rows: [agent] };
    }

    if (queryLower.includes('into seeds')) {
      const seed = {
        id: params?.[0] || uuidv4(),
        name: params?.[1],
        description: params?.[2],
        category: params?.[3],
        yaml: params?.[4],
        config: params?.[5] || {},
        tags: params?.[6] || [],
        is_public: params?.[7] || false,
        user_id: params?.[8] || 'maifarm-user',
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      this.seeds.set(seed.id, seed);
      return { rows: [seed] };
    }

    if (queryLower.includes('into harvests')) {
      const harvest = {
        id: params?.[0] || uuidv4(),
        farm_id: params?.[1],
        type: params?.[2],
        data: params?.[3],
        metadata: params?.[4] || {},
        status: params?.[5] || 'collected',
        created_at: new Date()
      };
      
      this.harvests.set(harvest.id, harvest);
      return { rows: [harvest] };
    }

    if (queryLower.includes('into barn_items')) {
      const item = {
        id: params?.[0] || uuidv4(),
        name: params?.[1],
        description: params?.[2],
        category: params?.[3],
        data: params?.[4],
        metadata: params?.[5] || {},
        tags: params?.[6] || [],
        user_id: params?.[7] || 'maifarm-user',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      this.barn.set(item.id, item);
      return { rows: [item] };
    }

    if (queryLower.includes('into tasks')) {
      const task = {
        id: params?.[0] || uuidv4(),
        farm_id: params?.[1],
        type: params?.[2],
        priority: params?.[3] || 'medium',
        status: params?.[4] || 'queued',
        payload: typeof params?.[5] === 'string' ? JSON.parse(params[5]) : (params?.[5] || {}),
        dependencies: params?.[6] || [],
        retries: params?.[7] || 0,
        max_retries: params?.[8] || 3,
        timeout: params?.[9] || 300000,
        metadata: typeof params?.[10] === 'string' ? JSON.parse(params[10]) : (params?.[10] || {}),
        created_at: params?.[11] || new Date(),
        updated_at: params?.[12] || new Date()
      };
      
      // Store task in tasks Map
      this.tasks.set(task.id, task);
      return { rows: [task] };
    }

    return { rows: [] };
  }

  private handleUpdate(query: string, params?: any[]): any {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('update agents')) {
      // Extract ID from params (it's usually the last parameter)
      const id = params?.[params.length - 1];
      const agent = this.agents.get(id);
      
      if (agent) {
        // Handle heartbeat updates
        if (queryLower.includes('last_heartbeat')) {
          agent.last_heartbeat = params?.[0] || new Date();
          if (params?.[1]) agent.status = params[1];
          if (params?.[2]) agent.metrics = params[2];
          agent.updated_at = new Date();
        } else {
          // Generic update - update fields based on what's in the query
          let paramIndex = 0;
          if (params?.[paramIndex] !== undefined) {
            // Dynamically update fields based on params
            const updateFields = ['name', 'type', 'status', 'capabilities', 'resources', 'config'];
            updateFields.forEach(field => {
              if (params?.[paramIndex] !== undefined && params[paramIndex] !== null) {
                agent[field] = params[paramIndex];
              }
              paramIndex++;
            });
          }
          agent.updated_at = new Date();
        }
        
        this.agents.set(id, agent);
        return { rows: [agent] };
      }
      return { rows: [] };
    }
    
    if (queryLower.includes('update farms')) {
      // Extract ID from params (it's usually the last parameter)
      const id = params?.[params.length - 1];
      const farm = this.farms.get(id);
      
      if (farm) {
        // Handle different update patterns
        if (queryLower.includes("set status = 'running'")) {
          // Pattern: UPDATE farms SET status = 'running', updated_at = $1 WHERE id = $2
          const previousStatus = farm.status;
          farm.status = 'running';
          farm.updated_at = params?.[0] || new Date();
          console.log(`[InMemoryDB] Updated farm ${id} status from '${previousStatus}' to 'running'`);
        } else if (queryLower.includes("set status = 'completed'")) {
          // Pattern: UPDATE farms SET status = 'completed', updated_at = $1 WHERE id = $2
          const previousStatus = farm.status;
          farm.status = 'completed';
          farm.updated_at = params?.[0] || new Date();
          console.log(`[InMemoryDB] Updated farm ${id} status from '${previousStatus}' to 'completed'`);
        } else if (queryLower.includes("set status = 'failed'")) {
          // Pattern: UPDATE farms SET status = 'failed', updated_at = $1 WHERE id = $2
          const previousStatus = farm.status;
          farm.status = 'failed';
          farm.updated_at = params?.[0] || new Date();
          console.log(`[InMemoryDB] Updated farm ${id} status from '${previousStatus}' to 'failed'`);
        } else if (queryLower.includes('set status =') && queryLower.includes('updated_at =')) {
          // Pattern: UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3
          const previousStatus = farm.status;
          farm.status = params?.[0];
          farm.updated_at = params?.[1] || new Date();
          console.log(`[InMemoryDB] Updated farm ${id} status from '${previousStatus}' to '${farm.status}'`);
        } else if (queryLower.includes('set status =')) {
          // Pattern: UPDATE farms SET status = $1 WHERE id = $2
          farm.status = params?.[0];
          farm.updated_at = new Date();
        } else {
          // Generic update - update fields based on position
          // This is a simplified approach for other update patterns
          let paramIndex = 0;
          if (params?.[paramIndex] !== undefined && params?.[paramIndex] !== null) {
            // Check what fields are being updated based on the query
            if (queryLower.includes('name =')) farm.name = params[paramIndex++];
            if (queryLower.includes('description =')) farm.description = params[paramIndex++];
            if (queryLower.includes('status =')) farm.status = params[paramIndex++];
            if (queryLower.includes('config =')) {
              const configParam = params[paramIndex++];
              farm.config = typeof configParam === 'string' ? JSON.parse(configParam) : configParam;
            }
            if (queryLower.includes('tags =')) farm.tags = params[paramIndex++];
          }
          farm.updated_at = new Date();
        }
        
        this.farms.set(id, farm);
        return { rows: [farm] };
      }
      
      // Farm not found, return empty result
      console.log(`[InMemoryDB] Farm ${id} not found for update`);
      return { rows: [] };
    }

    if (queryLower.includes('update seeds')) {
      const id = params?.[params.length - 1];
      const seed = this.seeds.get(id);
      
      if (seed) {
        seed.usage_count = (seed.usage_count || 0) + 1;
        seed.last_used = new Date();
        seed.updated_at = new Date();
        this.seeds.set(id, seed);
        return { rows: [seed] };
      }
    }

    return { rows: [] };
  }

  private handleDelete(query: string, params?: any[]): any {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('from agents')) {
      if (queryLower.includes('where farm_id =')) {
        const farmId = params?.[0];
        for (const [id, agent] of this.agents.entries()) {
          if (agent.farm_id === farmId) {
            this.agents.delete(id);
          }
        }
        return { rows: [] };
      } else if (queryLower.includes('where id =')) {
        const id = params?.[0];
        if (this.agents.has(id)) {
          this.agents.delete(id);
          return { rows: [{ id }] };
        }
      }
    }

    if (queryLower.includes('from farms where id =')) {
      const id = params?.[0];
      if (this.farms.has(id)) {
        this.farms.delete(id);
        return { rows: [{ id }] };
      }
    }

    return { rows: [] };
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {}
    };
  }

  async end() {
    // Clear all data
    this.farms.clear();
    this.seeds.clear();
    this.agents.clear();
    this.harvests.clear();
    this.barn.clear();
  }
}

// Singleton instance
export const inMemoryDb = new InMemoryDatabase();