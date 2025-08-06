-- Database initialization script
-- This runs when Docker container starts

-- Import main schema
\i /docker-entrypoint-initdb.d/schema.sql

-- Insert default data
INSERT INTO users (email, username, password_hash, role) VALUES
    ('admin@trumpinfog.com', 'admin', '$2a$10$XQq2o2D3hYqRNa7pI8Ynnu5JqtzV.MhLVwqvOJ8NsxqvPJqFa9Xb.', 'admin'),
    ('demo@trumpinfog.com', 'demo', '$2a$10$XQq2o2D3hYqRNa7pI8Ynnu5JqtzV.MhLVwqvOJ8NsxqvPJqFa9Xb.', 'user')
ON CONFLICT (email) DO NOTHING;

-- Insert default templates
INSERT INTO templates (name, description, category, config) VALUES
    ('Bar Chart Infographic', 'Display data as vertical or horizontal bars', 'charts', '{"type": "bar", "orientation": "vertical", "colors": ["#1f77b4", "#ff7f0e", "#2ca02c"]}'),
    ('Line Chart Timeline', 'Show trends over time with line graphs', 'charts', '{"type": "line", "interpolation": "monotone", "showPoints": true}'),
    ('Pie Chart Breakdown', 'Visualize proportions with pie or donut charts', 'charts', '{"type": "pie", "innerRadius": 0, "showLabels": true}'),
    ('Statistical Dashboard', 'Multi-panel dashboard with various metrics', 'dashboard', '{"layout": "grid", "panels": 6}'),
    ('Comparison Infographic', 'Side-by-side comparison of data points', 'comparison', '{"columns": 2, "showDifference": true}'),
    ('Timeline Infographic', 'Chronicle events along a timeline', 'timeline', '{"orientation": "horizontal", "showDates": true}')
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;