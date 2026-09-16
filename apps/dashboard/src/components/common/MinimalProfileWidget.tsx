import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  LogOut,
  ChevronDown,
  Shield,
  Users,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'react-hot-toast'
import { cn } from '@/utils/cn'
import {
  DeviceProfile,
  getDeviceProfiles,
  setSelectedProfile,
  upsertDeviceProfile
} from '@/utils/deviceProfiles'

interface MinimalProfileWidgetProps {
  className?: string
  expanded?: boolean
}

export const MinimalProfileWidget: React.FC<MinimalProfileWidgetProps> = ({
  className,
  expanded = false
}) => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [imageError, setImageError] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [changeProfileOpen, setChangeProfileOpen] = useState(false)
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfile[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDeviceProfiles(getDeviceProfiles())
  }, [])

  useEffect(() => {
    if (!user?.email) return
    const updatedProfiles = upsertDeviceProfile({
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      avatar: user.avatar,
      lastUsed: new Date().toISOString()
    })
    setDeviceProfiles(updatedProfiles)
  }, [user?.id, user?.email, user?.avatar, user?.name])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!dropdownOpen && !changeProfileOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false)
        setChangeProfileOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dropdownOpen, changeProfileOpen])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleLogout = async () => {
    try {
      setDropdownOpen(false)
      setChangeProfileOpen(false)
      await logout()
      toast.success('Logged out successfully')
      navigate('/login')
    } catch (error) {
      toast.error('Failed to logout')
    }
  }

  const handleProfileClick = () => {
    setDropdownOpen(prev => !prev)
    if (changeProfileOpen) {
      setChangeProfileOpen(false)
    }
  }

  const handleProfileSwitch = async (profile: DeviceProfile) => {
    if (!profile?.email) {
      return
    }

    if (profile.email.toLowerCase() === (user?.email || '').toLowerCase()) {
      toast.success('You are already using this profile')
      setChangeProfileOpen(false)
      return
    }

    try {
      setSelectedProfile(profile)
      upsertDeviceProfile({ ...profile, lastUsed: new Date().toISOString() })
      toast.success(`Switching to ${profile.name || profile.email}`)
      await logout()
      navigate('/login')
    } catch (error) {
      toast.error('Failed to switch profile')
    } finally {
      setChangeProfileOpen(false)
      setDropdownOpen(false)
    }
  }

  if (!user) return null

  const userName = user.name || user.email?.split('@')[0] || 'User'
  const isAdmin = user.roles?.some(role =>
    role.name?.toLowerCase() === 'admin' ||
    role.name?.toLowerCase() === 'administrator'
  ) || false

  return (
    <div className={cn('relative', className)}>
      {/* Profile Button */}
      <button
        type="button"
        onClick={handleProfileClick}
        className={cn(
          'flex items-center gap-3 rounded-lg transition-all duration-200',
          'hover:bg-gray-100 dark:hover:bg-gray-800/50',
          'hover:shadow-md hover:scale-[1.02]',
          expanded ? 'w-full px-3 py-2.5' : 'p-2',
          'relative group'
        )}
        aria-label={expanded ? 'View profile menu' : 'Profile menu'}
        aria-expanded={dropdownOpen}
        aria-haspopup="menu"
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={cn(
            'rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600',
            'flex items-center justify-center text-white font-semibold',
            expanded ? 'w-9 h-9' : 'w-10 h-10'
          )}>
            {user.avatar && !imageError ? (
              <img
                src={user.avatar}
                alt={userName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <span className={cn('font-medium', expanded ? 'text-xs' : 'text-sm')}>
                {getInitials(userName)}
              </span>
            )}
          </div>
          {isAdmin && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-500 rounded-full flex items-center justify-center border border-white dark:border-gray-800">
              <Shield className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Expanded Info */}
        {expanded && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {userName}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {user.email}
              </p>
            </div>
            <ChevronDown className={cn(
              'w-4 h-4 text-gray-400 transition-transform duration-200',
              dropdownOpen && 'rotate-180'
            )} />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setDropdownOpen(false)}
              aria-hidden="true"
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'absolute z-40 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 backdrop-blur-xl overflow-hidden',
                expanded
                  ? 'bottom-full left-0 w-full max-w-xs'
                  : 'bottom-full mb-2 lg:bottom-auto lg:top-full lg:mt-2 left-0 lg:left-full lg:ml-2 w-64'
              )}
              role="menu"
              aria-orientation="vertical"
            >
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
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
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {userName}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                    {isAdmin && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 mt-1">
                        Administrator
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="py-2">
                <button
                  onClick={() => {
                    navigate('/settings#profile')
                    setDropdownOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  role="menuitem"
                >
                  <User className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>

                <button
                  onClick={() => {
                    setDropdownOpen(false)
                    setChangeProfileOpen(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  role="menuitem"
                >
                  <Users className="w-4 h-4" />
                  <span>Change Profile</span>
                </button>

                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  role="menuitem"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {changeProfileOpen && (
          <ChangeProfileModal
            profiles={deviceProfiles}
            currentUserEmail={user.email}
            onClose={() => setChangeProfileOpen(false)}
            onSelect={handleProfileSwitch}
          />
        )}
      </AnimatePresence>

      {/* Tooltip for Icon-Only Mode */}
      {!expanded && !dropdownOpen && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 shadow-lg">
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-r-4 border-r-gray-900 dark:border-r-gray-700" />
          <span className="font-medium">{userName}</span>
        </div>
      )}
    </div>
  )
}

interface ChangeProfileModalProps {
  profiles: DeviceProfile[]
  currentUserEmail?: string | null
  onClose: () => void
  onSelect: (profile: DeviceProfile) => void
}

const ChangeProfileModal: React.FC<ChangeProfileModalProps> = ({
  profiles,
  currentUserEmail,
  onClose,
  onSelect
}) => {
  const sortedProfiles = [...profiles].sort((a, b) => {
    const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
    const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0
    return bTime - aTime
  })

  const formatLastUsed = (value?: string) => {
    if (!value) return 'Never used on this device'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Activity unknown'
    return `Last active ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 10, opacity: 0, scale: 0.97 }}
        role="dialog"
        aria-modal="true"
        aria-label="Change profile"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Change Profile
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Choose from the profiles saved on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close change profile dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sortedProfiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No saved profiles found on this computer yet.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Sign in with another account to add it to this list.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {sortedProfiles.map((profile) => {
              const isCurrent = profile.email.toLowerCase() === (currentUserEmail || '').toLowerCase()
              return (
                <button
                  key={`${profile.id || profile.email}`}
                  type="button"
                  onClick={() => onSelect(profile)}
                  className={cn(
                    'w-full flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                    'hover:border-emerald-500 hover:shadow-md',
                    isCurrent
                      ? 'border-emerald-500/80 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
                  )}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-semibold">
                    {profile.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={profile.name || profile.email}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm">
                        {(profile.name || profile.email)
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {profile.name || profile.email}
                      </p>
                      {isCurrent && (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {profile.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {formatLastUsed(profile.lastUsed)}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export default MinimalProfileWidget
