import { Printer } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useEffect, useState } from 'react';

const ALL_TABS = [
  { id: 'orders', label: 'Orders Queue' },
  { id: 'counter', label: 'Counter Sales' },
  { id: 'kds', label: 'Kitchen KDS' },
  { id: 'menu', label: 'Menu & Recipes' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'swiggy', label: 'Swiggy Import' },
  { id: 'sales', label: 'Sales & Cash' },
  { id: 'summary', label: 'Summary / Reports' },
  { id: 'expenses', label: 'Expenses Log' }
];

export default function SettingsScreen() {
  const printerOnline = useAppStore((state) => state.printerOnline);
  const setPrinterOnline = useAppStore((state) => state.setPrinterOnline);
  const customerPrinterName = useAppStore((state) => state.customerPrinterName);
  const setCustomerPrinterName = useAppStore((state) => state.setCustomerPrinterName);
  const kitchenPrinterName = useAppStore((state) => state.kitchenPrinterName);
  const setKitchenPrinterName = useAppStore((state) => state.setKitchenPrinterName);
  const hiddenTabs = useAppStore((state) => state.hiddenTabs);
  const toggleTabVisibility = useAppStore((state) => state.toggleTabVisibility);
  const [printers, setPrinters] = useState([]);

  useEffect(() => {
    window.kitchenOS?.printer?.list?.()
      .then((rows) => setPrinters(rows || []))
      .catch(() => setPrinters([]));
  }, []);

  return (
    <section className="h-full overflow-y-auto bg-transparent p-5 scrollbar-none">
      <header className="mb-5">
        <h1 className="text-xl font-black text-text-dark">Settings & Printing</h1>
        <p className="mt-1 text-[13px] font-semibold text-text-muted">Operational settings used by the desktop app.</p>
      </header>

      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md p-5 shadow-card">
          <div className="flex items-center gap-2 border-b border-[#f7f1ec] pb-3">
            <Printer size={18} className="text-primary" />
            <h2 className="text-base font-black text-text-dark uppercase tracking-wider">Printer Settings</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-[11px] font-black uppercase text-text-muted">Customer Receipt Printer</span>
              <select
                value={customerPrinterName}
                onChange={(event) => setCustomerPrinterName(event.target.value)}
                className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark"
              >
                {printers.length ? printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>{printer.name}</option>
                )) : <option value={customerPrinterName}>{customerPrinterName}</option>}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-black uppercase text-text-muted">Kitchen Order Ticket (KOT) Printer</span>
              <select
                value={kitchenPrinterName}
                onChange={(event) => setKitchenPrinterName(event.target.value)}
                className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark"
              >
                {printers.length ? printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>{printer.name}</option>
                )) : <option value={kitchenPrinterName}>{kitchenPrinterName}</option>}
              </select>
            </label>

            <p className="text-[11px] font-semibold text-text-muted">If both select the same printer, copies print together on that device.</p>

            <button
              type="button"
              onClick={() => setPrinterOnline(!printerOnline)}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded px-4 text-xs font-black uppercase text-white transition-all ${
                printerOnline ? 'bg-success hover:bg-green-700' : 'bg-danger hover:bg-red-700'
              }`}
            >
              Printer Status: {printerOnline ? 'Online (OK)' : 'Offline (Warning Active)'}
            </button>
          </div>
        </div>

        {/* Tab Visibility Settings */}
        <div className="rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md p-5 shadow-card">
          <div className="flex items-center gap-2 border-b border-[#f7f1ec] pb-3">
            <h2 className="text-base font-black text-text-dark uppercase tracking-wider">Tab Visibility Settings</h2>
          </div>
          <p className="mt-3 text-xs font-semibold text-text-muted">Configure which sidebar tabs are visible on this terminal:</p>
          
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ALL_TABS.map((tabItem) => {
              const isVisible = !hiddenTabs.includes(tabItem.id);
              return (
                <label key={tabItem.id} className="flex items-center gap-3 cursor-pointer text-sm font-bold text-text-dark select-none">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => toggleTabVisibility(tabItem.id)}
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                  />
                  <span>{tabItem.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
