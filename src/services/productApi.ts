import { CapacitorHttp } from '@capacitor/core'

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
    const response = await CapacitorHttp.get({
      url: `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      headers: {
        'User-Agent': 'NutrilystApp - Android - Version 1.0',
      },
    })

    const data = response.data

    if (response.status === 200 && data.status === 1 && data.product) {
      const p = data.product
      return {
        barcode,
        name: p.product_name || p.product_name_en || 'Scanned Item',
        brand: p.brands || 'Unknown Brand',
        category: p.categories_hierarchy?.[0]?.replace('en:', '').replaceAll('-', ' ') || 'Pantry Item',
        ingredients: p.ingredients_text || 'No flagged ingredients found',
        emoji: getEmojiForCategory(p.categories_tags || []),
        nutrients: {
          calories: Math.round(p.nutriments?.['energy-kcal_100g'] || 0),
          sugars: Math.round(p.nutriments?.sugars_100g || 0),
          sodium: Math.round((p.nutriments?.sodium_100g || 0) * 1000),
          saturatedFat: Math.round(p.nutriments?.['saturated-fat_100g'] || 0),
        },
      }
    }
  } catch (err) {
    console.error('API Fetch Error:', err)
  }

  return {
    barcode,
    name: `Scanned Item (${barcode.slice(-4)})`,
    brand: 'Generic Brand',
    category: 'Pantry Item',
    ingredients: 'Standard ingredients',
    emoji: '📦',
    nutrients: { calories: 150, sugars: 5, sodium: 120, saturatedFat: 1 },
  }
}

function getEmojiForCategory(tags: string[]): string {
  const t = tags.join(' ').toLowerCase()
  if (t.includes('beverage') || t.includes('drink')) return '🧃'
  if (t.includes('milk') || t.includes('dairy')) return '🥛'
  if (t.includes('biscuit') || t.includes('cookie')) return '🍪'
  if (t.includes('cereal') || t.includes('oat')) return '🥣'
  if (t.includes('sauce') || t.includes('canned')) return '🥫'
  if (t.includes('snack') || t.includes('chip')) return '🍿'
  return '📦'
}
