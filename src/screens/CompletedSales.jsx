import { useEffect, useMemo, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { applyExternalMappingsToOrders } from '../lib/business';
import { dateTitle, formatINR, todayISO } from '../lib/format';
import { getSwiggySettings, hasSwiggyBridge } from '../lib/swiggyBridge';
import { useInventoryStore } from '../store/inventoryStore';
import { useOrderStore } from '../store/orderStore';
import { useAppStore } from '../store/appStore';
import ReportDateFilter from '../components/ReportDateFilter';
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
  const [viewType, setViewType] = useState('sales'); // 'sales', 'bills', or 'cash'
  const [source, setSource] = useState('swiggy');
  const [billSearch, setBillSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

  const startDate = useAppStore((state) => state.reportStartDate);
  const endDate = useAppStore((state) => state.reportEndDate);
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
    const oDate = orderDate(order);
    if (oDate < startDate || oDate > endDate) return false;
    if (source === 'all') return true;
    if (source === 'takeaway') return order.source === 'counter' && order.order_type === 'takeaway';
    if (source === 'dine_in') return order.source === 'counter' && order.order_type === 'dine_in';
    return order.source === source;
  }), [orders, source, startDate, endDate]);

  const rows = useMemo(() => buildRows(completedOrders), [completedOrders]);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const filteredBills = useMemo(() => {
    return orders.filter((order) => {
      if (order.status !== 'completed' || !order.payment_confirmed) return false;
      const oDate = orderDate(order);
      if (oDate < startDate || oDate > endDate) return false;

      const q = billSearch.trim().toLowerCase();
      if (!q) return true;
      const orderCode = String(order.order_code || '').toLowerCase();
      const customerName = String(order.customer_name || '').toLowerCase();
      const tableNumber = String(order.table_number || '').toLowerCase();
      return orderCode.includes(q) || customerName.includes(q) || tableNumber.includes(q);
    });
  }, [orders, startDate, endDate, billSearch]);

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Toggle headers */}
      <div className="px-5 pt-5 pb-2 flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setViewType('sales')}
          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
            viewType === 'sales'
              ? 'bg-primary text-white shadow-md shadow-primary/20 hover:scale-[1.02]'
              : 'border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md text-text-dark hover:bg-white'
          }`}
        >
          Sales Breakdown
        </button>
        <button
          type="button"
          onClick={() => setViewType('bills')}
          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
            viewType === 'bills'
              ? 'bg-primary text-white shadow-md shadow-primary/20 hover:scale-[1.02]'
              : 'border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md text-text-dark hover:bg-white'
          }`}
        >
          Past Bills
        </button>
        <button
          type="button"
          onClick={() => setViewType('cash')}
          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
            viewType === 'cash'
              ? 'bg-primary text-white shadow-md shadow-primary/20 hover:scale-[1.02]'
              : 'border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md text-text-dark hover:bg-white'
          }`}
        >
          Cash Ledger
        </button>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto pr-1">
        {viewType === 'cash' ? (
          <div className="p-5 pt-0">
            <CashLedger />
          </div>
        ) : (
          <section className="p-5 pt-0">
            <header className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-black text-text-dark">
                  {viewType === 'sales' ? 'Completed Sales' : 'Past Bills'}
                </h1>
                <p className="mt-1 text-[13px] font-semibold text-text-muted">
                  {viewType === 'sales'
                    ? 'Grouped item sales from WhatsApp, Swiggy, and counter orders.'
                    : 'List of individual generated bills and customer orders.'}
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary text-white">
                <ShoppingBag size={24} />
              </div>
            </header>

            <ReportDateFilter />

            {viewType === 'sales' ? (
              <>
                <div className="mb-4 grid grid-cols-5 rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md p-1 shadow-sm">
                  {sourceOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSource(option.id)}
                      className={`min-h-11 rounded-lg text-[15px] font-black transition-all ${
                        source === option.id ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:bg-white/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mb-4 grid grid-cols-3 gap-3">
                  <Metric label="Orders" value={completedOrders.length} />
                  <Metric label="Items Sold" value={totalQuantity} />
                  <Metric label="Sales" value={formatINR(totalSales)} />
                </div>

                {!rows.length ? (
                  <EmptyState>No completed sales found for this period.</EmptyState>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#eadfd7]/60 bg-white/75 backdrop-blur-md shadow-card">
                    <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_100px_130px_140px] border-b border-[#eadfd7]/60 bg-[#fff6ef]/60 px-4 py-3.5 text-[13px] font-black uppercase text-text-muted">
                      <span>Item</span>
                      <span>Source</span>
                      <span className="text-right">Qty</span>
                      <span className="text-right">Orders</span>
                      <span className="text-right">Sales</span>
                    </div>
                    {rows.map((row) => (
                      <div key={`${row.source}-${row.item}`} className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_120px_100px_130px_140px] items-center border-b border-[#eadfd7]/40 px-4 py-4 text-[15px] font-bold text-text-dark last:border-b-0 hover:bg-white/40 transition-colors">
                        <span className="min-w-0 pr-3">{row.item}</span>
                        <span className={row.source === 'Swiggy' ? 'text-primary' : 'text-success'}>{row.source}</span>
                        <span className="text-right text-lg font-black">{row.quantity}</span>
                        <span className="text-right">{row.orders}</span>
                        <span className="text-right">{formatINR(row.sales)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Search Bar for Bills */}
                <div className="mb-4 flex gap-2">
                  <input
                    type="text"
                    placeholder="Search by Bill Code (e.g. EGO-3829) or Customer..."
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                    className="flex-grow bg-white/70 backdrop-blur-md border border-[#eadfd7]/60 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-primary shadow-sm"
                  />
                  {billSearch && (
                    <button
                      type="button"
                      onClick={() => setBillSearch('')}
                      className="px-4 bg-gray-100 hover:bg-gray-200 text-text-dark text-xs font-bold rounded-xl border border-gray-200"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <Metric label="Total Bills Generated" value={filteredBills.length} />
                  <Metric label="Total Sales Value" value={formatINR(filteredBills.reduce((sum, o) => sum + Number(o.total_amount || 0), 0))} />
                </div>

                {!filteredBills.length ? (
                  <EmptyState>No bills found matching search or filter range.</EmptyState>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#eadfd7]/60 bg-white/75 backdrop-blur-md shadow-card">
                    <div className="grid min-w-[720px] grid-cols-[140px_140px_180px_130px_130px] border-b border-[#eadfd7]/60 bg-[#fff6ef]/60 px-4 py-3.5 text-[13px] font-black uppercase text-text-muted">
                      <span>Bill Code</span>
                      <span>Type / Table</span>
                      <span>Date & Time</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Details</span>
                    </div>
                    {filteredBills.map((bill) => {
                      const label = bill.source === 'swiggy' ? 'Swiggy' : bill.source === 'whatsapp' ? 'WhatsApp' : bill.order_type === 'takeaway' ? 'Takeaway' : `Table ${bill.table_number}`;
                      const formattedTime = new Date(bill.created_at).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      });
                      return (
                        <div key={bill.id} className="grid min-w-[720px] grid-cols-[140px_140px_180px_130px_130px] items-center border-b border-[#eadfd7]/40 px-4 py-3 text-[15px] font-bold text-text-dark last:border-b-0 hover:bg-white/40 transition-colors">
                          <span className="font-extrabold text-primary">{bill.order_code || 'N/A'}</span>
                          <span>{label}</span>
                          <span className="text-xs text-text-muted">{formattedTime}</span>
                          <span className="text-right text-emerald-600 font-extrabold">{formatINR(bill.total_amount)}</span>
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedBill(bill)}
                              className="px-3 py-1.5 text-xs font-black text-white bg-primary rounded-lg shadow-sm hover:scale-[1.02] active:scale-95 transition-transform"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Bill Invoice Detail Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 relative max-h-[85vh] flex flex-col justify-between">
            <button
              type="button"
              onClick={() => setSelectedBill(null)}
              className="absolute top-4 right-4 text-text-muted hover:text-text-dark font-black text-sm"
            >
              ✕
            </button>
            <div className="text-center border-b pb-3 border-[#eadfd7]">
              <h2 className="text-base font-black text-text-dark uppercase tracking-wider">Invoice Details</h2>
              <p className="text-xs text-[#999999] mt-0.5 font-semibold">Bill Code: <span className="font-bold text-text-dark">{selectedBill.order_code || 'N/A'}</span></p>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 py-1 text-sm font-semibold">
              <div className="grid grid-cols-2 gap-1.5 text-xs text-text-muted">
                <div>Date & Time:</div>
                <div className="text-right text-text-dark">{new Date(selectedBill.created_at).toLocaleString("en-IN")}</div>
                <div>Source:</div>
                <div className="text-right text-text-dark capitalize">
                  {selectedBill.source === 'swiggy' ? 'Swiggy' : selectedBill.source === 'whatsapp' ? 'WhatsApp' : selectedBill.order_type === 'takeaway' ? 'Counter Takeaway' : `Dine-In Table ${selectedBill.table_number}`}
                </div>
                {selectedBill.customer_name && (
                  <>
                    <div>Customer Name:</div>
                    <div className="text-right text-text-dark">{selectedBill.customer_name}</div>
                  </>
                )}
              </div>

              <div className="border-t border-[#eadfd7] pt-2">
                <p className="text-[10px] font-black tracking-widest text-[#999999] uppercase mb-1.5">Order Items</p>
                <div className="divide-y divide-gray-100">
                  {(() => {
                    const items = Array.isArray(selectedBill.items) ? selectedBill.items : [];
                    return items.map((item, idx) => (
                      <div key={idx} className="py-2 flex justify-between text-xs font-bold text-text-dark">
                        <div>
                          <span>{item.name}</span>
                        </div>
                        <div className="text-right text-text-muted whitespace-nowrap">
                          {item.quantity || item.qty || 1} x {formatINR(item.price || 0)} = <span className="text-text-dark font-extrabold">{formatINR((item.price || 0) * (item.quantity || item.qty || 1))}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            <div className="border-t border-[#eadfd7] pt-3 text-center">
              <div className="flex justify-between items-center text-sm font-black text-text-dark">
                <span>Total Amount Paid</span>
                <span className="text-lg text-emerald-600 font-extrabold">{formatINR(selectedBill.total_amount)}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="mt-3.5 w-full h-9 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-black uppercase text-text-dark transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md p-4 shadow-sm hover:scale-[1.01] transition-transform duration-200">
      <p className="text-[13px] font-black uppercase text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-black text-text-dark">{value}</p>
    </div>
  );
}
