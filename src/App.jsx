import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Boxes,
  ChartColumn,
  CircleHelp,
  ClipboardList,
  Clock3,
  IndianRupee,
  Menu as MenuIcon,
  ReceiptText,
  ShoppingBag,
  Settings,
  Store,
  UtensilsCrossed,
  Wifi,
  ChefHat,
  Pin
} from 'lucide-react';
import { unlockAudio } from './lib/audio';
import { applyExternalMappingsToOrders, orderPortionKgByMenu } from './lib/business';
import { fetchKitchenOrders, fetchKitchenSettings, hasKitchenApi, updateKitchenSettings } from './lib/kitchenApi';
import { importSwiggyNow, onSwiggyProgress } from './lib/swiggyBridge';
import { subscribeToOrders, supabase } from './lib/supabase';
import { useAppStore } from './store/appStore';
import { alertManager } from './lib/alertManager';
import { useAlertStore } from './store/alertStore';
import MascotAssistant from './components/MascotAssistant';
import PremiumToasts from './components/PremiumToasts';
import { useCashStore } from './store/cashStore';
import { useExpenseStore } from './store/expenseStore';
import { sampleBatchLogs, sampleIngredients, sampleMenuItems, sampleRecipes, samplePortions } from './lib/sampleData';
import { useInventoryStore } from './store/inventoryStore';
import { useOrderStore } from './store/orderStore';
import CashLedger from './screens/CashLedger';
import CompletedSales from './screens/CompletedSales';
import DailySummary from './screens/DailySummary';
import ExpenseLog from './screens/ExpenseLog';
import Inventory from './screens/Inventory';
import MenuSetup from './screens/MenuSetup';
import OrderQueue from './screens/OrderQueue';
import SwiggyImportPanel from './components/SwiggyImportPanel';
import CounterSales from './screens/CounterSales';
import SettingsScreen from './screens/SettingsScreen';
import LicenseGate from './components/LicenseGate';
import { licenseStatus, unlockLicense } from './lib/license';
import KdsView from './screens/KdsView';

const screens = {
  orders: OrderQueue,
  counter: CounterSales,
  kds: KdsView,
  sales: CompletedSales,
  inventory: Inventory,
  swiggy: SwiggyImportPanel,
  expenses: ExpenseLog,
  cash: CashLedger,
  summary: DailySummary,
  menu: MenuSetup,
  settings: SettingsScreen
};

