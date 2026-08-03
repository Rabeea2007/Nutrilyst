import { Share } from '@capacitor/share'
import type { PantryItem } from '../App'

export interface ShoppingItem {
  id: string
  name: string
  category: string
  reason: 'Expiring Soon' | 'Out of Stock' | 'Low Stock'
  suggestedQty: string
}

export function generateShoppingList(pantryItems: PantryItem[]): ShoppingItem[] {
  const needsRestock: ShoppingItem[] = []

  pantryItems.forEach((item) => {
    if (item.expiryLevel === 'urgent') {
      needsRestock.push({
        id: `shop-${item.id}`,
        name: item.name,
        category: item.category || 'General',
        reason: 'Expiring Soon',
        suggestedQty: '1 pack',
      })
    } else if (item.expiryLevel === 'moderate') {
      needsRestock.push({
        id: `shop-${item.id}`,
        name: item.name,
        category: item.category || 'General',
        reason: 'Low Stock',
        suggestedQty: '1 pack',
      })
    }
  })

  return needsRestock
}

export async function shareShoppingList(items: ShoppingItem[]) {
  if (items.length === 0) return

  const formattedList = items
    .map((item, index) => `${index + 1}. ${item.name} (${item.suggestedQty}) - Reason: ${item.reason}`)
    .join('\n')

  const textToShare = `🛒 Nutrilyst Restock & Grocery List:\n\n${formattedList}\n\nGenerated via Nutrilyst App`

  try {
    await Share.share({
      title: 'Nutrilyst Shopping List',
      text: textToShare,
      dialogTitle: 'Share Grocery List',
    })
  } catch (err) {
    console.error('Sharing failed:', err)
  }
}
