import { ScannedProduct } from '../services/productApi'

export interface VerdictResult {
  variant: 'avoid' | 'moderation' | 'safe'
  badge: string
  headline: string
  reason: string
  score: number
  flaggedIngredients: { name: string; sub: string; level: 'high' | 'medium' | 'low' }[]
}

export function evaluateProductHealth(
  product: ScannedProduct,
  userFlags: string[]
): VerdictResult {
  const flags = new Set(userFlags)
  const flaggedList: { name: string; sub: string; level: 'high' | 'medium' | 'low' }[] = []
  let riskScore = 0

  const ingredientsText = (product.ingredients || '').toLowerCase()
  const { sugars, sodium, saturatedFat } = product.nutrients

  if (flags.has('Diabetes (Type 2)')) {
    if (sugars > 15) {
      riskScore += 4
      flaggedList.push({
        name: `High Sugars (${sugars}g per 100g)`,
        sub: 'Added Sweeteners · Spike in Glycemic Index',
        level: 'high',
      })
    } else if (sugars > 8) {
      riskScore += 2
      flaggedList.push({
        name: `Moderate Sugars (${sugars}g per 100g)`,
        sub: 'Monitor sugar intake for Diabetes management',
        level: 'medium',
      })
    }
  }

  if (flags.has('Hypertension')) {
    if (sodium > 600) {
      riskScore += 4
      flaggedList.push({
        name: `High Sodium (${sodium}mg per 100g)`,
        sub: 'Exceeds recommended single-serving sodium thresholds',
        level: 'high',
      })
    }
  }

  if (flags.has('Gluten / Wheat')) {
    if (ingredientsText.includes('wheat') || ingredientsText.includes('gluten') || ingredientsText.includes('barley')) {
      riskScore += 5
      flaggedList.push({
        name: 'Contains Wheat / Gluten',
        sub: 'Explicit allergen flagged for Gluten sensitivity',
        level: 'high',
      })
    }
  }

  if (flags.has('Dairy / Lactose') || flags.has('Vegan')) {
    if (ingredientsText.includes('milk') || ingredientsText.includes('whey') || ingredientsText.includes('lactose') || ingredientsText.includes('butter')) {
      riskScore += 5
      flaggedList.push({
        name: 'Contains Dairy / Lactose',
        sub: 'Dairy derivatives detected in product ingredients',
        level: 'high',
      })
    }
  }

  if (flags.has('IBS / Low-FODMAP')) {
    if (ingredientsText.includes('fructose') || ingredientsText.includes('gum') || ingredientsText.includes('artificial')) {
      riskScore += 2
      flaggedList.push({
        name: 'Potential FODMAP Trigger',
        sub: 'Contains emulsifiers or added sweeteners that may aggravate IBS',
        level: 'medium',
      })
    }
  }

  const finalScore = Math.max(1, Math.min(10, 10 - riskScore))

  if (riskScore >= 4) {
    return {
      variant: 'avoid',
      badge: '🔴 AVOID PRODUCT',
      headline: 'High Health Risk Detected',
      reason: `Flagged due to health conflicts with your active conditions (${userFlags.filter((f) => flags.has(f)).slice(0, 2).join(', ')}).`,
      score: finalScore,
      flaggedIngredients: flaggedList,
    }
  } else if (riskScore >= 2) {
    return {
      variant: 'moderation',
      badge: '🟡 CONSUME IN MODERATION',
      headline: 'Moderate Risk Warning',
      reason: 'Contains elevated nutrients or ingredients that require portion control.',
      score: finalScore,
      flaggedIngredients: flaggedList,
    }
  } else {
    return {
      variant: 'safe',
      badge: '🟢 SAFE TO EAT',
      headline: '100% Match for Your Profile',
      reason: 'No conflicting allergens or high-risk nutritional metrics detected for your active health profile.',
      score: finalScore,
      flaggedIngredients: flaggedList,
    }
  }
}
