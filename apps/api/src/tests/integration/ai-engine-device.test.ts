/**
 * AI Engine Device-Optimized Endpoints Integration Tests
 *
 * Tests the device-aware AI engine configuration endpoints
 * with focus on iOS device optimization scenarios.
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { createTestApp, closeTestApp, resetTestDatabase } from '../test-app';

let app: any;

describe('AI Engine Device-Optimized Endpoints', () => {
    beforeAll(async () => {
        app = await createTestApp();
    });

    afterAll(async () => {
        await closeTestApp();
    });

    beforeEach(async () => {
        // Clean up device preferences between tests
        await resetTestDatabase(['device_engine_preferences', 'engine_usage_by_device']);
    });

    // ========================================================================
    // Device Status Endpoint Tests
    // ========================================================================

    describe('GET /api/ai-engines/status/device', () => {

        it('should return limited engines for iPhone SE tier', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-id', 'test-iphone-se')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'limited')
                .set('x-thermal-state', 'nominal');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.engines).toBeDefined();

            // Local models should NOT be available for limited tier
            const engineIds = res.body.engines.map((e: any) => e.id);
            expect(engineIds).not.toContain('ollama');
            expect(engineIds).not.toContain('localcore');

            // Cloud engines should be available
            expect(engineIds).toContain('claude');
            expect(engineIds).toContain('openai');
            expect(engineIds).toContain('grok');

            // Check restrictions
            expect(res.body.restrictions.maxAgents).toBe(2);
            expect(res.body.restrictions.maxDurationMinutes).toBe(60);
            expect(res.body.restrictions.allowLocalModels).toBe(false);
        });

        it('should return all engines for workstation tier', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-id', 'test-mac')
                .set('x-device-type', 'mac')
                .set('x-device-tier', 'workstation');

            expect(res.status).toBe(200);

            const engineIds = res.body.engines.map((e: any) => e.id);

            // Local models SHOULD be available for workstation tier
            expect(engineIds).toContain('ollama');
            expect(engineIds).toContain('localcore');
            expect(engineIds).toContain('claude');

            // Check restrictions
            expect(res.body.restrictions.maxAgents).toBe(10);
            expect(res.body.restrictions.maxDurationMinutes).toBe(480);
            expect(res.body.restrictions.allowLocalModels).toBe(true);
        });

        it('should recommend budget models when thermal is critical', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-id', 'test-hot-iphone')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'performance')
                .set('x-thermal-state', 'critical');

            expect(res.status).toBe(200);

            // Should recommend budget models
            expect(res.body.recommendations).toContain('claude-3-5-haiku-20241022');
            expect(res.body.recommendations).toContain('gpt-4o-mini');

            // Should not recommend heavy models
            expect(res.body.recommendations).not.toContain('claude-3-opus-20240229');
        });

        it('should filter models by device tier', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'limited');

            expect(res.status).toBe(200);

            // Find Claude engine
            const claude = res.body.engines.find((e: any) => e.id === 'claude');
            expect(claude).toBeDefined();

            // Opus should NOT be recommended for limited tier
            const modelIds = claude.models.map((m: any) => m.id);
            expect(modelIds).not.toContain('claude-3-opus-20240229');

            // But Haiku should be
            expect(modelIds).toContain('claude-3-5-haiku-20241022');
        });

        it('should return context about device state', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'standard')
                .set('x-thermal-state', 'fair')
                .set('x-low-power-mode', 'true');

            expect(res.status).toBe(200);
            expect(res.body.context).toBeDefined();
            expect(res.body.context.deviceTier).toBe('standard');
            expect(res.body.context.thermalState).toBe('fair');
            expect(res.body.context.isLowPowerMode).toBe(true);
        });
    });

    // ========================================================================
    // Lightweight Validation Tests
    // ========================================================================

    describe('POST /api/ai-engines/:provider/validate-lite', () => {

        it('should validate Claude API key format', async () => {
            const res = await request(app)
                .post('/api/ai-engines/claude/validate-lite')
                .send({ apiKey: 'sk-ant-api03-valid-key-format-12345678' });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(true);
            expect(res.body.formatOnly).toBe(true);
        });

        it('should reject invalid Claude API key format', async () => {
            const res = await request(app)
                .post('/api/ai-engines/claude/validate-lite')
                .send({ apiKey: 'invalid-key-format' });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
            expect(res.body.message).toContain('sk-');
        });

        it('should validate OpenAI API key format', async () => {
            const res = await request(app)
                .post('/api/ai-engines/openai/validate-lite')
                .send({ apiKey: 'sk-proj-abcdefghijklmnop123456' });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(true);
        });

        it('should defer validation when thermal is critical', async () => {
            const res = await request(app)
                .post('/api/ai-engines/claude/validate-lite')
                .set('x-thermal-state', 'critical')
                .send({ apiKey: 'sk-ant-valid-key-12345678' });

            expect(res.status).toBe(202);
            expect(res.body.deferred).toBe(true);
            expect(res.body.reason).toContain('thermal');
            // Should still return format validity
            expect(res.body.formatValid).toBe(true);
        });

        it('should reject too short API keys', async () => {
            const res = await request(app)
                .post('/api/ai-engines/claude/validate-lite')
                .send({ apiKey: 'sk-short' });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
            expect(res.body.message).toContain('too short');
        });
    });

    // ========================================================================
    // Device Preferences Tests
    // ========================================================================

    describe('GET /api/ai-engines/device-preferences', () => {

        it('should return default preferences for new device', async () => {
            const res = await request(app)
                .get('/api/ai-engines/device-preferences')
                .set('x-device-id', 'new-device-123')
                .set('x-device-tier', 'standard');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.isDefault).toBe(true);
            expect(res.body.preferences.preferredEngine).toBe('claude');
            expect(res.body.preferences.autoSwitchOnThermal).toBe(true);
        });

        it('should recommend Ollama for workstation tier', async () => {
            const res = await request(app)
                .get('/api/ai-engines/device-preferences')
                .set('x-device-id', 'mac-device-456')
                .set('x-device-tier', 'workstation');

            expect(res.status).toBe(200);
            expect(res.body.preferences.preferredEngine).toBe('ollama');
        });
    });

    describe('PUT /api/ai-engines/device-preferences', () => {

        it('should save device preferences', async () => {
            const preferences = {
                preferredEngine: 'openai',
                preferredModel: 'gpt-4o-mini',
                fallbackEngine: 'gpt-oss',
                autoSwitchOnThermal: true,
                autoSwitchOnBattery: false,
                maxConcurrentRequests: 3
            };

            const res = await request(app)
                .put('/api/ai-engines/device-preferences')
                .set('x-device-id', 'iphone-pro-789')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'performance')
                .send(preferences);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify preferences were saved
            const getRes = await request(app)
                .get('/api/ai-engines/device-preferences')
                .set('x-device-id', 'iphone-pro-789');

            expect(getRes.body.isDefault).toBe(false);
            expect(getRes.body.preferences.preferredEngine).toBe('openai');
            expect(getRes.body.preferences.preferredModel).toBe('gpt-4o-mini');
            expect(getRes.body.preferences.autoSwitchOnBattery).toBe(false);
        });

        it('should update existing preferences', async () => {
            // First save
            await request(app)
                .put('/api/ai-engines/device-preferences')
                .set('x-device-id', 'ipad-001')
                .set('x-device-type', 'ipad')
                .set('x-device-tier', 'performance')
                .send({ preferredEngine: 'claude' });

            // Update
            const res = await request(app)
                .put('/api/ai-engines/device-preferences')
                .set('x-device-id', 'ipad-001')
                .set('x-device-type', 'ipad')
                .set('x-device-tier', 'performance')
                .send({ preferredEngine: 'grok', preferredModel: 'grok-2' });

            expect(res.status).toBe(200);

            // Verify update
            const getRes = await request(app)
                .get('/api/ai-engines/device-preferences')
                .set('x-device-id', 'ipad-001');

            expect(getRes.body.preferences.preferredEngine).toBe('grok');
            expect(getRes.body.preferences.preferredModel).toBe('grok-2');
        });
    });

    // ========================================================================
    // Usage Logging Tests
    // ========================================================================

    describe('POST /api/ai-engines/usage', () => {

        it('should log successful engine usage', async () => {
            const res = await request(app)
                .post('/api/ai-engines/usage')
                .set('x-device-id', 'usage-test-device')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'standard')
                .send({
                    engine: 'claude',
                    model: 'claude-3-5-sonnet-20241022',
                    tokensUsed: 1500,
                    cost: 0.0045,
                    latencyMs: 850,
                    success: true
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should log thermal throttle events', async () => {
            const res = await request(app)
                .post('/api/ai-engines/usage')
                .set('x-device-id', 'hot-device')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'limited')
                .send({
                    engine: 'claude',
                    model: 'claude-3-5-haiku-20241022',
                    tokensUsed: 500,
                    latencyMs: 2000,
                    success: true,
                    thermalThrottled: true
                });

            expect(res.status).toBe(200);
        });

        it('should log offline fallback events', async () => {
            const res = await request(app)
                .post('/api/ai-engines/usage')
                .set('x-device-id', 'offline-device')
                .set('x-device-type', 'ipad')
                .set('x-device-tier', 'performance')
                .send({
                    engine: 'gpt-oss',
                    model: 'llama3.1:8b',
                    tokensUsed: 800,
                    latencyMs: 1200,
                    success: true,
                    offlineFallback: true
                });

            expect(res.status).toBe(200);
        });
    });

    // ========================================================================
    // Device Analytics Tests
    // ========================================================================

    describe('GET /api/ai-engines/device-analytics', () => {

        it('should return aggregated analytics', async () => {
            // First log some usage
            await request(app)
                .post('/api/ai-engines/usage')
                .set('x-device-id', 'analytics-device')
                .set('x-device-type', 'iphone')
                .set('x-device-tier', 'standard')
                .send({
                    engine: 'claude',
                    model: 'claude-3-5-sonnet-20241022',
                    tokensUsed: 1000,
                    cost: 0.003,
                    latencyMs: 500,
                    success: true
                });

            const res = await request(app)
                .get('/api/ai-engines/device-analytics')
                .query({ days: 7 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.analytics).toBeDefined();
            expect(res.body.period.days).toBe(7);
        });

        it('should filter by time period', async () => {
            const res = await request(app)
                .get('/api/ai-engines/device-analytics')
                .query({ days: 30 });

            expect(res.status).toBe(200);
            expect(res.body.period.days).toBe(30);
        });
    });

    // ========================================================================
    // Model Filtering Tests
    // ========================================================================

    describe('Model Device Recommendations', () => {

        it('should not show Opus for limited tier devices', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'limited');

            const claude = res.body.engines.find((e: any) => e.id === 'claude');
            const opusModel = claude.models.find((m: any) =>
                m.id === 'claude-3-opus-20240229'
            );

            expect(opusModel).toBeUndefined();
        });

        it('should show Opus for performance tier devices', async () => {
            const res = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'performance');

            const claude = res.body.engines.find((e: any) => e.id === 'claude');
            const opusModel = claude.models.find((m: any) =>
                m.id === 'claude-3-opus-20240229'
            );

            expect(opusModel).toBeDefined();
        });

        it('should show Llama 70B only for workstation tier', async () => {
            // Performance tier - should NOT have 70B
            const perfRes = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'performance');

            const ollamaPerf = perfRes.body.engines.find((e: any) => e.id === 'ollama');
            if (ollamaPerf) {
                const llama70BPerf = ollamaPerf.models.find((m: any) =>
                    m.id === 'llama3.1:70b'
                );
                expect(llama70BPerf).toBeUndefined();
            }

            // Workstation tier - SHOULD have 70B
            const wsRes = await request(app)
                .get('/api/ai-engines/status/device')
                .set('x-device-tier', 'workstation');

            const ollamaWs = wsRes.body.engines.find((e: any) => e.id === 'ollama');
            expect(ollamaWs).toBeDefined();
            const llama70BWs = ollamaWs.models.find((m: any) =>
                m.id === 'llama3.1:70b'
            );
            expect(llama70BWs).toBeDefined();
        });
    });
});
