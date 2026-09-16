-- Migration: 061_seed_default_farmer_groups.sql
-- Description: Seeds default farmer groups and maps existing farmer templates
-- Author: Claude Code
-- Date: 2026-01-01

-- ============================================================================
-- INSERT DEFAULT FARMER GROUPS
-- ============================================================================

-- Creative & Content Group
INSERT INTO farmer_groups (id, name, slug, description, icon, color, display_order, is_system, is_active)
VALUES (
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    'Creative & Content',
    'creative-content',
    'Farmers specialized in creative tasks, content creation, storytelling, and visual design',
    '🎨',
    'from-purple-500 to-pink-500',
    1,
    true,
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    display_order = EXCLUDED.display_order;

-- Technical & Development Group
INSERT INTO farmer_groups (id, name, slug, description, icon, color, display_order, is_system, is_active)
VALUES (
    'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e',
    'Technical & Development',
    'technical-development',
    'Farmers focused on code review, architecture design, web harvesting, and technical tasks',
    '💻',
    'from-blue-500 to-cyan-500',
    2,
    true,
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    display_order = EXCLUDED.display_order;

-- Business & Strategy Group
INSERT INTO farmer_groups (id, name, slug, description, icon, color, display_order, is_system, is_active)
VALUES (
    'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f',
    'Business & Strategy',
    'business-strategy',
    'Farmers for startup building, negotiations, strategic planning, and financial operations',
    '📊',
    'from-amber-500 to-orange-500',
    3,
    true,
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    display_order = EXCLUDED.display_order;

-- Operations & Analysis Group
INSERT INTO farmer_groups (id, name, slug, description, icon, color, display_order, is_system, is_active)
VALUES (
    'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a',
    'Operations & Analysis',
    'operations-analysis',
    'Farmers for operations management, data analysis, process optimization, and innovation',
    '⚙️',
    'from-green-500 to-emerald-500',
    4,
    true,
    true
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    display_order = EXCLUDED.display_order;

-- ============================================================================
-- MAP FARMERS TO GROUPS
-- ============================================================================

-- Creative & Content Group Members
-- buzz-bee: Social Media Strategist
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'buzz-bee', 1)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- sage-fox: Storyteller & Narrative Architect
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'sage-fox', 2)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- pixel-panther: Visual Designer
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'pixel-panther', 3)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- sparkle-unicorn: Creative Innovator
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'sparkle-unicorn', 4)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Technical & Development Group Members
-- owlbert-barnowl: Code Reviewer
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'owlbert-barnowl', 1)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- harvest-hound: Web Harvester
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'harvest-hound', 2)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- blueprint-beaver: Architecture Designer
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', 'blueprint-beaver', 3)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Business & Strategy Group Members
-- vision-rooster: Startup Architect
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'vision-rooster', 1)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- barter-bull: Negotiation Expert
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'barter-bull', 2)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- oracle-owl: Strategic Advisor
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'oracle-owl', 3)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- ledger-llama: Finance & Accounting
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f', 'ledger-llama', 4)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Operations & Analysis Group Members
-- daisy-donkey: Operations Manager
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'daisy-donkey', 1)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- harvest-hen: Data Analyst
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'harvest-hen', 2)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- maverick-mustang: Innovation Lead
INSERT INTO farmer_group_members (group_id, farmer_id, display_order)
VALUES ('d4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a', 'maverick-mustang', 3)
ON CONFLICT (group_id, farmer_id) DO UPDATE SET display_order = EXCLUDED.display_order;

-- ============================================================================
-- INITIALIZE FARMER STATS FOR ALL TEMPLATES
-- (Pre-populate with zero stats so queries don't need to handle missing rows)
-- ============================================================================

INSERT INTO farmer_stats (farmer_id, total_uses, successful_farms, failed_farms)
VALUES
    ('buzz-bee', 0, 0, 0),
    ('sage-fox', 0, 0, 0),
    ('pixel-panther', 0, 0, 0),
    ('sparkle-unicorn', 0, 0, 0),
    ('owlbert-barnowl', 0, 0, 0),
    ('harvest-hound', 0, 0, 0),
    ('blueprint-beaver', 0, 0, 0),
    ('vision-rooster', 0, 0, 0),
    ('barter-bull', 0, 0, 0),
    ('oracle-owl', 0, 0, 0),
    ('ledger-llama', 0, 0, 0),
    ('daisy-donkey', 0, 0, 0),
    ('harvest-hen', 0, 0, 0),
    ('maverick-mustang', 0, 0, 0)
ON CONFLICT (farmer_id) DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES (for debugging)
-- ============================================================================
-- SELECT g.name, g.icon, COUNT(m.farmer_id) as farmer_count
-- FROM farmer_groups g
-- LEFT JOIN farmer_group_members m ON g.id = m.group_id
-- GROUP BY g.id, g.name, g.icon
-- ORDER BY g.display_order;

-- SELECT g.name, m.farmer_id, m.display_order
-- FROM farmer_groups g
-- JOIN farmer_group_members m ON g.id = m.group_id
-- ORDER BY g.display_order, m.display_order;
