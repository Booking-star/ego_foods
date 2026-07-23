import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { applyExternalMappingsToOrders } from '../lib/business';
import { dateTitle, formatINR, todayISO } from '../lib/format';
import { getSwiggySettings, hasSwiggyBridge } from '../lib/swiggyBridge';
import { useInventoryStore } from '../store/inventoryStore';
import { useOrderStore } from '../store/orderStore';
import CashLedger from './CashLedger';

const sourceOptions = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'swiggy', label: 'Swiggy' },
  { id: 'takeaway', label: 'Counter Pickup' },
  { id: 'dine_in', label: 'Dine In' },
  { id: 'all', label: 'All' }
];

function sourceLabel(order) {
  if (order.source === 'swiggy') return 'Swiggy';
  if (order.source === 'whatsapp') return 'WhatsApp';
  if (order.source === 'counter') {
    return order.order_type === 'takeaway' ? 'Counter Pickup' : 'Dine In';
  }
  return 'WhatsApp';
}

function itemAmount(order, item, itemCount) {
  const quantity = Number(item.qty || item.quantity || 1);
  const price = Number(item.price || item.amount || 0);
  if (price) return price * quantity;
  if (itemCount === 1) return Number(order.total_amount || order.total || 0);
  return 0;
}

function buildRows(orders) {
  const grouped = new Map();

  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemCount = items.length || 1;
    for (const item of items) {
      const name = String(item.name || item.item || 'Unknown item').trim();
      const quantity = Number(item.qty || item.quantity || 1);
      const label = sourceLabel(order);
      const key = `${label}::${name}`;
      const row = grouped.get(key) || {
        item: name,
        source: label,
        quantity: 0,
        orders: new Set(),
        sales: 0
      };
      row.quantity += quantity;
      row.orders.add(order.swiggy_order_id || order.id);
      row.sales += itemAmount(order, item, itemCount);
      grouped.set(key, row);
    }
  }

  return Array.from(grouped.values())
    .map((row) => ({ ...row, orders: row.orders.size }))
    .sort((a, b) => b.quantity - a.quantity || b.sales - a.sales || a.item.localeCompare(b.item));
}

function orderDate(order) {
  return String(order.orderDateIso || order.date || order.updated_at || order.created_at || '').slice(0, 10);
}

export default function CompletedSales() {
  const [viewType, setViewType] = useState('sales'); // 'sales' or 'cash'
  const [source, setSource] = useState('swiggy');
  const [date, setDate] = useState(todayISO());
  const orders = useOrderStore((state) => state.orders);
  const mergeImportedOrders = useOrderStore((state) => state.mergeImportedOrders);
  const inventory = useInventoryStore((state) => ({
    externalMappings: state.externalMappings,
    portions: state.portions,
    menuItems: state.menuItems
  }));
  useEffect(() => {
    if (!hasSwiggyBridge()) return;
    getSwiggySettings().then((payload) => {
      mergeImportedOrders(applyExternalMappingsToOrders(payload?.importedOrders || [], inventory));
    }).catch(() => {});
  }, [mergeImportedOrders]);
  const completedOrders = useMemo(() => orders.filter((order) => {
    if (order.status !== 'completed' || !order.payment_confirmed) return false;
    if (orderDate(order) !== date) return false;
    if (source === 'all') return true;
    if (source === 'takeaway') return order.source === 'counter' && order.order_type === 'takeaway';
    if (source === 'dine_in') return order.source === 'counter' && order.order_type === 'dine_in';
    return order.source === source;
  }), [orders, source, date]);
  const rows = useMemo(() => buildRows(completedOrders), [completedOrders]);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  if (viewType === 'cash') {
    return (
      <div className="h-full flex flex-col bg-[#f7f1ec]">
        {/* Toggle headers */}
        <div className="px-5 pt-5 pb-2 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setViewType('sales')}
            className="px-4 py-2 text-xs font-black rounded-sm border border-[#eadfd7] bg-white text-text-dark"
          >
            Sales Breakdown
          </button>
          <button
            type="button"
            onClick={() => setViewType('cash')}
            className="px-4 py-2 text-xs font-black rounded-sm bg-primary text-white"
          >
            Cash Ledger
          </button>
        </div>
        <div className="flex-grow min-h-0">
          <CashLedger />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f7f1ec]">
      {/* Toggle headers */}
      <div className="px-5 pt-5 pb-2 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setViewType('sales')}
          className="px-4 py-2 text-xs font-black rounded-sm bg-primary text-white"
        >
          Sales Breakdown
        </button>
        <button
          type="button"
          onClick={() => setViewType('cash')}
          className="px-4 py-2 text-xs font-black rounded-sm border border-[#eadfd7] bg-white text-text-dark"
        >
          Cash Ledger
        </button>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto pr-1">
        <section className="p-5 pt-0">
          <header className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-text-dark">Completed Sales</h1>
              <p className="mt-1 text-[13px] font-semibold text-text-muted">Grouped item sales from WhatsApp, Swiggy, and counter orders.</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary text-white">
              <ShoppingBag size={24} />
            </div>
          </header>

          <div className="mb-4 grid grid-cols-5 rounded-sm border border-[#eadfd7] bg-white p-1">
            {sourceOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setSource(option.id)}
                className={`min-h-11 rounded-md text-[15px] font-black ${
                  source === option.id ? 'bg-primary text-white' : 'text-text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#eadfd7] bg-white p-3">
            <div>
              <p className="text-[13px] font-black uppercase text-text-muted">Sales date</p>
              <p className="mt-1 text-[15px] font-bold text-text-dark">{dateTitle(date)}</p>
            </div>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-11 rounded-sm border border-[#eadfd7] px-3 text-[15px] font-black text-text-dark"
            />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <Metric label="Orders" value={completedOrders.length} />
            <Metric label="Items Sold" value={totalQuantity} />
            <Metric label="Sales" value={formatINR(totalSales)} />
          </div>

          {!rows.length ? (
            <EmptyState>No completed sales found for {dateTitle(date)}.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-[#eadfd7] bg-white shadow-card">
              <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_100px_130px_140px] border-b border-[#eadfd7] bg-[#fff6ef] px-4 py-3 text-[13px] font-black uppercase text-text-muted">
                <span>Item</span>
                <span>Source</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Orders</span>
                <span className="text-right">Sales</span>
              </div>
              {rows.map((row) => (
                <div key={`${row.source}-${row.item}`} className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_100px_130px_140px] items-center border-b border-[#eadfd7] px-4 py-4 text-[15px] font-bold text-text-dark last:border-b-0">
                  <span className="min-w-0 pr-3">{row.item}</span>
                  <span className={row.source === 'Swiggy' ? 'text-primary' : 'text-success'}>{row.source}</span>
                  <span className="text-right text-lg font-black">{row.quantity}</span>
                  <span className="text-right">{row.orders}</span>
                  <span className="text-right">{formatINR(row.sales)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-sm border border-[#eadfd7] bg-white p-3 shadow-card">
      <p className="text-[13px] font-black uppercase text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-text-dark">{value}</p>
    </div>
  );
}
