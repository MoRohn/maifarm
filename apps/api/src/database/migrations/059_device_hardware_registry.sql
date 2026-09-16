-- Device Hardware Registry
-- Records device hardware capabilities and uses them to limit AI engine selection

-- Table to store device hardware profiles
CREATE TABLE IF NOT EXISTS device_hardware (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL, -- Unique device identifier
    device_name VARCHAR(255),

    -- CPU Information
    cpu_model VARCHAR(255),
    cpu_cores INTEGER,
    cpu_threads INTEGER,
    cpu_frequency DECIMAL(5,2), -- GHz
    cpu_vendor VARCHAR(50), -- intel, amd, apple, unknown
    is_apple_silicon BOOLEAN DEFAULT FALSE,

    -- GPU Information
    gpu_name VARCHAR(255),
    gpu_vram_gb DECIMAL(5,1),
    gpu_vendor VARCHAR(50), -- nvidia, amd, apple, intel, unknown
    has_nvidia_gpu BOOLEAN DEFAULT FALSE,
    has_amd_gpu BOOLEAN DEFAULT FALSE,
    metal_support BOOLEAN DEFAULT FALSE,
    cuda_cores INTEGER,
    compute_capability VARCHAR(20),

    -- Memory Information
    memory_total_gb DECIMAL(5,1),
    memory_available_gb DECIMAL(5,1),
    swap_gb DECIMAL(5,1),

    -- Platform Information
    platform VARCHAR(50), -- darwin, win32, linux
    arch VARCHAR(20), -- x64, arm64

    -- Computed Scores
    compute_score INTEGER CHECK (compute_score >= 0 AND compute_score <= 100),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one device per user
    UNIQUE(user_id, device_id)
);

-- Table to define AI engine hardware requirements
CREATE TABLE IF NOT EXISTS ai_engine_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL, -- claude, openai, ollama, gpt_oss
    model_id VARCHAR(255) NOT NULL,
    model_name VARCHAR(255) NOT NULL,

    -- Minimum Hardware Requirements
    min_compute_score INTEGER DEFAULT 0,
    min_memory_gb DECIMAL(5,1) DEFAULT 0,
    min_vram_gb DECIMAL(5,1) DEFAULT 0,
    min_cpu_cores INTEGER DEFAULT 1,

    -- Recommended Hardware
    recommended_compute_score INTEGER DEFAULT 50,
    recommended_memory_gb DECIMAL(5,1) DEFAULT 8,
    recommended_vram_gb DECIMAL(5,1) DEFAULT 0,

    -- Compatibility Flags
    requires_nvidia BOOLEAN DEFAULT FALSE,
    requires_metal BOOLEAN DEFAULT FALSE,
    requires_cuda BOOLEAN DEFAULT FALSE,
    supports_cpu_only BOOLEAN DEFAULT TRUE,

    -- Cloud vs Local
    is_cloud_based BOOLEAN DEFAULT TRUE, -- Cloud APIs don't need local resources
    estimated_vram_usage_gb DECIMAL(5,1),
    estimated_ram_usage_gb DECIMAL(5,1),

    -- Performance Category
    performance_tier VARCHAR(20) DEFAULT 'standard', -- minimal, standard, performance, premium

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(provider, model_id)
);

