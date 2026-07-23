import { AlertTriangle, Filter, TimerReset } from 'lucide-react';
import { useRef, useState } from 'react';
import OrderCard from '../components/OrderCard';
import { activeToday, completedToday, orderItemPortionKg, sortOrders } from '../lib/business';
import { useInventoryStore } from '../store/inventoryStore';
import { useOrderStore } from '../store/orderStore';

const orderTabs = [
  { id: 'new', label: 'New Orders 🚨' },
  { id: 'processing', label: 'Processing 👨‍🍳' }
];

export default function OrderQueue() {
  const orders = useOrderStore((state) => state.orders);
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const dismissAlarmForOrder = useOrderStore((state) => state.dismissAlarmForOrder);
  const menuItems = useInventoryStore((state) => state.menuItems);
  const addSoldKg = useInventoryStore((state) => state.addSoldKg);
  const [queueTab, setQueueTab] = useState('new');
  const [selected, setSelected] = useState(new Set());
  const [paidOnly, setPaidOnly] = useState(false);
  const [timeAsc, setTimeAsc] = useState(true);
  const topRef = useRef(null);
  const active = sortOrders(orders.filter(activeToday));
  const tabCounts = {
    new: active.filter((order) => order.status === 'new' || order.status === 'payment_pending').length,
    processing: active.filter((order) => order.status === 'preparing' || order.status === 'ready').length
  };
  const baseVisibleOrders =
    queueTab === 'new'
      ? active.filter((order) => order.status === 'new' || order.status === 'payment_pending')
      : active.filter((order) => order.status === 'preparing' || order.status === 'ready');
  const visibleOrders = sortOrders(paidOnly ? baseVisibleOrders.filter((order) => order.payment_confirmed) : baseVisibleOrders)
    .sort((a, b) => timeAsc ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));

  const paidNewOrders = visibleOrders.filter((order) => (order.status === 'new' || order.status === 'payment_pending') && order.payment_confirmed);

  function toggleSelected(orderId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function acceptSelected() {
    const ids = Array.from(selected);
    for (const id of ids) {
      const result = await updateOrderStatus(id, 'preparing');
      if (result.ok) dismissAlarmForOrder(id);
    }
    setSelected(new Set());
  }

  async function rejectSelected() {
    const ids = Array.from(selected);
    for (const id of ids) {
      const result = await updateOrderStatus(id, 'rejected', { rejection_reason: 'Out of stock', refund_pending: true });
      if (result.ok) dismissAlarmForOrder(id);
    }
    setSelected(new Set());
  }

  async function handleCompleted(order) {
    for (const item of order.items || []) {
      const menuItem = menuItems.find((menu) => menu.id === item.menu_item_id || menu.name === item.name);
      await addSoldKg(menuItem?.id || item.menu_item_id, orderItemPortionKg(item, menuItems));
    }
  }

  return (
    <section className="flex h-full flex-col bg-[#f7f1ec]">
      {tabCounts.new > 0 ? (
        <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 bg-[#bc1414] px-5 text-white">
          <div className="flex items-center gap-2 text-[13px] font-black uppercase">
            <AlertTriangle size={17} />
            Alarm: {tabCounts.new} new WhatsApp orders pending acceptance
          </div>
          <button type="button" onClick={() => setQueueTab('new')} className="min-h-8 rounded-sm border border-white px-4 text-[12px] font-black">
            VIEW ALL
          </button>
        </div>
      ) : null}

      <div className="grid min-h-[64px] shrink-0 grid-cols-2 border-b border-[#eadfd7] bg-[#fffaf6] px-4">
        {orderTabs.map((tab) => {
          const activeTab = queueTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setQueueTab(tab.id)}
              className={`relative min-h-[64px] min-w-0 px-2 text-left text-[14px] font-bold ${
                activeTab ? 'text-[#a74608]' : 'text-text-muted hover:text-text-dark'
              }`}
            >
              <span className="block truncate">{tab.label}</span>
              <span className="text-[13px] text-text-dark">{tabCounts[tab.id]}</span>
              {activeTab ? <span className="absolute bottom-0 left-0 h-[3px] w-full rounded-t bg-primary" /> : null}
            </button>
          );
        })}
      </div>

      <div ref={topRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-none lg:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-text-dark">Order Queue <span className="ml-2 rounded-full bg-[#fff0e5] px-2 py-1 text-[12px] text-[#a74608]">{visibleOrders.length} Active</span></h1>
            <p className="mt-1 text-[13px] font-semibold text-text-muted">Accept paid WhatsApp orders, track preparation, and finish pickup.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPaidOnly((value) => !value)} className={`inline-flex min-h-10 items-center gap-2 rounded-sm border border-[#eadfd7] px-3 text-[13px] font-bold ${paidOnly ? 'bg-[#fff0e5] text-[#9a3f00]' : 'bg-white text-text-dark'}`}>
              <Filter size={15} /> {paidOnly ? 'Paid Only' : 'All Payments'}
            </button>
            <button type="button" onClick={() => setTimeAsc((value) => !value)} className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-[#eadfd7] bg-white px-3 text-[13px] font-bold text-text-dark">
              <TimerReset size={15} /> {timeAsc ? 'Time Ascending' : 'Time Descending'}
            </button>
          </div>
        </div>

        {paidNewOrders.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#eadfd7] bg-white px-4 py-3">
            <p className="text-[13px] font-bold text-text-dark">
              {selected.size} selected paid new orders. Bulk action applies only to paid new cards.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={rejectSelected} disabled={!selected.size} className="min-h-9 rounded-sm border border-[#a74608] px-3 text-[12px] font-black text-[#a74608] disabled:border-border disabled:text-text-muted">Reject Selected</button>
              <button type="button" onClick={acceptSelected} disabled={!selected.size} className="min-h-9 rounded-sm bg-primary px-3 text-[12px] font-black text-white disabled:bg-text-muted">Accept Selected</button>
            </div>
          </div>
        ) : null}

        {visibleOrders.length === 0 ? (
          <div className="flex min-h-[380px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#FFE9B8] text-4xl">!</div>
              <h2 className="text-4xl font-black text-[#8B8D99]">No Orders!</h2>
              <p className="mt-2 text-sm font-semibold text-text-muted">New orders will appear here automatically.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                muted={queueTab === 'completed' || queueTab === 'past'}
                onCompleted={handleCompleted}
                selectable={(order.status === 'new' || order.status === 'payment_pending') && order.payment_confirmed}
                selected={selected.has(order.id)}
                onSelectedChange={() => toggleSelected(order.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
