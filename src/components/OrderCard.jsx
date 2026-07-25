import { CheckCircle2, ChevronDown, ChevronUp, Image, XCircle, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import Modal from './Modal';
import { STATUS_META } from '../lib/business';
import { formatINR } from '../lib/format';
import { useOrderStore } from '../store/orderStore';
import { useInventoryStore } from '../store/inventoryStore';

const nextAction = {
  new: ['Confirm Payment', 'preparing'],
  payment_pending: ['Confirm Payment', 'preparing'],
  preparing: ['Mark Ready', 'ready'],
  ready: ['Picked Up', 'completed']
};

function Dot({ color }) {
  const map = {
    red: 'bg-danger',
    yellow: 'bg-primary',
    orange: 'bg-primary',
    green: 'bg-success',
    black: 'bg-text-muted'
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[color]}`} />;
}

export default function OrderCard({
  order,
  muted = false,
  onCompleted,
  selectable = false,
  selected = false,
  onSelectedChange
}) {
  const [expanded, setExpanded] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [outOfStockConfirmOpen, setOutOfStockConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
  const dismissAlarmForOrder = useOrderStore((state) => state.dismissAlarmForOrder);
  const alarmOrderIds = useOrderStore((state) => state.alarmOrderIds);
  const viewedScreenshots = useOrderStore((state) => state.viewedScreenshots);
  const markScreenshotViewed = useOrderStore((state) => state.markScreenshotViewed);
  
  const menuItems = useInventoryStore((state) => state.menuItems);

  const meta = STATUS_META[order.status] || STATUS_META.new;
  const action = nextAction[order.status];
  const isPaidNew = (order.status === 'new' || order.status === 'payment_pending') && order.payment_confirmed;

  const [showGlow, setShowGlow] = useState(isPaidNew);

  useEffect(() => {
    if (isPaidNew) {
      const timer = setTimeout(() => {
        setShowGlow(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isPaidNew]);

  const primaryLabel = isPaidNew ? 'Accept' : action?.[0];
  const primaryStatus = isPaidNew ? 'preparing' : action?.[1];
  const ageMinutes = dayjs().diff(dayjs(order.created_at), 'minute');
  const isEscalatedPending = (order.status === 'new' || order.status === 'payment_pending') && order.payment_confirmed && ageMinutes >= 5;
  const isPrepOverrun = order.status === 'preparing' && ageMinutes >= 15;
  const needsScreenshotView = Boolean(order.payment_screenshot_url) && !viewedScreenshots[order.id] && !order.payment_confirmed;
  const isPulsing = alarmOrderIds.has(order.id) || isEscalatedPending || isPrepOverrun;

  // Detect out-of-stock items in the order
  const outOfStockItems = (order.items || []).filter((item) => {
    const menuItem = menuItems.find(
      (m) => m.id === item.menu_item_id || m.name.toLowerCase() === item.name.toLowerCase()
    );
    return menuItem?.available === false;
  });

  async function handleAction(bypassWarning = false) {
    if (loading || !primaryStatus) return;
    if (primaryStatus === 'preparing' && needsScreenshotView) {
      setMessage('View the payment screenshot before confirming payment.');
      return;
    }
    if (primaryStatus === 'preparing' && outOfStockItems.length > 0 && !bypassWarning) {
      setOutOfStockConfirmOpen(true);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const extra = primaryStatus === 'preparing' ? { payment_confirmed: true } : {};
      const result = await updateOrderStatus(order.id, primaryStatus, extra);
      if (!result.ok) setMessage(result.message);
      if (result.ok) dismissAlarmForOrder(order.id);
      if (result.ok && primaryStatus === 'completed') onCompleted?.(result.next);
    } finally {
      setLoading(false);
    }
  }

  async function rejectOrder(reason) {
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const result = await updateOrderStatus(order.id, 'rejected', { rejection_reason: reason, refund_pending: true });
      if (!result.ok) setMessage(result.message);
      else {
        dismissAlarmForOrder(order.id);
        setRejectOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function openScreenshot() {
    markScreenshotViewed(order.id);
    setScreenshotOpen(true);
  }

  return (
    <>
      <motion.article
        layout
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        onClick={() => dismissAlarmForOrder(order.id)}
        className={`relative rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md shadow-card hover:scale-[1.01] hover:shadow-lg transition-all duration-200 ${isPulsing ? 'pulse-danger' : ''} ${muted ? 'opacity-75' : ''} ${showGlow ? 'shadow-[0_0_12px_rgba(242,108,35,0.6)] border-[#f26c23]' : ''}`}
        style={{ borderTop: `4px solid ${meta.border}` }}
      >
        <div className="p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {selectable ? (
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(event) => {
                    event.stopPropagation();
                    onSelectedChange?.();
                  }}
                  className="h-4 w-4 shrink-0 accent-primary"
                  aria-label={`Select order ${order.pickup_code}`}
                />
              ) : null}
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-black ${meta.badgeClass}`}>
                <Dot color={meta.dot} /> {meta.label}
              </span>
            </div>
            <span className="shrink-0 text-[12px] font-bold text-text-dark">
              {dayjs(order.updated_at || order.created_at).format('DD MMM YYYY, h:mm A')}
            </span>
          </div>

          <div className="min-h-[110px]">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-black text-text-dark">{order.customer_name || 'Walk-in Customer'}</p>
                <div className="mt-1.5 space-y-1">
                  <p className="text-[13px] font-bold text-text-muted">
                    Order ID: <span className="font-extrabold text-text-dark">{order.order_code || order.id || 'N/A'}</span>
                  </p>
                  <p className="text-[13px] font-bold text-text-muted">
                    OTP: <span className="font-black text-primary text-base">{order.pickup_otp || order.pickup_code || '----'}</span>
                  </p>
                </div>
              </div>
            </div>

            {outOfStockItems.length > 0 && (
              <div className="mb-2 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded text-[11px] font-black flex items-center gap-1">
                <AlertTriangle size={13} className="shrink-0 animate-bounce text-red-600" />
                <span>OUT OF STOCK ITEM DETECTED</span>
              </div>
            )}
            
            <div className="mt-3 space-y-1 rounded border border-[#f0e4db] bg-[#fffcf9] p-2.5">
              {(order.items || []).length > 0 ? (
                order.items.map((item, idx) => {
                  const isItemOutOfStock = outOfStockItems.some(
                    (o) => o.name === item.name || o.menu_item_id === item.menu_item_id
                  );
                  return (
                    <div key={idx} className={`flex justify-between text-[13px] font-bold ${
                      isItemOutOfStock ? 'text-red-600 line-through bg-red-50/50 px-1 rounded' : 'text-text-dark'
                    }`}>
                      <span>
                        {item.name} {item.variant ? `(${item.variant})` : ''}
                        {isItemOutOfStock && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-black uppercase tracking-wider">
                            Out
                          </span>
                        )}
                      </span>
                      <span className={isItemOutOfStock ? 'text-red-600' : 'text-primary'}>
                        x{item.qty || item.quantity || 1}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="text-[13px] font-semibold text-text-muted">No items listed</p>
              )}
            </div>
            
            <p className="mt-2 text-[12px] font-semibold italic text-text-muted">
              {order.status === 'new' || order.status === 'payment_pending'
                ? 'Payment confirmed. Alarm rings until Accept or Reject.'
                : order.status === 'preparing'
                  ? 'Order is currently being prepared in kitchen.'
                  : order.status === 'ready'
                    ? 'Order is ready for pickup!'
                    : 'Order completed.'}
            </p>
          </div>

          <div className="mt-3 border-t border-[#eadfd7] pt-3">
            <div className="grid grid-cols-2 gap-2">
              {isPaidNew ? (
                <button type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); setRejectOpen((value) => !value); }} className="min-h-11 rounded border border-danger text-[13px] font-black text-danger hover:bg-red-50 disabled:text-text-muted">
                  Reject Order
                </button>
              ) : (
                <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }} className="min-h-11 rounded border border-[#eadfd7] text-[13px] font-black text-text-dark hover:bg-gray-50">
                  {expanded ? 'Collapse' : 'Order Details'}
                </button>
              )}
              {primaryStatus ? (
                <button type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); handleAction(); }} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded bg-success px-3 text-[13px] font-black text-white hover:bg-green-700 disabled:bg-text-muted shadow-sm">
                  <CheckCircle2 size={16} /> {loading ? 'Saving...' : primaryLabel}
                </button>
              ) : order.status === 'preparing' ? (
                <button type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); updateOrderStatus(order.id, 'ready'); }} className="min-h-11 rounded bg-amber-600 px-3 text-[13px] font-black text-white hover:bg-amber-700 shadow-sm">
                  {loading ? 'Saving...' : 'Mark Ready 📦'}
                </button>
              ) : order.status === 'ready' ? (
                <button type="button" disabled={loading} onClick={(event) => { event.stopPropagation(); updateOrderStatus(order.id, 'completed').then(() => onCompleted?.(order)); }} className="min-h-11 rounded bg-emerald-600 px-3 text-[13px] font-black text-white hover:bg-emerald-700 shadow-sm">
                  {loading ? 'Saving...' : 'Mark Picked Up ✅'}
                </button>
              ) : (
                <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }} className="min-h-11 rounded bg-[#f7f1ec] px-3 text-[13px] font-black text-text-dark">
                  View
                </button>
              )}
            </div>
            {rejectOpen ? (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-sm bg-[#fff6ef] p-2">
                <button type="button" onClick={(event) => { event.stopPropagation(); rejectOrder('Out of stock'); }} className="min-h-9 rounded-sm border border-[#eadfd7] text-[12px] font-bold text-danger">
                  Out of stock
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); rejectOrder('Kitchen closed'); }} className="min-h-9 rounded-sm border border-[#eadfd7] text-[12px] font-bold text-danger">
                  Kitchen closed
                </button>
              </div>
            ) : null}
            <button type="button" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }} className="mt-2 flex min-h-9 w-full items-center justify-center gap-1 rounded-sm text-[12px] font-bold text-text-muted">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {expanded ? 'Hide full order' : 'Expand full order'}
            </button>
            {message ? <p className="mt-2 text-[12px] font-bold text-danger">{message}</p> : null}
          </div>
        </div>

        {expanded ? (
          <div className="border-t border-[#eadfd7] px-3 pb-3 pt-3">
            <div className="space-y-2">
              <p className="text-[13px] font-black uppercase text-text-muted">Items</p>
              {(order.items || []).map((item, index) => {
                const isItemOutOfStock = outOfStockItems.some(
                  (o) => o.name === item.name || o.menu_item_id === item.menu_item_id
                );
                return (
                  <div key={`${item.name}-${index}`} className={`flex justify-between gap-3 text-[14px] ${
                    isItemOutOfStock ? 'text-red-600 line-through bg-red-50/50 px-1 rounded' : 'text-text-dark'
                  }`}>
                    <span>
                      {item.name} {item.variant} x{item.qty || item.quantity || 1}
                      {isItemOutOfStock && (
                        <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-black uppercase tracking-wider">
                          Out
                        </span>
                      )}
                    </span>
                    <span className="font-semibold">{formatINR(Number(item.price || 0) * Number(item.qty || item.quantity || 1))}</span>
                  </div>
                );
              })}
              <div className="flex justify-between border-t border-[#eadfd7] pt-2 text-base font-bold">
                <span>Total</span>
                <span>{formatINR(order.total_amount || order.total || 0)}</span>
              </div>
              <div className="rounded-sm bg-[#fff6ef] p-3">
                <p className="text-[12px] font-black uppercase text-text-muted">Pickup Code</p>
                <p className="mt-1 text-3xl font-black text-text-dark">{order.pickup_code}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {order.payment_screenshot_url ? (
                <button type="button" onClick={openScreenshot} className="inline-flex items-center justify-center gap-2 rounded-sm border border-[#eadfd7] bg-bg text-base font-bold text-text-dark">
                  <Image size={20} /> View Screenshot
                </button>
              ) : null}
              {primaryStatus ? (
                <button type="button" disabled={loading} onClick={handleAction} className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-text-muted">
                  <CheckCircle2 size={20} /> {loading ? 'Saving...' : primaryLabel}
                </button>
              ) : null}
              {isPaidNew ? (
                <button type="button" disabled={loading} onClick={() => setRejectOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-sm border border-danger px-4 text-base font-bold text-danger disabled:text-text-muted">
                  <XCircle size={20} /> Reject Order
                </button>
              ) : null}
              <p className="text-[14px] font-medium text-text-muted">Created {dayjs(order.created_at).format('D MMM, h:mm A')}</p>
            </div>
          </div>
        ) : null}
      </motion.article>

      {screenshotOpen ? (
        <Modal
          title="Payment Screenshot"
          onClose={() => setScreenshotOpen(false)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setScreenshotOpen(false)} className="rounded-sm border border-border font-bold text-text-dark">
                Close
              </button>
              <button type="button" disabled={loading} onClick={handleAction} className="rounded-sm bg-primary px-3 font-bold text-white disabled:bg-text-muted">
                Confirm Payment
              </button>
            </div>
          }
        >
          <img src={order.payment_screenshot_url} alt="Payment screenshot" className="max-h-[58vh] w-full rounded-sm object-contain" />
        </Modal>
      ) : null}

      {outOfStockConfirmOpen && (
        <Modal
          title="Out of Stock Items in WhatsApp Order"
          onClose={() => setOutOfStockConfirmOpen(false)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutOfStockConfirmOpen(false)}
                className="rounded border border-[#eadfd7] bg-white text-xs font-black uppercase text-text-dark hover:bg-gray-50 h-10 font-bold"
              >
                Go Back & Contact
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setOutOfStockConfirmOpen(false);
                  handleAction(true);
                }}
                className="rounded bg-success text-xs font-black uppercase text-white hover:bg-green-700 h-10 font-bold"
              >
                Accept Anyway
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-center p-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mx-auto animate-pulse">
              <AlertTriangle size={24} />
            </span>
            <div>
              <h4 className="text-sm font-black text-text-dark uppercase">Out of Stock Detected</h4>
              <p className="text-xs text-text-muted mt-1">
                This order contains items that are currently marked as Out of Stock in the database:
              </p>
            </div>

            <div className="bg-red-50 border border-red-100 rounded p-3 text-left space-y-1.5">
              {outOfStockItems.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-bold text-red-800">
                  <span>{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                  <span>Qty: {item.qty || item.quantity || 1}</span>
                </div>
              ))}
            </div>

            <div className="rounded bg-[#fffcf9] p-3 text-xs font-bold text-text-dark border border-[#f0e4db] text-left">
              <p className="text-[10px] text-text-muted uppercase">Customer Details</p>
              <p className="mt-1 text-sm font-black">{order.customer_name || 'WhatsApp Customer'}</p>
              {order.customer_phone && <p className="mt-0.5 text-primary">Phone/WhatsApp: {order.customer_phone}</p>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
