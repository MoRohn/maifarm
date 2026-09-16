-- Migration 066: Cross-Device Farm Handoff System
-- Enables iOS users to transfer running farms to their iMac devices
-- and provides cross-device state synchronization

-- Table to track user's registered devices
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('iphone', 'ipad', 'mac', 'web')),
    platform VARCHAR(50), -- darwin, ios, macos, web
    os_version VARCHAR(50),
    app_version VARCHAR(20),

    -- Device capabilities
    compute_tier VARCHAR(20) DEFAULT 'standard' CHECK (compute_tier IN ('limited', 'standard', 'performance', 'workstation')),
    supports_local_models BOOLEAN DEFAULT FALSE,
    supports_background_execution BOOLEAN DEFAULT FALSE,
    max_agents INT DEFAULT 3,
    max_farm_duration_minutes INT DEFAULT 120,

    -- Push notification token for real-time updates
    push_token TEXT,
    push_token_type VARCHAR(20), -- apns, fcm

    -- Connection state
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ,

    -- Preferences
    is_primary_device BOOLEAN DEFAULT FALSE,
    accept_handoffs BOOLEAN DEFAULT TRUE,
    auto_sync_enabled BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, device_id)
);

-- Table to track farm handoff requests
CREATE TABLE IF NOT EXISTS farm_handoff_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Source and target devices
    source_device_id VARCHAR(64) NOT NULL,
    target_device_id VARCHAR(64),

    -- Handoff type and status
    handoff_type VARCHAR(20) NOT NULL CHECK (handoff_type IN ('transfer', 'clone', 'monitor_only')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'failed', 'cancelled', 'expired')),

    -- State snapshot at handoff time
    farm_state_snapshot JSONB NOT NULL,
    agents_snapshot JSONB,
    progress_at_handoff DECIMAL(5,2),

    -- Handoff details
    reason VARCHAR(255),
    error_message TEXT,

    -- Timing
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track cross-device state sync
CREATE TABLE IF NOT EXISTS device_state_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL,

    -- Sync state
    entity_type VARCHAR(50) NOT NULL, -- farm, harvest, settings, barn_item
    entity_id VARCHAR(255) NOT NULL,
    entity_version BIGINT NOT NULL DEFAULT 1,
    entity_checksum VARCHAR(64), -- SHA-256 of entity data

    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending_upload', 'pending_download', 'conflict')),
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    -- Conflict resolution
    conflict_data JSONB,
    resolved_at TIMESTAMPTZ,
    resolution_strategy VARCHAR(20), -- local_wins, remote_wins, manual, merged

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, device_id, entity_type, entity_id)
);

