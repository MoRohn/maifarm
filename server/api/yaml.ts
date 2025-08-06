import { Router, Request, Response } from 'express';
import { apiRateLimits } from '../middleware/rateLimit';
import { yamlGenerator } from '../services/yamlGenerator';
import { yamlValidator } from '../services/yamlValidator';

const router = Router();

// Enhance prompt before YAML generation
router.post('/enhance-prompt',
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { prompt, context, purpose } = req.body;
      
      // Basic validation
      if (!prompt || typeof prompt !== 'string' || prompt.length < 5) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROMPT',
            message: 'Prompt must be at least 5 characters long'
          }
        });
      }

      // Enhance the prompt using yamlGenerator service
      const result = await yamlGenerator.enhancePrompt({
        prompt,
        context,
        purpose
      });

      res.json({
        success: true,
        data: {
          enhanced_prompt: result.enhanced_prompt,
          original_prompt: prompt,
          suggestions: result.suggestions,
          improvements: result.improvements
        }
      });
    } catch (error) {
      console.error('Prompt enhancement error:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'ENHANCEMENT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to enhance prompt'
        }
      });
    }
  }
);

// Generate YAML from prompt
router.post('/generate', 
  apiRateLimits.write,
  async (req: Request, res: Response) => {
    try {
      const { prompt, mode = 'freestyle', templateId, constraints } = req.body;
      
      // Basic validation
      if (!prompt || typeof prompt !== 'string' || prompt.length < 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROMPT',
            message: 'Prompt must be at least 10 characters long'
          }
        });
      }

      // Generate YAML configuration
      const result = await yamlGenerator.generateYaml({
        prompt,
        mode,
        templateId,
        constraints
      });

      res.json({
        success: true,
        data: {
          yaml: result.yaml,
          metadata: result.metadata,
          validation: result.validation,
          suggestions: result.suggestions
        }
      });
    } catch (error) {
      console.error('YAML generation error:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate YAML'
        }
      });
    }
  }
);

// Validate YAML
router.post('/validate',
  apiRateLimits.read,
  async (req: Request, res: Response) => {
    try {
      const { yaml } = req.body;
      
      // Basic validation
      if (!yaml || typeof yaml !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_YAML',
            message: 'YAML content is required'
          }
        });
      }
      
      const validation = await yamlValidator.validate(yaml);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('YAML validation error:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to validate YAML'
        }
      });
    }
  }
);

export default router;