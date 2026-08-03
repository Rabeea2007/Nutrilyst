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
  ingredients: { name: string; qty: string; fromPantry: boolean }[]
  instructions: string[]
  chefTip: string
}

export async function generateAutomaticRecipe(
  pantryItems: PantryItem[],
  apiKey?: string
): Promise<AIRecipe[]> {
  const availableNames = pantryItems.map((i) => i.name)
  const expiringNames = pantryItems
    .filter((i) => i.expiryLevel === 'urgent' || i.expiryLevel === 'moderate')
    .map((i) => i.name)

  if (!apiKey) {
    return generateLocalFallbackRecipes(pantryItems)
  }

  const prompt = `You are an expert Zero-Waste Executive Chef.
Current Pantry Items: ${availableNames.join(', ')}
MUST-USE Expiring Items: ${expiringNames.length > 0 ? expiringNames.join(', ') : 'None urgent, prioritize best combination'}

Generate 2 unique zero-waste recipes using these ingredients.
Return ONLY valid JSON matching this structure:
[
  {
    "id": "ai-1",
    "title": "Recipe Name",
    "prepTime": "10 mins",
    "cookTime": "15 mins",
    "difficulty": "Easy",
    "emoji": "🍲",
    "description": "Short appetizing description",
    "rescuedIngredients": ["item1", "item2"],
    "ingredients": [{"name": "Ingredient Name", "qty": "1 cup", "fromPantry": true}],
    "instructions": ["Step 1", "Step 2"],
    "chefTip": "Pro tip to reduce waste"
  }
]`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    )

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim()

    return JSON.parse(cleanJson) as AIRecipe[]
  } catch (err) {
    console.error('AI Generation error, falling back to local engine:', err)
    return generateLocalFallbackRecipes(pantryItems)
  }
}

function generateLocalFallbackRecipes(pantryItems: PantryItem[]): AIRecipe[] {
  const expiring = pantryItems.filter(
    (item) => item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate'
  )
  const rescued = expiring.map((item) => item.name)

  return [
    {
      id: 'auto-1',
      title: rescued.length > 0 ? `Zero-Waste ${rescued[0]} & Pantry Hash` : 'Quick Pantry Stir-Fry',
      prepTime: '8 mins',
      cookTime: '12 mins',
      difficulty: 'Easy',
      emoji: '🍳',
      description:
        'A custom high-flavor skillet dish designed to utilize your most time-sensitive ingredients before they spoil.',
      rescuedIngredients: rescued,
      ingredients: pantryItems.slice(0, 5).map((item) => ({
        name: item.name,
        qty: '1 portion',
        fromPantry: true,
      })),
      instructions: [
        'Dice all available fresh vegetables and proteins into uniform bite-sized pieces.',
        'Heat 1 tbsp oil in a large skillet or wok over medium-high heat.',
        'Sauté ingredients starting with firmer items first, seasoning with salt, pepper, and herbs.',
        'Serve hot immediately as a complete zero-waste bowl.',
      ],
      chefTip:
        'Adding a splash of lemon juice or soy sauce at the end brightens up ingredients that are slightly past their prime peak.',
    },
  ]
}
