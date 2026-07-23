import { todayISO, uid } from './format';

const now = new Date();
const minutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();

const catalogList = [
  { id: 'menu-fry-piece-palav', name: 'Chicken Fry Piece Palav', category: 'non_veg_large', price: 250 },
  { id: 'menu-chicken-joint-palav', name: 'Chicken Joint Palav', category: 'non_veg_large', price: 320 },
  { id: 'menu-mutton-dum-biryani', name: 'Mutton Dum Biryani', category: 'non_veg_large', price: 380 },
  { id: 'menu-special-chicken-palav', name: 'Special Chicken Palav', category: 'non_veg_large', price: 290 },
  { id: 'menu-gongura-chicken-palav', name: 'Gongura Chicken Palav', category: 'non_veg_large', price: 270 },
  { id: 'menu-egg-palav', name: 'Egg Palav', category: 'non_veg_small', price: 180 },
  { id: 'menu-veg-palav', name: 'Veg Palav', category: 'veg', price: 160 },
  { id: 'menu-paneer-palav', name: 'Paneer Palav', category: 'veg', price: 220 },
  { id: 'menu-mushroom-palav', name: 'Mushroom Palav', category: 'veg', price: 210 },
  { id: 'menu-kaju-palav', name: 'Kaju Palav', category: 'veg', price: 240 },
  { id: 'menu-chicken-65', name: 'Chicken 65', category: 'non_veg_small', price: 230 },
  { id: 'menu-chilli-chicken', name: 'Chilli Chicken', category: 'non_veg_small', price: 230 },
  { id: 'menu-chicken-lollipop', name: 'Chicken Lollipop', category: 'non_veg_small', price: 250 },
  { id: 'menu-pepper-chicken', name: 'Pepper Chicken', category: 'non_veg_small', price: 240 },
  { id: 'menu-dragon-chicken', name: 'Dragon Chicken', category: 'non_veg_small', price: 260 },
  { id: 'menu-crispy-corn', name: 'Crispy Corn', category: 'veg', price: 150 },
  { id: 'menu-chilli-paneer', name: 'Chilli Paneer', category: 'veg', price: 200 },
  { id: 'menu-mushroom-pepper-fry', name: 'Mushroom Pepper Fry', category: 'veg', price: 190 },
  { id: 'menu-gulab-jamun', name: 'Gulab Jamun', category: 'desserts', price: 80 },
  { id: 'menu-double-ka-meetha', name: 'Double Ka Meetha', category: 'desserts', price: 90 },
  { id: 'menu-apricot-delight', name: 'Apricot Delight', category: 'desserts', price: 120 },
  { id: 'menu-soft-drink', name: 'Soft Drink 600ml', category: 'beverages', price: 40 },
  { id: 'menu-water-bottle', name: 'Mineral Water 1L', category: 'beverages', price: 20 },
  { id: 'menu-butter-milk', name: 'Butter Milk', category: 'beverages', price: 30 },
  { id: 'menu-extra-raitha', name: 'Special Raitha Extra', category: 'sides', price: 20 },
  { id: 'menu-extra-salan', name: 'Salan Extra', category: 'sides', price: 20 }
];

export const sampleMenuItems = catalogList.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  recipe_base_quantity: 1,
  recipe_base_unit: 'kg',
  cooked_low_stock_threshold_kg: 1.5,
  price_full: item.price,
  price_half: Math.round(item.price * 0.6),
  portion_full_grams: 400,
  portion_half_grams: 200,
  is_active: true
}));

export const samplePortions = catalogList.flatMap((item) => [
  { id: `portion-${item.id}-full`, menu_item_id: item.id, name: 'Full', grams: 400, price: item.price, source: 'whatsapp' },
  { id: `portion-${item.id}-swiggy`, menu_item_id: item.id, name: 'Swiggy Single', grams: 400, price: null, source: 'swiggy' }
]);

