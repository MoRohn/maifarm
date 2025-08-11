# MaiBarn - Isolated Storage for MaiFarm

## 🎯 Purpose

MaiBarn is the isolated storage system for MaiFarm that ensures complete separation between farm-generated content and the MaiFarm application codebase. All farm operations, agent workspaces, harvests, and barn items are stored here, preventing any unintended modifications to the main application.

## 🏗️ Architecture

MaiBarn implements a **complete isolation strategy** where:
- Farm agents operate in isolated workspaces within `maibarn/`
- All file operations are validated to prevent path traversal
- The main MaiFarm codebase is protected from any farm-generated changes
- Each farm gets its own isolated workspace with configurable templates

## 📁 Directory Structure

```
maibarn/
├── workspaces/          # Isolated farm workspaces
│   ├── active/         # Currently running farms
│   │   └── {farmId}/   # Each farm's isolated workspace
│   └── archived/       # Completed/archived farm workspaces
│
├── harvests/           # Harvest file storage
│   ├── active/        # Active harvest operations
│   │   └── {harvestId}/
│   │       ├── config/      # Farm configuration
│   │       ├── logs/        # Agent logs
│   │       └── yield/       # Harvest yields
│   └── completed/     # Completed harvests
│
├── barn/              # Permanent storage for valuable outputs
│   ├── items/        # Stored barn items
│   │   └── {itemId}/
│   │       ├── metadata.json
│   │       └── artifacts/
│   ├── templates/    # Reusable templates
│   └── catalog.json  # Barn catalog index
│
├── coordination/      # Multi-agent coordination
│   ├── farms/        # Farm configuration files
│   ├── locks/        # Distributed locks
│   └── active_agents.json
│
├── temp/             # Temporary files
├── logs/             # Operational logs
└── config/           # MaiBarn configuration
```

## 🔒 Security & Isolation

### Path Validation
- All paths are validated to ensure they remain within `maibarn/`
- Path traversal attempts (`../`) are blocked
- Absolute paths outside maibarn are rejected
- Symlinks are validated to prevent escaping

### Workspace Isolation
Each farm workspace is completely isolated:
- Agents cannot access files outside their workspace
- Workspaces have size quotas (default 1GB)
- Automatic cleanup of old workspaces
- Lock mechanism prevents concurrent access

### Access Control
- Role-based access to barn items
- Audit logging for all file operations
- Checksum verification for file integrity
- Automated backup of critical items

## 🚀 Usage

### For Farms
When a farm is created, it automatically gets an isolated workspace in `workspaces/active/{farmId}/`. The farm's agents operate entirely within this workspace.

### For Harvests
Harvest operations store their yields in `harvests/active/{harvestId}/`. Once completed, they can be moved to `harvests/completed/`.

### For Barn Storage
Valuable outputs can be permanently stored in `barn/items/{itemId}/`. These items are cataloged and can be referenced by future farms using `@barn:item-id` syntax.

## 🧹 Maintenance

### Automatic Cleanup
- Temporary files older than 1 day are automatically deleted
- Archived workspaces older than 7 days are removed
- Completed harvests can be compressed after 30 days

### Storage Quotas
- Per-workspace limit: 1GB
- Total maibarn limit: 10GB (configurable)
- Alerts when usage exceeds 90%

### Manual Cleanup
```bash
# Remove all temporary files
rm -rf temp/*

# Archive old workspaces
mv workspaces/active/old-farm-* workspaces/archived/

# Compress old harvests
tar -czf harvests/archive/old-harvests.tar.gz harvests/completed/old-*
```

## 🔧 Configuration

Configuration is stored in `config/settings.json`:
```json
{
  "version": "1.0.0",
  "quotas": {
    "workspaceSize": "1GB",
    "totalSize": "10GB"
  },
  "cleanup": {
    "tempFileAge": "1d",
    "archiveAge": "7d",
    "harvestCompressionAge": "30d"
  },
  "security": {
    "pathValidation": true,
    "checksumVerification": true,
    "auditLogging": true
  }
}
```

## 📊 Monitoring

Monitor storage usage:
```bash
# Check total size
du -sh maibarn/

# Check workspace sizes
du -sh workspaces/active/*

# View recent operations
tail -f logs/audit.log
```

## ⚠️ Important Notes

1. **Never manually move files** from maibarn to the main MaiFarm directory
2. **Always use the API** to access barn items and harvest yields
3. **Do not modify** the directory structure manually
4. **Regular backups** are recommended for barn items

## 🆘 Troubleshooting

### Farm Can't Access Files
- Check workspace exists in `workspaces/active/`
- Verify no locks in `coordination/locks/`
- Check workspace health via API

### Storage Full
- Run cleanup: `DELETE /api/storage/cleanup`
- Archive old workspaces
- Compress completed harvests

### Path Validation Errors
- Ensure paths don't contain `../`
- Use relative paths within workspace
- Check path doesn't escape maibarn

## 📚 Related Documentation

- [Workspace Templates](./docs/workspace-templates.md)
- [Barn Catalog API](./docs/barn-catalog.md)
- [Security Guidelines](./docs/security.md)
- [Migration Guide](./docs/migration.md)

---

*MaiBarn - Keeping your farm yields safe and your codebase clean* 🌾