#!/usr/bin/env node

/**
 * Test script to demonstrate enhanced YAML generation
 * This simulates how the YAML generator would create detailed output
 */

const testPrompt = "Build an infographic of a sci-fi economy";

function generateEnhancedYAML(prompt) {
  const yaml = {
    name: "sci-fi-economy-visualization-farm",
    description: prompt, // Preserves original prompt
    agents: [
      {
        name: "Farmer Joe the Human Farmer",
        role: "Coordinate visualization project and manage workflow",
        capabilities: [
          "project-management",
          "design-coordination",
          "quality-assurance"
        ],
        personality: "Strategic project coordinator"
      },
      {
        name: "Neighton the Horse",
        role: "Design and implement visual components",
        capabilities: [
          "data-visualization",
          "infographic-design",
          "chart-creation",
          "D3.js",
          "Canvas API"
        ],
        personality: "Fast and efficient visual designer"
      },
      {
        name: "Gertie the Guinea Fowl",
        role: "Research and analyze sci-fi economy data",
        capabilities: [
          "data-analysis",
          "research",
          "economic-modeling",
          "trend-analysis"
        ],
        personality: "Alert to data patterns and insights"
      }
    ],
    initial_prompt: `🌾 Welcome to MaiFarm! 🌾

You are joining a collaborative team of 3 specialized agents for an important task.

📋 **Original Request:**
Build an infographic of a sci-fi economy

🎨 **Your Mission:** Create compelling data visualizations:
- Interactive infographics and dashboards
- Real-time data visualization
- Responsive and accessible design
- Performance-optimized rendering
- Export capabilities for various formats

**Visualization Approach:**
1. Define data requirements and user interactions
2. Each agent handles specific visualization components
3. Ensure consistent design language
4. Optimize for performance and responsiveness
5. Test across devices and browsers

👥 **Your Team:**
Working alongside: Farmer Joe the Human Farmer (Strategic project coordinator), Neighton the Horse (Fast and efficient visual designer), Gertie the Guinea Fowl (Alert to data patterns)
Total team size: 3 specialized agents

📁 **Coordination Protocol:**
- Shared workspace: /tmp/claude_coordination/
- Claim work areas in active_agents.json before starting
- Update progress in work_claims.json regularly
- Communicate through shared status files
- Avoid duplicating work by checking claims first

⚙️ **Special Requirements:**
- Create visual representations and infographics
- Implement responsive design for all screen sizes
- Ensure accessibility standards (WCAG 2.1 AA)

✅ **Success Criteria:**
- All tasks completed with high quality
- No duplicate work between agents
- Clear documentation of all work done
- Successful integration of all components
- Meeting or exceeding project requirements

⏱️ **Estimated Timeline:** 2-4 hours

📝 **Getting Started:**
1. Review the task steps outlined below
2. Claim your work area in the coordination files
3. Begin with your assigned responsibilities
4. Coordinate with other agents as needed
5. Update status regularly

When you're ready to begin this collaborative effort with your farm colleagues, respond with "Ready to begin" and start claiming your work areas.`,
    steps: [
      {
        number: 0,
        content: "Set up multi-agent coordination system: Initialize shared workspace at /tmp/claude_coordination/, establish work claim protocols to prevent duplicate efforts, set up inter-agent communication channels, define clear task boundaries and interfaces, implement progress tracking and status updates, and establish conflict resolution procedures",
        description: "Multi-agent coordination and setup",
        estimated_time: 10,
        tags: ["coordination", "setup", "initialization"]
      },
      {
        number: 1,
        content: "Define visualization requirements and data sources: Identify key metrics and KPIs to visualize for sci-fi economy (GDP, trade routes, resource flows, technology levels), determine data update frequency and real-time needs, establish data sources and APIs, define user interaction requirements, and create detailed mockups and wireframes",
        description: "Define visualization requirements",
        estimated_time: 20,
        tags: ["planning", "analysis", "visualization"]
      },
      {
        number: 2,
        content: "Research sci-fi economy concepts: Analyze common sci-fi economic models (post-scarcity, resource-based, energy credits), research interstellar trade concepts, study technology impact on economics, identify unique economic indicators, compile reference materials and inspirations",
        description: "Research sci-fi economy concepts",
        estimated_time: 25,
        tags: ["research", "analysis", "visualization"]
      },
      {
        number: 3,
        content: "Set up visualization framework: Choose appropriate libraries (D3.js for complex visualizations, Chart.js for standard charts, Three.js for 3D elements), configure responsive canvas/SVG rendering, implement data transformation pipeline, establish theming and styling system, create reusable chart components",
        description: "Set up visualization framework",
        estimated_time: 30,
        tags: ["setup", "implementation", "visualization"]
      },
      {
        number: 4,
        content: "Design information architecture: Create clear visual hierarchy for economic data, establish consistent color schemes (tech/futuristic palette), design responsive layout grid for different screen sizes, implement accessibility features, ensure print-ready quality for export",
        description: "Design information architecture",
        estimated_time: 25,
        tags: ["design", "implementation", "visualization"]
      },
      {
        number: 5,
        content: "Implement core visualizations: Build interactive charts for economic indicators (GDP over time, trade balance), create real-time data updates for market fluctuations, add zoom/pan/filter capabilities for detailed exploration, create informative tooltips and legends, implement data comparison features between economies",
        description: "Implement core visualizations",
        estimated_time: 35,
        tags: ["implementation", "visualization"]
      },
      {
        number: 6,
        content: "Create sci-fi specific visualizations: Design interstellar trade route map with animated flows, implement resource flow diagrams between planets/systems, create technology tree visualization, build energy credit exchange dashboard, visualize population distribution across colonies",
        description: "Create sci-fi specific visualizations",
        estimated_time: 40,
        tags: ["implementation", "creative", "visualization"]
      },
      {
        number: 7,
        content: "Optimize performance: Implement efficient data loading and caching strategies, optimize rendering for large datasets (virtualization, LOD), add progressive loading for complex visualizations, minimize bundle size with code splitting, implement web workers for heavy computations",
        description: "Optimize performance",
        estimated_time: 20,
        tags: ["optimization", "visualization"]
      },
      {
        number: 8,
        content: "Create comprehensive infographic: Design cohesive visual narrative telling the story of the sci-fi economy, balance text and visual elements for clarity, ensure cross-device compatibility, implement interactive elements for engagement, create export options (PNG, SVG, PDF)",
        description: "Create comprehensive infographic",
        estimated_time: 30,
        tags: ["implementation", "design", "visualization"]
      },
      {
        number: 9,
        content: "Test and document: Test across all browsers and devices, verify data accuracy and calculations, gather and incorporate user feedback, document usage and integration, create style guide for consistency",
        description: "Test and document",
        estimated_time: 15,
        tags: ["testing", "documentation", "visualization"]
      }
    ],
    config: {
      autoScale: false,
      maxAgents: 6,
      timeout: 3600,
      coordination: "collaborative",
      stagger: 5
    },
    metadata: {
      created_at: new Date().toISOString(),
      ai_generated: true,
      purpose: "visualization",
      num_agents: 3,
      complexity: "moderate",
      original_prompt: prompt
    }
  };
  
  return yaml;
}

