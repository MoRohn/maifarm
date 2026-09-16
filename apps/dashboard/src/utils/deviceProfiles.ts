import {
  safeLocalStorageGetJSON,
  safeLocalStorageSetJSON,
  safeLocalStorageRemove
} from './safeLocalStorage'

export interface DeviceProfile {
  id?: string
  name?: string
  email: string
  avatar?: string | null
  lastUsed?: string
  colorSchemeId?: string
}

const DEVICE_PROFILES_KEY = 'maifarm:device-profiles'
const SELECTED_PROFILE_KEY = 'maifarm:selected-profile'
const MAX_DEVICE_PROFILES = 8

const normalizeProfile = (profile: DeviceProfile): DeviceProfile => ({
  ...profile,
  email: profile.email.trim(),
  name: profile.name?.trim() || profile.email.trim(),
  lastUsed: profile.lastUsed ?? new Date().toISOString()
})

export const getDeviceProfiles = (): DeviceProfile[] => {
  const profiles = safeLocalStorageGetJSON<DeviceProfile[]>(DEVICE_PROFILES_KEY, [])
  return Array.isArray(profiles) ? profiles : []
}

const persistProfiles = (profiles: DeviceProfile[]): DeviceProfile[] => {
  safeLocalStorageSetJSON(DEVICE_PROFILES_KEY, profiles)
  return profiles
}

export const upsertDeviceProfile = (profile: DeviceProfile): DeviceProfile[] => {
  if (!profile.email) {
    return getDeviceProfiles()
  }

  const normalized = normalizeProfile(profile)
  const profiles = getDeviceProfiles()
  const normalizedEmail = normalized.email.toLowerCase()
  const filtered = profiles.filter((existing) => {
    if (normalized.id && existing.id && existing.id === normalized.id) {
      return false
    }
    return existing.email.toLowerCase() !== normalizedEmail
  })

  const nextProfiles = [normalized, ...filtered].slice(0, MAX_DEVICE_PROFILES)
  return persistProfiles(nextProfiles)
}

export const setSelectedProfile = (profile: DeviceProfile | null): void => {
  if (profile) {
    safeLocalStorageSetJSON(SELECTED_PROFILE_KEY, normalizeProfile(profile))
  } else {
    safeLocalStorageRemove(SELECTED_PROFILE_KEY)
  }
}

export const consumeSelectedProfile = (): DeviceProfile | null => {
  const profile = safeLocalStorageGetJSON<DeviceProfile | null>(SELECTED_PROFILE_KEY, null)
  safeLocalStorageRemove(SELECTED_PROFILE_KEY)
  return profile
}

export const clearDeviceProfiles = (): void => {
  safeLocalStorageRemove(DEVICE_PROFILES_KEY)
}
