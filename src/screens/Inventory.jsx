import { useMemo, useState, useEffect } from 'react';
import EmptyState from '../components/EmptyState';
import InventoryBar from '../components/InventoryBar';
import { formatKg, todayISO } from '../lib/format';
import { useInventoryStore } from '../store/inventoryStore';
import { useAppStore } from '../store/appStore';
import { supabase } from '../lib/supabase';

function ingredientColor(ingredient) {
  const stock = Number(ingredient.current_stock || 0);
  const threshold = Number(ingredient.low_stock_threshold || 0);
  if (stock <= threshold) return '#E02020';
  if (stock <= threshold * 1.3) return '#FC8019';
  return '#60B246';
}

export default function Inventory() {
  const menuItems = useInventoryStore((state) => state.menuItems) || [];
  const ingredients = useInventoryStore((state) => state.ingredients) || [];
  const batchLogs = useInventoryStore((state) => state.batchLogs) || [];
  const logBatch = useInventoryStore((state) => state.logBatch);
  const updateStockAndThreshold = useInventoryStore((state) => state.updateStockAndThreshold);
  const openExpenseMode = useAppStore((state) => state.openExpenseMode);

  const [batchInputs, setBatchInputs] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Manage Stock Modal States
  const [activeIngredient, setActiveIngredient] = useState(null);
  const [stockInput, setStockInput] = useState('');
  const [thresholdInput, setThresholdInput] = useState('');
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);

  // Spoilage Logs Modal States
  const [isSpoilageModalOpen, setIsSpoilageModalOpen] = useState(false);
  const [spoilageIngredientId, setSpoilageIngredientId] = useState('');
  const [spoilageQty, setSpoilageQty] = useState('');
  const [spoilageReason, setSpoilageReason] = useState('Spoiled / Expired');

  // Daily Low Stock Alert States
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [showLowStockPopup, setShowLowStockPopup] = useState(false);

  // Daily alert trigger check
  useEffect(() => {
    const lastAlertDate = localStorage.getItem('kitchen-os.low-stock-alert-date');
    const today = todayISO();
    
    if (lastAlertDate !== today && (ingredients || []).length > 0) {
      const lowItems = (ingredients || []).filter(Boolean).filter(
        (ing) => Number(ing.current_stock || 0) <= Number(ing.low_stock_threshold || 0)
      );
      if (lowItems.length > 0) {
        setLowStockAlerts(lowItems);
        setShowLowStockPopup(true);
      }
    }
  }, [ingredients]);

  const dismissAlertPopup = () => {
    localStorage.setItem('kitchen-os.low-stock-alert-date', todayISO());
    setShowLowStockPopup(false);
  };

  // Sort recipes alphabetically
  const recipes = useInventoryStore((state) => state.recipes) || [];
  const sortedRecipes = useMemo(() => {
    return [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes]);

  function handleInputChange(recipeId, value) {
    setBatchInputs((prev) => ({
      ...prev,
      [recipeId]: value
    }));
  }

  async function handleSaveAllBatches() {
    if (loading) return false;
    setLoading(true);
    setMessage('');

    try {
      let savedAny = false;
      let errorOccurred = null;

      for (const [recipeId, valueStr] of Object.entries(batchInputs)) {
        const recipe = recipes.find((r) => r.id === recipeId);
        if (!recipe) continue;

        const newVal = Number(valueStr || 0);
        const todayBatches = batchLogs.filter((batch) => batch.date === todayISO() && batch.recipe_id === recipe.id);
        const currentCooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);

        if (newVal > currentCooked) {
          const delta = newVal - currentCooked;
          const result = await logBatch(recipe.id, delta);
          if (result.ok) {
            savedAny = true;
          } else {
            errorOccurred = `Failed to save "${recipe.name}": ${result.message}`;
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

  async function handleSaveStock() {
    if (!activeIngredient || loading) return;
    setLoading(true);
    try {
      const nextStock = Number(stockInput || 0);
      const nextThreshold = Number(thresholdInput || 0);
      const res = await updateStockAndThreshold(activeIngredient.id, nextStock, nextThreshold);
      if (res.ok) {
        setIsStockModalOpen(false);
        setActiveIngredient(null);
      } else {
        alert(res.message || 'Failed to update stock.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save stock.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSpoilage() {
    if (!spoilageIngredientId || !spoilageQty || loading) return;
    setLoading(true);
    try {
      const qtyToDeduct = Number(spoilageQty);
      const ingredient = ingredients.find(i => i.id === spoilageIngredientId);
      if (!ingredient) throw new Error('Ingredient not found');
      
      const currentVal = Number(ingredient.current_stock || 0);
      const nextStock = Math.max(0, currentVal - qtyToDeduct);
      
      // 1. Deduct stock in Supabase
      const res = await updateStockAndThreshold(ingredient.id, nextStock, Number(ingredient.low_stock_threshold || 0));
      if (!res.ok) throw new Error(res.message || 'Failed to update stock');

      // 2. Insert expense
      const costAmount = qtyToDeduct * Number(ingredient.cost_per_base_unit || 0);
      const { error: expError } = await supabase.from('expenses').insert({
        restaurant_id: useInventoryStore.getState().restaurantId || ingredient.restaurant_id,
        type: 'Inventory Spoilage',
        description: `Discarded ${qtyToDeduct} ${ingredient.unit} of ${ingredient.name} due to: ${spoilageReason}`,
        amount: Number(costAmount.toFixed(2)),
        date: todayISO()
      });
      if (expError) throw expError;

      setIsSpoilageModalOpen(false);
      setSpoilageIngredientId('');
      setSpoilageQty('');
      setSpoilageReason('Spoiled / Expired');
      alert('Spoilage logged successfully and recorded as an expense.');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to log spoilage.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="h-full overflow-y-auto bg-transparent p-5 pb-6 scrollbar-none">
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
                (sortedRecipes || []).filter(Boolean).forEach((recipe) => {
                  const todayBatches = (batchLogs || []).filter(Boolean).filter((batch) => batch.date === todayISO() && batch.recipe_id === recipe.id);
                  const cooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);
                  initialInputs[recipe.id] = cooked || '';
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

        {sortedRecipes.length === 0 ? (
          <EmptyState>No reusable recipes configured.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#eadfd7] text-[13px] font-black text-text-muted uppercase">
                  <th className="py-2">Recipe Name</th>
                  <th className="py-2 text-right w-40">Cooked Today</th>
                  <th className="py-2 text-right w-40">Available Stock</th>
                </tr>
              </thead>
              <tbody>
                {(sortedRecipes || []).filter(Boolean).map((recipe) => {
                  const todayBatches = (batchLogs || []).filter(Boolean).filter((batch) => batch.date === todayISO() && batch.recipe_id === recipe.id);
                  const cooked = todayBatches.reduce((sum, batch) => sum + Number(batch.kg_cooked || 0), 0);
                  const available = Number(recipe.current_stock || 0);
                  
                  const inputValue = batchInputs[recipe.id] !== undefined ? batchInputs[recipe.id] : (cooked || '');

                  return (
                    <tr key={recipe.id} className="border-b border-[#f7f1ec] text-[15px] font-semibold text-text-dark">
                      <td className="py-3 pr-2 font-bold capitalize">{recipe.name}</td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={inputValue}
                            onChange={(e) => handleInputChange(recipe.id, e.target.value)}
                            placeholder="0.0"
                            className="h-10 w-32 rounded border border-[#eadfd7] bg-white text-right px-2 font-bold outline-primary"
                          />
                        ) : (
                          <span className="font-bold text-text-muted">
                            {cooked > 0 ? `${cooked.toFixed(1)} kg` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-black text-[#8a3a08]">
                        {available > 0 ? `${available.toFixed(2)} kg` : '0.00 kg'}
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (ingredients.length > 0) {
                setSpoilageIngredientId(ingredients[0].id);
              }
              setIsSpoilageModalOpen(true);
            }}
            className="h-11 rounded-sm border border-red-200 bg-red-50 hover:bg-red-100 px-3 text-[15px] font-bold text-red-700 transition-colors"
          >
            Log Spoilage / Loss 🗑️
          </button>
          <button type="button" onClick={() => openExpenseMode('market')} className="h-11 rounded-sm border border-[#eadfd7] bg-white px-3 text-[15px] font-bold text-text-dark">
            Record Expense / Purchase
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-3">
        {ingredients.length === 0 ? (
          <EmptyState>No ingredients added yet. Go to Menu Setup to configure your recipe.</EmptyState>
        ) : (
          ingredients.map((ingredient) => {
            const color = ingredientColor(ingredient);
            const max = Math.max(Number(ingredient.current_stock || 0), Number(ingredient.low_stock_threshold || 0) * 2);
            return (
              <div key={ingredient.id} className="rounded border border-[#eadfd7] bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-base font-black text-text-dark">{ingredient.name}</h3>
                    <div className="text-right">
                      <span className="text-base font-bold text-text-dark">{ingredient.current_stock} {ingredient.unit}</span>
                      <p className="text-[10px] font-black text-text-muted uppercase mt-0.5">Threshold: {ingredient.low_stock_threshold} {ingredient.unit}</p>
                    </div>
                  </div>
                  <InventoryBar value={ingredient.current_stock} max={max} color={color} />
                  <p className="mt-2 text-[13px] font-black uppercase tracking-wider" style={{ color }}>
                    {Number(ingredient.current_stock) <= Number(ingredient.low_stock_threshold) ? 'Low Stock!' : 'Above threshold'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIngredient(ingredient);
                      setStockInput(ingredient.current_stock);
                      setThresholdInput(ingredient.low_stock_threshold);
                      setIsStockModalOpen(true);
                    }}
                    className="h-9 px-4 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-black uppercase transition-all"
                  >
                    Manage Stock
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Manage Stock & Threshold */}
      {isStockModalOpen && activeIngredient && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-black text-sm uppercase text-text-dark">Manage Ingredient: {activeIngredient.name}</h3>
            
            <div className="space-y-3">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Current Stock ({activeIngredient.unit})</label>
                <input
                  type="number"
                  step="0.01"
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value)}
                  className="h-10 rounded border px-3 text-sm font-bold"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Low Stock Threshold ({activeIngredient.unit})</label>
                <input
                  type="number"
                  step="0.01"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="h-10 rounded border px-3 text-sm font-bold"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsStockModalOpen(false);
                  setActiveIngredient(null);
                }}
                className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStock}
                className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Daily Low Stock Notification Popup */}
      {showLowStockPopup && lowStockAlerts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-lg p-5 space-y-4 border-t-4 border-t-[#E02020]">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-[#E02020] animate-ping" />
              <h3 className="font-black text-base uppercase text-[#E02020] tracking-wide">Daily Low Stock Warning!</h3>
            </div>
            
            <p className="text-xs text-text-muted font-semibold">
              The following raw materials have fallen below their safety threshold limits. Please refill them as soon as possible:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-[#eadfd7] rounded p-2 bg-[#fffcf9]">
              {lowStockAlerts.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs py-1.5 border-b border-[#f0e4db] last:border-0">
                  <span className="font-black text-text-dark">{item.name}</span>
                  <div className="text-right">
                    <span className="font-extrabold text-[#E02020]">{item.current_stock} {item.unit}</span>
                    <span className="text-text-muted font-bold ml-1.5">(Min: {item.low_stock_threshold})</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t pt-3">
              <button
                type="button"
                onClick={dismissAlertPopup}
                className="rounded bg-[#E02020] px-5 py-2.5 text-xs font-black text-white hover:bg-red-800 transition-all uppercase tracking-wider"
              >
                Acknowledge Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Log Spoilage / Loss */}
      {isSpoilageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-black text-sm uppercase text-text-dark">Log Raw Ingredient Spoilage / Loss</h3>
            
            <div className="space-y-3">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Select Ingredient</label>
                <select
                  value={spoilageIngredientId}
                  onChange={(e) => setSpoilageIngredientId(e.target.value)}
                  className="h-10 rounded border bg-white px-2 text-sm font-bold text-text-dark"
                >
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Quantity to Discard</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={spoilageQty}
                  onChange={(e) => setSpoilageQty(e.target.value)}
                  className="h-10 rounded border px-3 text-sm font-bold outline-primary"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Reason for Loss</label>
                <select
                  value={spoilageReason}
                  onChange={(e) => setSpoilageReason(e.target.value)}
                  className="h-10 rounded border bg-white px-2 text-sm font-bold text-text-dark"
                >
                  <option value="Spoiled / Expired">Spoiled / Expired</option>
                  <option value="Spilled / Wasted">Spilled / Wasted</option>
                  <option value="Customer Return">Customer Return</option>
                  <option value="Incorrect Preparation">Incorrect Preparation</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsSpoilageModalOpen(false);
                  setSpoilageIngredientId('');
                  setSpoilageQty('');
                }}
                className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !spoilageQty}
                onClick={handleSaveSpoilage}
                className="rounded bg-[#E02020] px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:bg-text-muted"
              >
                {loading ? 'Logging...' : 'Confirm Spoilage & Log Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