// Generate enhanced YAML
const enhancedYAML = generateEnhancedYAML(testPrompt);

// Convert to YAML string format for display
function toYAMLString(obj, indent = 0) {
  let yaml = '';
  const spaces = '  '.repeat(indent);
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    
    if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      value.forEach(item => {
        if (typeof item === 'object') {
          yaml += `${spaces}  - `;
          const firstEntry = Object.entries(item)[0];
          if (firstEntry) {
            yaml += `${firstEntry[0]}: ${typeof firstEntry[1] === 'string' && firstEntry[1].includes('\n') ? '|\n    ' + firstEntry[1].replace(/\n/g, '\n    ') : firstEntry[1]}\n`;
            Object.entries(item).slice(1).forEach(([k, v]) => {
              if (typeof v === 'object' && !Array.isArray(v)) {
                yaml += toYAMLString({[k]: v}, indent + 2);
              } else if (Array.isArray(v)) {
                yaml += `${spaces}    ${k}:\n`;
                v.forEach(subItem => {
                  yaml += `${spaces}      - ${subItem}\n`;
                });
              } else {
                yaml += `${spaces}    ${k}: ${typeof v === 'string' && v.includes('\n') ? '|\n      ' + v.replace(/\n/g, '\n      ') : v}\n`;
              }
            });
          }
        } else {
          yaml += `${spaces}  - ${item}\n`;
        }
      });
    } else if (typeof value === 'object') {
      yaml += `${spaces}${key}:\n`;
      yaml += toYAMLString(value, indent + 1);
    } else if (typeof value === 'string' && value.includes('\n')) {
      yaml += `${spaces}${key}: |\n`;
      value.split('\n').forEach(line => {
        yaml += `${spaces}  ${line}\n`;
      });
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }
  
  return yaml;
}

console.log('Enhanced YAML Generation Test');
console.log('=============================\n');
console.log('Original Prompt:', testPrompt);
console.log('\nGenerated YAML Structure:');
console.log('-------------------------\n');

// Display key enhancements
console.log('✅ Original prompt preserved in description field');
console.log('✅ Detailed initial_prompt with comprehensive instructions');
console.log('✅', enhancedYAML.steps.length, 'detailed steps with full descriptions');
console.log('✅ Agent capabilities and specializations defined');
console.log('✅ Coordination protocols included');
console.log('✅ Success criteria specified');
console.log('✅ Timeline estimates provided\n');

console.log('Sample YAML Output (first 100 lines):');
console.log('--------------------------------------\n');

const yamlString = toYAMLString(enhancedYAML);
const lines = yamlString.split('\n');
console.log(lines.slice(0, 100).join('\n'));

if (lines.length > 100) {
  console.log('\n... [' + (lines.length - 100) + ' more lines] ...\n');
}

console.log('\n✨ Enhanced YAML generation complete!');
console.log('📝 The generated YAML now contains:');
console.log('   - Comprehensive task instructions');
console.log('   - Detailed step-by-step guidance');
console.log('   - Clear agent responsibilities');
console.log('   - Coordination protocols');
console.log('   - Success criteria and timelines');