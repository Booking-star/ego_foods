import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sampleExpenses } from '../lib/sampleData';
import { todayISO, uid } from '../lib/format';
import { readLocal, writeLocal } from '../lib/localPersist';

const expenseKey = 'kitchen-os.expenses';

export const useExpenseStore = create((set, get) => ({
  expenses: readLocal(expenseKey, sampleExpenses),
  addExpense: async (expense) => {
    const row = {
      id: crypto.randomUUID?.() || uid('expense'),
      date: todayISO(),
      logged_at: new Date().toISOString(),
      ...expense,
      amount: Number(expense.amount)
    };
    if (supabase) {
      const { error } = await supabase.from('expenses').insert(row);
      if (error) return { ok: false, message: error.message };
    }
    set((state) => {
      const expenses = [row, ...state.expenses];
      writeLocal(expenseKey, expenses);
      return { expenses };
    });
    return { ok: true, row };
  },
  totalToday: () =>
    get().expenses
      .filter((expense) => expense.date === todayISO())
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
}));
