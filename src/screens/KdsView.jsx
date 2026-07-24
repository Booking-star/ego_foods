import { useEffect, useState, useMemo } from 'react';
import { ChefHat, CheckCircle2, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import { useOrderStore } from '../store/orderStore';

export default function KdsView() {
  const orders = useOrderStore((state) => state.orders);
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const [currentTime, setCurrentTime] = useState(dayjs());

  // Update timers every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(dayjs());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter only active preparing orders
  const preparingOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === 'preparing')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [orders]);

  async function handleMarkReady(orderId) {
    try {
      const res = await updateOrderStatus(orderId, 'ready');
      if (!res.ok) alert(res.message || 'Failed to update order.');
    } catch (err) {
      console.error(err);
      alert('Failed to mark order as ready.');
    }
  }

  return (
    <section className="flex h-full flex-col bg-[#f7f1ec] text-text-dark p-5 overflow-hidden">
      <header className="mb-6 flex shrink-0 justify-between items-center border-b border-[#eadfd7] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30">
            <ChefHat size={28} />
          </span>
          <div>
            <h1 className="text-xl font-black uppercase tracking-wider">Kitchen Display System (KDS)</h1>
            <p className="text-xs font-semibold text-text-muted">Active Prep Queue: <b>{preparingOrders.length}</b> orders cooking</p>
          </div>
        </div>
        <div className="text-right text-xs font-bold text-text-muted">
          Current time: <b className="text-text-dark text-sm">{currentTime.format('h:mm A')}</b>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {preparingOrders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-20 bg-white border border-[#eadfd7] rounded-xl">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-secondary border border-[#eadfd7] text-4xl mb-4">🍳</div>
            <h2 className="text-2xl font-black text-text-muted uppercase tracking-widest">Kitchen Clean!</h2>
            <p className="mt-2 text-sm font-semibold text-text-muted">All orders have been prepared and cleared.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {preparingOrders.map((order) => {
              const elapsedMins = currentTime.diff(dayjs(order.created_at), 'minute');
              const isOverrun = elapsedMins >= 15;
              const sourceLabel = order.source === 'swiggy' ? 'Swiggy' : order.source === 'counter' ? 'Counter' : 'WhatsApp';

              return (
                <div
                  key={order.id}
                  className={`flex flex-col rounded-xl border bg-white shadow-card transition-all ${
                    isOverrun
                      ? 'border-red-600 ring-2 ring-red-600/40 bg-red-50/50 animate-pulse'
                      : 'border-[#eadfd7] hover:border-[#dcd0c5]'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3 border-b border-[#eadfd7] flex justify-between items-start gap-2 bg-[#fffaf6] rounded-t-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-primary uppercase tracking-wider truncate">
                        {order.customer_name || 'Counter Order'}
                      </p>
                      <p className="text-[10px] font-bold text-text-muted uppercase mt-0.5">
                        Code: <span className="font-extrabold text-text-dark text-[11px]">{order.pickup_otp || order.pickup_code || 'N/A'}</span>
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase border ${
                      order.source === 'swiggy'
                        ? 'bg-[#fc8019]/10 border-[#fc8019]/30 text-[#fc8019]'
                        : order.source === 'counter'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        : 'bg-green-500/10 border-green-500/30 text-green-400'
                    }`}>
                      {sourceLabel}
                    </span>
                  </div>

                  {/* Timer Badge */}
                  <div className="px-3 pt-2 flex items-center gap-1">
                    {isOverrun ? (
                      <span className="flex h-2 w-2 rounded-full bg-red-600 animate-ping shrink-0" />
                    ) : (
                      <Clock size={11} className="text-text-muted shrink-0" />
                    )}
                    <span className={`text-[11px] font-black uppercase ${
                      isOverrun ? 'text-red-500' : 'text-text-muted'
                    }`}>
                      Elapsed: {elapsedMins} mins {isOverrun && ' (DELAYED)'}
                    </span>
                  </div>

                  {/* Items List */}
                  <div className="p-3 flex-1 space-y-2">
                    {(order.items || []).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-2 text-sm font-extrabold">
                        <span className="text-text-dark leading-5">
                          {item.name} {item.variant ? `(${item.variant})` : ''}
                        </span>
                        <span className="text-primary text-base font-black px-1.5 py-0.5 rounded bg-primary/10 shrink-0">
                          x{item.qty || item.quantity || 1}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Complete Button */}
                  <div className="p-3 border-t border-[#eadfd7] bg-bg-secondary rounded-b-xl">
                    <button
                      type="button"
                      onClick={() => handleMarkReady(order.id)}
                      className="w-full flex justify-center items-center gap-1.5 h-10 rounded-lg bg-green-600 hover:bg-green-700 text-xs font-black uppercase text-white transition-all active:scale-95 shadow-md"
                    >
                      <CheckCircle2 size={14} /> Cooked / Ready 📦
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
