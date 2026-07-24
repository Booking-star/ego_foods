import dayjs from 'dayjs';
import { todayISO } from './format';

export const STATUS_ORDER = ['new', 'payment_pending', 'preparing', 'ready', 'rejected', 'completed'];

export const STATUS_META = {
  new: { label: 'NEW', dot: 'red', border: '#E02020', badgeClass: 'text-danger bg-red-50' },
  payment_pending: { label: 'PENDING', dot: 'yellow', border: '#FC8019', badgeClass: 'text-primary bg-orange-50' },
  preparing: { label: 'PREPARING', dot: 'orange', border: '#FC8019', badgeClass: 'text-primary bg-orange-50' },
  ready: { label: 'READY', dot: 'green', border: '#60B246', badgeClass: 'text-success bg-green-50' },
  rejected: { label: 'REFUND PENDING', dot: 'black', border: '#93959F', badgeClass: 'text-text-muted bg-bg-secondary' },
  completed: { label: 'DONE', dot: 'black', border: '#93959F', badgeClass: 'text-text-muted bg-bg-secondary' }
};

export function sortOrders(orders) {
  return [...orders].sort((a, b) => {
    const rank = (status) => (status === 'new' ? -1 : STATUS_ORDER.indexOf(status));
    const rankDiff = rank(a.status) - rank(b.status);
    if (rankDiff !== 0) return rankDiff;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

export function activeToday(order) {
  const isOnline = order.source === 'whatsapp' || order.source === 'swiggy';
  return isOnline && dayjs(order.created_at).isSame(dayjs(), 'day') && !['completed', 'rejected'].includes(order.status) && order.payment_confirmed;
}

export function completedToday(order) {
  return dayjs(order.updated_at || order.created_at).isSame(dayjs(), 'day') && order.status === 'completed';
}

export function orderPortionKg(order, menuItems) {
  return (order.items || []).reduce((sum, item) => sum + orderItemPortionKg(item, menuItems), 0);
}

export function orderItemPortionKg(item, menuItems) {
  const menuItem = menuItems.find((menu) => menu.id === item.menu_item_id || menu.name === item.name);
  const grams = item.portion_grams || (item.variant === 'half' ? menuItem?.portion_half_grams : menuItem?.portion_full_grams);
  return (Number(grams || 0) / 1000) * Number(item.qty || item.quantity || 1);
}

export function orderPortionKgByMenu(order, menuItems) {
  return (order.items || []).reduce((totals, item) => {
    const menuItem = menuItems.find((menu) => menu.id === item.menu_item_id || menu.name === item.name);
    const menuId = menuItem?.id || item.menu_item_id;
    if (!menuId) return totals;
    totals[menuId] = (totals[menuId] || 0) + orderItemPortionKg(item, menuItems);
    return totals;
  }, {});
}

export function applyExternalMappingsToOrders(orders, { externalMappings = [], portions = [], menuItems = [] }) {
  const swiggyMappings = new Map(
    externalMappings
      .filter((mapping) => mapping.source === 'swiggy')
      .map((mapping) => [String(mapping.external_item_name || '').trim().toLowerCase(), mapping])
  );

  return (orders || []).map((order) => {
    if (order.source !== 'swiggy') return order;
    return {
      ...order,
      items: (order.items || []).map((item) => {
        const mapping = swiggyMappings.get(String(item.name || '').trim().toLowerCase());
        if (!mapping) return item;
        const portion = portions.find((row) => row.id === mapping.portion_id);
        const menuItem = menuItems.find((row) => row.id === mapping.menu_item_id);
        return {
          ...item,
          menu_item_id: mapping.menu_item_id,
          name: menuItem && portion ? `${menuItem.name} - ${portion.name}` : item.name,
          portion_id: mapping.portion_id,
          portion_name: portion?.name,
          portion_grams: portion?.grams
        };
      })
    };
  });
}

export function generatePickupCode(activeOrders) {
  const used = new Set(
    activeOrders
      .filter((order) => order.status !== 'completed' && dayjs(order.created_at).isSame(dayjs(), 'day'))
      .map((order) => order.pickup_code)
  );
  let code = '';
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(code));
  return code;
}

export function todayRows(rows, field = 'date') {
  const today = todayISO();
  return rows.filter((row) => {
    const value = row[field] || row.created_at || row.logged_at;
    return String(value).slice(0, 10) === today;
  });
}
