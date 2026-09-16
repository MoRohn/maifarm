import { unwrapBarnApiPayload, normalizeBarnItem } from '../barnServiceUtils';

describe('BarnService helpers', () => {
  describe('unwrapBarnApiPayload', () => {
    it('unwraps nested Axios response with success envelope', () => {
      const payload = {
        status: 200,
        data: {
          success: true,
          data: { value: 42 }
        }
      };

      const result = unwrapBarnApiPayload<{ value: number }>(payload);
      expect(result).toEqual({ value: 42 });
    });

    it('returns arrays directly', () => {
      const items = [{ id: 'a' }, { id: 'b' }];
      const result = unwrapBarnApiPayload<typeof items>(items);
      expect(result).toBe(items);
    });

    it('returns null for nullish payloads', () => {
      expect(unwrapBarnApiPayload(null)).toBeNull();
      expect(unwrapBarnApiPayload(undefined)).toBeNull();
    });
  });

  describe('parseBarnItem normalisation', () => {
    it('converts date strings and normalises tags/metadata', () => {
      const now = new Date().toISOString();
      const item = {
        id: 'item-1',
        harvestId: 'harvest-1',
        farmId: 'farm-1',
        farmName: 'Test Farm',
        name: 'Workflow Results',
        description: 'Collected outputs from farm run',
        type: 'workflow',
        category: 'default',
        tags: 'not-an-array',
        artifacts: [
          {
            id: 'art-1',
            name: 'log.txt',
            type: 'log',
            path: '/tmp/log.txt',
            location: '',
            size: 123
          }
        ],
        yield: [],
        config: {},
        metadata: undefined,
        version: '1.0',
        status: 'saved',
        createdBy: 'user-1',
        createdAt: now,
        updatedAt: now,
        useCount: 0
      };

      const parsed = normalizeBarnItem(item);

      expect(parsed.createdAt).toBeInstanceOf(Date);
      expect(parsed.updatedAt).toBeInstanceOf(Date);
      expect(parsed.tags).toEqual([]);
      expect(parsed.metadata).toEqual({
        agentCount: 0,
        taskCount: 0,
        duration: 0,
        successRate: 0,
        resourceUsage: undefined
      });
      expect(parsed.config).toEqual({});
      expect(parsed.artifacts[0].location).toBe('/tmp/log.txt');
    });
  });
});
