import request from 'supertest';
import express from 'express';
import { Router } from 'express';
import { InfographicModel } from '../../models/Infographic';
import { ArticleModel } from '../../models/Article';
import { AnalysisModel } from '../../models/Analysis';

// Mock the models
jest.mock('../../models/Infographic');
jest.mock('../../models/Article');
jest.mock('../../models/Analysis');

// Import the router after mocking
import infographicsRouter from '../infographics';

describe('Infographics API', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/infographics', infographicsRouter);
  });

  describe('GET /api/infographics', () => {
    it('should return list of infographics with default pagination', async () => {
      const mockInfographics = [
        {
          id: '1',
          title: 'Trump Policy Overview',
          description: 'Comprehensive policy analysis',
          template_type: 'standard',
          status: 'published',
          created_at: new Date('2024-06-15'),
          updated_at: new Date('2024-06-15')
        },
        {
          id: '2',
          title: 'Election Polling Data',
          description: 'Latest polling trends',
          template_type: 'chart-heavy',
          status: 'draft',
          created_at: new Date('2024-06-14'),
          updated_at: new Date('2024-06-14')
        }
      ];

      (InfographicModel.find as jest.Mock).mockResolvedValue(mockInfographics);

      const response = await request(app)
        .get('/api/infographics')
        .expect(200);

      expect(response.body).toEqual({
        data: mockInfographics,
        meta: {
          limit: 20,
          offset: 0
        }
      });

      expect(InfographicModel.find).toHaveBeenCalledWith({
        status: undefined,
        template_type: undefined,
        limit: 20,
        offset: 0
      });
    });

    it('should filter infographics by status', async () => {
      const mockPublished = [
        {
          id: '1',
          title: 'Published Infographic',
          status: 'published'
        }
      ];

      (InfographicModel.find as jest.Mock).mockResolvedValue(mockPublished);

      const response = await request(app)
        .get('/api/infographics?status=published')
        .expect(200);

      expect(InfographicModel.find).toHaveBeenCalledWith({
        status: ['published'],
        template_type: undefined,
        limit: 20,
        offset: 0
      });

      expect(response.body.data).toEqual(mockPublished);
    });

    it('should handle pagination parameters', async () => {
      (InfographicModel.find as jest.Mock).mockResolvedValue([]);

      await request(app)
        .get('/api/infographics?limit=10&offset=20')
        .expect(200);

      expect(InfographicModel.find).toHaveBeenCalledWith({
        status: undefined,
        template_type: undefined,
        limit: 10,
        offset: 20
      });
    });

    it('should filter by template type', async () => {
      (InfographicModel.find as jest.Mock).mockResolvedValue([]);

      await request(app)
        .get('/api/infographics?templateType=chart-heavy')
        .expect(200);

      expect(InfographicModel.find).toHaveBeenCalledWith({
        status: undefined,
        template_type: 'chart-heavy',
        limit: 20,
        offset: 0
      });
    });

    it('should handle database errors gracefully', async () => {
      (InfographicModel.find as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/infographics')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/infographics/:id', () => {
    const mockInfographic = {
      id: '123',
      title: 'Test Infographic',
      description: 'Test description',
      template_type: 'standard',
      status: 'published',
      content_data: { sections: [] },
      design_config: { theme: 'modern' }
    };

    it('should return single infographic by ID', async () => {
      (InfographicModel.findById as jest.Mock).mockResolvedValue(mockInfographic);

      const response = await request(app)
        .get('/api/infographics/123')
        .expect(200);

      expect(response.body).toEqual({ data: mockInfographic });
      expect(InfographicModel.findById).toHaveBeenCalledWith('123');
    });

    it('should return 404 if infographic not found', async () => {
      (InfographicModel.findById as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/infographics/nonexistent')
        .expect(404);

      expect(response.body).toEqual({
        error: { message: 'Infographic not found' }
      });
    });

    it('should include full data when requested', async () => {
      const mockFullData = {
        ...mockInfographic,
        articles: [
          { id: 'a1', title: 'Article 1' },
          { id: 'a2', title: 'Article 2' }
        ],
        analysis: {
          sentiment: 'positive',
          key_topics: ['economy', 'policy']
        }
      };

      (InfographicModel.getWithFullData as jest.Mock).mockResolvedValue(mockFullData);

      const response = await request(app)
        .get('/api/infographics/123?includeArticles=true')
        .expect(200);

      expect(response.body.data).toEqual(mockFullData);
      expect(InfographicModel.getWithFullData).toHaveBeenCalledWith('123');
    });

    it('should handle database errors', async () => {
      (InfographicModel.findById as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await request(app)
        .get('/api/infographics/123')
        .expect(500);
    });
  });

  describe('POST /api/infographics', () => {
    const validPayload = {
      title: 'New Trump Policy Infographic',
      description: 'Analysis of recent policy changes',
      template_type: 'timeline',
      design_config: {
        theme: 'professional',
        colors: ['#FF0000', '#0000FF']
      },
      content_data: {
        sections: [
          { type: 'header', content: { title: 'Policy Update' } },
          { type: 'chart', content: { data: [] } }
        ]
      },
      metadata: {
        tags: ['trump', 'policy', '2024']
      }
    };

    it('should create new infographic with valid data', async () => {
      const mockCreated = {
        id: 'new-123',
        ...validPayload,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date()
      };

      (InfographicModel.create as jest.Mock).mockResolvedValue(mockCreated);

      const response = await request(app)
        .post('/api/infographics')
        .send(validPayload)
        .expect(201);

      expect(response.body.data).toEqual(mockCreated);
      expect(InfographicModel.create).toHaveBeenCalledWith(validPayload);
    });

    it('should reject request without title', async () => {
      const invalidPayload = { ...validPayload, title: undefined };

      const response = await request(app)
        .post('/api/infographics')
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toEqual({
        error: { message: 'Title is required' }
      });
      expect(InfographicModel.create).not.toHaveBeenCalled();
    });

    it('should link articles if provided', async () => {
      const payloadWithArticles = {
        ...validPayload,
        article_ids: ['article-1', 'article-2', 'article-3']
      };

      const mockCreated = { id: 'new-123', ...validPayload };

      (InfographicModel.create as jest.Mock).mockResolvedValue(mockCreated);
      (InfographicModel.linkArticles as jest.Mock).mockResolvedValue(true);

      await request(app)
        .post('/api/infographics')
        .send(payloadWithArticles)
        .expect(201);

      expect(InfographicModel.linkArticles).toHaveBeenCalledWith(
        'new-123',
        ['article-1', 'article-2', 'article-3']
      );
    });

    it('should handle creation errors', async () => {
      (InfographicModel.create as jest.Mock).mockRejectedValue(
        new Error('Creation failed')
      );

      await request(app)
        .post('/api/infographics')
        .send(validPayload)
        .expect(500);
    });
  });

  describe('PUT /api/infographics/:id', () => {
    const updatePayload = {
      title: 'Updated Title',
      description: 'Updated description',
      status: 'published'
    };

    it('should update existing infographic', async () => {
      const mockUpdated = {
        id: '123',
        ...updatePayload,
        updated_at: new Date()
      };

      (InfographicModel.update as jest.Mock).mockResolvedValue(mockUpdated);

      const response = await request(app)
        .put('/api/infographics/123')
        .send(updatePayload)
        .expect(200);

      expect(response.body.data).toEqual(mockUpdated);
      expect(InfographicModel.update).toHaveBeenCalledWith('123', updatePayload);
    });

    it('should return 404 if infographic not found', async () => {
      (InfographicModel.update as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .put('/api/infographics/nonexistent')
        .send(updatePayload)
        .expect(404);

      expect(response.body).toEqual({
        error: { message: 'Infographic not found' }
      });
    });

    it('should validate status values', async () => {
      const invalidPayload = {
        status: 'invalid-status'
      };

      const response = await request(app)
        .put('/api/infographics/123')
        .send(invalidPayload)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid status');
    });
  });

  describe('DELETE /api/infographics/:id', () => {
    it('should delete infographic', async () => {
      (InfographicModel.delete as jest.Mock).mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/infographics/123')
        .expect(200);

      expect(response.body).toEqual({
        message: 'Infographic deleted successfully'
      });
      expect(InfographicModel.delete).toHaveBeenCalledWith('123');
    });

    it('should return 404 if infographic not found', async () => {
      (InfographicModel.delete as jest.Mock).mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/infographics/nonexistent')
        .expect(404);

      expect(response.body).toEqual({
        error: { message: 'Infographic not found' }
      });
    });

    it('should handle deletion errors', async () => {
      (InfographicModel.delete as jest.Mock).mockRejectedValue(
        new Error('Deletion failed')
      );

      await request(app)
        .delete('/api/infographics/123')
        .expect(500);
    });
  });

  describe('POST /api/infographics/:id/generate', () => {
    it('should generate visualization for infographic', async () => {
      const mockVisualization = {
        svg: '<svg>...</svg>',
        png: Buffer.from('png-data'),
        url: 'https://cdn.example.com/infographic-123.png'
      };

      (InfographicModel.generate as jest.Mock).mockResolvedValue(mockVisualization);

      const response = await request(app)
        .post('/api/infographics/123/generate')
        .send({ format: 'png' })
        .expect(200);

      expect(response.body.data).toEqual(mockVisualization);
      expect(InfographicModel.generate).toHaveBeenCalledWith('123', { format: 'png' });
    });

    it('should support different output formats', async () => {
      (InfographicModel.generate as jest.Mock).mockResolvedValue({
        svg: '<svg>...</svg>'
      });

      await request(app)
        .post('/api/infographics/123/generate')
        .send({ format: 'svg' })
        .expect(200);

      expect(InfographicModel.generate).toHaveBeenCalledWith('123', { format: 'svg' });
    });

    it('should handle generation errors', async () => {
      (InfographicModel.generate as jest.Mock).mockRejectedValue(
        new Error('Generation failed')
      );

      await request(app)
        .post('/api/infographics/123/generate')
        .send({ format: 'png' })
        .expect(500);
    });
  });
});