const navItems = [
  { id: 'orders', label: 'Orders', icon: ClipboardList, roles: ['owner', 'waiter'] },
  { id: 'counter', label: 'Counter Sales', icon: Store, roles: ['owner', 'waiter'] },
  { id: 'kds', label: 'Kitchen KDS', icon: ChefHat, roles: ['owner', 'waiter'] },
  { id: 'menu', label: 'Menu & Recipes', icon: UtensilsCrossed, roles: ['owner'] },
  { id: 'inventory', label: 'Inventory', icon: Boxes, roles: ['owner'] },
  { id: 'swiggy', label: 'Swiggy Import', icon: Wifi, roles: ['owner'] },
  { id: 'sales', label: 'Sales & Cash', icon: ShoppingBag, roles: ['owner'] },
  { id: 'summary', label: 'Summary', icon: ChartColumn, roles: ['owner'] },
  { id: 'expenses', label: 'Expenses', icon: ReceiptText, roles: ['owner'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['owner'] }
];

const titleByTab = {
  orders: 'MANAGE ORDERS',
  counter: 'COUNTER SALES',
  kds: 'KITCHEN KDS',
  sales: 'COMPLETED SALES',
  inventory: 'INVENTORY',
  swiggy: 'SWIGGY IMPORT',
  expenses: 'EXPENSES',
  cash: 'CASH LEDGER',
  summary: 'SUMMARY',
  menu: 'MENU & RECIPES',
  settings: 'SETTINGS'
};

const closedMessage = 'Orders are currently not being taken. If we resume in some time, we will update you.';

export default function App() {
  const isElectron = typeof window !== 'undefined' && (Boolean(window.kitchenOS) || navigator.userAgent.toLowerCase().includes('electron'));
  const tab = useAppStore((state) => state.tab);
  const setTab = useAppStore((state) => state.setTab);
  const whatsappOpen = useAppStore((state) => state.whatsappOpen);
  const hiddenTabs = useAppStore((state) => state.hiddenTabs);
  const [currentUser, setCurrentUser] = useState(() => {
    return localStorage.getItem('kitchen-os.user-role') || null;
  });
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    return localStorage.getItem('kitchen-os.sidebar-pinned') === 'true';
  });
  const toggleSidebarPinned = () => {
    setIsSidebarPinned((prev) => {
      const next = !prev;
      localStorage.setItem('kitchen-os.sidebar-pinned', String(next));
      return next;
    });
  };

  useEffect(() => {
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);
  const setWhatsappOpen = useAppStore((state) => state.setWhatsappOpen);
  const printerOnline = useAppStore((state) => state.printerOnline);
  const setPrinterOnline = useAppStore((state) => state.setPrinterOnline);
  const setTableCount = useAppStore((state) => state.setTableCount);
  const activeCount = useOrderStore((state) => state.activeCount());
  const addOrder = useOrderStore((state) => state.addOrder);
  const upsertOrder = useOrderStore((state) => state.upsertOrder);
  const setOrders = useOrderStore((state) => state.setOrders);
  const mergeImportedOrders = useOrderStore((state) => state.mergeImportedOrders);
  const setInventory = useInventoryStore((state) => state.setAll);
  const addSoldKg = useInventoryStore((state) => state.addSoldKg);
  const [swiggyImporting, setSwiggyImporting] = useState(false);
  const [swiggyProgress, setSwiggyProgress] = useState(null);
  const [notice, setNotice] = useState('');
  const [license, setLicense] = useState(() => licenseStatus());
  const [remoteLicense, setRemoteLicense] = useState({ active: true, message: '' });
  const kitchenSynced = useRef(false);
  const Screen = screens[tab] || MenuSetup;

  async function importFromSwiggy() {
    if (swiggyImporting) return;
    setSwiggyImporting(true);
    setSwiggyProgress({ percent: 3, message: 'Starting Swiggy import...' });
    try {
      const result = await importSwiggyNow({ visible: true });
      if (result.importedOrders) mergeImportedOrders(applySwiggyMappings(result.importedOrders));
      setNotice(result.ok ? 'Swiggy import complete.' : result.status || 'Swiggy import needs attention.');
    } catch {
      setTab('swiggy');
      setNotice('Open Swiggy Import to configure credentials and restaurant ID.');
    } finally {
      setSwiggyImporting(false);
      setTimeout(() => setSwiggyProgress(null), 5000);
    }
  }

  async function toggleWhatsappOpen() {
    const next = !whatsappOpen;
    setWhatsappOpen(next);
    if (!hasKitchenApi) return;
    try {
      const settings = await updateKitchenSettings({ is_open: next, closed_message: closedMessage });
      setWhatsappOpen(Boolean(settings.is_open));
      setNotice(settings.is_open ? 'WhatsApp orders are open.' : 'WhatsApp orders are paused.');
    } catch {
      setWhatsappOpen(!next);
      setNotice('Could not update WhatsApp open status.');
    }
  }

  useEffect(() => {
    const unsubscribe = onSwiggyProgress((progress) => {
      setSwiggyProgress(progress);
      if (progress.done) setNotice(progress.message);
    });

    async function loadKitchenOrders() {
      if (!hasKitchenApi) return;
      const orders = await fetchKitchenOrders();
      if (kitchenSynced.current) {
        const known = new Set(useOrderStore.getState().orders.map((order) => order.id));
        const newPaid = orders.filter((order) => order.status === 'new' && order.payment_confirmed && !known.has(order.id));
        for (const order of newPaid) addOrder(order);
        if (newPaid.length) {
          startAlarm();
          requestAnimationFrame(() => document.querySelector('[data-app-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' }));
        }
      }
      kitchenSynced.current = true;
      setOrders(orders);
    }

    async function loadSupabaseData() {
      if (window.kitchenOS?.swiggy) {
        const payload = await window.kitchenOS.swiggy.getSettings();
        mergeImportedOrders(applySwiggyMappings(payload.importedOrders || []));
      }
      if (hasKitchenApi) {
        fetchKitchenSettings()
          .then((settings) => {
            setWhatsappOpen(Boolean(settings.is_open));
            setRemoteLicense(settings.license || { active: true, message: '' });
            if (!supabase && Array.isArray(settings.menu_items) && settings.menu_items.length > 0) {
              useInventoryStore.setState({ menuItems: settings.menu_items });
            }
          })
          .catch(() => {});
      }
      loadKitchenOrders().catch(() => setNotice('WhatsApp order sync is not reachable.'));
      if (!supabase) {
        setNotice('Supabase client is not initialized.');
        return;
      }
      try {
        const [orders, menuItems, ingredients, recipes, batchLogs, expenses, dineInSales, portions, settings, menuItemComponents, recipeComponents] = await Promise.all([
          supabase.from('orders').select('*').order('created_at', { ascending: false }),
          supabase.from('menu_items').select('*').order('sort_order', { ascending: true }),
          supabase.from('ingredients').select('*').order('created_at', { ascending: true }),
          supabase.from('recipes').select('*'),
          supabase.from('batch_logs').select('*').order('logged_at', { ascending: false }),
          supabase.from('expenses').select('*').order('logged_at', { ascending: false }),
          supabase.from('dinein_sales').select('*').order('logged_at', { ascending: false }),
          supabase.from('portions').select('*'),
          supabase.from('restaurant_settings').select('table_count').limit(1).maybeSingle(),
          supabase.from('menu_item_components').select('*'),
          supabase.from('recipe_components').select('*')
        ]);
        
        if (orders.error) {
          console.error('Supabase orders load error:', orders.error.message);
          window.kitchenOS?.logToFile('Supabase orders error: ' + orders.error.message);
        }
        if (menuItems.error) {
          console.error('Supabase menuItems load error:', menuItems.error.message);
          window.kitchenOS?.logToFile('Supabase menuItems error: ' + menuItems.error.message);
        }
        if (ingredients.error) {
          console.error('Supabase ingredients load error:', ingredients.error.message);
          window.kitchenOS?.logToFile('Supabase ingredients error: ' + ingredients.error.message);
        }
        if (recipes.error) {
          console.error('Supabase recipes load error:', recipes.error.message);
          window.kitchenOS?.logToFile('Supabase recipes error: ' + recipes.error.message);
        }
        if (batchLogs.error) {
          console.error('Supabase batchLogs load error:', batchLogs.error.message);
          window.kitchenOS?.logToFile('Supabase batchLogs error: ' + batchLogs.error.message);
        }
        if (expenses.error) {
          console.error('Supabase expenses load error:', expenses.error.message);
          window.kitchenOS?.logToFile('Supabase expenses error: ' + expenses.error.message);
        }
        if (dineInSales.error) {
          console.error('Supabase dineInSales load error:', dineInSales.error.message);
          window.kitchenOS?.logToFile('Supabase dineInSales error: ' + dineInSales.error.message);
        }
        if (portions.error) {
          console.error('Supabase portions load error:', portions.error.message);
          window.kitchenOS?.logToFile('Supabase portions error: ' + portions.error.message);
        }

        window.kitchenOS?.logToFile(`Load Complete. menuItems count: ${menuItems.data?.length}, portions count: ${portions.data?.length}`);

        if (!orders.error && orders.data?.length) {
          setOrders(orders.data);
          // Catch up on any completed orders that haven't deducted stock yet
          const pendingDeductions = orders.data.filter(o => o.status === 'completed' && !o.stock_deducted);
          for (const order of pendingDeductions) {
            useOrderStore.getState().deductRecipesForOrder(order);
          }
        }
        if (!menuItems.error && !ingredients.error && !recipes.error && !batchLogs.error && !portions.error) {
          setInventory({
            menuItems: menuItems.data?.length ? menuItems.data : sampleMenuItems,
            ingredients: ingredients.data?.length ? ingredients.data : sampleIngredients,
            recipes: recipes.data?.length ? recipes.data : sampleRecipes,
            batchLogs: batchLogs.data?.length ? batchLogs.data : sampleBatchLogs,
            portions: (portions.data && portions.data.length > 0) ? portions.data : samplePortions,
            menuItemComponents: menuItemComponents.data || [],
            recipeComponents: recipeComponents.data || []
          });
        }
        if (!expenses.error && expenses.data) useExpenseStore.setState({ expenses: expenses.data });
        if (!dineInSales.error && dineInSales.data) useCashStore.setState({ dineInSales: dineInSales.data });
        if (!settings.error && settings.data?.table_count) {
          setTableCount(settings.data.table_count);
        }
      } catch (err) {
        window.kitchenOS?.logToFile('Exception in loadSupabaseData: ' + (err instanceof Error ? err.message : String(err)));
        console.error('Failed to load database data:', err);
        setNotice('DB error: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    loadSupabaseData();
    alertManager.initialize();
    
    const kitchenPoll = hasKitchenApi
      ? setInterval(() => {
          loadKitchenOrders().catch(() => {});
        }, 10000)
      : null;
    const unsubscribeOrders = subscribeToOrders({
      onInsert: (order) => {
        addOrder(order);
        if (order.status === 'completed') {
          useOrderStore.getState().deductRecipesForOrder(order);
        } else {
          requestAnimationFrame(() => document.querySelector('[data-app-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' }));
        }
      },
      onUpdate: (order, oldOrder) => {
        upsertOrder(order);
        if (order.status === 'completed' && oldOrder?.status !== 'completed') {
          useOrderStore.getState().deductRecipesForOrder(order);
        }
      }
    });

    const channelSettings = supabase
      .channel('settings-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings' }, (payload) => {
        if (payload.new && payload.new.table_count !== undefined) {
          setTableCount(payload.new.table_count);
        }
      })
      .subscribe();

    const channelMenuItems = supabase
      .channel('menu-items-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
        const currentMenuItems = useInventoryStore.getState().menuItems;
        if (payload.eventType === 'UPDATE') {
          const updated = currentMenuItems.map((item) =>
            item.id === payload.new.id ? { ...item, ...payload.new } : item
          );
          useInventoryStore.setState({ menuItems: updated });
        } else if (payload.eventType === 'INSERT') {
          useInventoryStore.setState({ menuItems: [...currentMenuItems, payload.new] });
        } else if (payload.eventType === 'DELETE') {
          const updated = currentMenuItems.filter((item) => item.id !== payload.old.id);
          useInventoryStore.setState({ menuItems: updated });
        }
      })
      .subscribe();

    const channelPortions = supabase
      .channel('portions-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portions' }, (payload) => {
        const currentPortions = useInventoryStore.getState().portions;
        if (payload.eventType === 'INSERT') {
          useInventoryStore.setState({ portions: [...currentPortions, payload.new] });
        } else if (payload.eventType === 'UPDATE') {
          const updated = currentPortions.map((p) =>
            p.id === payload.new.id ? { ...p, ...payload.new } : p
          );
          useInventoryStore.setState({ portions: updated });
        } else if (payload.eventType === 'DELETE') {
          const updated = currentPortions.filter((p) => p.id !== payload.old.id);
          useInventoryStore.setState({ portions: updated });
        }
      })
      .subscribe();

    const channelIngredients = supabase
      .channel('ingredients-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, (payload) => {
        const currentIngredients = useInventoryStore.getState().ingredients;
        if (payload.eventType === 'INSERT') {
          useInventoryStore.setState({ ingredients: [...currentIngredients, payload.new] });
        } else if (payload.eventType === 'UPDATE') {
          const updated = currentIngredients.map((i) =>
            i.id === payload.new.id ? { ...i, ...payload.new } : i
          );
          useInventoryStore.setState({ ingredients: updated });
        } else if (payload.eventType === 'DELETE') {
          const updated = currentIngredients.filter((i) => i.id !== payload.old.id);
          useInventoryStore.setState({ ingredients: updated });
        }
      })
      .subscribe();

    return () => {
      if (kitchenPoll) clearInterval(kitchenPoll);
      unsubscribeOrders();
      unsubscribe();
      supabase.removeChannel(channelSettings);
      supabase.removeChannel(channelMenuItems);
      supabase.removeChannel(channelPortions);
      supabase.removeChannel(channelIngredients);
    };
  }, [addOrder, addSoldKg, mergeImportedOrders, setInventory, setOrders, upsertOrder, setTableCount]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);

  if (!license.ok || remoteLicense.active === false) {
    return (
      <LicenseGate
        status={license}
        remoteLicense={remoteLicense}
        onUnlock={(password) => {
          const result = unlockLicense(password);
          if (result.ok) setLicense(result.status);
          return result;
        }}
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={(role) => {
          setCurrentUser(role);
          localStorage.setItem('kitchen-os.user-role', role);
          if (role === 'waiter') {
            setTab('counter');
          } else {
            setTab('orders');
          }
        }}
      />
    );
  }

  return (
    <div className="flex h-screen min-h-[680px] w-screen overflow-y-auto overflow-x-hidden bg-gradient-to-br from-[#fdfcfb] via-[#f5ede6] to-[#eeddd0] text-text-dark" data-app-scroll>
      {/* Edge trigger zone for auto-hide hover reveal */}
      {!isSidebarPinned && (
        <div
          className="fixed left-0 top-0 bottom-0 w-3 z-40 bg-transparent cursor-w-resize"
          onMouseEnter={() => setIsSidebarVisible(true)}
        />
      )}

      <aside
        className={`flex h-full flex-col bg-white/70 backdrop-blur-md text-[#4b2b19] scrollbar-none transition-all duration-300 ease-in-out shrink-0 z-50 overflow-hidden md:relative fixed left-0 top-0 max-md:shadow-2xl ${
          isSidebarPinned || isSidebarVisible
            ? 'w-[164px] max-[860px]:w-[82px] border-r border-[#eadfd7]'
            : 'w-0 border-r-0'
        }`}
        onMouseEnter={() => setIsSidebarVisible(true)}
        onMouseLeave={() => setIsSidebarVisible(false)}
      >
        <div className="w-[164px] max-[860px]:w-[82px] flex flex-col h-full shrink-0">
          <div className="flex h-[74px] shrink-0 items-center justify-between border-b border-[#eadfd7] px-3.5 text-left max-[860px]:justify-center max-[860px]:px-2">
            <button
              type="button"
              onClick={() => setTab('orders')}
              className="flex items-center gap-2 text-left"
              aria-label="Kitchen OS home"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#eadfd7] bg-white shadow-card">
                <img src="ego-foods-logo.jpg" alt="Ego Foods logo" className="h-full w-full object-cover" />
              </span>
              <span className="text-[13px] font-black leading-4 max-[860px]:hidden">EGO FOODS</span>
            </button>
            <button
              type="button"
              onClick={toggleSidebarPinned}
              title={isSidebarPinned ? 'Unpin Sidebar (Enable Auto-Hide)' : 'Pin Sidebar (Keep Open)'}
              className={`flex h-6 w-6 items-center justify-center rounded hover:bg-[#fff4eb] text-text-muted hover:text-primary transition-colors max-[860px]:hidden shrink-0 ${
                isSidebarPinned ? 'text-primary' : ''
              }`}
            >
              <Pin size={13} className={isSidebarPinned ? 'rotate-45 fill-current' : ''} />
            </button>
          </div>

          <nav className="flex w-full flex-1 flex-col gap-1 px-2 py-4 overflow-y-auto scrollbar-none">
            {navItems
              .filter((item) => item.roles.includes(currentUser) && (item.id === 'settings' || !hiddenTabs.includes(item.id)))
              .map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    aria-label={label}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-extrabold transition-all duration-200 ${
                      active ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]' : 'text-[#5a4b42] hover:bg-[#fff4eb] hover:translate-x-0.5'
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <Icon size={17} />
                    </span>
                    <span className="max-[860px]:hidden">{label}</span>
                    {id === 'orders' && activeCount > 0 ? (
                      <span className={`absolute right-2.5 top-3 flex min-w-5 h-5 items-center justify-center rounded-full text-[10px] font-black px-1 border transition-all ${
                        active ? 'bg-white text-[#9a3f00] border-white' : 'bg-danger text-white border-transparent'
                      }`}>
                        {activeCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
          </nav>

          {/* User profile / Logout */}
          {!isElectron && (
            <div className="mt-auto border-t border-[#eadfd7] p-2 text-center max-[860px]:p-1">
              <p className="text-[11px] font-black uppercase text-text-muted max-[860px]:hidden">
                {currentUser === 'owner' ? 'Owner' : 'Waiter'}
              </p>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('kitchen-os.user-role');
                  setCurrentUser(null);
                }}
                className="mt-1 text-[11px] font-black text-danger hover:underline uppercase block w-full text-center"
              >
                Logout
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setTab('counter')}
            aria-label="New Counter Sale"
            className="m-3 min-h-11 rounded-sm bg-primary px-3 text-[12px] font-black text-white max-[860px]:px-2 shrink-0"
          >
            <span className="max-[860px]:hidden font-black">NEW COUNTER SALE</span>
            <span className="hidden max-[860px]:inline">SALE</span>
          </button>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {!useAlertStore((state) => state.audioPermissionGranted) && (
          <div className="flex shrink-0 items-center justify-between bg-[#fff0e5] border-b border-[#eadfd7] px-5 py-2.5 text-xs font-black text-[#7a3508]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
              Audio permission is required for order alerts.
            </span>
            <button
              onClick={() => {
                unlockAudio();
                alertManager.playAudio(alertManager.voiceSingle, 0.0);
                useAlertStore.getState().setAudioPermissionGranted(true);
              }}
              className="rounded bg-primary px-3 py-1 text-[11px] font-black uppercase text-white hover:bg-opacity-95 active:scale-95 transition-transform"
            >
              Enable Order Alerts
            </button>
          </div>
        )}
        <header className="shrink-0 border-b border-[#eadfd7]/60 bg-white/70 backdrop-blur-md text-text-dark">
          <div className="grid min-h-[74px] gap-3 px-5 py-3 xl:grid-cols-[minmax(240px,1fr)_auto] xl:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <p className="mr-2 text-[13px] font-black uppercase text-text-dark">Main Kitchen</p>
              <StatusPill color="bg-success" label="Open Status" active />
              <StatusPill color={whatsappOpen ? 'bg-success' : 'bg-danger'} label={whatsappOpen ? 'WhatsApp Ready' : 'WhatsApp Off'} />
              <StatusPill color={printerOnline ? 'bg-success' : 'bg-danger'} label={printerOnline ? 'Printer Active' : 'Printer Issue'} />
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="hidden h-10 min-w-[210px] items-center gap-2 rounded-full border border-[#eadfd7] bg-white px-3 text-[13px] font-semibold text-text-muted lg:flex">
              <MenuIcon size={15} />
              Search menu, items...
            </div>
            <button
              type="button"
              onClick={importFromSwiggy}
              disabled={swiggyImporting}
              className="h-10 whitespace-nowrap rounded-sm border border-[#eadfd7] bg-white px-3 text-[13px] font-black text-[#6f3513] disabled:text-text-muted"
            >
              {swiggyImporting ? 'IMPORTING...' : 'IMPORT SWIGGY'}
            </button>
            <button type="button" onClick={toggleWhatsappOpen} className={`h-10 whitespace-nowrap rounded-sm px-3 text-[13px] font-black text-white ${whatsappOpen ? 'bg-success' : 'bg-danger'}`}>
              WhatsApp {whatsappOpen ? 'ON' : 'OFF'}
            </button>
            <button type="button" onClick={() => setPrinterOnline(!printerOnline)} className="h-10 whitespace-nowrap rounded-sm border border-[#eadfd7] bg-white px-3 text-[13px] font-black text-text-dark">
              Printer {printerOnline ? 'OK' : 'Warn'}
            </button>
            <button type="button" onClick={() => setNotice('FAQ: Swiggy import, inventory, expenses, and reports are available from the sidebar.')} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfd7] bg-white text-text-dark" aria-label="FAQ">
              <Clock3 size={18} />
            </button>
            <button type="button" onClick={() => setNotice(`${activeCount} active orders need attention.`)} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfd7] bg-white text-text-dark" aria-label="Notifications">
              <Bell size={18} />
              {activeCount > 0 ? <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-danger" /> : null}
            </button>
            <button type="button" onClick={() => setNotice('Help: use Swiggy Import for credentials and Menu & Recipes for mappings.')} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfd7] bg-white text-text-dark" aria-label="Help">
              <CircleHelp size={18} />
            </button>
            </div>
          </div>
          {!whatsappOpen ? (
            <div className="border-t border-[#eadfd7] bg-[#fff0e5] px-5 py-2 text-[13px] font-bold text-[#7a3508]">
              WhatsApp orders are paused. Bot reply: {closedMessage}
            </div>
          ) : null}
        </header>
        {swiggyProgress ? (
          <div className="z-20 border-b border-border bg-bg px-8 py-3 shadow-card">
            <div className="flex items-center justify-between gap-4 text-[15px] font-black text-text-dark">
              <span>{swiggyProgress.message || 'Importing from Swiggy...'}</span>
              <span>{Math.round(swiggyProgress.percent || 0)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${Math.min(100, Math.max(0, swiggyProgress.percent || 0))}%` }} />
            </div>
          </div>
        ) : null}
        {notice ? (
          <div className="absolute right-6 top-[110px] z-30 rounded-lg border border-border bg-bg px-4 py-3 text-[15px] font-black text-text-dark shadow-lg">
            {notice}
          </div>
        ) : null}
        <main className="min-h-0 flex-1 flex flex-col overflow-hidden bg-transparent">
          <Screen />
        </main>
      <MascotAssistant />
      <PremiumToasts />
      </div>
    </div>
  );
}

function applySwiggyMappings(orders) {
  const { externalMappings, portions, menuItems } = useInventoryStore.getState();
  return applyExternalMappingsToOrders(orders, { externalMappings, portions, menuItems });
}

function StatusPill({ color, label }) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#eadfd7] bg-white px-3 text-[12px] font-bold text-text-dark">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function LoginScreen({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleKeyPress(num) {
    setError('');
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === '8888') {
          onLogin('owner');
        } else if (nextPin === '1111') {
          onLogin('waiter');
        } else {
          setError('Invalid PIN. Please try again.');
          setPin('');
        }
      }
    }
  }

  function handleBackspace() {
    setPin(pin.slice(0, -1));
  }

  function handleClear() {
    setPin('');
    setError('');
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gradient-to-br from-[#2b170c] via-[#1a0e07] to-[#0f0804] text-white">
      <div className="w-[360px] rounded-2xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary border border-primary/30">
            <Store size={32} />
          </div>
        </div>
        <h1 className="text-xl font-black tracking-wide uppercase">Ego Foods POS</h1>
        <p className="mt-1 text-[13px] font-bold text-gray-400">Enter PIN to start working</p>

        {/* PIN Indicators */}
        <div className="my-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-4.5 w-4.5 rounded-full border border-white/20 transition-all duration-150 ${
                idx < pin.length ? 'bg-primary border-primary scale-110 shadow-lg' : 'bg-transparent'
              }`}
            />
          ))}
        </div>

        {error && <p className="mb-4 text-xs font-black text-red-500 uppercase tracking-wider">{error}</p>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleKeyPress(String(num))}
              className="flex h-14 w-14 items-center justify-center mx-auto rounded-full bg-white/5 text-lg font-black hover:bg-white/10 border border-white/5 active:scale-95 transition-transform"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="flex h-14 w-14 items-center justify-center mx-auto rounded-full text-xs font-bold text-gray-400 hover:text-white active:scale-95 transition-transform"
          >
            Clear
          </button>
          <button
            key={0}
            type="button"
            onClick={() => handleKeyPress('0')}
            className="flex h-14 w-14 items-center justify-center mx-auto rounded-full bg-white/5 text-lg font-black hover:bg-white/10 border border-white/5 active:scale-95 transition-transform"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="flex h-14 w-14 items-center justify-center mx-auto rounded-full text-xs font-bold text-gray-400 hover:text-white active:scale-95 transition-transform"
          >
            Back
          </button>
        </div>

        <div className="mt-8 border-t border-white/10 pt-4 text-center">
          <p className="text-[11px] font-bold text-gray-400">
            Default PINs: <span className="text-white">Owner (8888)</span> · <span className="text-white">Waiter (1111)</span>
          </p>
        </div>
      </div>
    </div>
  );
}
