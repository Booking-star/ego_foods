import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { hasKitchenApi, updateKitchenOrderStatus } from '../lib/kitchenApi';
import { sampleOrders } from '../lib/sampleData';
import { activeToday, completedToday, generatePickupCode, orderPortionKg } from '../lib/business';
import { uid } from '../lib/format';
import { useAppStore } from './appStore';
import { alertManager } from '../lib/alertManager';

function isPaidNew(order) {
  return order?.payment_confirmed && (order.status === 'new' || order.status === 'payment_pending');
}

function printOrderCopies(order) {
  if (order?.source !== 'whatsapp' || !window.kitchenOS?.printer?.printOrderCopies) return;
  const { customerPrinterName, kitchenPrinterName } = useAppStore.getState();
  window.kitchenOS.printer.printOrderCopies(order, { customerPrinterName, kitchenPrinterName }).catch((error) => {
    console.error('Order receipt print failed:', error);
  });
}

export const useOrderStore = create((set, get) => ({
  orders: sampleOrders,
  viewedScreenshots: {},
  alarmOrderIds: new Set(),
  setOrders: (orders) => {
    const nextOrders = [
      ...(orders || []),
      ...get().orders.filter((order) => ['swiggy', 'counter', 'dinein'].includes(order.source))
    ];
    const byId = new Map(nextOrders.map((order) => [order.swiggy_order_id || order.id, order]));
    const mergedOrders = Array.from(byId.values());
    const alarmOrderIds = new Set(mergedOrders.filter(isPaidNew).map((order) => order.id));
    set({ orders: mergedOrders, alarmOrderIds });
  },
  mergeImportedOrders: (importedOrders) =>
    set((state) => {
      const byId = new Map(state.orders.map((order) => [order.swiggy_order_id || order.id, order]));
      for (const order of importedOrders || []) byId.set(order.swiggy_order_id || order.id, order);
      return { orders: Array.from(byId.values()) };
    }),
  addOrder: (order) =>
    set((state) => {
      const alarmOrderIds = new Set(state.alarmOrderIds);
      if (isPaidNew(order)) {
        alarmOrderIds.add(order.id);
      }
      return {
        orders: [order, ...state.orders.filter((item) => item.id !== order.id)],
        alarmOrderIds
      };
    }),
  upsertOrder: (order) =>
    set((state) => ({
      orders: state.orders.some((item) => item.id === order.id)
        ? state.orders.map((item) => (item.id === order.id ? order : item))
        : [order, ...state.orders]
    })),
  addCounterOrder: ({ items, total, mode }) =>
    set((state) => {
      const now = new Date().toISOString();
      const order = {
        id: uid('counter'),
        customer_name: mode || 'Counter Customer',
        customer_phone: '',
        items,
        total_amount: Number(total || 0),
        status: 'completed',
        payment_confirmed: true,
        payment_screenshot_url: '',
        pickup_code: generatePickupCode(state.orders),
        source: 'counter',
        created_at: now,
        updated_at: now
      };
      return { orders: [order, ...state.orders] };
    }),
  markScreenshotViewed: (orderId) =>
    set((state) => ({ viewedScreenshots: { ...state.viewedScreenshots, [orderId]: true } })),
  dismissAlarmForOrder: (orderId) => {
    if (isPaidNew(get().orders.find((order) => order.id === orderId))) return;
    set((state) => {
      const alarmOrderIds = new Set(state.alarmOrderIds);
      alarmOrderIds.delete(orderId);
      return { alarmOrderIds };
    });
  },
  updateOrderStatus: async (orderId, status, extra = {}) => {
    const previous = get().orders.find((order) => order.id === orderId);
    if (!previous) return { ok: false, message: 'Order not found.' };
    if (status === 'preparing' && !extra.payment_confirmed && !previous.payment_confirmed) {
      return { ok: false, message: 'Confirm the payment before preparing this order.' };
    }
    
    // Notify alert manager that an order has been accepted
    if (status === 'preparing') {
      alertManager.markOrderAccepted();
    }

    const finalExtra = status === 'completed' ? { ...extra, payment_screenshot_url: '' } : extra;
    const next = { ...previous, ...finalExtra, status, updated_at: new Date().toISOString() };
    if (hasKitchenApi && previous.source === 'whatsapp') {
      const saved = await updateKitchenOrderStatus(orderId, status, finalExtra);
      get().upsertOrder(saved);
      if (status === 'preparing') printOrderCopies(saved);
      return { ok: true, previous, next: saved };
    }
    if (supabase) {
      const { error } = await supabase.from('orders').update(next).eq('id', orderId);
      if (error) return { ok: false, message: error.message };
    }
    get().upsertOrder(next);
    if (status === 'preparing') printOrderCopies(next);
    return { ok: true, previous, next };
  },
  deductRecipesForOrder: async (order) => {
    if (order.stock_deducted || order.status !== 'completed') return;

    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .update({ stock_deducted: true })
        .eq('id', order.id)
        .eq('stock_deducted', false)
        .select('*');
      if (error || !data || data.length === 0) {
        return;
      }
    }

    const { portions, menuItemComponents, recipes } = useInventoryStore.getState();
    const recipeDeductions = {};

    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const portionId = item.portion_id || item.id;
      const portion = portions.find(p => p.id === portionId);
      if (!portion) continue;

      const components = menuItemComponents.filter(c => c.portion_id === portion.id);
      for (const comp of components) {
        if (comp.component_type === 'recipe' && comp.recipe_id) {
          const qtyUsed = Number(comp.quantity_in_base_unit || comp.quantity || 0); // in grams
          const kgUsed = (qtyUsed / 1000) * Number(item.quantity || item.qty || 1);
          recipeDeductions[comp.recipe_id] = (recipeDeductions[comp.recipe_id] || 0) + kgUsed;
        }
      }
    }

    if (supabase) {
      for (const [recipeId, kg] of Object.entries(recipeDeductions)) {
        const recipe = recipes.find(r => r.id === recipeId);
        if (recipe) {
          const nextStock = Number(recipe.current_stock || 0) - kg;
          await supabase
            .from('recipes')
            .update({ current_stock: nextStock })
            .eq('id', recipeId);
        }
      }
    }

    useInventoryStore.setState((state) => ({
      recipes: state.recipes.map(r => {
        const consumed = recipeDeductions[r.id];
        return consumed ? { ...r, current_stock: Number(r.current_stock || 0) - consumed } : r;
      })
    }));
  },
  activeCount: () => get().orders.filter(activeToday).length,
  paidTodayTotal: () =>
    get().orders
      .filter((order) => completedToday(order) && order.payment_confirmed)
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
  completedPortionKg: (menuItems) =>
    get().orders
      .filter((order) => completedToday(order))
      .reduce((sum, order) => sum + orderPortionKg(order, menuItems), 0)
}));
