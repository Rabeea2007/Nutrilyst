Here are the comprehensive, production-ready Figma text specifications, UI component structures, and intelligent automation logic for your new pantry management features.

---

## 1. Complete Text Strings for Figma (Copy-Paste Ready)

### Screen: Add / Edit Pantry Item (Categorization Flow)

#### Section 1: Item Lifespan & Freshness

* **Section Title:** `PRODUCT FRESHNESS TYPE`
* **Card Option A (Selected):**
* **Title:** `🥛 Perishable (Short Shelf-Life)`
* **Subtitle:** `Dairy, Fresh Produce, Bakery, Cooked Food, Meat`
* **Badge:** `High-Priority Alerts`


* **Card Option B:**
* **Title:** `🥫 Non-Perishable / Shelf-Stable`
* **Subtitle:** `Packaged Snacks, Canned Goods, Grains, Sauces`



#### Section 2: Consumption Frequency

* **Section Title:** `USAGE FREQUENCY`
* **Toggle Segment 1:** `☕ Daily Essential`
* **Toggle Segment 2:** `📦 Occasional Use`

#### Section 3: Smart Notification Settings (Dynamic based on Selection)

##### If "Daily Essential" is Selected:

* **Field Title:** `LINK TO DAILY ROUTINE`
* **Description:** `Get friendly reminders when you're preparing meals or tea.`
* **Routine Radio Chips:**
* `🌅 Breakfast (8:00 AM)`
* `🫖 Morning Tea (10:30 AM)`
* `☕ Evening Coffee / Tea (5:00 PM)`
* `🌙 Dinner Prep (7:30 PM)`
* `🚫 No Routine Link`



##### If "Occasional Use" is Selected:

* **Field Title:** `EARLY EXPIRY WARNING`
* **Description:** `Set an early buffer so specialty ingredients aren't forgotten.`
* **Dropdown Label:** `Remind Me Before Expiry:`
* **Dropdown Options:** `10 Days Prior` | `15 Days Prior` | `20 Days Prior`

---

### Screen: Living Pantry Dashboard (Updated View)

#### Top Category Pills

* `All Items (18)` | `🥛 Perishables (5)` | `☕ Daily Essentials (8)` | `📦 Occasional (5)`

#### Perishable Section Header & High-Urgency Card

* **Section Header:** `PERISHABLES NEEDING ATTENTION`
* **Urgency Banner:** `🔴 2 items expiring within 48 hours!`
* **Item Card 1 Example:**
* **Title:** `Organic Fresh Milk`
* **Sub-line:** `Dairy • Opened 2 days ago`
* **Status Badge:** `EXPIRES TOMORROW` *(Red Pill)*
* **Smart Action:** `[ ⚡ Use in Evening Tea ]`



#### Daily Essentials Section (Routine Grouped)

* **Section Header:** `☕ EVENING TEA & SNACK CORNER (5:00 PM)`
* **Item 1:** `Whole Wheat Digestive Biscuits` • `Exp: 24 Oct` • `[ In Stock ]`
* **Item 2:** `Green Tea Packets` • `Exp: 15 Dec` • `[ Running Low ]`

#### Occasional Use Section

* **Section Header:** `📦 OCCASIONAL & SPECIALTY INGREDIENTS`
* **Item 1:** `Garam Masala Powder` • `Remind: 15 days before` • `Exp: 12 Nov`
* **Item 2:** `Baking Cocoa Powder` • `Remind: 20 days before` • `Exp: 05 Sep` *(Yellow Pill: Alert set for Aug 16)*

---

## 2. Sensible & High-Value Feature Additions

To make your app stand out to hackathon judges, here are 3 high-impact features built on top of your new categories:

### 1. "Open Date" Tracker for Opened Perishables

* **Problem:** Unopened milk lasts 10 days, but once opened, it expires in 3 days regardless of the printed printed date.
* **Feature:** When a user checks off a perishable item as *"Opened Today"*, the app automatically recalculates the real expiration date to **3 days from opening** and triggers a priority notification.

### 2. Contextual Tea & Coffee Time Recipe Suggestions

* **Problem:** Standard recipe tools suggest full meals when you just want a snack with tea.
* **Feature:** At 5:00 PM, if a daily item (like Milk or Cream) or a perishable item (like Bread) is expiring in 24 hours, the app sends a targeted notification:
> *"🫖 Evening Tea Suggestion: Make Quick Milk Toast or Cream Biscuits using items expiring tomorrow!"*



### 3. Smart "Occasional Use" Rescue Plan

* **Problem:** People buy specialty spices or baking ingredients for one dish, and they sit unused until they expire.
* **Feature:** When an occasional item hits its **20-day warning threshold**, the app automatically prompts:
> *"📦 Your Cocoa Powder expires in 20 days. Tap to see 3 easy weekend baking recipes to finish it!"*



---

## 3. Updated Next.js Data Model (TypeScript)

Copy this updated TypeScript model into your codebase (`src/lib/types.ts`):

```typescript
export type StorageCategory = 'PERISHABLE' | 'NON_PERISHABLE';
export type UsageFrequency = 'DAILY' | 'OCCASIONAL';
export type RoutineSlot = 'BREAKFAST' | 'MORNING_TEA' | 'EVENING_TEA' | 'DINNER' | 'NONE';

export interface PantryItem {
  id: string;
  productName: string;
  brand?: string;
  storageCategory: StorageCategory; // Perishable vs Non-Perishable
  frequency: UsageFrequency;        // Daily vs Occasional
  routineSlot: RoutineSlot;          // Breakfast / Tea time slot
  
  // Expiry & Notification Logic
  printedExpiryDate: string;        // YYYY-MM-DD
  isOpened: boolean;
  openedDate?: string;               // YYYY-MM-DD
  realExpiryDate: string;           // Recalculated based on isOpened
  
  // Notification Config
  earlyWarningDays: number;         // 10, 15, or 20 days for OCCASIONAL items
  hasNotifiedEarly: boolean;
}

```

---