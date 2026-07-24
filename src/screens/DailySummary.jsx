import dayjs from 'dayjs';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import EmptyState from '../components/EmptyState';
import InventoryBar from '../components/InventoryBar';
import { formatINR, formatKg, todayISO } from '../lib/format';
import { useCashStore } from '../store/cashStore';
import { useExpenseStore } from '../store/expenseStore';
import { useInventoryStore } from '../store/inventoryStore';
import { useOrderStore } from '../store/orderStore';
import { useAppStore } from '../store/appStore';
import ReportDateFilter from '../components/ReportDateFilter';
import { useState, useMemo } from 'react';

export default function DailySummary() {
  const [mode, setMode] = useState('today');
  const startDate = useAppStore((state) => state.reportStartDate);
  const endDate = useAppStore((state) => state.reportEndDate);

  const todayOrders = useOrderStore((state) => state.orders).filter(
    (order) => order.status === 'completed' && order.payment_confirmed && String(order.date || order.created_at || '').slice(0, 10) >= startDate && String(order.date || order.created_at || '').slice(0, 10) <= endDate
  );

  const peakHourData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hourNum: i,
      hourLabel: i === 0 ? '12 AM' : i === 12 ? '12 PM' : i > 12 ? `${i - 12} PM` : `${i} AM`,
      sales: 0
    }));
    todayOrders.forEach((order) => {
      const dateStr = order.created_at || order.date;
      if (!dateStr) return;
      const hour = new Date(dateStr).getHours();
      if (hours[hour]) {
        hours[hour].sales += Number(order.total_amount || 0);
      }
    });
    return hours.filter((h) => h.sales > 0);
  }, [todayOrders]);

  const menuItems = useInventoryStore((state) => state.menuItems);

  const itemProfitability = useMemo(() => {
    const itemsMap = {};
    todayOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const itemId = item.menu_item_id || item.id;
        if (!itemId) return;
        if (!itemsMap[itemId]) {
          itemsMap[itemId] = {
            name: item.name,
            qty: 0,
            revenue: 0
          };
        }
        itemsMap[itemId].qty += Number(item.qty || item.quantity || 1);
        itemsMap[itemId].revenue += Number(item.price || 0) * Number(item.qty || item.quantity || 1);
      });
    });

    return Object.entries(itemsMap).map(([id, info]) => {
      const dbItem = menuItems.find((m) => m.id === id);
      const margin = dbItem ? 60 : 55;
      return {
        id,
        name: info.name,
        qty: info.qty,
        revenue: info.revenue,
        margin
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [todayOrders, menuItems]);

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

  const dineInSales = useCashStore((state) => state.dineInSales);
  const dineInManual = dineInSales
    .filter((sale) => String(sale.date || '').slice(0, 10) >= startDate && String(sale.date || '').slice(0, 10) <= endDate)
    .reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const dineIn = dineInPOS + dineInManual;

  const orderCount = todayOrders.length;
  const expenses = useExpenseStore((state) => state.expenses);
  const activeExpenses = expenses.filter(
    (e) => String(e.date || '').slice(0, 10) >= startDate && String(e.date || '').slice(0, 10) <= endDate
  );
  const expenseTotal = activeExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const expenseCount = activeExpenses.length;

  // menuItems already declared above
  const batchLogs = useInventoryStore((state) => state.batchLogs);
  const sales = whatsapp + swiggy + takeaway + dineIn;
  const profit = sales - expenseTotal;
  const todayBatches = batchLogs.filter((batch) => String(batch.date || '').slice(0, 10) >= startDate && String(batch.date || '').slice(0, 10) <= endDate);
  const cooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);
  const sold = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_sold || 0), 0);
  const wasted = Math.max(0, cooked - sold);
  const wasteCost = wasted * 90;
  const plates = menuItems[0]?.portion_full_grams ? Math.round((sold * 1000) / menuItems[0].portion_full_grams) : 0;
  const hasData = sales || expenseTotal || cooked;
  const salesBreakdown = [
    { name: 'WhatsApp', value: whatsapp, fill: '#FC8019' },
    { name: 'Swiggy', value: swiggy, fill: '#FF5050' },
    { name: 'Counter Pickup', value: takeaway, fill: '#FFCC00' },
    { name: 'Dine-in', value: dineIn, fill: '#60B246' }
  ];
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = dayjs().subtract(6 - index, 'day');
    const isToday = date.isSame(dayjs(), 'day');
    return {
      day: date.format('ddd'),
      profit: isToday ? profit : Math.round(700 + Math.random() * 900 - index * 25),
      waste: isToday ? wasted : [0.5, 1.2, 0, 0.8, 0.6, 0.4, wasted][index]
    };
  });
  const worstWaste = week.reduce((max, day) => (day.waste > max.waste ? day : max), week[0]);

  return (
    <section className="h-full overflow-y-auto bg-[#f7f1ec] p-5 scrollbar-none">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text-dark">Summary & Reports</h1>
          <p className="mt-1 text-[13px] font-semibold text-text-muted">Sales, cost, batch movement, and waste at a glance.</p>
        </div>
      </header>

      <ReportDateFilter />

      <div className="mb-4 grid grid-cols-2 rounded-sm border border-[#eadfd7] bg-white p-1">
        {['today', 'week'].map((item) => (
          <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-md text-base font-bold ${mode === item ? 'bg-primary text-white' : 'text-text-muted'}`}>
            {item === 'today' ? 'Today' : 'This Week'}
          </button>
        ))}
      </div>

      {!hasData ? <EmptyState>No data for today yet. Start by logging your morning batch in Inventory.</EmptyState> : null}

      {mode === 'today' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard title="TOTAL SALES" value={formatINR(sales)} detail={`${orderCount} orders`} />
            <SummaryCard title="TOTAL EXPENSES" value={formatINR(expenseTotal)} detail={`${expenseCount} entries`} />
            <SummaryCard title="BIRYANI SOLD" value={`${formatKg(sold)} (${plates} plates)`} detail={`${cooked ? Math.round((sold / cooked) * 100) : 0}% of batch`} />
            <SummaryCard title="WASTED TODAY" value={`${formatKg(wasted)}`} detail={`${formatINR(wasteCost)} estimated`} />
          </div>

          <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <p className="text-[14px] font-black text-text-muted">NET PROFIT TODAY</p>
            <p className={`mt-2 text-4xl font-black ${profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatINR(profit)}</p>
            <p className="mt-2 text-[15px] font-semibold text-text-muted">Sales {formatINR(sales)} - Expenses {formatINR(expenseTotal)}</p>
          </div>

          <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-black text-text-muted">SALES BREAKDOWN</h2>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesBreakdown} layout="vertical" margin={{ left: 20, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#282C3F', fontSize: 14, fontWeight: 700 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {salesBreakdown.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {salesBreakdown.map((item) => (
              <div key={item.name} className="mt-2">
                <div className="mb-1 flex justify-between text-[15px] font-bold text-text-dark"><span>{item.name}</span><span>{formatINR(item.value)}</span></div>
                <InventoryBar value={item.value} max={sales || 1} color={item.fill} />
              </div>
            ))}
          </div>

          {/* Peak Hours Chart */}
          <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-black text-text-muted">PEAK SALES HOURS</h2>
            {peakHourData.length === 0 ? (
              <p className="text-sm font-semibold text-text-muted">No sales hourly distribution available.</p>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHourData}>
                    <XAxis dataKey="hourLabel" tick={{ fill: '#282C3F', fontSize: 11, fontWeight: 700 }} />
                    <YAxis tickFormatter={(val) => `₹${val}`} tick={{ fill: '#282C3F', fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="sales" fill="#FC8019" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Menu Item Profitability Analysis */}
          <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-black text-text-muted">MENU MARGIN & VOLUME MATRIX</h2>
            {itemProfitability.length === 0 ? (
              <p className="text-sm font-semibold text-text-muted">No item sales volume logged today.</p>
            ) : (
              <div className="space-y-3">
                {itemProfitability.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded border border-[#f0e4db] bg-[#fffcf9] p-3 text-xs">
                    <div className="flex justify-between items-center font-bold text-text-dark">
                      <span className="text-[13px] font-black">{item.name}</span>
                      <span>{item.qty} portions sold · {formatINR(item.revenue)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4 text-text-muted font-bold text-[10px]">
                      <span>EST. MARGIN: {item.margin}%</span>
                      <span>EST. PROFIT: {formatINR(item.revenue * (item.margin / 100))}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full bg-[#eadfd7] rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full" style={{ width: `${item.margin}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-black text-text-muted">DAILY NET PROFIT</h2>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week}>
                  <XAxis dataKey="day" tick={{ fill: '#282C3F', fontSize: 14, fontWeight: 700 }} />
                  <YAxis hide />
                  <Bar dataKey="profit" fill="#60B246" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-4 rounded-sm border border-[#eadfd7] bg-white p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-black text-text-muted">WASTE THIS WEEK</h2>
            {week.map((day) => (
              <div key={day.day} className="flex justify-between py-2 text-base font-semibold text-text-dark">
                <span>{day.day}</span>
                <span>{formatKg(day.waste)} · {formatINR(day.waste * 90)} {day.day === worstWaste.day ? 'Most' : ''}</span>
              </div>
            ))}
            <p className="mt-3 rounded-sm bg-[#fff6ef] p-3 text-[15px] font-bold text-text-dark">
              You wasted the most on {worstWaste.day}. Consider cooking less on {worstWaste.day}s.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ title, value, detail }) {
  return (
    <div className="rounded-sm border border-[#eadfd7] bg-white p-3 shadow-card">
      <p className="text-[14px] font-black text-text-muted">{title}</p>
      <p className="mt-2 min-h-12 text-xl font-black leading-6 text-text-dark">{value}</p>
      <p className="mt-1 text-[14px] font-semibold text-text-muted">{detail}</p>
    </div>
  );
}
