import { useMemo, useState } from 'react';
import EmptyState from '../components/EmptyState';
import InventoryBar from '../components/InventoryBar';
import { formatKg, todayISO } from '../lib/format';
import { useInventoryStore } from '../store/inventoryStore';
import { useAppStore } from '../store/appStore';

function ingredientColor(ingredient) {
  const stock = Number(ingredient.current_stock || 0);
  const threshold = Number(ingredient.low_stock_threshold || 0);
  if (stock <= threshold) return '#E02020';
  if (stock <= threshold * 1.3) return '#FC8019';
  return '#60B246';
}

export default function Inventory() {
  const menuItems = useInventoryStore((state) => state.menuItems);
  const ingredients = useInventoryStore((state) => state.ingredients);
  const batchLogs = useInventoryStore((state) => state.batchLogs);
  const logBatch = useInventoryStore((state) => state.logBatch);
  const openExpenseMode = useAppStore((state) => state.openExpenseMode);

  const [batchInputs, setBatchInputs] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Sort menu items by Veg, Non-Veg, then Desserts
  const sortedMenuItems = useMemo(() => {
    const categoryOrder = {
      'veg': 1,
      'nonveg': 2,
      'non-veg': 2,
      'desserts': 3,
      'dessert': 3
    };

    return [...menuItems].sort((a, b) => {
      const catA = String(a.category).toLowerCase().replace(/[^a-z]/g, '');
      const catB = String(b.category).toLowerCase().replace(/[^a-z]/g, '');
      
      const orderA = categoryOrder[catA] || 99;
      const orderB = categoryOrder[catB] || 99;
      
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [menuItems]);

  function handleInputChange(itemId, value) {
    setBatchInputs((prev) => ({
      ...prev,
      [itemId]: value
    }));
  }

  async function handleSaveAllBatches() {
    if (loading) return false;
    setLoading(true);
    setMessage('');

    try {
      let savedAny = false;
      let errorOccurred = null;

      for (const [itemId, valueStr] of Object.entries(batchInputs)) {
        const item = menuItems.find((m) => m.id === itemId);
        if (!item) continue;

        const newVal = Number(valueStr || 0);
        const todayBatches = batchLogs.filter((batch) => batch.date === todayISO() && batch.menu_item_id === item.id);
        const currentCooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);

        if (newVal > currentCooked) {
          const delta = newVal - currentCooked;
          const result = await logBatch(item.id, delta);
          if (result.ok) {
            savedAny = true;
          } else {
            errorOccurred = `Failed to save "${item.name}": ${result.message}`;
            break;
          }
        }
      }

      if (errorOccurred) {
        setMessage(errorOccurred);
        return false;
      } else {
        setMessage('All batches saved successfully!');
        setBatchInputs({});
        return true;
      }
    } catch (err) {
      console.error(err);
      setMessage('Failed to save batches.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="h-full overflow-y-auto bg-[#f7f1ec] p-5 pb-6 scrollbar-none">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text-dark">Inventory & Batch Management</h1>
          <p className="mt-1 text-[13px] font-semibold text-text-muted">Real-time tracking of raw stock and cooked production batches.</p>
        </div>
        <span className="rounded-full border border-[#eadfd7] bg-white px-3 py-1 text-[13px] font-bold text-text-muted">Today</span>
      </header>

      {/* Production Batch Entry Table */}
      <div className="rounded border border-[#eadfd7] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-black text-text-muted uppercase">Today's Production Batches</h2>
          {!isEditing && (
            <button
              type="button"
              onClick={() => {
                const initialInputs = {};
                sortedMenuItems.forEach((item) => {
                  const todayBatches = batchLogs.filter((batch) => batch.date === todayISO() && batch.menu_item_id === item.id);
                  const cooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);
                  initialInputs[item.id] = cooked || '';
                });
                setBatchInputs(initialInputs);
                setIsEditing(true);
              }}
              className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-black text-text-dark hover:bg-bg-secondary"
            >
              Edit Batches
            </button>
          )}
        </div>

        {sortedMenuItems.length === 0 ? (
          <EmptyState>No menu items configured.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#eadfd7] text-[13px] font-black text-text-muted uppercase">
                  <th className="py-2">Item Name</th>
                  <th className="py-2 text-right w-40">Cooked Today</th>
                </tr>
              </thead>
              <tbody>
                {sortedMenuItems.map((item) => {
                  const todayBatches = batchLogs.filter((batch) => batch.date === todayISO() && batch.menu_item_id === item.id);
                  const cooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);
                  
                  const inputValue = batchInputs[item.id] !== undefined ? batchInputs[item.id] : (cooked || '');

                  return (
                    <tr key={item.id} className="border-b border-[#f7f1ec] text-[15px] font-semibold text-text-dark">
                      <td className="py-3 pr-2 font-bold">{item.name}</td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={inputValue}
                            onChange={(e) => handleInputChange(item.id, e.target.value)}
                            placeholder="0.0"
                            className="h-10 w-32 rounded border border-[#eadfd7] bg-white text-right px-2 font-bold outline-primary"
                          />
                        ) : (
                          <span className="font-bold text-text-muted">
                            {cooked > 0 ? `${cooked.toFixed(1)} kg` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {isEditing && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setBatchInputs({});
                setMessage('');
              }}
              className="rounded border border-[#eadfd7] bg-white py-2 text-sm font-bold text-text-dark hover:bg-bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                const ok = await handleSaveAllBatches();
                if (ok) {
                  setIsEditing(false);
                }
              }}
              className="rounded bg-primary py-2 text-sm font-bold text-white disabled:bg-text-muted"
            >
              {loading ? 'Saving...' : 'Save Batches'}
            </button>
          </div>
        )}

        {message && (
          <p className={`mt-3 text-center text-xs font-bold ${message.includes('success') ? 'text-success' : 'text-red-600'}`}>
            {message}
          </p>
        )}
      </div>

      {/* Raw Ingredients Section */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[14px] font-black text-text-muted">RAW INGREDIENTS</h2>
        <button type="button" onClick={() => openExpenseMode('market')} className="h-11 rounded-sm border border-[#eadfd7] bg-white px-3 text-[15px] font-bold text-text-dark">
          Add Stock
        </button>
      </div>
      <div className="mt-2 space-y-3">
        {ingredients.length === 0 ? (
          <EmptyState>No ingredients added yet. Go to Menu Setup to configure your recipe.</EmptyState>
        ) : (
          ingredients.map((ingredient) => {
            const color = ingredientColor(ingredient);
            const max = Math.max(Number(ingredient.current_stock || 0), Number(ingredient.low_stock_threshold || 0) * 2);
            return (
              <div key={ingredient.id} className="rounded border border-[#eadfd7] bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-base font-black text-text-dark">{ingredient.name}</h3>
                  <span className="shrink-0 text-base font-bold text-text-dark">{ingredient.current_stock} {ingredient.unit}</span>
                </div>
                <InventoryBar value={ingredient.current_stock} max={max} color={color} />
                <p className="mt-2 text-[15px] font-bold" style={{ color }}>
                  {Number(ingredient.current_stock) <= Number(ingredient.low_stock_threshold) ? 'Low Stock!' : 'Above threshold'}
                </p>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
