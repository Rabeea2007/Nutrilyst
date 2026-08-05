export interface ScannedProduct {
  barcode: string
  name: string
  brand: string
  category: string
  ingredients: string
  emoji: string
  nutrients: {
    calories: number
    sugars: number
    sodium: number
    saturatedFat: number
  }
}

export async function fetchProductByBarcode(barcode: string): Promise<ScannedProduct> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      {
        headers: {
          'User-Agent': 'NutrilystApp - Android - Version 1.0',
        },
      }
    )

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()

    if (data && data.status === 1 && data.product) {
      const p = data.product

      // Safely extract category — categories_hierarchy may be missing or non-array
      let category = 'Pantry Item'
      try {
        const hier = p.categories_hierarchy
        if (Array.isArray(hier) && hier.length > 0 && typeof hier[0] === 'string') {
          category = hier[0].replace('en:', '').replaceAll('-', ' ')
        } else if (typeof p.categories === 'string' && p.categories.length > 0) {
          category = p.categories.split(',')[0].trim()
        }
      } catch {}

      // Safely extract tags for emoji
      let tags: string[] = []
      try {
        if (Array.isArray(p.categories_tags)) tags = p.categories_tags
      } catch {}

      return {
        barcode,
        name: String(p.product_name || p.product_name_en || 'Scanned Item'),
        brand: String(p.brands || 'Unknown Brand'),
        category,
        ingredients: String(p.ingredients_text || 'No ingredient data available'),
        emoji: getEmojiForCategory(tags),
        nutrients: {
          calories: safeNum(p.nutriments?.['energy-kcal_100g']),
          sugars: safeNum(p.nutriments?.sugars_100g),
          sodium: Math.round(safeNum(p.nutriments?.sodium_100g) * 1000),
          saturatedFat: safeNum(p.nutriments?.['saturated-fat_100g']),
        },
      }
    }
  } catch (err) {
    console.error('fetchProductByBarcode error:', err)
  }

  // Fallback when product is not found in database
  return {
    barcode,
    name: 'Unknown Product',
    brand: 'Not found in database',
    category: 'Pantry Item',
    ingredients: 'No ingredient data available',
    emoji: '📦',
    nutrients: { calories: 0, sugars: 0, sodium: 0, saturatedFat: 0 },
  }
}

function safeNum(val: unknown): number {
  const n = Number(val)
  return isNaN(n) ? 0 : Math.round(n)
}

function getEmojiForCategory(tags: string[]): string {
  try {
    const t = tags.join(' ').toLowerCase()
    if (t.includes('beverage') || t.includes('drink')) return '🧃'
    if (t.includes('milk') || t.includes('dairy')) return '🥛'
    if (t.includes('biscuit') || t.includes('cookie')) return '🍪'
    if (t.includes('cereal') || t.includes('oat')) return '🥣'
    if (t.includes('sauce') || t.includes('canned')) return '🥫'
    if (t.includes('snack') || t.includes('chip')) return '🍿'
    if (t.includes('bread') || t.includes('bakery')) return '🍞'
    if (t.includes('chocolate') || t.includes('confection')) return '🍫'
    if (t.includes('fruit') || t.includes('juice')) return '🍎'
    if (t.includes('vegetable')) return '🥦'
    if (t.includes('meat') || t.includes('fish')) return '🥩'
  } catch {}
  return '📦'
}
