import { useState, useEffect, useRef, useMemo } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera } from '@capacitor/camera'
import { Toast } from '@capacitor/toast'
import { fetchProductByBarcode, type ScannedProduct } from './services/productApi'
import { evaluateProductHealth } from './utils/healthEvaluator'
import { fetchPantryRecipes, type AIRecipe as PantryAIRecipe } from './utils/recipeEngine'
import { generateShoppingList, shareShoppingList, type ShoppingItem } from './utils/shoppingListEngine'
import { generateAutomaticRecipe, type AIRecipe } from './services/aiRecipeService'
import { loadUserProfile, saveUserProfile, getProfileFlags, type UserProfile } from './services/profileService'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'dashboard' | 'profile' | 'scanner' | 'verdict' | 'pantry' | 'recipes' | 'shopping-list' | 'automatic-recipes' | 'add-item'
type VerdictVariant = 'avoid' | 'moderation' | 'safe'
type PantryFilter = 'all' | 'perishable' | 'daily' | 'occasional'
type StorageCategory = 'PERISHABLE' | 'NON_PERISHABLE'
type UsageFrequency = 'DAILY' | 'OCCASIONAL'
type RoutineSlot = 'BREAKFAST' | 'MORNING_TEA' | 'EVENING_TEA' | 'DINNER' | 'NONE'
type StockStatus = 'in-stock' | 'low' | 'out'

export interface PantryItem {
  id: number
  name: string
  category: string
  storageCategory: StorageCategory
  frequency: UsageFrequency
  routineSlot: RoutineSlot
  printedExpiry: string
  expiryLevel: 'urgent' | 'moderate' | 'safe'
  qty: number
  isOpened: boolean
  earlyWarningDays: number
  stockStatus: StockStatus
  smartAction?: string
  emoji: string
}

interface NutrientRow {
  name: string
  value: number
  daily: number
  unit: string
}

