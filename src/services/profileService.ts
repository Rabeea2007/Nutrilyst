export interface UserProfile {
  name: string
  email: string
  dietaryPreference: 'None' | 'Vegetarian' | 'Vegan' | 'Gluten-Free' | 'Keto' | 'Halal'
  householdSize: number
  expiryAlertDays: number
  metricSystem: 'Metric (g, ml)' | 'Imperial (oz, cups)'
  stats: {
    itemsSaved: number
    wastePreventedKg: number
    recipesCooked: number
  }
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Rabeea Zia',
  email: 'rabeea@nutrilyst.app',
  dietaryPreference: 'Vegetarian',
  householdSize: 2,
  expiryAlertDays: 3,
  metricSystem: 'Metric (g, ml)',
  stats: {
    itemsSaved: 24,
    wastePreventedKg: 6.8,
    recipesCooked: 18,
  },
}

export function loadUserProfile(): UserProfile {
  const saved = localStorage.getItem('nutrilyst_user_profile')

  if (saved) {
    try {
      return JSON.parse(saved) as UserProfile
    } catch {
      return DEFAULT_PROFILE
    }
  }

  return DEFAULT_PROFILE
}

export function saveUserProfile(profile: UserProfile): void {
  localStorage.setItem('nutrilyst_user_profile', JSON.stringify(profile))
}
