import { Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { formatINR, uid } from '../lib/format';
import { formatQuantity, unitOptions } from '../lib/units';
import { useAppStore } from '../store/appStore';
import { useInventoryStore } from '../store/inventoryStore';

function money(value) {
  return value === null || value === undefined || value === '' ? 'Optional' : formatINR(value);
}

export default function MenuSetup() {
  const menuItems = useInventoryStore((state) => state.menuItems);
  const portions = useInventoryStore((state) => state.portions);
  const ingredients = useInventoryStore((state) => state.ingredients);
  const recipes = useInventoryStore((state) => state.recipes);
  const externalMappings = useInventoryStore((state) => state.externalMappings);
  const addMenuItem = useInventoryStore((state) => state.addMenuItem);
  const addIngredient = useInventoryStore((state) => state.addIngredient);
  const updateMenuItem = useInventoryStore((state) => state.updateMenuItem);
  const updatePortions = useInventoryStore((state) => state.updatePortions);
  const replaceRecipesForMenu = useInventoryStore((state) => state.replaceRecipesForMenu);
  const upsertExternalMapping = useInventoryStore((state) => state.upsertExternalMapping);
  const setTab = useAppStore((state) => state.setTab);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState(menuItems[0]?.id || '');
  const [addingMenu, setAddingMenu] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [editingPortions, setEditingPortions] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingError, setMappingError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAllMappings, setShowAllMappings] = useState(true);
  const [menuDraft, setMenuDraft] = useState({ name: '', category: 'biryani', recipe_base_quantity: 1, recipe_base_unit: 'kg' });
  const [recipeBaseDraft, setRecipeBaseDraft] = useState({ quantity: 1, unit: 'kg' });
  const [ingredientDraft, setIngredientDraft] = useState({ name: '', unit: 'kg', current_stock: '', low_stock_threshold: '' });
  const menuItem = menuItems.find((item) => item.id === selectedMenuItemId) || menuItems[0];
  const itemPortions = portions.filter((portion) => portion.menu_item_id === menuItem?.id);
  const itemRecipes = recipes.filter((recipe) => recipe.menu_item_id === menuItem?.id);
  const [recipeDrafts, setRecipeDrafts] = useState([]);
  const [portionDrafts, setPortionDrafts] = useState([]);
  const [mappingDraft, setMappingDraft] = useState({
    external_item_name: '',
    portion_id: itemPortions[0]?.id || ''
  });

  async function saveIngredient() {
    if (!ingredientDraft.name.trim()) {
      setNotice('Enter an ingredient name.');
      return;
    }
    const res = await addIngredient({
      name: ingredientDraft.name.trim(),
      unit: ingredientDraft.unit,
      current_stock: Number(ingredientDraft.current_stock || 0),
      low_stock_threshold: Number(ingredientDraft.low_stock_threshold || 0)
    });
    if (res.ok) {
      setAddingIngredient(false);
      setIngredientDraft({ name: '', unit: 'kg', current_stock: '', low_stock_threshold: '' });
      setNotice('Ingredient added successfully!');
    } else {
      setNotice(`Failed to add ingredient: ${res.message}`);
    }
  }

  const swiggyMappings = externalMappings.filter(
    (mapping) => mapping.source === 'swiggy' && (showAllMappings || mapping.menu_item_id === menuItem?.id)
  );
  const recipeBase = useMemo(() => ({
    quantity: Number(menuItem?.recipe_base_quantity || itemRecipes[0]?.base_quantity || 1),
    unit: menuItem?.recipe_base_unit || itemRecipes[0]?.base_unit || 'kg'
  }), [menuItem, itemRecipes]);

  function openRecipeEditor() {
    setRecipeDrafts(itemRecipes.map((recipe) => ({ ...recipe, quantity: recipe.quantity ?? recipe.quantity_per_kg })));
    setRecipeBaseDraft(recipeBase);
    setEditingRecipe(true);
  }

  function saveRecipe() {
    updateMenuItem({ ...menuItem, recipe_base_quantity: recipeBaseDraft.quantity, recipe_base_unit: recipeBaseDraft.unit });
    replaceRecipesForMenu(menuItem.id, recipeDrafts.filter((recipe) => recipe.ingredient_id && Number(recipe.quantity)).map((recipe) => ({
      ...recipe,
      id: recipe.id || uid('recipe'),
      base_quantity: recipeBaseDraft.quantity,
      base_unit: recipeBaseDraft.unit,
      quantity: Number(recipe.quantity || 0),
      quantity_per_kg: Number(recipe.quantity || 0) / Number(recipeBaseDraft.quantity || 1),
      unit: recipe.unit
    })));
    setEditingRecipe(false);
    setNotice('Recipe saved. New batches will use this recipe base.');
  }

  function addRecipeDraft() {
    const firstIngredient = ingredients.find((ingredient) => !recipeDrafts.some((recipe) => recipe.ingredient_id === ingredient.id));
    if (!firstIngredient) return;
    setRecipeDrafts([...recipeDrafts, {
      id: uid('recipe'),
      menu_item_id: menuItem.id,
      ingredient_id: firstIngredient.id,
      base_quantity: recipeBaseDraft.quantity,
      base_unit: recipeBaseDraft.unit,
      quantity: 0,
      quantity_per_kg: 0,
      unit: firstIngredient.unit
    }]);
  }

  function saveMenuItem() {
    if (!menuDraft.name.trim()) {
      setNotice('Enter a menu item name.');
      return;
    }
    const item = addMenuItem({ ...menuDraft, name: menuDraft.name.trim() });
    setSelectedMenuItemId(item.id);
    setAddingMenu(false);
    setMenuDraft({ name: '', category: 'biryani', recipe_base_quantity: 1, recipe_base_unit: 'kg' });
    setNotice('Menu item added. Add portions and recipe next.');
  }

  function openPortionEditor() {
    setPortionDrafts(itemPortions.map((portion) => ({ ...portion })));
    setEditingPortions(true);
  }

  function savePortions() {
    updatePortions(menuItem.id, portionDrafts.filter((portion) => portion.name && Number(portion.grams)));
    setEditingPortions(false);
    setNotice('Portions saved. Sales and mappings can use these portions.');
  }

  function addPortionDraft() {
    setPortionDrafts([...portionDrafts, {
      id: uid('portion'),
      menu_item_id: menuItem.id,
      name: '',
      grams: '',
      price: '',
      source: 'counter'
    }]);
  }

  function saveMapping() {
    const portionId = mappingDraft.portion_id || itemPortions[0]?.id;
    const selectedPortion = portions.find((portion) => portion.id === portionId);
    if (!mappingDraft.external_item_name || !selectedPortion) {
      setMappingError('Enter the Swiggy item name and choose a portion.');
      return;
    }
    upsertExternalMapping({
      id: mappingDraft.id,
      source: 'swiggy',
      external_item_name: mappingDraft.external_item_name.trim(),
      menu_item_id: selectedPortion.menu_item_id,
      portion_id: selectedPortion.id,
      inventory_applies: true
    });
    setMappingOpen(false);
    setMappingError('');
    setMappingDraft({ external_item_name: '', portion_id: itemPortions[0]?.id || '' });
    setNotice('Swiggy mapping saved. Future imports will use this portion automatically.');
  }

  return (
    <section className="h-full w-full overflow-y-auto bg-bg-secondary p-4 lg:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-text-dark">Menu & Recipe</h1>
          <p className="mt-1 text-[15px] font-semibold text-text-muted">Set cooked items, portions, recipe quantities, and platform mappings.</p>
        </div>
        <button type="button" onClick={() => setTab('orders')} className="h-11 rounded-lg border border-border bg-bg px-3 text-base font-bold text-text-dark">Done</button>
      </header>

      <div className="rounded-lg border border-border bg-bg p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-black uppercase text-text-muted">{menuItem?.category}</p>
            <h2 className="mt-1 text-2xl font-black text-text-dark">{menuItem?.name}</h2>
            <p className="mt-1 text-[15px] font-semibold text-text-muted">Recipe base: {recipeBase.quantity} {recipeBase.unit} cooked batch</p>
          </div>
          <button type="button" onClick={() => setAddingMenu(true)} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-black text-white">
            <Plus size={18} /> Add Menu Item
          </button>
        </div>
        <label className="mt-4 block text-[13px] font-black uppercase text-text-muted">
          Menu item
          <select value={menuItem?.id || ''} onChange={(event) => setSelectedMenuItemId(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-border bg-white px-3 text-base font-bold text-text-dark">
            {menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="Portions" action="Edit Portions" onAction={openPortionEditor}>
          {itemPortions.map((portion) => (
            <div key={portion.id} className="grid grid-cols-[1fr_90px_110px] gap-3 border-b border-border py-3 text-base font-bold text-text-dark last:border-b-0">
              <span>{portion.name}</span>
              <span className="text-right">{portion.grams}g</span>
              <span className="text-right">{money(portion.price)}</span>
            </div>
          ))}
        </Panel>

        <Panel title={`Recipe - for ${recipeBase.quantity} ${recipeBase.unit} cooked batch`} action="Edit Recipe" onAction={openRecipeEditor}>
          {itemRecipes.map((recipe) => {
            const ingredient = ingredients.find((item) => item.id === recipe.ingredient_id);
            const quantity = recipe.quantity ?? recipe.quantity_per_kg;
            return (
              <div key={recipe.id} className="flex justify-between gap-3 border-b border-border py-3 text-base font-bold text-text-dark last:border-b-0">
                <span>{ingredient?.name}</span>
                <span>{formatQuantity(quantity, recipe.unit)}</span>
              </div>
            );
          })}
        </Panel>

        <Panel title="Raw Ingredients" action="Add Ingredient" onAction={() => setAddingIngredient(true)}>
          <div className="max-h-60 overflow-y-auto divide-y divide-border pr-1">
            {ingredients.length === 0 ? (
              <p className="py-6 text-sm font-semibold text-text-muted text-center">No ingredients yet.</p>
            ) : (
              ingredients.map((ingredient) => (
                <div key={ingredient.id} className="flex justify-between py-2.5 text-base font-bold text-text-dark last:border-b-0">
                  <span>{ingredient.name}</span>
                  <span className="text-text-muted">{ingredient.current_stock} {ingredient.unit}</span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-bg p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-text-dark">Swiggy Mapping ({swiggyMappings.length} Items)</h2>
            <p className="mt-1 text-[15px] font-semibold text-text-muted">Map each Swiggy item name once to a Kitchen OS portion.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAllMappings((value) => !value)} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-[13px] font-black text-text-dark">
              {showAllMappings ? 'Showing All Items' : 'Showing Selected Item Only'}
            </button>
            <button type="button" onClick={() => {
              setMappingDraft((draft) => ({ ...draft, portion_id: draft.portion_id || itemPortions[0]?.id || '' }));
              setMappingError('');
              setMappingOpen(true);
            }} className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-base font-black text-text-dark">
              <Plus size={18} /> Map Item
            </button>
          </div>
        </div>
        <div className="mt-3 divide-y divide-border">
          {swiggyMappings.map((mapping) => {
            const portion = portions.find((item) => item.id === mapping.portion_id);
            const item = menuItems.find((menu) => menu.id === mapping.menu_item_id);
            return (
              <div key={mapping.id} className="grid gap-2 py-3 text-base font-bold text-text-dark md:grid-cols-[1fr_1fr]">
                <span>{mapping.external_item_name}</span>
                <span className="text-primary">{item?.name} - {portion?.name} ({portion?.grams}g)</span>
              </div>
            );
          })}
        </div>
      </div>

      {notice ? <div className="mt-4 rounded-lg border border-border bg-bg p-3 text-[15px] font-bold text-text-dark">{notice}</div> : null}

      {editingPortions ? (
        <Modal
          title="Edit Portions"
          onClose={() => setEditingPortions(false)}
          footer={<ModalActions onCancel={() => setEditingPortions(false)} onSave={savePortions} />}
        >
          <div className="space-y-3">
            {portionDrafts.map((portion, index) => (
              <div key={portion.id} className="grid gap-2 rounded-lg bg-bg-secondary p-3">
                <input value={portion.name} onChange={(event) => setPortionDrafts(portionDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} className="h-11 rounded-lg border border-border px-3 font-bold" placeholder="Portion name" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={portion.grams} onChange={(event) => setPortionDrafts(portionDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, grams: Number(event.target.value) } : item))} className="h-11 rounded-lg border border-border px-3 font-bold" placeholder="Grams packed" />
                  <input type="number" value={portion.price ?? ''} onChange={(event) => setPortionDrafts(portionDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value === '' ? '' : Number(event.target.value) } : item))} className="h-11 rounded-lg border border-border px-3 font-bold" placeholder="Price optional" />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPortionDraft} className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 font-black text-text-dark">
            <Plus size={18} /> Add Portion
          </button>
        </Modal>
      ) : null}

      {editingRecipe ? (
        <Modal
          title="Edit Recipe"
          onClose={() => setEditingRecipe(false)}
          footer={<ModalActions onCancel={() => setEditingRecipe(false)} onSave={saveRecipe} />}
        >
          <div className="mb-4 rounded-lg bg-bg-secondary p-3">
            <p className="mb-2 text-base font-black text-text-dark">Recipe base</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={recipeBaseDraft.quantity} onChange={(event) => setRecipeBaseDraft({ ...recipeBaseDraft, quantity: Number(event.target.value || 1) })} className="h-11 rounded-lg border border-border px-3 font-bold" />
              <select value={recipeBaseDraft.unit} onChange={(event) => setRecipeBaseDraft({ ...recipeBaseDraft, unit: event.target.value })} className="h-11 rounded-lg border border-border px-3 font-bold">
                <option value="kg">kg cooked</option>
              </select>
            </div>
          </div>
          {recipeDrafts.map((recipe, index) => {
            const ingredient = ingredients.find((item) => item.id === recipe.ingredient_id);
            return (
              <label key={recipe.id} className="mb-3 block text-base font-bold text-text-dark">
                Ingredient
                <select value={recipe.ingredient_id} onChange={(event) => {
                  const ingredient = ingredients.find((item) => item.id === event.target.value);
                  setRecipeDrafts(recipeDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, ingredient_id: event.target.value, unit: ingredient?.unit || item.unit } : item));
                }} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold">
                  {ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <div className="mt-2 grid grid-cols-[1fr_110px] gap-2">
                  <input type="number" step="0.001" value={recipe.quantity ?? ''} onChange={(event) => setRecipeDrafts(recipeDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))} className="h-12 rounded-lg border border-border px-3 text-base font-bold" />
                  <select value={recipe.unit} onChange={(event) => setRecipeDrafts(recipeDrafts.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item))} className="h-12 rounded-lg border border-border px-3 text-base font-bold">
                    {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => setRecipeDrafts(recipeDrafts.filter((_, itemIndex) => itemIndex !== index))} className="mt-2 h-9 rounded-lg border border-border px-3 text-[13px] font-black text-danger">
                  Remove ingredient
                </button>
              </label>
            );
          })}
          <button type="button" onClick={addRecipeDraft} className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 font-black text-text-dark">
            <Plus size={18} /> Add Ingredient
          </button>
        </Modal>
      ) : null}

      {addingMenu ? (
        <Modal
          title="Add Menu Item"
          onClose={() => setAddingMenu(false)}
          footer={<ModalActions onCancel={() => setAddingMenu(false)} onSave={saveMenuItem} />}
        >
          <label className="block text-base font-bold text-text-dark">
            Item name
            <input value={menuDraft.name} onChange={(event) => setMenuDraft({ ...menuDraft, name: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold" placeholder="Chicken Sambar Rice" />
          </label>
          <label className="mt-3 block text-base font-bold text-text-dark">
            Category
            <input value={menuDraft.category} onChange={(event) => setMenuDraft({ ...menuDraft, category: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold" placeholder="non veg" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-base font-bold text-text-dark">
              Recipe base qty
              <input type="number" value={menuDraft.recipe_base_quantity} onChange={(event) => setMenuDraft({ ...menuDraft, recipe_base_quantity: Number(event.target.value || 1) })} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold" />
            </label>
            <label className="block text-base font-bold text-text-dark">
              Unit
              <select value={menuDraft.recipe_base_unit} onChange={(event) => setMenuDraft({ ...menuDraft, recipe_base_unit: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold">
                <option value="kg">kg cooked</option>
              </select>
            </label>
          </div>
        </Modal>
      ) : null}

      {addingIngredient ? (
        <Modal
          title="Add Raw Ingredient"
          onClose={() => setAddingIngredient(false)}
          footer={<ModalActions onCancel={() => setAddingIngredient(false)} onSave={saveIngredient} />}
        >
          <label className="block text-base font-bold text-text-dark">
            Ingredient name
            <input
              value={ingredientDraft.name}
              onChange={(event) => setIngredientDraft({ ...ingredientDraft, name: event.target.value })}
              className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold outline-none focus:border-primary"
              placeholder="e.g. Basmati Rice, Chicken, Onions"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-base font-bold text-text-dark">
              Initial Stock Qty
              <input
                type="number"
                value={ingredientDraft.current_stock}
                onChange={(event) => setIngredientDraft({ ...ingredientDraft, current_stock: event.target.value })}
                className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold outline-none focus:border-primary"
                placeholder="0"
              />
            </label>
            <label className="block text-base font-bold text-text-dark">
              Unit
              <select
                value={ingredientDraft.unit}
                onChange={(event) => setIngredientDraft({ ...ingredientDraft, unit: event.target.value })}
                className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold outline-none focus:border-primary"
              >
                {unitOptions.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-base font-bold text-text-dark">
            Low Stock Alert Threshold
            <input
              type="number"
              value={ingredientDraft.low_stock_threshold}
              onChange={(event) => setIngredientDraft({ ...ingredientDraft, low_stock_threshold: event.target.value })}
              className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold outline-none focus:border-primary"
              placeholder="0"
            />
          </label>
        </Modal>
      ) : null}

      {mappingOpen ? (
        <Modal
          title="Map Swiggy Item"
          onClose={() => setMappingOpen(false)}
          footer={<ModalActions onCancel={() => setMappingOpen(false)} onSave={saveMapping} />}
        >
          <label className="block text-base font-bold text-text-dark">
            Swiggy item name
            <input value={mappingDraft.external_item_name} onChange={(event) => { setMappingError(''); setMappingDraft({ ...mappingDraft, external_item_name: event.target.value }); }} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold" placeholder="Chicken Fry Piece Palav SINGLE" />
          </label>
            <select value={mappingDraft.portion_id} onChange={(event) => setMappingDraft({ ...mappingDraft, portion_id: event.target.value })} className="mt-2 h-12 w-full rounded-lg border border-border px-3 text-base font-bold">
              {portions.map((portion) => {
                const item = menuItems.find((m) => m.id === portion.menu_item_id);
                return (
                  <option key={portion.id} value={portion.id}>
                    {item?.name || 'Menu Item'} - {portion.name} ({portion.grams}g)
                  </option>
                );
              })}
            </select>
          {mappingError ? <p className="mt-3 rounded-lg border border-danger bg-red-50 p-3 text-[15px] font-bold text-danger">{mappingError}</p> : null}
        </Modal>
      ) : null}
    </section>
  );
}

function Panel({ title, action, onAction, children }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-text-dark">{title}</h2>
        <button type="button" onClick={onAction} className="h-11 rounded-lg border border-border px-3 text-[15px] font-black text-text-dark">{action}</button>
      </div>
      {children}
    </div>
  );
}

function ModalActions({ onCancel, onSave }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onCancel} className="rounded-lg border border-border font-bold text-text-dark">Cancel</button>
      <button type="button" onClick={onSave} className="rounded-lg bg-primary px-3 font-bold text-white">
        <Save size={18} className="mr-1 inline" /> Save
      </button>
    </div>
  );
}