interface Recipe {
  id: number
  title: string
  match: number
  time: string
  tags: string[]
  uses: string[]
  from: string
  to: string
  difficulty: 'Easy' | 'Medium'
  calories: number
  steps: string[]
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ALLERGIES = ['Peanuts', 'Tree Nuts', 'Gluten / Wheat', 'Dairy / Lactose', 'Soy', 'Shellfish']
const CONDITIONS = ['Diabetes (Type 2)', 'Hypertension', 'PCOS', 'IBS / Low-FODMAP', 'Kidney Care']
const DIETARY = ['Vegan', 'Vegetarian', 'Halal', 'Kosher', 'Keto']

const NUTRIENTS: NutrientRow[] = [
  { name: 'Calories', value: 280, daily: 2000, unit: 'kcal' },
  { name: 'Total Sugars', value: 24, daily: 50, unit: 'g' },
  { name: 'Sodium', value: 620, daily: 2300, unit: 'mg' },
  { name: 'Saturated Fat', value: 2.5, daily: 20, unit: 'g' },
  { name: 'Dietary Fiber', value: 3, daily: 28, unit: 'g' },
  { name: 'Protein', value: 6, daily: 50, unit: 'g' },
]

const FLAGGED_INGREDIENTS = [
  { name: 'High Fructose Corn Syrup', sub: 'Added Sweetener · High Glycemic Index impact', level: 'high' },
  { name: 'Sulphur Dioxide (E220)', sub: 'Preservative · Asthma trigger in sensitive individuals', level: 'medium' },
  { name: 'Acacia Gum', sub: 'Stabiliser · Generally safe, monitor for IBS sensitivity', level: 'low' },
]

const INITIAL_PANTRY: PantryItem[] = [
  { id: 1, name: 'Organic Fresh Milk', category: 'Dairy · Opened 2 days ago', storageCategory: 'PERISHABLE', frequency: 'DAILY', routineSlot: 'EVENING_TEA', printedExpiry: 'Expires Tomorrow', expiryLevel: 'urgent', qty: 1, isOpened: true, earlyWarningDays: 0, stockStatus: 'in-stock', smartAction: '⚡ Use in Evening Tea', emoji: '🥛' },
  { id: 2, name: 'Greek Style Yogurt', category: 'Chilled · 400g', storageCategory: 'PERISHABLE', frequency: 'DAILY', routineSlot: 'BREAKFAST', printedExpiry: '3 Days Left', expiryLevel: 'moderate', qty: 2, isOpened: false, earlyWarningDays: 0, stockStatus: 'in-stock', emoji: '🫙' },
  { id: 3, name: 'Whole Wheat Digestive Biscuits', category: 'Bakery', storageCategory: 'NON_PERISHABLE', frequency: 'DAILY', routineSlot: 'EVENING_TEA', printedExpiry: 'Exp: 24 Oct', expiryLevel: 'safe', qty: 3, isOpened: false, earlyWarningDays: 0, stockStatus: 'in-stock', emoji: '🍪' },
  { id: 4, name: 'Green Tea Packets', category: 'Beverages', storageCategory: 'NON_PERISHABLE', frequency: 'DAILY', routineSlot: 'EVENING_TEA', printedExpiry: 'Exp: 15 Dec', expiryLevel: 'safe', qty: 1, isOpened: false, earlyWarningDays: 0, stockStatus: 'low', emoji: '🍵' },
  { id: 5, name: 'Canned Tomato Puree', category: 'Pantry · 200g', storageCategory: 'NON_PERISHABLE', frequency: 'OCCASIONAL', routineSlot: 'NONE', printedExpiry: 'Exp: Oct 2027', expiryLevel: 'safe', qty: 4, isOpened: false, earlyWarningDays: 15, stockStatus: 'in-stock', emoji: '🥫' },
  { id: 6, name: 'Garam Masala Powder', category: 'Spices', storageCategory: 'NON_PERISHABLE', frequency: 'OCCASIONAL', routineSlot: 'NONE', printedExpiry: 'Exp: 12 Nov', expiryLevel: 'safe', qty: 1, isOpened: false, earlyWarningDays: 15, stockStatus: 'in-stock', emoji: '🫙' },
  { id: 7, name: 'Baking Cocoa Powder', category: 'Baking', storageCategory: 'NON_PERISHABLE', frequency: 'OCCASIONAL', routineSlot: 'NONE', printedExpiry: 'Exp: 05 Sep', expiryLevel: 'moderate', qty: 1, isOpened: false, earlyWarningDays: 20, stockStatus: 'in-stock', emoji: '🍫' },
  { id: 8, name: 'Wholegrain Oat Porridge', category: 'Breakfast · 500g', storageCategory: 'NON_PERISHABLE', frequency: 'DAILY', routineSlot: 'BREAKFAST', printedExpiry: 'Exp: Mar 2027', expiryLevel: 'safe', qty: 2, isOpened: true, earlyWarningDays: 0, stockStatus: 'in-stock', emoji: '🥣' },
]

const RECIPES: Recipe[] = [
  {
    id: 1, title: 'Berry Yogurt Parfait Bowl', match: 100, time: '10 min', difficulty: 'Easy', calories: 320,
    tags: ['Vegetarian', 'Diabetes Friendly', 'High Protein'],
    uses: ['Greek Style Yogurt', 'Organic Fresh Milk', 'Wholegrain Oat Porridge'],
    from: '#ecfdf5', to: '#d1fae5',
    steps: [
      'Layer Greek yogurt at the bottom of a serving bowl.',
      'Pour 30ml of whole milk over the yogurt and stir gently.',
      'Spoon porridge oats on top for texture and fiber.',
      'Add a handful of mixed berries and a drizzle of honey.',
      'Serve immediately for best texture.',
    ],
  },
  {
    id: 2, title: 'Quick Spiced Milk Toast', match: 100, time: '8 min', difficulty: 'Easy', calories: 240,
    tags: ['Vegetarian', 'Quick Breakfast', 'Comforting'],
    uses: ['Organic Fresh Milk', 'Whole Wheat Digestive Biscuits'],
    from: '#fef9c3', to: '#fde68a',
    steps: [
      'Warm the milk in a small saucepan over low heat — do not boil.',
      'Dip digestive biscuits briefly in the warm milk.',
      'Sprinkle a pinch of cinnamon or cardamom.',
      'Serve in a bowl with remaining warm milk poured over.',
    ],
  },
  {
    id: 3, title: 'Creamy Tomato Masala Soup', match: 85, time: '20 min', difficulty: 'Medium', calories: 180,
    tags: ['Vegan', 'Low Calorie', 'Warming'],
    uses: ['Canned Tomato Puree', 'Garam Masala Powder'],
    from: '#fee2e2', to: '#fecaca',
    steps: [
      'Heat a drizzle of oil in a saucepan over medium heat.',
      'Add one finely diced onion and cook until translucent.',
      'Stir in ½ tsp garam masala and cook for 30 seconds.',
      'Add tomato puree with 250ml water. Simmer 12 minutes.',
      'Blend until smooth. Season with salt to taste.',
      'Finish with a swirl of plant-based cream and serve hot.',
    ],
  },
]

const VERDICT_CONFIG = {
  avoid: { badge: '🔴 AVOID PRODUCT', headline: 'High Risk for Your Profile', reason: 'Contains High Fructose Corn Syrup & Sulphur Dioxide (E220) — both flagged for Diabetes & IBS sensitivity.', wrapCls: 'bg-red-50 border-red-200', badgeCls: 'bg-red-100 text-red-700', headCls: 'text-red-800', score: 2 },
  moderation: { badge: '🟡 CONSUME IN MODERATION', headline: 'High Sodium Content', reason: 'Exceeds 27% of your recommended daily sodium intake per serving.', wrapCls: 'bg-amber-50 border-amber-200', badgeCls: 'bg-amber-100 text-amber-700', headCls: 'text-amber-800', score: 5 },
  safe: { badge: '🟢 SAFE TO EAT', headline: '100% Match for Your Profile', reason: 'No flagged allergens, zero added sugars, and certified Gluten-Free.', wrapCls: 'bg-emerald-50 border-emerald-200', badgeCls: 'bg-emerald-100 text-emerald-700', headCls: 'text-emerald-800', score: 9 },
}

const EXPIRY_BADGE = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  safe: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const ROUTINE_LABEL: Record<RoutineSlot, string> = {
  BREAKFAST: '🌅 Breakfast (8:00 AM)',
  MORNING_TEA: '🫖 Morning Tea (10:30 AM)',
  EVENING_TEA: '☕ Evening Coffee / Tea (5:00 PM)',
  DINNER: '🌙 Dinner Prep (7:30 PM)',
  NONE: '🚫 No Routine Link',
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function HealthRing({ score, size = 72 }: { score: number; size?: number }) {
  const strokeW = 6
  const r = (size - strokeW * 2) / 2
  const circ = 2 * Math.PI * r
  const filled = circ * (score / 100)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={strokeW} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#34d399" strokeWidth={strokeW}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white font-mono font-bold leading-none" style={{ fontSize: size / 4 }}>{score}</span>
        <span className="text-white/50 font-mono leading-none" style={{ fontSize: size / 6.5 }}>/ 100</span>
      </div>
    </div>
  )
}

function NutrientBar({ name, value, daily, unit }: NutrientRow) {
  const pct = Math.min(100, Math.round((value / daily) * 100))
  const color = pct >= 60 ? '#ef4444' : pct >= 35 ? '#f59e0b' : '#10b981'
  const textColor = pct >= 60 ? 'text-red-500' : pct >= 35 ? 'text-amber-500' : 'text-emerald-600'
  const flag = pct >= 35
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {flag && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
          <span className="text-xs text-gray-600">{name}</span>
        </div>
        <span className={`text-[11px] font-mono font-semibold ${textColor}`}>
          {value}{unit} <span className="text-gray-300 font-normal">/ {daily}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="h-px flex-1 bg-gray-100" />
      <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-gray-400 shrink-0">{children}</p>
      <div className="h-px flex-1 bg-gray-100" />
    </div>
  )
}

function ChipGroup({ label, chips, selected, onToggle }: { label: string; chips: string[]; selected: Set<string>; onToggle: (c: string) => void }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-emerald-700 mb-2.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const on = selected.has(chip)
          return (
            <button key={chip} onClick={() => onToggle(chip)}
              className={`px-3 py-1.5 rounded-full text-[13px] border transition-all duration-150 ${on
                ? 'bg-emerald-800 text-white border-emerald-800 font-medium'
                : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}>
              {chip}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardScreen({ items, onNav, userName, scansToday }: {
  items: PantryItem[]
  onNav: (s: Screen) => void
  userName: string
  scansToday: number
}) {
  const urgent = items.filter((i) => i.expiryLevel === 'urgent')
  const moderate = items.filter((i) => i.expiryLevel === 'moderate')
  const safeCount = items.filter((i) => i.expiryLevel === 'safe').length
  const pantryScore = items.length > 0 ? Math.round((safeCount / items.length) * 100) : 100

  // Items saved = items added beyond the initial pantry (new scanned items added)
  const itemsSaved = Math.max(0, items.length - INITIAL_PANTRY.length)

  // Live date and greeting
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'GOOD MORNING' : hour < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING'
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

  const ACTIONS = [
    { label: 'Scan Product', icon: '📷', screen: 'scanner' as Screen, bg: 'bg-emerald-800', text: 'text-white' },
    { label: 'My Pantry', icon: '🏠', screen: 'pantry' as Screen, bg: 'bg-white', text: 'text-gray-800' },
    { label: 'Recipes', icon: '🍽️', screen: 'recipes' as Screen, bg: 'bg-white', text: 'text-gray-800' },
    { label: 'Profile', icon: '👤', screen: 'profile' as Screen, bg: 'bg-white', text: 'text-gray-800' },
  ]

  return (
    <div className="flex flex-col h-full bg-[#F2F4F3] overflow-y-auto pt-safe">
      {/* Hero header */}
      <div className="px-5 pt-4 pb-6" style={{ background: 'linear-gradient(145deg, #064e3b 0%, #065f46 50%, #0f2720 100%)' }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-emerald-400 text-xs font-mono mb-1">{greeting}</p>
            <h1 className="text-white text-2xl font-bold leading-tight">{userName}</h1>
            <p className="text-emerald-300/70 text-xs mt-0.5">{dateStr}</p>
          </div>
          <div className="bg-white/10 rounded-2xl px-3 py-2 text-center border border-white/10">
            <p className="text-[9px] font-mono text-emerald-400 mb-1 tracking-widest">PANTRY HEALTH</p>
            <HealthRing score={pantryScore} size={64} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total Items', val: items.length, color: 'text-white' },
            { label: 'Expiring Soon', val: urgent.length + moderate.length, color: 'text-amber-400' },
            { label: 'Scans Today', val: scansToday, color: 'text-emerald-400' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white/10 rounded-xl px-3 py-2.5 border border-white/10">
              <p className={`text-xl font-bold font-mono ${color}`}>{val}</p>
              <p className="text-white/50 text-[10px] mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Urgent alerts */}
        {urgent.length > 0 && (
          <div>
            <SectionLabel>URGENT ALERTS</SectionLabel>
            {urgent.map((item) => (
              <button key={item.id} onClick={() => onNav('pantry')}
                className="w-full flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-2 text-left hover:bg-red-100 transition-colors active:scale-[0.99]">
                <span className="text-2xl">{item.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">{item.name}</p>
                  <p className="text-xs text-red-500">{item.printedExpiry}</p>
                </div>
                {item.smartAction && (
                  <span className="text-[11px] font-mono text-emerald-700 bg-white border border-emerald-200 px-2 py-1 rounded-lg whitespace-nowrap">
                    {item.smartAction}
                  </span>
                )}
              </button>
            ))}
            <button onClick={() => onNav('recipes')}
              className="w-full text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl py-2.5 hover:bg-emerald-100 transition-colors">
              🍽️ Find zero-waste recipes for expiring items →
            </button>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <SectionLabel>QUICK ACTIONS</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {ACTIONS.map(({ label, icon, screen, bg, text }) => (
              <button key={screen} onClick={() => onNav(screen)}
                className={`${bg} ${text} rounded-2xl px-4 py-4 text-left border border-gray-100 hover:shadow-md active:scale-[0.97] transition-all`}
                style={bg === 'bg-emerald-800' ? { background: 'linear-gradient(135deg, #065f46, #047857)', border: 'none', boxShadow: '0 4px 20px rgba(6,95,70,0.3)' } : {}}>
                <span className="text-2xl block mb-2">{icon}</span>
                <p className="text-sm font-semibold">{label}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Pantry snapshot */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <SectionLabel>PANTRY SNAPSHOT</SectionLabel>
          </div>
          <div className="space-y-2">
            {items.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl px-3.5 py-2.5 border border-gray-100">
                <span className="text-xl">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.category}</p>
                </div>
                <span className={`text-[10px] font-mono border px-2 py-0.5 rounded-full shrink-0 ${EXPIRY_BADGE[item.expiryLevel]}`}>
                  {item.printedExpiry}
                </span>
              </div>
            ))}
            <button onClick={() => onNav('pantry')}
              className="w-full text-xs font-mono text-gray-400 py-1.5 hover:text-emerald-700 transition-colors">
              View all {items.length} items →
            </button>
          </div>
        </div>

        {/* Evening tea nudge */}
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl px-4 py-3.5">
          <p className="text-xs font-semibold text-amber-800 mb-1">☕ Evening Tea Suggestion · 5:00 PM</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Organic Fresh Milk expires tomorrow. Make Quick Spiced Milk Toast to use it up!
          </p>
          <button onClick={() => onNav('recipes')} className="mt-2 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors">
            View recipe →
          </button>
        </div>

        <div className="h-4" />
      </div>
    </div>
  )
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileScreen({ pantryItemCount, scansTotal }: { pantryItemCount: number; scansTotal: number }) {
  const [profile, setProfile] = useState<UserProfile>(loadUserProfile)
  const [savedMessage, setSavedMessage] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(profile.name)

  // Live-computed stats
  const itemsSaved = Math.max(0, pantryItemCount - INITIAL_PANTRY.length)
  const wastePreventedKg = +(itemsSaved * 0.3).toFixed(1)  // rough 300g per saved item

  const DIET_OPTIONS = [
    { label: 'Vegetarian', emoji: '🥦' },
    { label: 'Vegan', emoji: '🌱' },
    { label: 'Halal', emoji: '☪️' },
    { label: 'Kosher', emoji: '✡️' },
    { label: 'Keto', emoji: '🥑' },
    { label: 'Paleo', emoji: '🍖' },
    { label: 'Gluten-Free', emoji: '🌾' },
    { label: 'Dairy-Free', emoji: '🥛' },
    { label: 'Low-Carb', emoji: '🍞' },
    { label: 'Low-Sodium', emoji: '🧂' },
  ]

  const ALLERGY_OPTIONS = [
    { label: 'Peanuts', emoji: '🥜' },
    { label: 'Tree Nuts', emoji: '🌰' },
    { label: 'Gluten / Wheat', emoji: '🌾' },
    { label: 'Dairy / Lactose', emoji: '🧈' },
    { label: 'Soy', emoji: '🫘' },
    { label: 'Shellfish', emoji: '🦐' },
    { label: 'Eggs', emoji: '🥚' },
    { label: 'Fish', emoji: '🐟' },
    { label: 'Sesame', emoji: '🫙' },
    { label: 'Sulphites', emoji: '🍷' },
  ]

  const CONDITION_OPTIONS = [
    { label: 'Diabetes (Type 2)', emoji: '🩸' },
    { label: 'Hypertension', emoji: '❤️' },
    { label: 'PCOS', emoji: '🌸' },
    { label: 'IBS / Low-FODMAP', emoji: '🫶' },
    { label: 'Kidney Care', emoji: '💧' },
    { label: 'High Cholesterol', emoji: '🫀' },
    { label: 'Celiac Disease', emoji: '🌾' },
    { label: 'Thyroid', emoji: '⚡' },
  ]

  const handleUpdate = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
    const updated = { ...profile, [key]: value }
    setProfile(updated)
    saveUserProfile(updated)
    setSavedMessage(true)
    setTimeout(() => setSavedMessage(false), 2000)
  }

  const toggleItem = (key: 'dietaryPreferences' | 'allergies' | 'healthConditions', item: string) => {
    const current: string[] = profile[key] as string[]
    const updated = current.includes(item)
      ? current.filter((x) => x !== item)
      : [...current, item]
    handleUpdate(key, updated)
  }

  const saveName = () => {
    if (nameInput.trim()) handleUpdate('name', nameInput.trim())
    setEditingName(false)
  }

  const totalFlags = profile.dietaryPreferences.length + profile.allergies.length + profile.healthConditions.length

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4">
        <p className="text-[10px] font-mono tracking-widest text-emerald-600 mb-0.5">MY PROFILE</p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Health Profile</h1>
          {savedMessage && (
            <span className="text-[11px] font-mono bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-semibold">
              ✓ Saved
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-safe">

        {/* Identity card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white font-bold text-xl flex items-center justify-center shadow-md shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => e.key === 'Enter' && saveName()}
                    className="flex-1 text-base font-bold text-gray-900 bg-transparent border-b-2 border-emerald-500 outline-none py-0.5"
                  />
                  <button onClick={saveName} className="text-emerald-600 text-xs font-semibold">Save</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900">{profile.name}</h2>
                  <button onClick={() => { setNameInput(profile.name); setEditingName(true) }}
                    className="text-[11px] text-gray-400 border border-gray-200 rounded-md px-1.5 py-0.5 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                    ✏️ Edit
                  </button>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-0.5">Tap ✏️ to edit your name</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-100">
                  🌱 Zero-Waste Champion
                </span>
                {totalFlags > 0 && (
                  <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100">
                    {totalFlags} active flag{totalFlags > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* How it works callout */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex gap-3 items-start">
          <span className="text-xl shrink-0">💡</span>
          <div>
            <p className="text-xs font-semibold text-emerald-800">How your profile protects you</p>
            <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
              Every item you select below is checked against scanned products. Matches trigger warnings on the Result screen so you never accidentally buy something harmful.
            </p>
          </div>
        </div>

        {/* ── Dietary Preferences ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">🥗 Dietary Preferences</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Your eating style — affects recipe suggestions</p>
            </div>
            {profile.dietaryPreferences.length > 0 && (
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {profile.dietaryPreferences.length} selected
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {DIET_OPTIONS.map(({ label, emoji }) => {
              const on = profile.dietaryPreferences.includes(label)
              return (
                <button key={label} onClick={() => toggleItem('dietaryPreferences', label)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                    on ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                  <span>{emoji}</span><span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Allergies ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">⚠️ Allergies &amp; Intolerances</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Scanned products will be flagged if these are detected</p>
            </div>
            {profile.allergies.length > 0 && (
              <span className="text-[10px] font-mono bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {profile.allergies.length} selected
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {ALLERGY_OPTIONS.map(({ label, emoji }) => {
              const on = profile.allergies.includes(label)
              return (
                <button key={label} onClick={() => toggleItem('allergies', label)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                    on ? 'bg-red-500 text-white border-red-500 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                  <span>{emoji}</span><span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Health Conditions ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">🩺 Health Conditions</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Nutrients &amp; ingredients are evaluated against these</p>
            </div>
            {profile.healthConditions.length > 0 && (
              <span className="text-[10px] font-mono bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {profile.healthConditions.length} selected
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {CONDITION_OPTIONS.map(({ label, emoji }) => {
              const on = profile.healthConditions.includes(label)
              return (
                <button key={label} onClick={() => toggleItem('healthConditions', label)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                    on ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>
                  <span>{emoji}</span><span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Household & Settings ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-gray-900">⚙️ Preferences</h3>

          {/* Household size */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-semibold text-gray-800">Household Size</p>
              <p className="text-[11px] text-gray-400">Scales recipe ingredient quantities</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleUpdate('householdSize', Math.max(1, profile.householdSize - 1))}
                className="w-8 h-8 rounded-xl bg-gray-100 text-gray-700 font-bold text-base flex items-center justify-center active:scale-95">−</button>
              <span className="text-sm font-mono font-bold w-5 text-center text-gray-900">{profile.householdSize}</span>
              <button onClick={() => handleUpdate('householdSize', profile.householdSize + 1)}
                className="w-8 h-8 rounded-xl bg-gray-100 text-gray-700 font-bold text-base flex items-center justify-center active:scale-95">+</button>
            </div>
          </div>

          {/* Expiry alert */}
          <div className="flex items-center justify-between border-t border-gray-50 pt-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">Expiry Alert Buffer</p>
              <p className="text-[11px] text-gray-400">Warn when items expire within this window</p>
            </div>
            <select value={profile.expiryAlertDays}
              onChange={(e) => handleUpdate('expiryAlertDays', Number(e.target.value))}
              className="bg-gray-50 border border-gray-200 rounded-xl py-1.5 px-3 text-xs text-gray-800 font-mono focus:outline-none">
              <option value={1}>1 Day</option>
              <option value={2}>2 Days</option>
              <option value={3}>3 Days</option>
              <option value={5}>5 Days</option>
              <option value={7}>1 Week</option>
            </select>
          </div>

          {/* Measurement system */}
          <div className="flex items-center justify-between border-t border-gray-50 pt-3">
            <div>
              <p className="text-xs font-semibold text-gray-800">Measurement System</p>
              <p className="text-[11px] text-gray-400">Used for recipes &amp; quantities</p>
            </div>
            <select value={profile.metricSystem}
              onChange={(e) => handleUpdate('metricSystem', e.target.value as UserProfile['metricSystem'])}
              className="bg-gray-50 border border-gray-200 rounded-xl py-1.5 px-3 text-xs text-gray-800 font-mono focus:outline-none">
              <option value="Metric (g, ml)">Metric</option>
              <option value="Imperial (oz, cups)">Imperial</option>
            </select>
          </div>
        </div>

        {/* Active flags summary */}
        {totalFlags > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs">
            <h3 className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider mb-3">
              Active Scan Flags ({totalFlags})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {getProfileFlags(profile).map((flag) => (
                <span key={flag} className="text-[11px] font-mono bg-gray-900 text-white px-2.5 py-1 rounded-full">
                  {flag}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2.5">These are checked against every scanned product.</p>
          </div>
        )}

        {/* Impact stats */}
        <div className="bg-gradient-to-r from-emerald-900 to-emerald-700 rounded-2xl p-4 text-white shadow-sm">
          <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-200 mb-2">Impact Dashboard</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/10 rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-lg font-bold">{itemsSaved}</p>
              <p className="text-[10px] text-emerald-100 mt-0.5">Items Added</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-lg font-bold">{wastePreventedKg}kg</p>
              <p className="text-[10px] text-emerald-100 mt-0.5">Waste Prevented</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center border border-white/10">
              <p className="text-lg font-bold">{scansTotal}</p>
              <p className="text-[10px] text-emerald-100 mt-0.5">Products Scanned</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── Scanner ──────────────────────────────────────────────────────────────────

function ScannerScreen({
  onBack,
  onScan,
  stopCameraRef,
}: {
  onBack: () => void
  onScan: (product?: ScannedProduct, expiry?: string) => void
  stopCameraRef?: React.MutableRefObject<(() => Promise<void>) | null>
}) {
  const [statusText, setStatusText] = useState('Initializing camera...')
  const [torchOn, setTorchOn] = useState(false)
  const [fetching, setFetching] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  // Expose a stopCamera function to the parent so it can stop the stream
  // before unmounting this component (prevents black screen on navigation)
  const stopCamera = async () => {
    const scanner = scannerRef.current
    if (!scanner) return
    scannerRef.current = null

    // 1. Stop the html5-qrcode scanner loop
    try {
      if (scanner.isScanning) {
        await scanner.stop()
      }
    } catch (e) {
      console.warn('scanner.stop() error (ignored):', e)
    }
    try { scanner.clear() } catch {}

    // 2. Hard-stop every video track inside #reader to fully release the camera.
    //    On Android WebView, Html5Qrcode.stop() alone doesn't release the hardware.
    try {
      const videos = document.querySelectorAll<HTMLVideoElement>('#reader video')
      videos.forEach((v) => {
        try {
          const stream = v.srcObject
          if (stream && typeof (stream as any).getTracks === 'function') {
            const tracks: MediaStreamTrack[] = (stream as any).getTracks()
            if (Array.isArray(tracks)) {
              tracks.forEach((t) => { try { t.stop() } catch {} })
            }
          }
          v.srcObject = null
          v.load()
        } catch {}
      })
    } catch {}

    // 3. Give the Android camera HAL time to fully release the hardware.
    //    Without this delay, the next getUserMedia call hits NotReadableError.
    await new Promise((r) => setTimeout(r, 400))
  }

  useEffect(() => {
    if (stopCameraRef) stopCameraRef.current = stopCamera
    return () => {
      if (stopCameraRef) stopCameraRef.current = null
    }
  })

  useEffect(() => {
    let isMounted = true
    let hasScanned = false  // prevent callback firing multiple times during fetch

    async function startCamera(attempt = 0) {
      try {
        // 1. Request Capacitor Camera Permission (for mobile builds)
        try {
          const permResult = await Camera.requestPermissions({ permissions: ['camera'] })
          if (permResult.camera !== 'granted') {
            if (isMounted) setStatusText('Camera permission denied in app settings.')
            return
          }
        } catch (e) {
          // Fallback when running on standard web browser
          console.warn('Capacitor camera request skipped on web:', e)
        }

        // 2. Short pause to guarantee the <div id="reader"> element is rendered in DOM
        await new Promise((resolve) => setTimeout(resolve, 200))

        if (!isMounted) return

        // 3. Initialize Barcode Scanner Engine
        const html5QrcodeScanner = new Html5Qrcode('reader')
        scannerRef.current = html5QrcodeScanner

        if (isMounted) setStatusText('Align barcode within frame')

        await html5QrcodeScanner.start(
          { facingMode: 'environment' }, // Back camera
          {
            fps: 10,
            qrbox: { width: 240, height: 180 },
          },
          async (decodedText) => {
            if (hasScanned || !isMounted) return
            hasScanned = true
            try {
              if (isMounted) {
                setFetching(true)
                setStatusText('Looking up product...')
              }
              const product = await fetchProductByBarcode(decodedText)
              onScan(product)
            } catch (err) {
              console.error('Barcode processing error:', err)
              hasScanned = false
              if (isMounted) {
                setFetching(false)
                setStatusText('Error looking up product. Try again.')
              }
            }
          },
          () => {} // Suppress per-frame scan errors
        )
      } catch (err: any) {
        const msg = String(err?.message || err || '')
        // NotReadableError means the camera HAL hasn't released yet — retry once
        if (attempt === 0 && msg.includes('NotReadableError')) {
          console.warn('Camera NotReadableError — retrying in 800ms...')
          if (isMounted) setStatusText('Starting camera...')
          // Clean up the failed instance before retry
          try { scannerRef.current?.clear() } catch {}
          scannerRef.current = null
          await new Promise((r) => setTimeout(r, 800))
          if (isMounted) startCamera(1)
          return
        }
        console.error('Camera access error:', err)
        if (isMounted) {
          setStatusText(
            msg.includes('Permission') || msg.includes('permission')
              ? 'Camera permission denied. Check app settings.'
              : 'Unable to access camera. Close other camera apps and try again.'
          )
        }
      }
    }

    startCamera()

    // Teardown: stop camera cleanly when component unmounts
    return () => {
      isMounted = false
      stopCamera()
    }
  }, [])

  // Toggle Torch / Flashlight safely
  const toggleTorch = async () => {
    if (!scannerRef.current || !scannerRef.current.isScanning) return

    try {
      const newTorchState = !torchOn
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorchState } as MediaTrackConstraintSet],
      })
      setTorchOn(newTorchState)
      await Toast.show({
        text: newTorchState ? 'Flashlight Turned ON' : 'Flashlight Turned OFF',
        duration: 'short',
      })
    } catch (err) {
      console.error('Torch error:', err)
      await Toast.show({ text: 'Flashlight not supported on this camera.' })
    }
  }

  // Pick a barcode image from the gallery and decode it
  const pickFromGallery = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: 'base64' as any,
        source: 'PHOTOS' as any,
      })

      if (!photo.base64String) {
        await Toast.show({ text: 'Could not read image from gallery.', duration: 'short' })
        return
      }

      setStatusText('Reading barcode from image...')

      // Convert base64 to a File so Html5Qrcode.scanFile can accept it
      const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg'
      const byteChars = atob(photo.base64String)
      const byteNums = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
      const file = new File([byteNums], `barcode.${photo.format || 'jpg'}`, { type: mimeType })

      // Use a temporary Html5Qrcode instance just for file scanning (doesn't need a DOM element)
      const tempScanner = new Html5Qrcode('reader-temp', { verbose: false })
      try {
        const decodedText = await tempScanner.scanFile(file, false)
        setStatusText(`Found Barcode: ${decodedText}`)
        // Stop the live camera before navigating
        await stopCamera()
        const product = await fetchProductByBarcode(decodedText)
        onScan(product)
      } catch {
        setStatusText('No barcode found in image. Try a clearer photo.')
        await Toast.show({ text: 'No barcode detected in that image.', duration: 'short' })
      } finally {
        try { tempScanner.clear() } catch {}
      }
    } catch (err: any) {
      if (!String(err).includes('cancelled') && !String(err).includes('cancel')) {
        console.error('Gallery pick error:', err)
        await Toast.show({ text: 'Could not open gallery.', duration: 'short' })
      }
      setStatusText('Align barcode within frame')
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white pt-safe">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-4 shrink-0 z-10">
        <button onClick={onBack} className="text-sm text-white/70 hover:text-white">
          ← Back
        </button>
        <p className="text-[11px] font-mono text-emerald-400">Barcode Scanner</p>
        <button
          onClick={toggleTorch}
          className={`p-2.5 rounded-full border transition-all ${
            torchOn
              ? 'bg-amber-400 text-gray-950 border-amber-300 shadow-lg shadow-amber-400/30'
              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
          }`}
          title="Toggle Flashlight"
        >
          <span className="text-base leading-none">⚡</span>
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="relative w-full max-w-[270px] aspect-square rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          <div id="reader" className="w-full h-full object-cover" />
          {/* Hidden temp element for gallery scan */}
          <div id="reader-temp" style={{ display: 'none' }} />
          {/* Loading overlay while fetching product info */}
          {fetching && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 rounded-3xl">
              <span className="text-3xl animate-bounce">🔍</span>
              <p className="text-xs font-mono text-emerald-400 text-center px-4">Looking up product...</p>
            </div>
          )}
        </div>
        <p className="text-xs font-mono text-white/60 text-center px-4">{statusText}</p>

        {/* Gallery import button */}
        <button
          onClick={pickFromGallery}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border border-white/15 bg-white/8 hover:bg-white/15 active:scale-[0.97] transition-all"
        >
          <span className="text-lg leading-none">🖼️</span>
          <span className="text-sm font-semibold text-white/80">Import from Gallery</span>
        </button>
      </div>
    </div>
  )
}
// ─── Verdict ──────────────────────────────────────────────────────────────────

function VerdictScreen({
  scannedProduct,
  detectedExpiry,
  onBack,
  onAdd,
}: {
  scannedProduct?: ScannedProduct
  detectedExpiry?: string
  onBack: () => void
  onAdd: (item: PantryItem) => void
}) {
  const [editDate, setEditDate] = useState(false)
  const [date, setDate] = useState(detectedExpiry || '14 OCT 2026')
  const [showIngredients, setShowIngredients] = useState(true)

  const profileFlags: string[] = (() => {
    try {
      const raw = localStorage.getItem('nutrilyst_profile')
      if (!raw) return []
      const parsed = JSON.parse(raw)
      // Build flat flags array from all three profile fields
      const diets = Array.isArray(parsed.dietaryPreferences) ? parsed.dietaryPreferences : []
      const allergies = Array.isArray(parsed.allergies) ? parsed.allergies : []
      const conditions = Array.isArray(parsed.healthConditions) ? parsed.healthConditions : []
      return [...diets, ...allergies, ...conditions]
    } catch {
      return []
    }
  })()

  // ── Empty state: no product scanned yet ──────────────────────────────────
  if (!scannedProduct) {
    return (
      <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
        <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4">
          <p className="text-[10px] font-mono tracking-widest text-gray-400">SCAN RESULT</p>
          <h2 className="text-lg font-bold text-gray-900 mt-0.5">No Product Scanned</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-4xl">
            📷
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-base font-bold text-gray-800">Scan a product first</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Point your camera at a barcode to get a full nutrition &amp; health analysis tailored to your profile.
            </p>
          </div>
          <button
            onClick={onBack}
            className="w-full py-4 rounded-2xl font-semibold text-base text-white active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg, #065f46, #059669)', boxShadow: '0 4px 16px rgba(6,95,70,0.25)' }}
          >
            📷 Open Scanner
          </button>
        </div>
      </div>
    )
  }

  const product = scannedProduct

  const evaluation = evaluateProductHealth(product, profileFlags)
  const cfg = VERDICT_CONFIG[evaluation.variant]

  const flagLevel = {
    high: 'text-red-600 bg-red-50 border-red-200',
    medium: 'text-amber-600 bg-amber-50 border-amber-200',
    low: 'text-gray-500 bg-gray-50 border-gray-200',
  }

  const handleAddItem = () => {
    onAdd({
      id: Date.now(),
      name: product.name,
      category: `${product.brand} · ${product.category}`,
      storageCategory: 'NON_PERISHABLE',
      frequency: 'DAILY',
      routineSlot: 'BREAKFAST',
      printedExpiry: `Exp: ${date}`,
      expiryLevel: 'safe',
      qty: 1,
      isOpened: false,
      earlyWarningDays: 0,
      stockStatus: 'in-stock',
      emoji: product.emoji,
    })
  }

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors mb-3 block">← Back to Scanner</button>
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-2xl shrink-0">{product.emoji}</div>
          <div className="flex-1">
            <p className="text-[10px] font-mono tracking-widest text-gray-400 mb-0.5">{product.category.toUpperCase()}</p>
            <p className="text-xs font-semibold text-emerald-700 mb-0.5">{product.brand}</p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">{product.name}</h2>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <div className={`rounded-2xl border p-4 ${cfg.wrapCls}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${cfg.badgeCls}`}>
              {evaluation.badge}
            </span>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-gray-400">Profile Match</span>
              <span className={`text-lg font-bold font-mono ${cfg.headCls}`}>{evaluation.score}/10</span>
            </div>
          </div>
          <h3 className={`text-base font-bold mb-1 ${cfg.headCls}`}>{evaluation.headline}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{evaluation.reason}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-4 pt-3.5 pb-2 border-b border-gray-50">
            <SectionLabel>NUTRITION DETAILS (PER 100g)</SectionLabel>
          </div>
          <div className="px-4 py-3.5 space-y-3">
            <NutrientBar name="Calories" value={product.nutrients.calories} daily={2000} unit="kcal" />
            <NutrientBar name="Total Sugars" value={product.nutrients.sugars} daily={50} unit="g" />
            <NutrientBar name="Sodium" value={product.nutrients.sodium} daily={2300} unit="mg" />
            <NutrientBar name="Saturated Fat" value={product.nutrients.saturatedFat} daily={20} unit="g" />
          </div>
        </div>

        {evaluation.flaggedIngredients.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button onClick={() => setShowIngredients((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors">
              <SectionLabel>{`FLAGGED RISKS (${evaluation.flaggedIngredients.length})`}</SectionLabel>
              <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">{showIngredients ? '↑ Hide' : '↓ Show'}</span>
            </button>
            {showIngredients && (
              <div className="divide-y divide-gray-50">
                {evaluation.flaggedIngredients.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 px-4 py-3">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border shrink-0 ${flagLevel[item.level]}`}>
                      {item.level === 'high' ? '⚠️ HIGH' : '⚡ MED'}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono text-gray-400 mb-0.5">Detected Expiry</p>
            {editDate ? (
              <input className="text-lg font-mono font-bold text-gray-900 bg-transparent border-b-2 border-emerald-500 outline-none w-36" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => setEditDate(false)} autoFocus />
            ) : (
              <p className="text-lg font-mono font-bold text-gray-900">{date}</p>
            )}
          </div>
          <button onClick={() => setEditDate(true)} className="text-xs font-mono text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">
            [ Edit Date ]
          </button>
        </div>
      </div>

      <div className="px-5 pt-3 pb-5 bg-white border-t border-gray-100 space-y-2">
        <button onClick={handleAddItem} className="w-full text-white py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-all" style={{ background: 'linear-gradient(135deg, #065f46, #059669)', boxShadow: '0 4px 16px rgba(6,95,70,0.25)' }}>
          + Add to Living Pantry
        </button>
      </div>
    </div>
  )
}