-- Insert default AI engine requirements
INSERT INTO ai_engine_requirements (provider, model_id, model_name, is_cloud_based, min_compute_score, performance_tier) VALUES
-- Claude Models (Cloud-based - no local requirements)
('claude', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', TRUE, 0, 'premium'),
('claude', 'claude-3-opus-20240229', 'Claude 3 Opus', TRUE, 0, 'premium'),
('claude', 'claude-3-sonnet-20240229', 'Claude 3 Sonnet', TRUE, 0, 'performance'),
('claude', 'claude-3-haiku-20240307', 'Claude 3 Haiku', TRUE, 0, 'standard'),

-- OpenAI Models (Cloud-based - no local requirements)
('openai', 'gpt-4o', 'GPT-4o', TRUE, 0, 'premium'),
('openai', 'gpt-4-turbo', 'GPT-4 Turbo', TRUE, 0, 'premium'),
('openai', 'gpt-4', 'GPT-4', TRUE, 0, 'performance'),
('openai', 'gpt-3.5-turbo', 'GPT-3.5 Turbo', TRUE, 0, 'standard'),

-- Ollama Models (Local - require hardware)
('ollama', 'llama3:8b', 'Llama 3 8B', FALSE, 40, 'standard'),
('ollama', 'llama3:70b', 'Llama 3 70B', FALSE, 80, 'premium'),
('ollama', 'mistral:7b', 'Mistral 7B', FALSE, 35, 'standard'),
('ollama', 'mixtral:8x7b', 'Mixtral 8x7B', FALSE, 70, 'performance'),
('ollama', 'codellama:7b', 'CodeLlama 7B', FALSE, 35, 'standard'),
('ollama', 'phi3:mini', 'Phi-3 Mini', FALSE, 25, 'minimal'),

-- GPT-OSS Models (Local - require hardware)
('gpt_oss', 'meta-llama/Meta-Llama-3.1-8B-Instruct', 'Llama 3.1 8B', FALSE, 55, 'standard'),
('gpt_oss', 'meta-llama/Meta-Llama-3.1-70B-Instruct', 'Llama 3.1 70B', FALSE, 85, 'premium'),
('gpt_oss', 'TheBloke/Llama-2-7B-Chat-GGUF', 'Llama 2 7B Chat', FALSE, 40, 'standard'),
('gpt_oss', 'TheBloke/Llama-2-13B-chat-GGUF', 'Llama 2 13B Chat', FALSE, 55, 'performance'),
('gpt_oss', 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF', 'TinyLlama 1.1B', FALSE, 20, 'minimal')
ON CONFLICT (provider, model_id) DO NOTHING;

-- Update hardware requirements for local models with detailed specs
UPDATE ai_engine_requirements SET
    min_memory_gb = 8, min_vram_gb = 6, min_cpu_cores = 4,
    recommended_memory_gb = 16, recommended_vram_gb = 8,
    estimated_ram_usage_gb = 8, estimated_vram_usage_gb = 6,
    supports_cpu_only = TRUE
WHERE provider IN ('ollama', 'gpt_oss') AND model_id LIKE '%7b%' OR model_id LIKE '%8b%' OR model_id LIKE '%8B%';

UPDATE ai_engine_requirements SET
    min_memory_gb = 16, min_vram_gb = 10, min_cpu_cores = 8,
    recommended_memory_gb = 32, recommended_vram_gb = 16,
    estimated_ram_usage_gb = 14, estimated_vram_usage_gb = 12,
    supports_cpu_only = TRUE
WHERE provider IN ('ollama', 'gpt_oss') AND (model_id LIKE '%13b%' OR model_id LIKE '%13B%');

UPDATE ai_engine_requirements SET
    min_memory_gb = 64, min_vram_gb = 48, min_cpu_cores = 16,
    recommended_memory_gb = 128, recommended_vram_gb = 80,
    estimated_ram_usage_gb = 70, estimated_vram_usage_gb = 60,
    supports_cpu_only = FALSE, requires_nvidia = TRUE
WHERE provider IN ('ollama', 'gpt_oss') AND (model_id LIKE '%70b%' OR model_id LIKE '%70B%');

UPDATE ai_engine_requirements SET
    min_memory_gb = 4, min_vram_gb = 2, min_cpu_cores = 2,
    recommended_memory_gb = 8, recommended_vram_gb = 4,
    estimated_ram_usage_gb = 2, estimated_vram_usage_gb = 1,
    supports_cpu_only = TRUE
WHERE provider IN ('ollama', 'gpt_oss') AND (model_id LIKE '%1b%' OR model_id LIKE '%1B%' OR model_id LIKE '%mini%');

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_device_hardware_user ON device_hardware(user_id);
CREATE INDEX IF NOT EXISTS idx_device_hardware_device ON device_hardware(device_id);
CREATE INDEX IF NOT EXISTS idx_device_hardware_compute ON device_hardware(compute_score);
CREATE INDEX IF NOT EXISTS idx_ai_engine_requirements_provider ON ai_engine_requirements(provider);
CREATE INDEX IF NOT EXISTS idx_ai_engine_requirements_cloud ON ai_engine_requirements(is_cloud_based);
CREATE INDEX IF NOT EXISTS idx_ai_engine_requirements_score ON ai_engine_requirements(min_compute_score);

-- Function to check if an AI engine is compatible with device hardware
CREATE OR REPLACE FUNCTION check_engine_compatibility(
    p_user_id UUID,
    p_device_id VARCHAR(255),
    p_provider VARCHAR(50),
    p_model_id VARCHAR(255)
) RETURNS JSON AS $$
DECLARE
    v_hardware RECORD;
    v_requirements RECORD;
    v_compatible BOOLEAN := TRUE;
    v_issues JSON[] := ARRAY[]::JSON[];
    v_performance_level VARCHAR(20) := 'optimal';
BEGIN
    -- Get device hardware
    SELECT * INTO v_hardware FROM device_hardware
    WHERE user_id = p_user_id AND device_id = p_device_id;

    IF v_hardware IS NULL THEN
        RETURN json_build_object(
            'compatible', FALSE,
            'reason', 'Device hardware not registered',
            'issues', '[]'::json
        );
    END IF;

    -- Get AI engine requirements
    SELECT * INTO v_requirements FROM ai_engine_requirements
    WHERE provider = p_provider AND model_id = p_model_id;

    IF v_requirements IS NULL THEN
        -- Unknown model - allow with warning
        RETURN json_build_object(
            'compatible', TRUE,
            'performance', 'unknown',
            'reason', 'Model requirements not defined, proceeding with caution'
        );
    END IF;

    -- Cloud-based models are always compatible
    IF v_requirements.is_cloud_based THEN
        RETURN json_build_object(
            'compatible', TRUE,
            'performance', 'optimal',
            'reason', 'Cloud-based model - no local hardware requirements'
        );
    END IF;

    -- Check compute score
    IF v_hardware.compute_score < v_requirements.min_compute_score THEN
        v_compatible := FALSE;
        v_issues := array_append(v_issues, json_build_object(
            'type', 'compute_score',
            'required', v_requirements.min_compute_score,
            'actual', v_hardware.compute_score
        ));
    ELSIF v_hardware.compute_score < v_requirements.recommended_compute_score THEN
        v_performance_level := 'acceptable';
    END IF;

    -- Check memory
    IF v_hardware.memory_total_gb < v_requirements.min_memory_gb THEN
        v_compatible := FALSE;
        v_issues := array_append(v_issues, json_build_object(
            'type', 'memory',
            'required', v_requirements.min_memory_gb,
            'actual', v_hardware.memory_total_gb
        ));
    ELSIF v_hardware.memory_total_gb < v_requirements.recommended_memory_gb THEN
        IF v_performance_level = 'optimal' THEN
            v_performance_level := 'good';
        END IF;
    END IF;

    -- Check VRAM (if GPU required)
    IF NOT v_requirements.supports_cpu_only THEN
        IF v_hardware.gpu_vram_gb IS NULL OR v_hardware.gpu_vram_gb < v_requirements.min_vram_gb THEN
            v_compatible := FALSE;
            v_issues := array_append(v_issues, json_build_object(
                'type', 'vram',
                'required', v_requirements.min_vram_gb,
                'actual', COALESCE(v_hardware.gpu_vram_gb, 0)
            ));
        END IF;
    END IF;

    -- Check NVIDIA requirement
    IF v_requirements.requires_nvidia AND NOT v_hardware.has_nvidia_gpu THEN
        v_compatible := FALSE;
        v_issues := array_append(v_issues, json_build_object(
            'type', 'nvidia_required',
            'message', 'This model requires an NVIDIA GPU'
        ));
    END IF;

    -- Check CPU cores
    IF v_hardware.cpu_cores < v_requirements.min_cpu_cores THEN
        IF v_performance_level IN ('optimal', 'good') THEN
            v_performance_level := 'acceptable';
        END IF;
    END IF;

    RETURN json_build_object(
        'compatible', v_compatible,
        'performance', CASE WHEN v_compatible THEN v_performance_level ELSE 'incompatible' END,
        'issues', to_json(v_issues),
        'hardware', json_build_object(
            'compute_score', v_hardware.compute_score,
            'memory_gb', v_hardware.memory_total_gb,
            'vram_gb', v_hardware.gpu_vram_gb,
            'cpu_cores', v_hardware.cpu_cores
        ),
        'requirements', json_build_object(
            'min_compute_score', v_requirements.min_compute_score,
            'min_memory_gb', v_requirements.min_memory_gb,
            'min_vram_gb', v_requirements.min_vram_gb,
            'min_cpu_cores', v_requirements.min_cpu_cores
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get compatible AI engines for a device
CREATE OR REPLACE FUNCTION get_compatible_engines(
    p_user_id UUID,
    p_device_id VARCHAR(255)
) RETURNS TABLE (
    provider VARCHAR(50),
    model_id VARCHAR(255),
    model_name VARCHAR(255),
    is_cloud_based BOOLEAN,
    performance_tier VARCHAR(20),
    compatibility_level VARCHAR(20),
    estimated_performance VARCHAR(20)
) AS $$
DECLARE
    v_hardware RECORD;
BEGIN
    -- Get device hardware
    SELECT * INTO v_hardware FROM device_hardware
    WHERE device_hardware.user_id = p_user_id AND device_hardware.device_id = p_device_id;

    IF v_hardware IS NULL THEN
        -- Return only cloud-based engines if no hardware registered
        RETURN QUERY
        SELECT
            r.provider,
            r.model_id,
            r.model_name,
            r.is_cloud_based,
            r.performance_tier,
            'full'::VARCHAR(20) as compatibility_level,
            'optimal'::VARCHAR(20) as estimated_performance
        FROM ai_engine_requirements r
        WHERE r.is_cloud_based = TRUE
        ORDER BY r.provider, r.performance_tier DESC;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        r.provider,
        r.model_id,
        r.model_name,
        r.is_cloud_based,
        r.performance_tier,
        CASE
            WHEN r.is_cloud_based THEN 'full'
            WHEN v_hardware.compute_score >= r.min_compute_score
                 AND v_hardware.memory_total_gb >= r.min_memory_gb
                 AND (r.supports_cpu_only OR COALESCE(v_hardware.gpu_vram_gb, 0) >= r.min_vram_gb)
                 AND (NOT r.requires_nvidia OR v_hardware.has_nvidia_gpu)
            THEN 'compatible'
            WHEN v_hardware.compute_score >= r.min_compute_score * 0.8
                 AND v_hardware.memory_total_gb >= r.min_memory_gb * 0.8
            THEN 'partial'
            ELSE 'incompatible'
        END::VARCHAR(20) as compatibility_level,
        CASE
            WHEN r.is_cloud_based THEN 'optimal'
            WHEN v_hardware.compute_score >= r.recommended_compute_score
                 AND v_hardware.memory_total_gb >= r.recommended_memory_gb
            THEN 'optimal'
            WHEN v_hardware.compute_score >= r.min_compute_score
                 AND v_hardware.memory_total_gb >= r.min_memory_gb
            THEN 'acceptable'
            ELSE 'degraded'
        END::VARCHAR(20) as estimated_performance
    FROM ai_engine_requirements r
    ORDER BY
        CASE compatibility_level
            WHEN 'full' THEN 1
            WHEN 'compatible' THEN 2
            WHEN 'partial' THEN 3
            ELSE 4
        END,
        r.performance_tier DESC,
        r.provider;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_device_hardware_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS device_hardware_update_timestamp ON device_hardware;
CREATE TRIGGER device_hardware_update_timestamp
    BEFORE UPDATE ON device_hardware
    FOR EACH ROW
    EXECUTE FUNCTION update_device_hardware_timestamp();
