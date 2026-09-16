import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Mail,
  Shield,
  Save,
  Upload,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { GlassCard } from '../UI/GlassCard';
import { GlassButton } from '../UI/GlassButton';
import { GlassToggle } from '../UI/GlassToggle';
import { GlassModal } from '../UI/GlassModal';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';

interface ProfileSectionProps {
  canManageUsers?: boolean;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  canManageUsers = false
}) => {
  const { user, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showAdminConfirm, setShowAdminConfirm] = useState(false);
  const [pendingAdminStatus, setPendingAdminStatus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    displayName: user?.displayName || '',
    email: user?.email || '',
    username: user?.username || '',
    isAdmin: user?.isAdmin || false
  });

  const [avatar, setAvatar] = useState<string | null>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Avatar must be less than 5MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatar(event.target?.result as string);
        toast.success('Avatar uploaded successfully');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdminToggle = (checked: boolean) => {
    if (user?.isAdmin && !checked) {
      toast.error('Cannot remove admin status from yourself');
      return;
    }

    setPendingAdminStatus(checked);
    setShowAdminConfirm(true);
  };

  const confirmAdminChange = async () => {
    setShowAdminConfirm(false);
    setFormData({ ...formData, isAdmin: pendingAdminStatus });
    toast.success(
      pendingAdminStatus ? 'Admin access granted' : 'Admin access removed'
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        name: formData.displayName,
        displayName: formData.displayName,
        avatar: avatar || undefined
      });
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error('Failed to update profile');
      console.error('Profile update error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatLastLogin = (date?: Date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <>
      <GlassCard className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <User className="w-6 h-6" />
            Profile Settings
          </h2>
          {!isEditing && (
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Edit Profile
            </GlassButton>
          )}
        </div>

        {/* Avatar Section */}
        <div className="flex items-center gap-6">
          <div className="relative">
            <motion.div
              className={cn(
                'w-24 h-24 rounded-full',
                'backdrop-blur-xl bg-gradient-to-br from-blue-500 to-purple-600',
                'border-4 border-white/20',
                'flex items-center justify-center',
                'text-white text-2xl font-bold',
                'shadow-xl shadow-blue-500/30',
                'overflow-hidden'
              )}
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                getInitials(formData.displayName || user?.username || 'U')
              )}
            </motion.div>

            {isEditing && (
              <motion.button
                className={cn(
                  'absolute -bottom-2 -right-2',
                  'w-10 h-10 rounded-full',
                  'backdrop-blur-xl bg-blue-500 border-2 border-white/20',
                  'flex items-center justify-center',
                  'text-white shadow-lg shadow-blue-500/50',
                  'hover:bg-blue-600 transition-all duration-300',
                  'focus:outline-none focus:ring-4 focus:ring-blue-500/50'
                )}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
              </motion.button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-semibold text-white">
              {formData.displayName || user?.username}
            </h3>
            <p className="text-gray-400 text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {formData.email}
            </p>
            <p className="text-gray-400 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Last login: {formatLastLogin(user?.lastLogin)}
            </p>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) =>
                setFormData({ ...formData, displayName: e.target.value })
              }
              disabled={!isEditing}
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'backdrop-blur-xl bg-white/10 border border-white/20',
                'text-white placeholder-gray-400',
                'focus:outline-none focus:ring-4 focus:ring-blue-500/50',
                'transition-all duration-300',
                !isEditing && 'opacity-60 cursor-not-allowed'
              )}
              placeholder="Enter your display name"
            />
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={formData.email}
              disabled
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'backdrop-blur-xl bg-white/5 border border-white/10',
                'text-gray-400',
                'cursor-not-allowed opacity-60'
              )}
            />
          </div>

          {/* Username (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={formData.username}
              disabled
              className={cn(
                'w-full px-4 py-3 rounded-xl',
                'backdrop-blur-xl bg-white/5 border border-white/10',
                'text-gray-400',
                'cursor-not-allowed opacity-60'
              )}
            />
          </div>

          {/* Admin Toggle (Conditional) */}
          {canManageUsers && (
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <div>
                    <p className="text-sm font-medium text-white">
                      Administrator Access
                    </p>
                    <p className="text-xs text-gray-400">
                      Full system access and user management
                    </p>
                  </div>
                </div>
                <GlassToggle
                  checked={formData.isAdmin}
                  onChange={handleAdminToggle}
                  disabled={user?.isAdmin && formData.isAdmin}
                />
              </div>
            </div>
          )}
        </div>

        {/* Preferences Section (Expandable) */}
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={() => setShowPreferences(!showPreferences)}
            className={cn(
              'w-full flex items-center justify-between',
              'text-white font-medium',
              'hover:text-blue-400 transition-colors duration-300',
              'focus:outline-none'
            )}
          >
            <span>Preferences</span>
            {showPreferences ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>

          <AnimatePresence>
            {showPreferences && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 space-y-3 text-gray-400 text-sm">
                  <p>Theme: Dark Mode (Default)</p>
                  <p>Language: English</p>
                  <p>Notifications: Enabled</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <GlassButton
              variant="primary"
              icon={<Save className="w-4 h-4" />}
              onClick={handleSave}
              loading={isSaving}
              fullWidth
            >
              Save Changes
            </GlassButton>
            <GlassButton
              variant="secondary"
              onClick={() => {
                setIsEditing(false);
                setFormData({
                  displayName: user?.displayName || '',
                  email: user?.email || '',
                  username: user?.username || '',
                  isAdmin: user?.isAdmin || false
                });
                setAvatar(null);
              }}
              disabled={isSaving}
            >
              Cancel
            </GlassButton>
          </div>
        )}
      </GlassCard>

      {/* Admin Confirmation Modal */}
      <GlassModal
        isOpen={showAdminConfirm}
        onClose={() => setShowAdminConfirm(false)}
        title="Confirm Admin Status Change"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              {pendingAdminStatus ? (
                <p>
                  You are about to grant administrator access. This will allow
                  full system access and user management capabilities.
                </p>
              ) : (
                <p>
                  You are about to remove administrator access. This will
                  restrict system access and remove user management
                  capabilities.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <GlassButton
              variant="primary"
              onClick={confirmAdminChange}
              fullWidth
            >
              Confirm
            </GlassButton>
            <GlassButton
              variant="secondary"
              onClick={() => setShowAdminConfirm(false)}
              fullWidth
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </>
  );
};
