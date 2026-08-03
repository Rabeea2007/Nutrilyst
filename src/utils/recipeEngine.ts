import type { PantryItem } from '../App'

export interface AIRecipe {
  id: string
  title: string
  prepTime: string
  cookTime: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  emoji: string
  description: string
  rescuedIngredients: string[]
  ingredients: { name: string; qty: string; fromPantry: boolean; isExpiring?: boolean }[]
  instructions: string[]
  chefTip: string
}

export async function fetchPantryRecipes(
  pantryItems: PantryItem[],
  apiKey?: string
): Promise<AIRecipe[]> {
  const availableNames = pantryItems.map((item) => item.name)
  const expiringItems = pantryItems.filter(
    (item) => item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate'
  )
  const expiringNames = expiringItems.map((item) => item.name)

  if (pantryItems.length === 0) {
    return [
      {
        id: 'empty-1',
        title: 'Your Pantry is Empty',
        prepTime: '0 mins',
        cookTime: '0 mins',
        difficulty: 'Easy',
        emoji: '🧺',
        description: 'Add or scan items into your pantry to unlock tailored AI zero-waste recipes!',
        rescuedIngredients: [],
        ingredients: [],
        instructions: ['Scan barcodes or add items manually on the Pantry tab to get started.'],
        chefTip: 'Nutrilyst dynamically pairings recipes based on what you actually own.',
      },
    ]
  }

  if (apiKey) {
    try {
      const prompt = `You are a zero-waste chef.
Available Pantry Ingredients: ${availableNames.join(', ')}
EXPIRING SOON (PRIORITIZE THESE): ${expiringNames.length > 0 ? expiringNames.join(', ') : 'None urgent'}

Generate 3 creative zero-waste recipes using these ingredients.
Return ONLY valid JSON matching this exact structure:
[
  {
    "id": "recipe-1",
    "title": "Recipe Name",
    "prepTime": "10 mins",
    "cookTime": "15 mins",
    "difficulty": "Easy",
    "emoji": "🍲",
    "description": "Short description",
    "rescuedIngredients": ["ingredient1"],
    "ingredients": [{"name": "Ingredient Name", "qty": "1 cup", "fromPantry": true, "isExpiring": false}],
    "instructions": ["Step 1", "Step 2"],
    "chefTip": "Zero-waste tip"
  }
]`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      )

      const data = await response.json()
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim()
      return JSON.parse(cleanJson) as AIRecipe[]
    } catch (error) {
      console.warn('API call failed, using dynamic local AI synthesis', error)
    }
  }

  return buildSmartLocalRecipes(pantryItems, expiringNames)
}

function buildSmartLocalRecipes(pantryItems: PantryItem[], expiringNames: string[]): AIRecipe[] {
  const primaryItem = expiringNames[0] || pantryItems[0]?.name || 'Pantry'
  const secondaryItem = pantryItems[1]?.name || 'Seasonings'

  return [
    {
      id: 'dynamic-1',
      title: expiringNames.length > 0 ? `Rescue ${primaryItem} Skillet Hash` : `Quick ${primaryItem} & ${secondaryItem} Bowl`,
      prepTime: '10 mins',
      cookTime: '15 mins',
      difficulty: 'Easy',
      emoji: '🥘',
      description: `A customized dish specially built around your current stock of ${primaryItem}.`,
      rescuedIngredients: expiringNames,
      ingredients: pantryItems.map((item) => ({
        name: item.name,
        qty: '1 portion',
        fromPantry: true,
        isExpiring: item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate',
      })),
      instructions: [
        `Prep and chop ${primaryItem} into thin, uniform pieces.`,
        'Heat 1 tbsp olive oil in a skillet over medium heat.',
        `Sauté ${primaryItem} along with ${secondaryItem} until warm and lightly tender.`,
        'Season with salt, pepper, and herbs to taste before serving hot.',
      ],
      chefTip: `Using ${primaryItem} quickly prevents food waste while keeping flavors fresh!`,
    },
    {
      id: 'dynamic-2',
      title: `Zero-Waste ${primaryItem} Soup & Broth`,
      prepTime: '8 mins',
      cookTime: '20 mins',
      difficulty: 'Easy',
      emoji: '🥣',
      description: 'Simmer your pantry ingredients into a nourishing zero-waste soup.',
      rescuedIngredients: expiringNames,
      ingredients: pantryItems.slice(0, 4).map((item) => ({
        name: item.name,
        qty: 'To taste',
        fromPantry: true,
        isExpiring: item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate',
      })),
      instructions: [
        'Bring 3 cups of water or stock to a soft boil in a saucepan.',
        `Add diced ${primaryItem} and simmer for 15 minutes.`,
        'Blend or serve chunky with toasted bread.',
      ],
      chefTip: 'Soups are the ultimate zero-waste meal because almost any pantry ingredient fits right in.',
    },
  ]
}
