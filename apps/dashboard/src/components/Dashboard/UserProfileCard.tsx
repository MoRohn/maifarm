import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Mail,
  Settings,
  LogOut,
  Shield,
  Calendar,
  Activity,
  Sparkles,
  Edit2,
  ChevronRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUserStore } from '@/store/userStore'
import { useFarmStore } from '@/store/farmStore'
import { toast } from 'react-hot-toast'
import { cn } from '@/utils/cn'

interface UserProfileCardProps {
  className?: string
  compact?: boolean
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ className, compact = false }) => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { preferences } = useUserStore()
  const { farms } = useFarmStore()
  const [imageError, setImageError] = useState(false)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatDate = (date?: Date | string) => {
    if (!date) return 'Recently'
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return `${Math.floor(diffDays / 365)} years ago`
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast.success('Logged out successfully')
      navigate('/login')
    } catch (error) {
      toast.error('Failed to logout')
    }
  }

  const handleEditProfile = () => {
    navigate('/settings')
  }

  if (!user) return null

  const userName = user.name || user.email?.split('@')[0] || 'User'
  const isAdmin = user.roles?.some(role =>
    role.name?.toLowerCase() === 'admin' ||
    role.name?.toLowerCase() === 'administrator'
  ) || false

  const activeFarms = farms.filter(f => f.status === 'active' || f.status === 'running').length
  const totalHarvests = farms.reduce((acc, farm) => acc + (farm.harvests?.length || 0), 0)

  if (compact) {
    // Compact version for sidebar or header
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl',
          'bg-white/10 dark:bg-gray-800/50 backdrop-blur-xl',
          'border border-white/20 dark:border-gray-700',
          'cursor-pointer hover:bg-white/20 dark:hover:bg-gray-700/50',
          'transition-all duration-200',
          className
        )}
        onClick={handleEditProfile}
      >
        {/* Avatar */}
        <div className="relative">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-semibold">
            {user.avatar && !imageError ? (
              <img
                src={user.avatar}
                alt={userName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <span className="text-sm">{getInitials(userName)}</span>
            )}
          </div>
          {isAdmin && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
              <Shield className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {userName}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {user.email}
          </p>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-400" />
      </motion.div>
    )
  }

  // Full card version for dashboard
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-2xl shadow-lg',
        'border border-gray-200 dark:border-gray-700',
        'overflow-hidden',
        className
      )}
    >
      {/* Header with gradient background */}
      <div className="relative h-32 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600">
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={handleEditProfile}
            className="p-2 bg-white/20 backdrop-blur rounded-lg text-white hover:bg-white/30 transition-colors"
            title="Edit Profile"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 bg-white/20 backdrop-blur rounded-lg text-white hover:bg-white/30 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profile content */}
      <div className="relative px-6 pb-6">
        {/* Avatar */}
        <div className="absolute -top-12 left-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-white dark:bg-gray-900 p-1">
              <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold">
                {user.avatar && !imageError ? (
                  <img
                    src={user.avatar}
                    alt={userName}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  getInitials(userName)
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900">
                <Shield className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* User info */}
        <div className="pt-16">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {userName}
                {user.setupCompletedAt && (
                  <Sparkles className="w-4 h-4 text-yellow-500" title="Setup Complete" />
                )}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 mt-1">
                <Mail className="w-3 h-3" />
                {user.email}
              </p>
              {isAdmin && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 mt-2">
                  Administrator
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 py-4 border-y border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {activeFarms}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Active Farms</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalHarvests}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Harvests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {farms.length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Total Farms</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-4 space-y-2">
            <button
              onClick={() => navigate('/farms/new')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium">Create New Farm</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => navigate('/analytics')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className="font-medium">View Analytics</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span className="font-medium">Settings</span>
              </span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Member Since */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {user.lastLogin ? (
                <>Last active {formatDate(user.lastLogin)}</>
              ) : (
                <>Member since {formatDate(user.createdAt)}</>
              )}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default UserProfileCard