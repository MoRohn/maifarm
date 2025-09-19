import React, { useState, useEffect } from 'react';
import { getBackupService, BackupConfig, BackupMetadata, BackupDestination } from '@/services/backup/backupService';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { 
  Download, 
  Upload, 
  HardDrive, 
  Cloud,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings,
  Shield,
  Archive
} from 'lucide-react';

export const BackupManager: React.FC = () => {
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [config, setConfig] = useState<BackupConfig>({
    schedule: 'daily',
    retentionDays: 30,
    encryptBackups: true,
    compressionEnabled: true,
    destinations: [
      { type: 'local', config: {}, enabled: true },
      { type: 's3', config: { bucket: 'maifarm-backups', region: 'us-east-1' }, enabled: false },
    ],
    incrementalBackup: true,
    maxBackupSize: 100, // MB
  });

  const backupService = getBackupService(config);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      const backupList = await backupService.listBackups();
      setBackups(backupList.sort((_a, _b) => _b.timestamp - _a.timestamp));
    } catch (error) {
      console.error('Failed to load backups:', error);
    }
  };

  const performBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await backupService.performBackup();
      if (result.success) {
        await loadBackups();
      }
    } catch (error) {
      console.error('Backup failed:', error);
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (backupId: string) => {
    if (!window.confirm('Are you sure you want to restore from this backup? This will replace all current data.')) {
      return;
    }

    setIsRestoring(true);
    try {
      const result = await backupService.restore(backupId);
      if (result.success) {
        window.location.reload(); // Reload to show restored data
      }
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const testBackup = async () => {
    try {
      const success = await backupService.testBackup();
      alert(success ? 'Backup test successful!' : 'Backup test failed!');
    } catch (error) {
      console.error('Backup test failed:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getScheduleIcon = () => {
    switch (config.schedule) {
      case 'hourly':
        return '🕐';
      case 'daily':
        return '📅';
      case 'weekly':
        return '📆';
      default:
        return '🔧';
    }
  };

  const lastBackupTime = backupService.getLastBackupTime();
  const timeSinceLastBackup = lastBackupTime ? Date.now() - lastBackupTime : null;

  return (
    <div className="space-y-6">
      {/* Backup Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Disaster Recovery
            </span>
            <div className="flex items-center gap-2">
              {config.encryptBackups && (
                <Badge variant="success" size="sm">
                  <Shield className="w-3 h-3 mr-1" />
                  Encrypted
                </Badge>
              )}
              {config.compressionEnabled && (
                <Badge variant="info" size="sm">
                  <Archive className="w-3 h-3 mr-1" />
                  Compressed
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Schedule</p>
              <p className="text-lg font-semibold flex items-center gap-2">
                <span>{getScheduleIcon()}</span>
                <span className="capitalize">{config.schedule}</span>
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Last Backup</p>
              <p className="text-lg font-semibold">
                {lastBackupTime ? formatDate(lastBackupTime) : 'Never'}
              </p>
              {timeSinceLastBackup && timeSinceLastBackup > 86400000 && (
                <p className="text-xs text-orange-500 mt-1">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  More than 24h ago
                </p>
              )}
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Total Backups</p>
              <p className="text-lg font-semibold">{backups.length}</p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Retention</p>
              <p className="text-lg font-semibold">{config.retentionDays} days</p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button onClick={performBackup} disabled={isBackingUp}>
                {isBackingUp ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Backing up...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Backup Now
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={testBackup}>
                Test Backup
              </Button>
            </div>
            
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup Destinations */}
      <Card>
        <CardHeader>
          <CardTitle>Backup Destinations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.destinations.map((dest, index) => (
              <div
                key={`destination-${dest.type}-${index}`}
                className={`
                  flex items-center justify-between p-3 rounded-lg border
                  ${dest.enabled ? 'bg-green-50 dark:bg-green-900/20 border-green-200' : 'bg-gray-50 dark:bg-gray-800'}
                `}
              >
                <div className="flex items-center gap-3">
                  {dest.type === 'local' ? (
                    <HardDrive className="w-5 h-5" />
                  ) : (
                    <Cloud className="w-5 h-5" />
                  )}
                  <div>
                    <p className="font-medium capitalize">{dest.type}</p>
                    {dest.type !== 'local' && dest.config.bucket && (
                      <p className="text-sm text-gray-500">{dest.config.bucket}</p>
                    )}
                  </div>
                </div>
                <Badge variant={dest.enabled ? 'success' : 'secondary'}>
                  {dest.enabled ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle>Backup History</CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No backups found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {backups.slice(0, 10).map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="font-medium">{formatDate(backup.timestamp)}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-gray-500">
                          {formatFileSize(backup.size)}
                        </span>
                        <Badge variant="secondary" size="sm">
                          {backup.type}
                        </Badge>
                        {backup.encrypted && (
                          <Shield className="w-3 h-3 text-green-500" />
                        )}
                        {backup.compressed && (
                          <Archive className="w-3 h-3 text-blue-500" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restoreBackup(backup.id)}
                    disabled={isRestoring}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};