export const sampleIngredients = [
  ['Basmati Rice', 'kg', 10, 2],
  ['Chicken Fry Pieces', 'kg', 5, 1],
  ['Oil', 'ml', 2000, 500],
  ['Onions', 'kg', 3, 0.5],
  ['Tomatoes', 'kg', 2, 0.5],
  ['Ginger Garlic Paste', 'kg', 0.5, 0.1],
  ['Biryani Masala', 'kg', 0.3, 0.05],
  ['Curd', 'kg', 1, 0.2],
  ['Salt and Spices', 'kg', 0.5, 0.1]
].map(([name, unit, current_stock, low_stock_threshold]) => ({
  id: `ingredient-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  unit,
  current_stock,
  low_stock_threshold
}));

export const sampleRecipes = sampleIngredients.map((ingredient) => ({
  id: uid('recipe'),
  menu_item_id: 'menu-fry-piece-palav',
  ingredient_id: ingredient.id,
  base_quantity: 1,
  base_unit: 'kg',
  quantity_per_kg: {
    'Basmati Rice': 0.6,
    'Chicken Fry Pieces': 0.4,
    Oil: 80,
    Onions: 0.15,
    Tomatoes: 0.1,
    'Ginger Garlic Paste': 0.03,
    'Biryani Masala': 0.02,
    Curd: 0.05,
    'Salt and Spices': 0.01
  }[ingredient.name],
  unit: ingredient.unit
}));

export const sampleExternalMappings = [];

export const sampleBatchLogs = [
  {
    id: 'batch-today',
    menu_item_id: 'menu-fry-piece-biryani',
    date: todayISO(),
    kg_cooked: 5,
    kg_sold: 0.8,
    estimated_waste_cost: 90,
    logged_at: minutesAgo(220)
  }
];

export const sampleOrders = [
  {
    id: 'order-new-1',
    customer_name: 'Arjun M.',
    customer_phone: '9999999999',
    items: [{ menu_item_id: 'menu-fry-piece-biryani', name: 'Fry Piece Biryani', variant: 'full', qty: 1, price: 180 }],
    total_amount: 180,
    status: 'new',
    payment_confirmed: true,
    payment_screenshot_url: '',
    pickup_code: '4291',
    source: 'whatsapp',
    created_at: minutesAgo(8),
    updated_at: minutesAgo(8)
  },
  {
    id: 'order-preparing-1',
    customer_name: 'Meera',
    items: [{ menu_item_id: 'menu-fry-piece-biryani', name: 'Fry Piece Biryani', variant: 'half', qty: 2, price: 110 }],
    total_amount: 220,
    status: 'preparing',
    payment_confirmed: true,
    pickup_code: '8310',
    source: 'whatsapp',
    created_at: minutesAgo(30),
    updated_at: minutesAgo(12)
  },
  {
    id: 'order-done-1',
    customer_name: 'Ravi',
    items: [{ menu_item_id: 'menu-fry-piece-biryani', name: 'Fry Piece Biryani', variant: 'full', qty: 1, price: 180 }],
    total_amount: 180,
    status: 'completed',
    payment_confirmed: true,
    pickup_code: '2764',
    source: 'whatsapp',
    created_at: minutesAgo(95),
    updated_at: minutesAgo(72)
  }
];

export const sampleExpenses = [
  {
    id: 'expense-chicken',
    type: 'market_purchase',
    description: 'Chicken Fry Pieces',
    ingredient_id: 'ingredient-chicken-fry-pieces',
    quantity: 3,
    unit: 'kg',
    amount: 720,
    date: todayISO(),
    logged_at: minutesAgo(260)
  },
  {
    id: 'expense-rice',
    type: 'market_purchase',
    description: 'Basmati Rice',
    ingredient_id: 'ingredient-basmati-rice',
    quantity: 5,
    unit: 'kg',
    amount: 450,
    date: todayISO(),
    logged_at: minutesAgo(250)
  }
];

export const sampleDineInSales = [
  { id: 'dinein-1', amount: 1800, note: 'Lunch counter', date: todayISO(), logged_at: minutesAgo(70) }
];
