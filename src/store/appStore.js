import { create } from 'zustand';
import { readLocal, writeLocal } from '../lib/localPersist';
import { todayISO } from '../lib/format';

const printerSettings = readLocal('kitchen-printer-settings', { customerPrinterName: 'POS-58-Series' });

export const useAppStore = create((set) => ({
  tab: 'orders',
  setTab: (tab) => set({ tab }),
  whatsappOpen: true,
  setWhatsappOpen: (whatsappOpen) => set({ whatsappOpen }),
  printerOnline: true,
  setPrinterOnline: (printerOnline) => set({ printerOnline }),
  tableCount: 4,
  setTableCount: (tableCount) => set({ tableCount }),
  customerPrinterName: printerSettings.customerPrinterName || 'POS-58-Series',
  setCustomerPrinterName: (customerPrinterName) => {
    const kitchenPrinterName = useAppStore.getState().kitchenPrinterName;
    writeLocal('kitchen-printer-settings', { customerPrinterName, kitchenPrinterName });
    set({ customerPrinterName });
  },
  kitchenPrinterName: printerSettings.kitchenPrinterName || printerSettings.customerPrinterName || 'POS-58-Series',
  setKitchenPrinterName: (kitchenPrinterName) => {
    const customerPrinterName = useAppStore.getState().customerPrinterName;
    writeLocal('kitchen-printer-settings', { customerPrinterName, kitchenPrinterName });
    set({ kitchenPrinterName });
  },
  expenseMode: null,
  openExpenseMode: (expenseMode) => set({ tab: 'expenses', expenseMode }),
  clearExpenseMode: () => set({ expenseMode: null }),
  menuOpen: false,
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  reportFilterMode: 'today',
  reportStartDate: todayISO(),
  reportEndDate: todayISO(),
  setReportFilter: (filter) => set(filter),
  hiddenTabs: readLocal('kitchen-os-hidden-tabs', []),
  toggleTabVisibility: (tabId) => {
    const current = useAppStore.getState().hiddenTabs;
    const next = current.includes(tabId)
      ? current.filter(id => id !== tabId)
      : [...current, tabId];
    writeLocal('kitchen-os-hidden-tabs', next);
    set({ hiddenTabs: next });
  }
}));
