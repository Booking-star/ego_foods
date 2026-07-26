import { Printer, Volume2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAlertStore } from '../store/alertStore';
import { useOrderStore } from '../store/orderStore';
import { alertManager } from '../lib/alertManager';
import { startAlarm } from '../lib/audio';
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

  // Alert settings store
  const {
    alertMode,
    alarmVolume,
    voiceVolume,
    mascotEnabled,
    minimizeNotificationEnabled,
    repeatIntervalSeconds,
    customVoiceSingle,
    customVoicePlural,
    setAlertMode,
    setAlarmVolume,
    setVoiceVolume,
    setMascotEnabled,
    setMinimizeNotificationEnabled,
    setRepeatIntervalSeconds,
    setCustomVoiceSingle,
    setCustomVoicePlural
  } = useAlertStore();

  useEffect(() => {
    window.kitchenOS?.printer?.list?.()
      .then((rows) => setPrinters(rows || []))
      .catch(() => setPrinters([]));
  }, []);

  const handleTestAlarm = () => {
    alertManager.playAudio(alertManager.alarmAudio, alarmVolume);
    setTimeout(() => {
      if (alertManager.alarmAudio) {
        alertManager.alarmAudio.stop();
      }
    }, 3000);
  };

  const handleTestVoice = () => {
    const isDefault = customVoiceSingle === 'Hey Boss! You have got a new order.';
    if (isDefault) {
      alertManager.playAudio(alertManager.voiceSingle, voiceVolume);
    } else {
      alertManager.speakText(customVoiceSingle, voiceVolume);
    }
  };

  const handleCreateDummyOrder = () => {
    const mockOrder = {
      id: `test_${Date.now()}`,
      order_code: `WA-${Math.floor(100 + Math.random() * 900)}`,
      customer_name: 'Dummy Customer',
      customer_phone: '917702449983',
      items: [
        { name: 'Chicken Fry Piece Palav (Regular)', qty: 1, price: 200 }
      ],
      total_amount: 200,
      status: 'new',
      payment_confirmed: true,
      source: 'whatsapp',
      created_at: new Date().toISOString()
    };
    useOrderStore.getState().addOrder(mockOrder);
    startAlarm();
  };

  return (
    <section className="h-full overflow-y-auto bg-transparent p-5 scrollbar-none">
      <header className="mb-5">
        <h1 className="text-xl font-black text-text-dark">Settings & Printing</h1>
        <p className="mt-1 text-[13px] font-semibold text-text-muted">Operational settings used by the desktop app.</p>
      </header>

      <div className="max-w-2xl space-y-6 pb-20">
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

        {/* Voice & Alarm Alert Settings */}
        <div className="rounded-xl border border-[#eadfd7]/60 bg-white/70 backdrop-blur-md p-5 shadow-card">
          <div className="flex items-center gap-2 border-b border-[#f7f1ec] pb-3">
            <Volume2 size={18} className="text-primary" />
            <h2 className="text-base font-black text-text-dark uppercase tracking-wider">Voice & Alarm Alert Settings</h2>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-[11px] font-black uppercase text-text-muted">Order Alert Mode</span>
              <select
                value={alertMode}
                onChange={(e) => setAlertMode(e.target.value)}
                className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark"
              >
                <option value="alarm_voice">Alarm + Voice (Default)</option>
                <option value="alarm_only">Alarm Only</option>
                <option value="voice_only">Voice Only</option>
                <option value="silent">Silent</option>
              </select>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block">
                  <span className="text-[11px] font-black uppercase text-text-muted">Alarm Volume ({Math.round(alarmVolume * 100)}%)</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={alarmVolume}
                    onChange={(e) => setAlarmVolume(parseFloat(e.target.value))}
                    className="mt-2 w-full h-1.5 bg-[#eadfd7] rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-black uppercase text-text-muted">Voice Volume ({Math.round(voiceVolume * 100)}%)</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={voiceVolume}
                    onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                    className="mt-2 w-full h-1.5 bg-[#eadfd7] rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-text-dark select-none">
                <input
                  type="checkbox"
                  checked={mascotEnabled}
                  onChange={(e) => setMascotEnabled(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                />
                <span>Enable Chef Assistant Mascot</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer text-sm font-bold text-text-dark select-none">
                <input
                  type="checkbox"
                  checked={minimizeNotificationEnabled}
                  onChange={(e) => setMinimizeNotificationEnabled(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
                />
                <span>Play Sound When Minimized</span>
              </label>
            </div>

            <div>
              <label className="block">
                <span className="text-[11px] font-black uppercase text-text-muted">Alert Repeat Interval (seconds)</span>
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={repeatIntervalSeconds}
                  onChange={(e) => setRepeatIntervalSeconds(parseInt(e.target.value) || 5)}
                  className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block">
                  <span className="text-[11px] font-black uppercase text-text-muted">Voice Sentence (Single Order)</span>
                  <input
                    type="text"
                    value={customVoiceSingle}
                    onChange={(e) => setCustomVoiceSingle(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                    placeholder="e.g. Hey Boss! You have got a new order."
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-black uppercase text-text-muted">Voice Sentence (Multiple Orders)</span>
                  <input
                    type="text"
                    value={customVoicePlural}
                    onChange={(e) => setCustomVoicePlural(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                    placeholder="e.g. Hey Boss! You have new orders waiting."
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleTestAlarm}
                className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#eadfd7] bg-white text-text-dark text-xs font-black uppercase hover:bg-gray-50 active:scale-95 transition-all"
              >
                Test Alarm Sound
              </button>
              <button
                type="button"
                onClick={handleTestVoice}
                className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 rounded border border-[#eadfd7] bg-white text-text-dark text-xs font-black uppercase hover:bg-gray-50 active:scale-95 transition-all"
              >
                Test Voice Alert
              </button>
              <button
                type="button"
                onClick={handleCreateDummyOrder}
                className="flex-1 inline-flex min-h-10 items-center justify-center gap-2 rounded bg-primary text-white text-xs font-black uppercase hover:bg-primary/95 active:scale-95 transition-all"
              >
                Simulate WA Order
              </button>
            </div>
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