-- Table to store device notifications/events for cross-device communication
CREATE TABLE IF NOT EXISTS device_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_device_id VARCHAR(64), -- NULL means broadcast to all devices

    -- Notification details
    notification_type VARCHAR(50) NOT NULL, -- farm_status_change, handoff_request, sync_required, harvest_ready
    payload JSONB NOT NULL,
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),

    -- Delivery tracking
    delivered BOOLEAN DEFAULT FALSE,
    delivered_at TIMESTAMPTZ,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Expiration
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track which farms are being monitored on which devices
CREATE TABLE IF NOT EXISTS device_farm_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(64) NOT NULL,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,

    -- Subscription type
    subscription_type VARCHAR(20) DEFAULT 'monitor' CHECK (subscription_type IN ('owner', 'monitor', 'read_only')),

    -- Real-time updates
    receive_terminal_output BOOLEAN DEFAULT TRUE,
    receive_status_updates BOOLEAN DEFAULT TRUE,
    receive_agent_updates BOOLEAN DEFAULT TRUE,

    -- Timing
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, device_id, farm_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_id ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_online ON user_devices(is_online, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_user_devices_type ON user_devices(device_type);

CREATE INDEX IF NOT EXISTS idx_farm_handoff_user_id ON farm_handoff_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_farm_handoff_farm_id ON farm_handoff_requests(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_handoff_status ON farm_handoff_requests(status);
CREATE INDEX IF NOT EXISTS idx_farm_handoff_pending ON farm_handoff_requests(status, expires_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_device_sync_user_device ON device_state_sync(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_entity ON device_state_sync(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_pending ON device_state_sync(sync_status) WHERE sync_status != 'synced';

CREATE INDEX IF NOT EXISTS idx_device_notifications_target ON device_notifications(target_device_id, delivered);
CREATE INDEX IF NOT EXISTS idx_device_notifications_user ON device_notifications(user_id, delivered);
CREATE INDEX IF NOT EXISTS idx_device_notifications_expires ON device_notifications(expires_at) WHERE delivered = FALSE;

CREATE INDEX IF NOT EXISTS idx_device_farm_subs_device ON device_farm_subscriptions(device_id, farm_id);
CREATE INDEX IF NOT EXISTS idx_device_farm_subs_farm ON device_farm_subscriptions(farm_id);

-- Function to get user's online devices eligible for handoff
CREATE OR REPLACE FUNCTION get_handoff_eligible_devices(
    p_user_id UUID,
    p_source_device_id VARCHAR(64),
    p_min_compute_tier VARCHAR(20) DEFAULT 'standard'
) RETURNS TABLE (
    device_id VARCHAR(64),
    device_name VARCHAR(255),
    device_type VARCHAR(20),
    compute_tier VARCHAR(20),
    is_online BOOLEAN,
    last_seen_at TIMESTAMPTZ,
    supports_local_models BOOLEAN,
    max_agents INT
) AS $$
DECLARE
    v_tier_order TEXT[] := ARRAY['limited', 'standard', 'performance', 'workstation'];
    v_min_tier_idx INT;
BEGIN
    -- Find minimum tier index
    v_min_tier_idx := array_position(v_tier_order, p_min_compute_tier);
    IF v_min_tier_idx IS NULL THEN
        v_min_tier_idx := 1;
    END IF;

    RETURN QUERY
    SELECT
        ud.device_id,
        ud.device_name,
        ud.device_type,
        ud.compute_tier,
        ud.is_online,
        ud.last_seen_at,
        ud.supports_local_models,
        ud.max_agents
    FROM user_devices ud
    WHERE ud.user_id = p_user_id
        AND ud.device_id != p_source_device_id
        AND ud.accept_handoffs = TRUE
        AND array_position(v_tier_order, ud.compute_tier) >= v_min_tier_idx
        AND (ud.is_online = TRUE OR ud.last_seen_at > NOW() - INTERVAL '5 minutes')
    ORDER BY
        ud.is_online DESC,
        array_position(v_tier_order, ud.compute_tier) DESC,
        ud.last_seen_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to create a farm handoff request
CREATE OR REPLACE FUNCTION create_farm_handoff_request(
    p_user_id UUID,
    p_farm_id UUID,
    p_source_device_id VARCHAR(64),
    p_target_device_id VARCHAR(64),
    p_handoff_type VARCHAR(20) DEFAULT 'transfer',
    p_reason VARCHAR(255) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_request_id UUID;
    v_farm_state JSONB;
    v_agents JSONB;
    v_progress DECIMAL(5,2);
BEGIN
    -- Get current farm state
    SELECT
        jsonb_build_object(
            'id', f.id,
            'name', f.name,
            'status', f.status,
            'provider', f.provider,
            'duration', f.duration,
            'progress', f.progress,
            'created_at', f.created_at
        ),
        f.agents,
        f.progress
    INTO v_farm_state, v_agents, v_progress
    FROM farms f
    WHERE f.id = p_farm_id AND f.user_id = p_user_id;

    IF v_farm_state IS NULL THEN
        RAISE EXCEPTION 'Farm not found or not owned by user';
    END IF;

    -- Create handoff request
    INSERT INTO farm_handoff_requests (
        user_id, farm_id, source_device_id, target_device_id,
        handoff_type, farm_state_snapshot, agents_snapshot, progress_at_handoff,
        reason
    ) VALUES (
        p_user_id, p_farm_id, p_source_device_id, p_target_device_id,
        p_handoff_type, v_farm_state, v_agents, v_progress,
        p_reason
    )
    RETURNING id INTO v_request_id;

    -- Create notification for target device
    INSERT INTO device_notifications (
        user_id, target_device_id, notification_type, payload, priority
    ) VALUES (
        p_user_id,
        p_target_device_id,
        'handoff_request',
        jsonb_build_object(
            'request_id', v_request_id,
            'farm_id', p_farm_id,
            'farm_name', v_farm_state->>'name',
            'source_device_id', p_source_device_id,
            'handoff_type', p_handoff_type,
            'reason', p_reason
        ),
        'high'
    );

    RETURN v_request_id;
END;
$$ LANGUAGE plpgsql;

-- Function to accept a handoff request
CREATE OR REPLACE FUNCTION accept_farm_handoff(
    p_request_id UUID,
    p_accepting_device_id VARCHAR(64)
) RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_result JSONB;
BEGIN
    -- Get and lock the request
    SELECT * INTO v_request
    FROM farm_handoff_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is no longer pending');
    END IF;

    IF v_request.expires_at < NOW() THEN
        UPDATE farm_handoff_requests SET status = 'expired' WHERE id = p_request_id;
        RETURN jsonb_build_object('success', false, 'error', 'Request has expired');
    END IF;

    IF v_request.target_device_id IS NOT NULL AND v_request.target_device_id != p_accepting_device_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request was sent to a different device');
    END IF;

    -- Update request status
    UPDATE farm_handoff_requests
    SET
        status = 'accepted',
        target_device_id = p_accepting_device_id,
        accepted_at = NOW()
    WHERE id = p_request_id;

    -- Create subscription for the accepting device
    INSERT INTO device_farm_subscriptions (
        user_id, device_id, farm_id, subscription_type
    ) VALUES (
        v_request.user_id, p_accepting_device_id, v_request.farm_id,
        CASE v_request.handoff_type
            WHEN 'transfer' THEN 'owner'
            WHEN 'clone' THEN 'owner'
            ELSE 'monitor'
        END
    )
    ON CONFLICT (user_id, device_id, farm_id) DO UPDATE SET
        subscription_type = EXCLUDED.subscription_type,
        last_activity_at = NOW();

    -- Notify source device
    INSERT INTO device_notifications (
        user_id, target_device_id, notification_type, payload, priority
    ) VALUES (
        v_request.user_id,
        v_request.source_device_id,
        'handoff_accepted',
        jsonb_build_object(
            'request_id', p_request_id,
            'farm_id', v_request.farm_id,
            'accepting_device_id', p_accepting_device_id
        ),
        'high'
    );

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'farm_id', v_request.farm_id,
        'farm_state', v_request.farm_state_snapshot,
        'agents', v_request.agents_snapshot
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_cross_device_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_devices_update_timestamp ON user_devices;
CREATE TRIGGER user_devices_update_timestamp
    BEFORE UPDATE ON user_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_cross_device_timestamp();

DROP TRIGGER IF EXISTS farm_handoff_update_timestamp ON farm_handoff_requests;
CREATE TRIGGER farm_handoff_update_timestamp
    BEFORE UPDATE ON farm_handoff_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_cross_device_timestamp();

DROP TRIGGER IF EXISTS device_sync_update_timestamp ON device_state_sync;
CREATE TRIGGER device_sync_update_timestamp
    BEFORE UPDATE ON device_state_sync
    FOR EACH ROW
    EXECUTE FUNCTION update_cross_device_timestamp();

-- Cleanup job for expired requests and old notifications
CREATE OR REPLACE FUNCTION cleanup_expired_cross_device_data() RETURNS void AS $$
BEGIN
    -- Mark expired handoff requests
    UPDATE farm_handoff_requests
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();

    -- Delete old notifications (older than 7 days)
    DELETE FROM device_notifications
    WHERE created_at < NOW() - INTERVAL '7 days';

    -- Mark devices as offline if no heartbeat for 2 minutes
    UPDATE user_devices
    SET is_online = FALSE
    WHERE is_online = TRUE
        AND last_heartbeat_at < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql;