// ─── Add Item ─────────────────────────────────────────────────────────────────

function AddItemScreen({ onBack, onSave }: { onBack: () => void; onSave: (item: PantryItem) => void }) {
  const [freshness, setFreshness] = useState<StorageCategory>('PERISHABLE')
  const [frequency, setFrequency] = useState<UsageFrequency>('DAILY')
  const [routine, setRoutine] = useState<RoutineSlot>('EVENING_TEA')
  const [warning, setWarning] = useState(10)
  const [name, setName] = useState('')

  const handleSave = () => {
    onSave({
      id: Date.now(), name: name || 'New Item', category: freshness === 'PERISHABLE' ? 'Perishable' : 'Pantry',
      storageCategory: freshness, frequency, routineSlot: frequency === 'DAILY' ? routine : 'NONE',
      printedExpiry: 'Exp: TBD', expiryLevel: 'safe', qty: 1, isOpened: false,
      earlyWarningDays: frequency === 'OCCASIONAL' ? warning : 0, stockStatus: 'in-stock', emoji: '📦',
    })
  }

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-5">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors mb-3 block">← Back</button>
        <h2 className="text-xl font-bold text-gray-900">Add Pantry Item</h2>
        <p className="text-sm text-gray-400 mt-0.5">Set freshness type and smart alert schedule</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Name */}
        <div>
          <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-gray-400 mb-2">PRODUCT NAME</p>
          <input className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-emerald-400 transition-colors"
            placeholder="e.g. Organic Whole Milk" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {/* Freshness */}
        <div>
          <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-gray-400 mb-2.5">PRODUCT FRESHNESS TYPE</p>
          {[
            { val: 'PERISHABLE' as StorageCategory, icon: '🥛', title: 'Perishable (Short Shelf-Life)', sub: 'Dairy, Fresh Produce, Bakery, Cooked Food, Meat', badge: 'High-Priority Alerts' },
            { val: 'NON_PERISHABLE' as StorageCategory, icon: '🥫', title: 'Non-Perishable / Shelf-Stable', sub: 'Packaged Snacks, Canned Goods, Grains, Sauces', badge: null },
          ].map(({ val, icon, title, sub, badge }) => (
            <button key={val} onClick={() => setFreshness(val)}
              className={`w-full text-left rounded-2xl border p-4 mb-2 transition-all ${freshness === val ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5 flex-1">
                  <span className="text-xl mt-0.5">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 mb-0.5">{title}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{sub}</p>
                  </div>
                </div>
                {badge && freshness === val && (
                  <span className="text-[10px] font-mono bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full ml-2 shrink-0">{badge}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Frequency */}
        <div>
          <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-gray-400 mb-2.5">USAGE FREQUENCY</p>
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(['DAILY', 'OCCASIONAL'] as UsageFrequency[]).map((f) => (
              <button key={f} onClick={() => setFrequency(f)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${frequency === f ? 'bg-white text-gray-900 font-semibold shadow-sm' : 'text-gray-400'}`}>
                {f === 'DAILY' ? '☕ Daily Essential' : '📦 Occasional Use'}
              </button>
            ))}
          </div>
        </div>

        {/* Smart notifications */}
        {frequency === 'DAILY' ? (
          <div>
            <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-emerald-700 mb-1">LINK TO DAILY ROUTINE</p>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Get a reminder when you're preparing this item's routine.</p>
            <div className="space-y-1.5">
              {(['BREAKFAST', 'MORNING_TEA', 'EVENING_TEA', 'DINNER', 'NONE'] as RoutineSlot[]).map((slot) => (
                <button key={slot} onClick={() => setRoutine(slot)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between ${routine === slot ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}>
                  <span>{ROUTINE_LABEL[slot]}</span>
                  {routine === slot && <span className="text-emerald-300 text-xs font-mono">✓</span>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-mono font-semibold tracking-[0.18em] text-emerald-700 mb-1">EARLY EXPIRY WARNING</p>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Alert me this many days before the printed expiry date.</p>
            <div className="flex gap-2">
              {[10, 15, 20].map((days) => (
                <button key={days} onClick={() => setWarning(days)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-mono font-semibold transition-all ${warning === days ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}>
                  {days}d
                </button>
              ))}
            </div>
            <p className="text-[11px] font-mono text-gray-300 mt-2 text-center">days prior to printed expiry</p>
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-5 bg-white border-t border-gray-100">
        <button onClick={handleSave}
          className="w-full text-white py-4 rounded-2xl font-semibold text-base active:scale-[0.98] transition-all"
          style={{ background: 'linear-gradient(135deg, #065f46, #059669)', boxShadow: '0 4px 16px rgba(6,95,70,0.2)' }}>
          Save to Pantry
        </button>
      </div>
    </div>
  )
}

// ─── Pantry ───────────────────────────────────────────────────────────────────

type ExpiryFilter = 'all' | 'urgent' | 'moderate' | 'safe'
type CategoryFilter = 'all' | 'dairy' | 'pantry' | 'produce' | 'beverage' | 'snack'

function PantryScreen({ items, setItems, onRecipes, onAddItem }: {
  items: PantryItem[]; setItems: React.Dispatch<React.SetStateAction<PantryItem[]>>; onRecipes: () => void; onAddItem: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const adjustedQty = (id: number, delta: number) => {
    setItems((prevItems) =>
      prevItems
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.qty + delta
            return nextQty > 0 ? { ...item, qty: nextQty } : null
          }
          return item
        })
        .filter((item): item is PantryItem => item !== null)
    )
  }

  const toggleOpened = (id: number) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, isOpened: !item.isOpened } : item
      )
    )
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesExpiry =
        expiryFilter === 'all' || item.expiryLevel === expiryFilter

      const matchesCategory =
        categoryFilter === 'all' || item.category.toLowerCase().includes(categoryFilter)

      return matchesSearch && matchesExpiry && matchesCategory
    })
  }, [items, searchQuery, expiryFilter, categoryFilter])

  const urgentCount = items.filter((item) => item.expiryLevel === 'urgent').length
  const moderateCount = items.filter((item) => item.expiryLevel === 'moderate').length

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-3 pt-safe">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-mono tracking-widest text-emerald-600 mb-0.5">INVENTORY MANAGEMENT</p>
            <h1 className="text-xl font-bold text-gray-900">My Living Pantry</h1>
          </div>
          <button onClick={onAddItem}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-medium text-xs shadow-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5">
            <span>＋</span>
            <span>Add Item</span>
          </button>
        </div>

        <div className="relative mt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pantry items, categories..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-9 pr-8 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setExpiryFilter('all')}
            className={`px-3 py-1 rounded-full text-[11px] font-mono whitespace-nowrap transition-all ${
              expiryFilter === 'all'
                ? 'bg-gray-900 text-white font-semibold'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setExpiryFilter('urgent')}
            className={`px-3 py-1 rounded-full text-[11px] font-mono whitespace-nowrap transition-all ${
              expiryFilter === 'urgent'
                ? 'bg-red-600 text-white font-semibold shadow-xs'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            ⚡ Urgent ({urgentCount})
          </button>
          <button
            onClick={() => setExpiryFilter('moderate')}
            className={`px-3 py-1 rounded-full text-[11px] font-mono whitespace-nowrap transition-all ${
              expiryFilter === 'moderate'
                ? 'bg-amber-500 text-white font-semibold shadow-xs'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            ⚠️ Soon ({moderateCount})
          </button>
          <button
            onClick={() => setExpiryFilter('safe')}
            className={`px-3 py-1 rounded-full text-[11px] font-mono whitespace-nowrap transition-all ${
              expiryFilter === 'safe'
                ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            ✅ Safe
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar text-[10px] font-mono">
          <span className="text-gray-400 shrink-0">Category:</span>
          {(['all', 'dairy', 'pantry', 'produce', 'beverage', 'snack'] as CategoryFilter[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-0.5 rounded-lg border transition-all ${
                categoryFilter === cat
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {urgentCount > 0 && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs font-mono font-semibold text-red-800">🔴 {urgentCount} item{urgentCount !== 1 ? 's' : ''} expiring soon!</p>
          <button onClick={onRecipes} className="text-xs text-emerald-700 font-semibold whitespace-nowrap ml-3 hover:text-emerald-900 transition-colors">Recipes →</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-safe">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-3xl mb-2">🔍</span>
            <p className="text-sm font-semibold text-gray-700">No matching pantry items found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or filter chips.</p>
            {(searchQuery || expiryFilter !== 'all' || categoryFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setExpiryFilter('all')
                  setCategoryFilter('all')
                }}
                className="mt-3 text-xs text-emerald-600 font-semibold underline"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isPerish = item.storageCategory === 'PERISHABLE'

            return (
              <div key={item.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 shadow-sm">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-xl shrink-0">{item.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 leading-tight">{item.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{item.isOpened ? item.category.replace('Opened', '📂 Opened') : item.category}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-mono border px-2 py-0.5 rounded-full ${EXPIRY_BADGE[item.expiryLevel]}`}>
                      {item.isOpened && item.expiryLevel !== 'safe' ? 'EXPIRES TOMORROW' : item.printedExpiry}
                    </span>
                    {item.isOpened && <p className="text-[10px] font-mono text-amber-500">⚡ 3-day real expiry</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => adjustedQty(item.id, -1)} className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-50 transition-all">−</button>
                  <span className="w-6 text-center text-sm font-mono font-bold text-gray-800">{item.qty}</span>
                  <button onClick={() => adjustedQty(item.id, 1)} className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 text-sm flex items-center justify-center hover:bg-gray-50 transition-all">+</button>

                  {isPerish ? (
                    <button onClick={() => toggleOpened(item.id)}
                      className={`ml-auto text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all ${item.isOpened ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-amber-300'}`}>
                      {item.isOpened ? '📂 Opened' : '📦 Mark Opened'}
                    </button>
                  ) : item.frequency === 'OCCASIONAL' && item.earlyWarningDays > 0 ? (
                    <span className="ml-auto text-[10px] font-mono text-gray-300 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                      ⏰ {item.earlyWarningDays}d warning
                    </span>
                  ) : null}
                </div>

                {item.smartAction && (
                  <button className="mt-2.5 w-full text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl py-2 hover:bg-emerald-100 transition-colors">
                    {item.smartAction}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Shopping List ─────────────────────────────────────────────────────────────

function ShoppingListScreen({ pantryItems }: { pantryItems: PantryItem[] }) {
  const [list, setList] = useState<ShoppingItem[]>(() => generateShoppingList(pantryItems))
  const [copied, setCopied] = useState(false)

  const removeItem = (id: string) => {
    setList((prev) => prev.filter((item) => item.id !== id))
  }

  const handleCopyText = async () => {
    const formatted = list.map((item, i) => `${i + 1}. ${item.name} [${item.reason}]`).join('\n')
    await navigator.clipboard.writeText(`🛒 Nutrilyst Grocery List:\n\n${formatted}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4 pt-safe">
        <p className="text-[10px] font-mono tracking-widest text-emerald-600 mb-0.5">
          AUTOMATED RESTOCKING
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Grocery Shopping List</h1>
          <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-semibold">
            {list.length} Items
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-safe">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🎉</span>
            <p className="text-base font-bold text-gray-800">Your pantry is well-stocked!</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[240px]">
              No urgent or expiring items need restocking at this time.
            </p>
          </div>
        ) : (
          list.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-100 p-3.5 shadow-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🛒</span>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">{item.name}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Suggested Qty: {item.suggestedQty} • Category: {item.category}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  {item.reason}
                </span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-gray-300 hover:text-red-500 text-xs px-1 py-1 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {list.length > 0 && (
        <div className="px-5 pb-6 pt-3 bg-white border-t border-gray-100 shrink-0 safe-padding-bottom flex gap-2">
          <button
            onClick={handleCopyText}
            className="flex-1 py-3.5 rounded-xl border border-gray-200 bg-gray-50 font-semibold text-xs text-gray-700 active:scale-95 transition-all"
          >
            {copied ? '✓ Copied to Clipboard!' : '📋 Copy Text'}
          </button>

          <button
            onClick={() => shareShoppingList(list)}
            className="flex-1 py-3.5 rounded-xl font-semibold text-xs text-white shadow-sm active:scale-95 transition-all"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            📲 Share List
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Automatic AI Recipes ─────────────────────────────────────────────────────

function AutomaticRecipesScreen({ pantryItems }: { pantryItems: PantryItem[] }) {
  const [recipes, setRecipes] = useState<AIRecipe[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  const handleAutoGenerate = async () => {
    setLoading(true)
    setGenerated(true)
    const result = await generateAutomaticRecipe(pantryItems)
    setRecipes(result)
    setLoading(false)
  }

  const expiringItems = pantryItems.filter(
    (item) => item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate'
  )

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4 pt-safe">
        <p className="text-[10px] font-mono tracking-widest text-emerald-600 mb-0.5">
          AI-POWERED ZERO-WASTE
        </p>
        <h1 className="text-xl font-bold text-gray-900">Automatic Recipe Generator</h1>
        <p className="text-xs text-gray-500 mt-1">
          Analyzes your {pantryItems.length} pantry items and automatically drafts tailored recipes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-safe">
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-600 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">🪄</span>
            <span className="text-[10px] font-mono bg-white/20 px-2.5 py-0.5 rounded-full">
              {expiringItems.length} Expiring Items
            </span>
          </div>
          <h3 className="text-base font-bold">Auto-Create Recipes from Pantry</h3>
          <p className="text-xs text-white/80 mt-1">
            Let AI combine your available ingredients to prevent food waste.
          </p>

          <button
            onClick={handleAutoGenerate}
            disabled={loading}
            className="mt-4 w-full py-3 bg-white text-emerald-950 font-bold text-xs rounded-xl shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Generating custom recipes...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>{generated ? 'Regenerate New Recipes' : 'Auto-Generate Recipes Now'}</span>
              </>
            )}
          </button>
        </div>

        {loading && (
          <div className="py-12 text-center space-y-2">
            <span className="text-3xl animate-bounce inline-block">👨‍🍳</span>
            <p className="text-xs font-mono text-gray-500">
              Examining pantry stock & pairing expiring ingredients...
            </p>
          </div>
        )}

        {!loading && generated && recipes.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-mono tracking-wider text-gray-400 uppercase">
              Generated Recommendations ({recipes.length})
            </h2>

            {recipes.map((recipe) => (
              <div key={recipe.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{recipe.emoji}</span>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 leading-tight">{recipe.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{recipe.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-600">
                        ⏱️ Prep: {recipe.prepTime}
                      </span>
                      <span className="text-[10px] font-mono bg-gray-100 px-2 py-0.5 rounded-md text-gray-600">
                        🔥 Cook: {recipe.cookTime}
                      </span>
                    </div>
                  </div>
                </div>

                {recipe.rescuedIngredients.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>
                      Rescues: <strong className="underline">{recipe.rescuedIngredients.join(', ')}</strong>
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-50 space-y-1.5">
                  <p className="text-[11px] font-bold text-gray-700 font-mono">INSTRUCTIONS:</p>
                  {recipe.instructions.map((step, idx) => (
                    <p key={idx} className="text-xs text-gray-600 flex gap-2">
                      <span className="font-bold text-emerald-600 shrink-0">{idx + 1}.</span>
                      <span>{step}</span>
                    </p>
                  ))}
                </div>

                {recipe.chefTip && (
                  <div className="bg-emerald-50 rounded-xl p-2.5 text-[11px] text-emerald-800 italic">
                    💡 <strong>Chef's Tip:</strong> {recipe.chefTip}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Recipes ──────────────────────────────────────────────────────────────────

function RecipesScreen({ pantryItems }: { pantryItems: PantryItem[] }) {
  const [recipes, setRecipes] = useState<PantryAIRecipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadRecipes() {
      setLoading(true)
      const data = await fetchPantryRecipes(pantryItems)
      if (active) {
        setRecipes(data)
        setLoading(false)
      }
    }

    loadRecipes()

    return () => {
      active = false
    }
  }, [pantryItems])

  const expiringCount = pantryItems.filter(
    (item) => item.expiryLevel === 'urgent' || item.expiryLevel === 'moderate'
  ).length

  return (
    <div className="flex flex-col h-full bg-[#F7FAF8] pt-safe">
      <div className="bg-white border-b border-gray-100 px-5 pt-4 pb-4 pt-safe">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-widest text-emerald-600 mb-0.5">
              AI ZERO-WASTE KITCHEN
            </p>
            <h1 className="text-xl font-bold text-gray-900">Recipes For You</h1>
          </div>
          {loading && (
            <span className="text-xs font-mono bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1">
              <span>✨</span> AI Thinking...
            </span>
          )}
        </div>

        {expiringCount > 0 ? (
          <div className="mt-2 text-xs font-mono bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <span>⚡</span>
            <span>Rescuing {expiringCount} expiring pantry item{expiringCount > 1 ? 's' : ''}!</span>
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            Recipes automatically built from your {pantryItems.length} pantry items.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 pb-safe">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
            <span className="text-3xl animate-bounce">👨‍🍳</span>
            <p className="text-sm font-bold text-gray-800">Analyzing Your Living Pantry...</p>
            <p className="text-xs text-gray-400">Pairing expiring ingredients with pantry staples</p>
          </div>
        ) : (
          recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs space-y-3 hover:border-emerald-200 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{recipe.emoji}</span>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 leading-tight">{recipe.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                        ⏱️ {recipe.prepTime}
                      </span>
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                        🔥 {recipe.cookTime}
                      </span>
                      <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-semibold">
                        {recipe.difficulty}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">{recipe.description}</p>

              {recipe.rescuedIngredients.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                  <span className="font-bold">⚡ Rescued Ingredients:</span>{' '}
                  <span className="font-semibold underline">{recipe.rescuedIngredients.join(', ')}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-50 flex flex-wrap gap-1.5">
                {recipe.ingredients.map((ingredient, index) => (
                  <span
                    key={index}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border ${
                      ingredient.isExpiring
                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {ingredient.isExpiring ? '⚡ ' : '✓ '}
                    {ingredient.name} ({ingredient.qty})
                  </span>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-50 space-y-1">
                <p className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                  Instructions:
                </p>
                {recipe.instructions.map((step, idx) => (
                  <p key={idx} className="text-xs text-gray-600 flex gap-2">
                    <span className="font-bold text-emerald-600 shrink-0">{idx + 1}.</span>
                    <span>{step}</span>
                  </p>
                ))}
              </div>

              {recipe.chefTip && (
                <div className="bg-emerald-50 rounded-xl p-2.5 text-[11px] text-emerald-800 italic">
                  💡 <strong>Chef's Tip:</strong> {recipe.chefTip}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard' as Screen, label: 'Home', icon: '⬡' },
  { id: 'scanner' as Screen, label: 'Scan', icon: '📷' },
  { id: 'verdict' as Screen, label: 'Result', icon: '✅' },
  { id: 'pantry' as Screen, label: 'Pantry', icon: '🏠' },
  { id: 'shopping-list' as Screen, label: 'Shop', icon: '🛒' },
  { id: 'automatic-recipes' as Screen, label: 'AI Recipes', icon: '✨' },
  { id: 'recipes' as Screen, label: 'Recipes', icon: '🍽️' },
  { id: 'profile' as Screen, label: 'Profile', icon: '👤' },
]

const NAV_SCREENS: Screen[] = ['dashboard', 'scanner', 'verdict', 'pantry', 'shopping-list', 'automatic-recipes', 'recipes', 'profile']

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | undefined>()
  const [detectedExpiry, setDetectedExpiry] = useState<string | undefined>()
  const [pantryItems, setPantryItems] = useState<PantryItem[]>(() => {
    const saved = localStorage.getItem('nutrilyst_pantry')
    return saved ? JSON.parse(saved) : INITIAL_PANTRY
  })
  // Track scans done this session
  const [scansToday, setScansToday] = useState(0)
  // Load profile for name display — re-read on focus so edits in ProfileScreen reflect immediately
  const [profileName, setProfileName] = useState(() => loadUserProfile().name)

  // Ref to the scanner's stopCamera function — populated while ScannerScreen is mounted
  const stopCameraRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    localStorage.setItem('nutrilyst_pantry', JSON.stringify(pantryItems))
  }, [pantryItems])

  // Refresh profile name whenever the user navigates back from profile screen
  useEffect(() => {
    if (screen === 'dashboard') {
      setProfileName(loadUserProfile().name)
    }
  }, [screen])

  // Always stop camera before leaving scanner screen to prevent black screen
  const navigateTo = async (target: Screen) => {
    if (screen === 'scanner' && stopCameraRef.current) {
      await stopCameraRef.current()
    }
    setScreen(target)
  }

  const isDark = screen === 'scanner'

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: isDark ? '#030712' : '#ffffff' }}>
        {/* Screen */}
        <div className="flex-1 overflow-hidden">
          {screen === 'dashboard' && <DashboardScreen items={pantryItems} onNav={(s) => navigateTo(s)} userName={profileName} scansToday={scansToday} />}
          {screen === 'profile' && <ProfileScreen pantryItemCount={pantryItems.length} scansTotal={scansToday} />}
          {screen === 'scanner' && (
            <ScannerScreen
              stopCameraRef={stopCameraRef}
              onBack={() => navigateTo('dashboard')}
              onScan={async (product, expiry) => {
                if (stopCameraRef.current) await stopCameraRef.current()
                setScannedProduct(product)
                setDetectedExpiry(expiry)
                setScansToday((n) => n + 1)
                setScreen('verdict')
              }}
            />
          )}
          {screen === 'verdict' && (
            <VerdictScreen
              scannedProduct={scannedProduct}
              detectedExpiry={detectedExpiry}
              onBack={() => setScreen('scanner')}
              onAdd={(item) => {
                setPantryItems((prev) => [item, ...prev])
                setScreen('pantry')
              }}
            />
          )}
          {screen === 'pantry' && (
            <PantryScreen
              items={pantryItems}
              setItems={setPantryItems}
              onRecipes={() => setScreen('recipes')}
              onAddItem={() => setScreen('add-item')}
            />
          )}
          {screen === 'shopping-list' && <ShoppingListScreen pantryItems={pantryItems} />}
          {screen === 'automatic-recipes' && <AutomaticRecipesScreen pantryItems={pantryItems} />}
          {screen === 'recipes' && <RecipesScreen pantryItems={pantryItems} />}
          {screen === 'add-item' && (
            <AddItemScreen
              onBack={() => setScreen('pantry')}
              onSave={(item) => {
                setPantryItems((p) => [item, ...p])
                setScreen('pantry')
              }}
            />
          )}
        </div>

        {/* Bottom nav */}
        {NAV_SCREENS.includes(screen) && (
          <div className={`bottom-nav-safe shrink-0 flex border-t ${isDark ? 'bg-gray-950 border-white/10' : 'bg-white border-gray-100'}`} style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
            {NAV.map(({ id, label, icon }) => {
              const active = screen === id
              return (
                <button key={id} onClick={() => navigateTo(id)} className="flex-1 pt-2.5 flex flex-col items-center gap-0.5 transition-all">
                  <span className={`text-lg transition-transform ${active ? 'scale-110' : 'opacity-35 scale-100'}`}>{icon}</span>
                  <span className={`text-[9px] font-mono font-semibold ${active ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-white/30' : 'text-gray-400')}`}>{label}</span>
                </button>
              )
            })}
          </div>
        )}
    </div>
  )
}