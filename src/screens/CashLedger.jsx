import { Plus } from 'lucide-react';
import { useState } from 'react';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { formatINR, todayISO } from '../lib/format';
import { useCashStore } from '../store/cashStore';
import { useExpenseStore } from '../store/expenseStore';
import { useOrderStore } from '../store/orderStore';

export default function CashLedger() {
  const todayOrders = useOrderStore((state) => state.orders).filter(
    (order) => order.status === 'completed' && order.payment_confirmed && String(order.date || order.created_at || '').slice(0, 10) === todayISO()
  );

  const whatsapp = todayOrders
    .filter((order) => order.source === 'whatsapp')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const swiggy = todayOrders
    .filter((order) => order.source === 'swiggy')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const takeaway = todayOrders
    .filter((order) => order.source === 'counter' && order.order_type === 'takeaway')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const dineInPOS = todayOrders
    .filter((order) => order.source === 'counter' && order.order_type === 'dine_in')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const dineInManual = useCashStore((state) => state.totalToday());
  const dineIn = dineInPOS + dineInManual;

  const addDineInSale = useCashStore((state) => state.addDineInSale);
  const expenses = useExpenseStore((state) => state.expenses);
  const expenseTotal = useExpenseStore((state) => state.totalToday());
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const totalIn = whatsapp + swiggy + takeaway + dineIn;
  const cash = totalIn - expenseTotal;
  const market = expenses.filter((expense) => expense.type === 'market_purchase').reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const other = expenseTotal - market;

  async function save() {
    if (loading || !Number(amount)) return;
    setLoading(true);
    try {
      const result = await addDineInSale({ amount: Number(amount), note });
      if (result.ok) {
        setOpen(false);
        setAmount('');
        setNote('');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="h-full overflow-y-auto bg-[#f7f1ec] p-5 scrollbar-none">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text-dark">Cash Ledger</h1>
          <p className="mt-1 text-[13px] font-semibold text-text-muted">Transparent cash flow from paid orders, counter sales, and expenses.</p>
        </div>
        <span className="rounded-full border border-[#eadfd7] bg-white px-3 py-1 text-[13px] font-bold text-text-muted">Today</span>
      </header>

      {totalIn === 0 && expenseTotal === 0 ? <EmptyState>No sales or expenses recorded today yet.</EmptyState> : null}

      <div className="rounded-sm border border-[#eadfd7] bg-white p-5 text-center shadow-card">
        <p className="text-[14px] font-black text-text-muted">CASH IN HAND RIGHT NOW</p>
        <p className="mt-2 text-4xl font-black text-text-dark">{formatINR(cash)}</p>
        <p className="mt-2 text-[15px] font-semibold text-text-muted">= WhatsApp + Swiggy + Counter Pickup + Dine-in - Expenses</p>
      </div>

      <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-black text-text-muted">TODAY'S FLOW</h2>
        <FlowLine label="WhatsApp Orders" value={whatsapp} />
        <FlowLine label="Swiggy Orders" value={swiggy} />
        <FlowLine label="Counter Pickup" value={takeaway} />
        <FlowLine label="Dine-in Sales" value={dineIn} />
        <FlowLine label="Total In" value={totalIn} strong />
        <div className="my-3 border-t border-border" />
        <FlowLine label="Market Purchases" value={market} />
        <FlowLine label="Other Expenses" value={other} />
        <FlowLine label="Total Out" value={expenseTotal} strong />
        <div className="my-3 border-t-2 border-text-dark" />
        <FlowLine label="Net Cash Today" value={cash} strong />
      </div>

      <button type="button" onClick={() => setOpen(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 text-base font-bold text-white">
        <Plus size={20} /> Add Dine-in Sales
      </button>

      {open ? (
        <Modal
          title="Dine-in Sales Entry"
          onClose={() => setOpen(false)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-sm border border-border font-bold text-text-dark">Cancel</button>
              <button type="button" disabled={loading || !Number(amount)} onClick={save} className="rounded-sm bg-primary px-3 font-bold text-white disabled:bg-text-muted">{loading ? 'Saving...' : 'Save'}</button>
            </div>
          }
        >
          <label className="mb-3 block text-base font-bold text-text-dark">Amount
            <input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-12 w-full rounded-sm border border-border px-3 text-base font-bold" />
          </label>
          <label className="block text-base font-bold text-text-dark">Note
            <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 h-12 w-full rounded-sm border border-border px-3 text-base font-bold" />
          </label>
        </Modal>
      ) : null}
    </section>
  );
}

function FlowLine({ label, value, strong = false }) {
  return (
    <div className={`mt-3 flex items-center justify-between gap-3 ${strong ? 'text-lg font-black text-text-dark' : 'text-base font-semibold text-text-dark'}`}>
      <span>{label}</span>
      <span>{formatINR(value)}</span>
    </div>
  );
}
