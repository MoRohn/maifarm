import { Router, Request, Response } from 'express';
import { farmersService } from '../services/farmersService';
import { farmerGroupService } from '../services/FarmerGroupService';
import { orchestratorService } from '../services/unified/orchestratorService';
import { yamlGenerator } from '../services/yamlGenerator';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middleware/auth';

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
  const { id } = req.params;
  console.log(`[Farmers] Launch request for farmer template: ${id}`);

  try {
    const authReq = req as AuthRequest;
    const {
      farmName,
      description,
      userPrompt = '',
      maxAgents,
      yamlContent,
      customizations = {}
    } = req.body;

    console.log(`[Farmers] Request body:`, {
      farmName,
      description: description?.substring(0, 50),
      userPromptLength: userPrompt?.length,
      maxAgents,
      hasYaml: !!yamlContent
    });

    // Step 1: Get farmer template
    const template = await farmersService.getFarmerById(id);

    if (!template) {
      console.error(`[Farmers] Template not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: `Farmer template "${id}" not found`
      });
    }

    console.log(`[Farmers] Found template: ${template.title}`);

    // Step 2: Get or generate YAML
    let customizedYaml = yamlContent;
    if (!customizedYaml) {
      console.log(`[Farmers] Generating YAML for template ${id}`);
      try {
        const result = await farmersService.useFarmer(id);
        customizedYaml = result.customizedYaml;
        if (userPrompt) {
          customizedYaml = customizedYaml.replace(
            /\{\{USER_PROMPT\}\}/g,
            userPrompt
          );
        }
      } catch (yamlError) {
        console.error('[Farmers] YAML generation failed:', yamlError);
        throw new Error(`Failed to generate YAML configuration: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`);
      }
    }

    // Step 3: Create and launch farm
    console.log(`[Farmers] Creating and launching farm`);
    // Use SYSTEM_UUIDS.GUEST for unauthenticated users (database expects UUID format)
    const { SYSTEM_UUIDS } = await import('../utils/systemUuids');
    const userId = authReq.user?.userId || authReq.user?.id || SYSTEM_UUIDS.GUEST;
    const numberOfAgents = Math.min(maxAgents || template.config?.maxAgents || 3, 8);
    const prompt = template.initial_prompt?.replace(/\{\{USER_PROMPT\}\}/g, userPrompt || 'Please help me with my task.') || userPrompt || 'Please help me with my task.';

    let farm;
    try {
      const { farmService } = await import('../services/unified/farmService');
      farm = await farmService.createFarm({
        name: farmName || `${template.title} Farm`,
        description: description || `Farm created from ${template.title} farmer template`,
        numberOfAgents,
        prompt,
        yamlContent: customizedYaml,
        autoScale: template.config?.autoScale || false,
        timeout: template.config?.timeout || 3600,
        userId,
        createdBy: userId,
        farmerTemplateId: id,
        farmerTemplateName: template.title,
        collaborative: template.config?.coordination === 'collaborative',
        staggerDelay: template.config?.stagger || 10,
        provider: 'claude'  // Use Claude provider (has proper CLI implementation)
      });
    } catch (dbError) {
      console.error('[Farmers] Farm creation/launch failed:', dbError);
      throw new Error(`Failed to create farm: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }

    // farmService.createFarm returns LaunchResult with farmId, not id
    const farmId = farm.farmId;
    console.log(`[Farmers] Farm record created with ID: ${farmId}`);

    // Note: farmService.createFarm already handles the full launch internally
    // (it calls launchWithRetry which starts the agents). No need for separate launch.

    // Step 4: Update farmer usage stats in database
    try {
      await farmerGroupService.recordFarmerUsage(id, numberOfAgents);

      // Also track user-specific usage if authenticated
      if (userId && userId !== 'guest') {
        await farmerGroupService.recordUserUsage(userId, id);
      }
    } catch (statsError) {
      // Don't fail the request if stats update fails
      console.warn('[Farmers] Failed to update stats:', statsError);
    }

    console.log(`[Farmers] Successfully launched farm ${farmId} from template ${id}`);

    res.json({
      success: true,
      data: {
        farmId,
        template: template,
        yaml: customizedYaml,
        launchOptions: {
          name: farmName || `${template.title} Farm`,
          numberOfAgents,
          collaborative: template.config?.coordination === 'collaborative'
        }
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';

    console.error(`[Farmers] Error launching farm from template ${id}:`, {
      message: errorMessage,
      stack: errorStack,
      error
    });

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorStack : undefined
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

// Health check endpoint
router.get('/meta/health', async (req: Request, res: Response) => {
  try {
    const healthStatus = await farmersService.getHealthStatus();

    const isHealthy = healthStatus.isInitialized &&
                      healthStatus.loadedFarmers > 0 &&
                      !healthStatus.hasError;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting farmers health status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve health status'
    });
  }
});

// Force re-initialization endpoint (for recovery)
router.post('/meta/reinitialize', async (req: Request, res: Response) => {
  try {
    console.log('[Farmers API] Force re-initialization requested');
    await farmersService.forceReinitialization();

    const healthStatus = await farmersService.getHealthStatus();

    res.json({
      success: healthStatus.isInitialized,
      message: 'FarmersService re-initialized',
      data: healthStatus
    });
  } catch (error) {
    console.error('Error re-initializing farmers service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to re-initialize farmers service'
    });
  }
});

export default router;