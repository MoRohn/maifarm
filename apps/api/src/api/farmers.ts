import { Router, Request, Response } from 'express';
import { farmersService } from '../services/farmersService';
import { orchestratorService } from '../services/unified/orchestratorService';
import { yamlGenerator } from '../services/yamlGenerator';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get all farmers
router.get('/', async (req: Request, res: Response) => {
  try {
    const farmers = await farmersService.getAllFarmers();
    const categories = await farmersService.getCategories();
    
    res.json({
      success: true,
      data: farmers,
      categories
    });
  } catch (error) {
    console.error('Error fetching farmers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmers'
    });
  }
});

// Get farmer by ID with profile and stats
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [template, profile, stats] = await Promise.all([
      farmersService.getFarmerById(id),
      farmersService.getFarmerProfile(id),
      farmersService.getFarmerStats(id)
    ]);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Farmer not found'
      });
    }

    res.json({
      success: true,
      data: {
        template,
        profile,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching farmer details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer details'
    });
  }
});

// Get farmer profile
router.get('/:id/profile', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profile = await farmersService.getFarmerProfile(id);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Farmer profile not found'
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    console.error('Error fetching farmer profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer profile'
    });
  }
});

// Get farmer stats
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stats = await farmersService.getFarmerStats(id);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Farmer stats not found'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching farmer stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch farmer stats'
    });
  }
});

// Use a farmer template (returns customized YAML and optionally creates farm)
router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userPrompt, customizations, createFarm = false, farmName } = req.body;

    const result = await farmersService.useFarmer(id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Farmer not found'
      });
    }

    // Customize the YAML with user prompt if provided
    let customizedYaml = result.customizedYaml;
    if (userPrompt) {
      // Replace placeholder in initial_prompt with user's prompt
      customizedYaml = customizedYaml.replace(
        /\{\{USER_PROMPT\}\}/g,
        userPrompt
      );
    }

    let farmId = null;
    
    // If createFarm is requested, launch the farm immediately
    if (createFarm) {
      farmId = uuidv4();
      const template = result.template;
      
      // Prepare launch options from farmer template
      const launchOptions = {
        farmId,
        name: farmName || `${template.title} Farm`,
        description: `Farm created from ${template.title} farmer template`,
        numberOfAgents: Math.min(template.config.maxAgents || 8, 8),
        prompt: template.initial_prompt.replace(/\{\{USER_PROMPT\}\}/g, userPrompt || 'Please help me with my task.'),
        yamlContent: customizedYaml,
        steps: template.steps || [],
        collaborative: template.config.coordination === 'collaborative',
        staggerDelay: template.config.stagger || 10,
        provider: 'claude' as const
      };

      try {
        // Launch the farm
        await orchestratorService.launchFarm(launchOptions);
        console.log(`[Farmers] Successfully launched farm ${farmId} from template ${id}`);
      } catch (farmError) {
        console.error('Failed to launch farm from farmer template:', farmError);
        // Don't fail the request if farm launch fails - just log it
      }
    }

    res.json({
      success: true,
      data: {
        template: result.template,
        yaml: customizedYaml,
        farmId: farmId
      }
    });
  } catch (error) {
    console.error('Error using farmer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to use farmer template'
    });
  }
});

// Generate YAML from farmer template with user customizations
router.post('/:id/generate-yaml', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { farmName, description, customPrompt, maxAgents, timeout } = req.body;

    // Get the farmer template
    const template = await farmersService.getFarmerById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Farmer template not found'
      });
    }

    // Generate customized YAML using the enhanced service
    const customizedYaml = await yamlGenerator.generateYamlFromFarmer(
      template,
      {
        farmName: farmName || `${template.title} Farm`,
        description: description || `Farm created using the ${template.title} farmer template`,
        customPrompt: customPrompt || '',
        maxAgents: Math.min(maxAgents || template.config?.maxAgents || 3, 8),
        timeout: timeout || 3600
      }
    );

    res.json({
      success: true,
      yaml: customizedYaml,
      template: {
        id: template.id,
        title: template.title,
        category: template.category
      }
    });
  } catch (error) {
    console.error('Error generating YAML from farmer template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate YAML configuration'
    });
  }
});

// Launch a farm directly from a farmer template
router.post('/:id/launch', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      farmName, 
      description, 
      userPrompt = '', 
      maxAgents, 
      yamlContent,
      customizations = {} 
    } = req.body;

    const template = await farmersService.getFarmerById(id);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Farmer template not found'
      });
    }

    // Use provided YAML or generate it from template
    let customizedYaml = yamlContent;
    let result = null;
    if (!customizedYaml) {
      result = await farmersService.useFarmer(id);
      customizedYaml = result.customizedYaml;
      if (userPrompt) {
        customizedYaml = customizedYaml.replace(
          /\{\{USER_PROMPT\}\}/g,
          userPrompt
        );
      }
    }

    // First, create the farm record in the database using farmService
    const { farmService } = await import('../services/unified/farmService');
    const farm = await farmService.createFarm({
      name: farmName || `${template.title} Farm`,
      description: description || `Farm created from ${template.title} farmer template`,
      type: template.config?.coordination === 'collaborative' ? 'collaborative' : 'sequential',
      config: {
        maxAgents: Math.min(maxAgents || template.config?.maxAgents || 3, 8),
        autoScale: template.config?.autoScale || false,
        timeout: template.config?.timeout || 3600,
        yaml: customizedYaml
      },
      userId: 'maifarm-user', // TODO: get from auth middleware
      createdBy: 'maifarm-user',
      farmerTemplateId: id,
      farmerTemplateName: template.title
    });

    // Use the actual farm ID from the database
    const farmId = farm.id;

    // Prepare launch options from farmer template
    const launchOptions = {
      farmId,
      name: farmName || `${template.title} Farm`,
      description: description || `Farm created from ${template.title} farmer template`,
      numberOfAgents: Math.min(maxAgents || template.config?.maxAgents || 3, 8),
      prompt: template.initial_prompt?.replace(/\{\{USER_PROMPT\}\}/g, userPrompt || 'Please help me with my task.') || userPrompt || 'Please help me with my task.',
      yamlContent: customizedYaml,
      steps: template.steps || [],
      collaborative: template.config?.coordination === 'collaborative',
      staggerDelay: template.config?.stagger || 10,
      provider: 'claude' as const,
      farmerTemplateId: id,
      farmerTemplateName: template.title
    };

    // Launch the farm
    await orchestratorService.launchFarm(launchOptions);
    
    // Update farmer usage stats
    await farmersService.updateFarmerStats(id, {
      totalUses: (await farmersService.getFarmerStats(id))?.totalUses ?? 0 + 1,
      lastUsed: new Date()
    });

    console.log(`[Farmers] Successfully launched farm ${farmId} from template ${id}`);

    res.json({
      success: true,
      data: {
        farmId,
        template: template,
        yaml: customizedYaml,
        launchOptions: {
          name: launchOptions.name,
          numberOfAgents: launchOptions.numberOfAgents,
          collaborative: launchOptions.collaborative
        }
      }
    });
  } catch (error) {
    console.error('Error launching farm from farmer template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to launch farm from farmer template'
    });
  }
});

// Get categories
router.get('/meta/categories', async (req: Request, res: Response) => {
  try {
    const categories = await farmersService.getCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

export default router;