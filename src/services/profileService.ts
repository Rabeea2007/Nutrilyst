// src/services/profileService.ts
export interface UserProfile {
  name: string
  email: string
  // Multi-select dietary preferences (replaces single dietaryPreference)
  dietaryPreferences: string[]
  allergies: string[]
  healthConditions: string[]
  expiryAlertDays: number
  householdSize: number
  metricSystem: 'Metric (g, ml)' | 'Imperial (oz, cups)'
  stats: {
    itemsSaved: number
    wastePreventedKg: number
    recipesCooked: number
  }
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'User',
  email: 'user@example.com',
  dietaryPreferences: [],
  allergies: [],
  healthConditions: [],
  expiryAlertDays: 3,
  householdSize: 2,
  metricSystem: 'Metric (g, ml)',
  stats: {
    itemsSaved: 14,
    wastePreventedKg: 4.2,
    recipesCooked: 8,
  },
}

const STORAGE_KEY = 'nutrilyst_profile'

export function loadUserProfile(): UserProfile {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return DEFAULT_PROFILE
    const parsed = JSON.parse(data)
    // Migrate old single dietaryPreference string to array
    let dietaryPreferences = DEFAULT_PROFILE.dietaryPreferences
    if (Array.isArray(parsed.dietaryPreferences)) {
      dietaryPreferences = parsed.dietaryPreferences
    } else if (typeof parsed.dietaryPreference === 'string' && parsed.dietaryPreference !== 'None') {
      dietaryPreferences = [parsed.dietaryPreference]
    }
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      dietaryPreferences,
      metricSystem: parsed.metricSystem ?? DEFAULT_PROFILE.metricSystem,
      stats: { ...DEFAULT_PROFILE.stats, ...(parsed.stats || {}) },
      allergies: Array.isArray(parsed.allergies) ? parsed.allergies : [],
      healthConditions: Array.isArray(parsed.healthConditions) ? parsed.healthConditions : [],
    }
  } catch (err) {
    console.error('Failed to load user profile from storage:', err)
    return DEFAULT_PROFILE
  }
}

export function saveUserProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch (err) {
    console.error('Failed to save user profile to storage:', err)
  }
}

/** Returns the flat list of flags passed to the health evaluator */
export function getProfileFlags(profile: UserProfile): string[] {
  return [
    ...profile.dietaryPreferences,
    ...profile.allergies,
    ...profile.healthConditions,
  ]
}
