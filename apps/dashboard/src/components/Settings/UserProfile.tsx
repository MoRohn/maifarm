import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  UserIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ClockIcon,
  KeyIcon,
  BellIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CameraIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store/userStore';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';

interface UserProfileProps {
  onChange?: (key: string, value: any) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ onChange }) => {
  const { user, updateProfile } = useAuth();
  const { preferences } = useUserStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: user?.displayName || user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    isAdmin: user?.roles?.some(role => role.name === 'Admin' || role.name === 'ADMIN' || role.name === 'admin') || false
  });

  // Safely extract notification preferences with comprehensive defaults
  const notificationPrefs = preferences?.notifications || {};
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: preferences?.emailNotifications ?? notificationPrefs?.email?.enabled ?? true,
    pushNotifications: preferences?.pushNotifications ?? notificationPrefs?.desktop ?? true,
    farmUpdates: preferences?.farmUpdates ?? notificationPrefs?.types?.farmStart?.enabled ?? true,
    harvestAlerts: preferences?.harvestAlerts ?? notificationPrefs?.types?.farmComplete?.enabled ?? true
  });

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Avatar must be less than 5MB');
        return;
      }

      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Validate password change if attempted
      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          toast.error('Passwords do not match');
          setIsSaving(false);
          return;
        }
        if (formData.newPassword.length < 8) {
          toast.error('Password must be at least 8 characters');
          setIsSaving(false);
          return;
        }
      }

      // Update profile
      const mergedPreferences = {
        ...(preferences || {}),
        notifications: {
          ...(preferences?.notifications || {}),
          enabled: notificationSettings.emailNotifications || notificationSettings.pushNotifications,
          desktop: notificationSettings.pushNotifications,
          sound: notificationSettings.pushNotifications,
          email: {
            ...(preferences?.notifications?.email || {}),
            enabled: notificationSettings.emailNotifications,
            address: user?.email || preferences?.notifications?.email?.address || '',
            frequency: preferences?.notifications?.email?.frequency || 'immediate'
          },
          types: {
            ...(preferences?.notifications?.types || {}),
            farmStart: {
              ...(preferences?.notifications?.types?.farmStart || {}),
              enabled: notificationSettings.farmUpdates,
              channels: preferences?.notifications?.types?.farmStart?.channels || {
                email: notificationSettings.emailNotifications,
                push: notificationSettings.pushNotifications,
                inApp: true
              }
            },
            farmComplete: {
              ...(preferences?.notifications?.types?.farmComplete || {}),
              enabled: notificationSettings.harvestAlerts,
              channels: preferences?.notifications?.types?.farmComplete?.channels || {
                email: notificationSettings.emailNotifications,
                push: notificationSettings.pushNotifications,
                inApp: true
              }
            },
            agentError: preferences?.notifications?.types?.agentError,
            resourceAlert: preferences?.notifications?.types?.resourceAlert,
            aiDiscovery: preferences?.notifications?.types?.aiDiscovery,
          }
        }
      };

      await updateProfile({
        name: formData.name,
        displayName: formData.name,
        avatar: avatarPreview || undefined,
        preferences: mergedPreferences
      });

      toast.success('Profile updated successfully');
      setIsEditing(false);
      setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
      console.error('Profile update error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      name: user?.name || '',
      email: user?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      isAdmin: user?.roles?.some(role => role.name === 'Admin' || role.name === 'ADMIN') || false
    });
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Profile Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center space-x-4">
            {/* Avatar */}
            <div className="relative group">
              <div className={cn(
                'w-24 h-24 rounded-full overflow-hidden',
                'border-4 border-emerald-500 dark:border-emerald-400',
                'shadow-lg'
              )}>
                {avatarPreview || user?.avatar ? (
                  <img
                    src={avatarPreview || user?.avatar}
                    alt={user?.name || 'User'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold">
                    {getInitials(user?.name || 'User')}
                  </div>
                )}
              </div>
              {isEditing && (
                <label className={cn(
                  'absolute bottom-0 right-0',
                  'w-8 h-8 bg-emerald-600 rounded-full',
                  'flex items-center justify-center',
                  'cursor-pointer shadow-lg',
                  'hover:bg-emerald-700 transition-colors',
                  'group-hover:scale-110 transform duration-200'
                )}>
                  <CameraIcon className="w-4 h-4 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </label>
              )}
            </div>

            {/* User Info */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {user?.name || 'User'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 flex items-center space-x-2 mt-1">
                <EnvelopeIcon className="w-4 h-4" />
                <span>{user?.email}</span>
              </p>
              <div className="flex items-center space-x-4 mt-2">
                {user?.roles && user.roles.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <ShieldCheckIcon className="w-3 h-3 mr-1" />
                    {user.roles[0].name}
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  <ClockIcon className="w-3 h-3 mr-1" />
                  Joined {formatDate(user?.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors duration-200 shadow-sm"
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Account Stats */}
        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {Array.isArray(user?.farms) ? user.farms.length : 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Active Farms</div>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
              {Array.isArray(user?.harvests) ? user.harvests.length : 0}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Harvests</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900 dark:text-white">
              {user?.lastLogin ? formatDate(user.lastLogin) : formatDate(user?.createdAt)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {user?.lastLogin ? 'Last Login' : 'Member Since'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Profile Details Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
          <UserIcon className="w-5 h-5 mr-2" />
          Personal Information
        </h3>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={!isEditing}
              className={cn(
                'w-full px-4 py-3 rounded-lg',
                'border border-gray-300 dark:border-gray-600',
                'bg-white dark:bg-gray-900',
                'text-gray-900 dark:text-white',
                'focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
                'transition-all duration-200',
                !isEditing && 'opacity-60 cursor-not-allowed'
              )}
              placeholder="Enter your full name"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 cursor-not-allowed"
              />
              <CheckCircleIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Email cannot be changed for security reasons
            </p>
          </div>
        </div>
      </motion.div>

      {/* Security Card */}
      {isEditing && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
            <LockClosedIcon className="w-5 h-5 mr-2" />
            Change Password
          </h3>

          <div className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter new password"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Confirm new password"
              />
            </div>

            {formData.newPassword && formData.confirmPassword && (
              <div className={cn(
                'p-3 rounded-lg flex items-center space-x-2',
                formData.newPassword === formData.confirmPassword
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              )}>
                {formData.newPassword === formData.confirmPassword ? (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    <span className="text-sm">Passwords match</span>
                  </>
                ) : (
                  <>
                    <ExclamationCircleIcon className="w-4 h-4" />
                    <span className="text-sm">Passwords do not match</span>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Administrator & Permissions Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
          <ShieldCheckIcon className="w-5 h-5 mr-2" />
          Administrator & Permissions
        </h3>

        <div className="space-y-4">
          {/* Administrator Toggle */}
          <div className="flex items-center justify-between py-4 px-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-purple-600 dark:bg-purple-500 flex items-center justify-center">
                <ShieldCheckIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">Administrator Access</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Full system access and user management capabilities
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                if (isEditing) {
                  setFormData({ ...formData, isAdmin: !formData.isAdmin });
                }
              }}
              disabled={!isEditing}
              className={cn(
                'relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200',
                formData.isAdmin
                  ? 'bg-purple-600 dark:bg-purple-500'
                  : 'bg-gray-300 dark:bg-gray-600',
                !isEditing && 'opacity-60 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 shadow-lg',
                  formData.isAdmin
                    ? 'translate-x-8'
                    : 'translate-x-1'
                )}
              />
            </button>
          </div>

          {/* Admin Permissions Info */}
          {formData.isAdmin && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pl-4 space-y-2"
            >
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Administrator Permissions:
              </p>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span>Create and manage user accounts</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span>Access all farms and harvests</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span>Modify system settings and configurations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span>View analytics and system logs</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  <span>Manage API keys and integrations</span>
                </li>
              </ul>
            </motion.div>
          )}

          {/* Warning for Admin Removal */}
          {!formData.isAdmin && isEditing && user?.roles?.some(role => role.name === 'Admin' || role.name === 'ADMIN') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start space-x-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700"
            >
              <ExclamationCircleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">Warning: Removing Administrator Access</p>
                <p>You are about to remove your administrator privileges. This action will restrict your access to system settings and user management features.</p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Notifications Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
          <BellIcon className="w-5 h-5 mr-2" />
          Notification Preferences
        </h3>

        <div className="space-y-4">
          {[
            { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive updates via email' },
            { key: 'pushNotifications', label: 'Push Notifications', desc: 'Get browser push notifications' },
            { key: 'farmUpdates', label: 'Farm Updates', desc: 'Notifications about farm status changes' },
            { key: 'harvestAlerts', label: 'Harvest Alerts', desc: 'Alerts when harvests are ready' }
          ].map((setting) => (
            <div key={setting.key} className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{setting.label}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{setting.desc}</div>
              </div>
              <button
                onClick={() => {
                  if (isEditing) {
                    setNotificationSettings({
                      ...notificationSettings,
                      [setting.key]: !notificationSettings[setting.key as keyof typeof notificationSettings]
                    });
                  }
                }}
                disabled={!isEditing}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200',
                  notificationSettings[setting.key as keyof typeof notificationSettings]
                    ? 'bg-emerald-600'
                    : 'bg-gray-300 dark:bg-gray-600',
                  !isEditing && 'opacity-60 cursor-not-allowed'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200',
                    notificationSettings[setting.key as keyof typeof notificationSettings]
                      ? 'translate-x-6'
                      : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Action Buttons */}
      {isEditing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-end space-x-3"
        >
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors duration-200 shadow-sm flex items-center space-x-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </motion.div>
      )}
    </div>
  );
};

export default UserProfile;
