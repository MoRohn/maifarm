import * as yaml from 'js-yaml';

interface YamlValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: any;
}

class YamlParser {
  async parse(yamlContent: string): Promise<any> {
    try {
      const parsed = yaml.load(yamlContent);
      
      // Validate required fields
      const validation = this.validate(parsed);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      return parsed;
    } catch (error) {
      if (error instanceof yaml.YAMLException) {
        throw new Error(`YAML parsing error: ${error.message}`);
      }
      throw error;
    }
  }

  validate(config: any): YamlValidationResult {
    const errors: string[] = [];

    // Check required fields
    if (!config.name) {
      errors.push('Missing required field: name');
    }

    if (!config.type) {
      errors.push('Missing required field: type');
    }

    if (!config.agents || !Array.isArray(config.agents)) {
      errors.push('Missing or invalid field: agents (must be an array)');
    } else {
      // Validate each agent
      config.agents.forEach((agent: any, index: number) => {
        if (!agent.name) {
          errors.push(`Agent ${index + 1}: missing name`);
        }
        if (!agent.type) {
          errors.push(`Agent ${index + 1}: missing type`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      parsed: errors.length === 0 ? config : undefined
    };
  }

  stringify(config: any): string {
    try {
      return yaml.dump(config, {
        indent: 2,
        lineWidth: 80,
        noRefs: true,
        sortKeys: false
      });
    } catch (error) {
      throw new Error(`Failed to stringify configuration: ${error.message}`);
    }
  }

  // Generate a template YAML based on farm type
  generateTemplate(type: 'sequential' | 'parallel' | 'distributed'): string {
    const templates = {
      sequential: `name: Sequential Task Farm
type: sequential
description: Process tasks one after another
agents:
  - name: Data Collector
    type: builder
    capabilities: [data_collection]
    tasks:
      - Collect data from source
      - Validate data integrity
  - name: Data Processor
    type: builder
    capabilities: [data_processing]
    tasks:
      - Process collected data
      - Generate reports
settings:
  maxRetries: 3
  timeout: 3600`,

      parallel: `name: Parallel Processing Farm
type: parallel
description: Process multiple tasks simultaneously
agents:
  - name: Worker 1
    type: builder
    capabilities: [general]
    maxConcurrent: 5
  - name: Worker 2
    type: builder
    capabilities: [general]
    maxConcurrent: 5
  - name: Worker 3
    type: builder
    capabilities: [general]
    maxConcurrent: 5
settings:
  loadBalancing: round-robin
  autoScale: true
  maxAgents: 10`,

      distributed: `name: Distributed Computing Farm
type: distributed
description: Distributed processing across multiple nodes
agents:
  - name: Coordinator
    type: orchestrator
    capabilities: [coordination, monitoring]
  - name: Compute Node 1
    type: compute
    capabilities: [heavy_computation]
    resources:
      cpu: 4
      memory: 8GB
  - name: Compute Node 2
    type: compute
    capabilities: [heavy_computation]
    resources:
      cpu: 4
      memory: 8GB
settings:
  faultTolerance: true
  checkpointing: true
  replicationFactor: 2`
    };

    return templates[type];
  }
}

export const yamlParser = new YamlParser();