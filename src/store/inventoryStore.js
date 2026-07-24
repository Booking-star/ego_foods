import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { sampleBatchLogs, sampleExternalMappings, sampleIngredients, sampleMenuItems, samplePortions, sampleRecipes } from '../lib/sampleData';
import { todayISO, uid } from '../lib/format';
import { convertUnit } from '../lib/units';
import { readLocal, writeLocal } from '../lib/localPersist';

const inventoryKey = 'kitchen-os.inventory.v2';
const rawSaved = readLocal(inventoryKey, null);
const initialInventory = (!rawSaved || !rawSaved.menuItems || rawSaved.menuItems.length < sampleMenuItems.length)
  ? {
      menuItems: sampleMenuItems,
      portions: samplePortions,
      ingredients: sampleIngredients,
      recipes: sampleRecipes,
      externalMappings: sampleExternalMappings,
      batchLogs: sampleBatchLogs
    }
  : rawSaved;

function persistInventory(state) {
  writeLocal(inventoryKey, {
    menuItems: state.menuItems,
    portions: state.portions,
    ingredients: state.ingredients,
    recipes: state.recipes,
    externalMappings: state.externalMappings,
    batchLogs: state.batchLogs
  });
}

const getUnitBaseFactor = (unit) => {
  const u = (unit || "kg").toLowerCase().trim();
  if (["kg", "kilogram", "kilograms", "l", "litre", "litres", "liter", "liters"].includes(u)) return 1000;
  if (["dozen", "dozens"].includes(u)) return 12;
  return 1;
};

async function calculateIngredientsDeduction(supabase, menuItemId, kgQuantity) {
  const { data: portions } = await supabase.from('portions').select('*').eq('menu_item_id', menuItemId);
  if (!portions || portions.length === 0) return {};
  
  const portion = portions.find(p => p.is_default) || portions[0];
  const portionGrams = Number(portion.grams || 400);
  
  const { data: menuComps } = await supabase.from('menu_item_components').select('*').eq('portion_id', portion.id);
  const { data: recipeComps } = await supabase.from('recipe_components').select('*');
  const { data: recipes } = await supabase.from('recipes').select('*');
  const { data: dbIngredients } = await supabase.from('ingredients').select('*');
  
  const totalGramsCooked = Number(kgQuantity) * 1000;
  const portionsCount = totalGramsCooked / portionGrams;
  
  const baseDeductions = {};
  
  const resolveRecipeIngredients = (recipeId, fraction) => {
    const comps = recipeComps?.filter(rc => rc.recipe_id === recipeId) || [];
    for (const rc of comps) {
      if (rc.component_type === 'ingredient' && rc.ingredient_id) {
        const qty = Number(rc.quantity_in_base_unit || rc.quantity) * fraction;
        baseDeductions[rc.ingredient_id] = (baseDeductions[rc.ingredient_id] || 0) + qty;
      } else if (rc.component_type === 'recipe' && rc.child_recipe_id) {
        const childRecipe = recipes?.find(r => r.id === rc.child_recipe_id);
        if (childRecipe) {
          const childOutputBase = Number(childRecipe.output_quantity_in_base_unit || 1000);
          const childQtyUsed = Number(rc.quantity_in_base_unit || rc.quantity);
          const childFraction = (childQtyUsed * fraction) / childOutputBase;
          resolveRecipeIngredients(rc.child_recipe_id, childFraction);
        }
      }
    }
  };

  for (const comp of (menuComps || [])) {
    if (comp.component_type === 'ingredient' || comp.component_type === 'packaging') {
      const ingId = comp.ingredient_id;
      if (ingId) {
        const qty = Number(comp.quantity_in_base_unit || comp.quantity) * portionsCount;
        baseDeductions[ingId] = (baseDeductions[ingId] || 0) + qty;
      }
    } else if (comp.component_type === 'recipe') {
      const recipeId = comp.recipe_id;
      const recipe = recipes?.find(r => r.id === recipeId);
      if (recipe) {
        const recipeOutputBase = Number(recipe.output_quantity_in_base_unit || 1000);
        const recipeQtyUsedPerPortion = Number(comp.quantity_in_base_unit || comp.quantity);
        const recipeGramsCooked = recipeQtyUsedPerPortion * portionsCount;
        const recipeFraction = recipeGramsCooked / recipeOutputBase;
        resolveRecipeIngredients(recipeId, recipeFraction);
      }
    }
  }

  const finalDeductions = {};
  for (const [ingId, qtyBase] of Object.entries(baseDeductions)) {
    const ing = dbIngredients?.find(i => i.id === ingId);
    if (ing) {
      const factor = getUnitBaseFactor(ing.unit);
      finalDeductions[ingId] = qtyBase / factor;
    }
  }
  
  return finalDeductions;
}

export const useInventoryStore = create((set, get) => ({
  menuItems: initialInventory.menuItems,
  portions: initialInventory.portions,
  ingredients: initialInventory.ingredients,
  recipes: initialInventory.recipes,
  externalMappings: initialInventory.externalMappings,
  batchLogs: initialInventory.batchLogs,
  setAll: (payload) => {
    set((state) => {
      const nextPortions = payload.portions?.length ? payload.portions : state.portions;
      const nextMappings = payload.externalMappings?.length ? payload.externalMappings : state.externalMappings;
      const nextState = {
        menuItems: payload.menuItems || state.menuItems,
        ingredients: payload.ingredients || state.ingredients,
        recipes: payload.recipes || state.recipes,
        batchLogs: payload.batchLogs || state.batchLogs,
        portions: nextPortions,
        externalMappings: nextMappings
      };
      persistInventory(nextState);
      return nextState;
    });
  },
  logBatch: async (menuItemId, kgCooked) => {
    let deductionsMap = {};
    const ingredients = get().ingredients;
    if (supabase) {
      deductionsMap = await calculateIngredientsDeduction(supabase, menuItemId, kgCooked);
    }
    
    let shortageIngredient = null;
    let shortageAmount = 0;
    
    for (const [ingId, amount] of Object.entries(deductionsMap)) {
      const ingredient = ingredients.find(i => i.id === ingId);
      if (!ingredient || Number(ingredient.current_stock) - amount < 0) {
        shortageIngredient = ingredient;
        shortageAmount = amount;
        break;
      }
    }
    
    if (shortageIngredient) {
      return {
        ok: false,
        message: `Not enough ${shortageIngredient.name} in stock. You have ${shortageIngredient.current_stock} ${shortageIngredient.unit} but this batch needs ${shortageAmount.toFixed(2)} ${shortageIngredient.unit}.`
      };
    }

    const batch = {
      id: crypto.randomUUID?.() || uid('batch'),
      menu_item_id: menuItemId,
      date: todayISO(),
      kg_cooked: Number(kgCooked),
      kg_sold: 0,
      estimated_waste_cost: Number(kgCooked) * 90,
      logged_at: new Date().toISOString()
    };

    if (supabase) {
      const { error: batchError } = await supabase.from('batch_logs').insert(batch);
      if (batchError) return { ok: false, message: batchError.message };
      for (const [ingId, amount] of Object.entries(deductionsMap)) {
        const ingredient = ingredients.find(i => i.id === ingId);
        const nextStock = Number(ingredient.current_stock) - amount;
        const { error } = await supabase
          .from('ingredients')
          .update({ current_stock: nextStock })
          .eq('id', ingId);
        if (error) return { ok: false, message: error.message };
      }
    }

    set((state) => {
      const next = {
        ...state,
        batchLogs: [batch, ...state.batchLogs],
        ingredients: state.ingredients.map((ingredient) => {
          const deductionAmount = deductionsMap[ingredient.id];
          return deductionAmount ? { ...ingredient, current_stock: Number(ingredient.current_stock) - deductionAmount } : ingredient;
        })
      };
      persistInventory(next);
      return { batchLogs: next.batchLogs, ingredients: next.ingredients };
    });
    return { ok: true };
  },
  addStock: async ({ ingredientId, quantity, amount }) => {
    const ingredient = get().ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return { ok: false, message: 'Choose an ingredient.' };
    const nextStock = Number(ingredient.current_stock) + Number(quantity);
    if (supabase) {
      const { error } = await supabase.from('ingredients').update({ current_stock: nextStock }).eq('id', ingredientId);
      if (error) return { ok: false, message: error.message };
    }
    set((state) => {
      const ingredients = state.ingredients.map((item) => (item.id === ingredientId ? { ...item, current_stock: nextStock } : item));
      persistInventory({ ...state, ingredients });
      return { ingredients };
    });
    return { ok: true, ingredient, quantity, amount };
  },
  updateStockAndThreshold: async (ingredientId, nextStock, nextThreshold) => {
    if (supabase) {
      const { error } = await supabase
        .from('ingredients')
        .update({ current_stock: nextStock, low_stock_threshold: nextThreshold })
        .eq('id', ingredientId);
      if (error) return { ok: false, message: error.message };
    }
    set((state) => {
      const ingredients = state.ingredients.map((item) =>
        item.id === ingredientId ? { ...item, current_stock: nextStock, low_stock_threshold: nextThreshold } : item
      );
      persistInventory({ ...state, ingredients });
      return { ingredients };
    });
    return { ok: true };
  },
  addSoldKg: async (menuItemId, kg) => {
    const today = todayISO();
    const todayBatch = get().batchLogs.find((batch) => batch.menu_item_id === menuItemId && batch.date === today);
    const nextSold = todayBatch ? Number(todayBatch.kg_sold || 0) + Number(kg || 0) : Number(kg || 0);
    
    let deductionsMap = {};
    if (supabase) {
      if (todayBatch) {
        await supabase.from('batch_logs').update({ kg_sold: nextSold }).eq('id', todayBatch.id);
      }
      deductionsMap = await calculateIngredientsDeduction(supabase, menuItemId, kg);
      for (const [ingId, amount] of Object.entries(deductionsMap)) {
        const ingredient = get().ingredients.find(i => i.id === ingId);
        if (ingredient) {
          const nextStock = Number(ingredient.current_stock) - amount;
          await supabase.from('ingredients').update({ current_stock: nextStock }).eq('id', ingId);
        }
      }
    }
    
    set((state) => {
      const batchLogs = todayBatch 
        ? state.batchLogs.map((batch) => (batch.id === todayBatch.id ? { ...batch, kg_sold: nextSold } : batch))
        : state.batchLogs;
      const ingredients = state.ingredients.map((ingredient) => {
        const deductionAmount = deductionsMap[ingredient.id];
        return deductionAmount ? { ...ingredient, current_stock: Number(ingredient.current_stock) - deductionAmount } : ingredient;
      });
      persistInventory({ ...state, batchLogs, ingredients });
      return { batchLogs, ingredients };
    });
  },
  addIngredient: async (input) => {
    let restaurantId = null;
    if (supabase) {
      const { data } = await supabase.from('restaurants').select('id').limit(1);
      if (data && data[0]) restaurantId = data[0].id;
    }
    const id = crypto.randomUUID?.() || uid('ing');
    const ingredient = {
      id,
      restaurant_id: restaurantId,
      name: input.name,
      unit: input.unit || 'kg',
      current_stock: Number(input.current_stock || 0),
      low_stock_threshold: Number(input.low_stock_threshold || 0)
    };

    if (supabase) {
      const { error } = await supabase.from('ingredients').insert(ingredient);
      if (error) return { ok: false, message: error.message };
    }

    set((state) => {
      const ingredients = [ingredient, ...state.ingredients];
      persistInventory({ ...state, ingredients });
      return { ingredients };
    });
    return { ok: true, ingredient };
  },
  addMenuItem: async (input) => {
    let restaurantId = null;
    if (supabase) {
      const { data } = await supabase.from('restaurants').select('id').limit(1);
      if (data && data[0]) restaurantId = data[0].id;
    }
    const id = crypto.randomUUID?.() || uid('menu');
    const menuItem = {
      id,
      restaurant_id: restaurantId,
      name: input.name,
      category: input.category || 'menu',
      price_full: Number(input.price_full || 0),
      price_half: Number(input.price_half || 0),
      portion_full_grams: Number(input.portion_full_grams || 400),
      portion_half_grams: Number(input.portion_half_grams || 0),
      is_active: true,
      price_paise: Math.round(Number(input.price_full || 0) * 100)
    };
    
    const defaultPortion = {
      id: crypto.randomUUID?.() || uid('portion'),
      menu_item_id: id,
      name: 'Full',
      grams: menuItem.portion_full_grams,
      price: menuItem.price_full,
      source: 'manual'
    };

    if (supabase) {
      await supabase.from('menu_items').insert(menuItem);
      await supabase.from('portions').insert(defaultPortion);
    }
    set((state) => {
      const menuItems = [menuItem, ...state.menuItems];
      const portions = [defaultPortion, ...state.portions];
      persistInventory({ ...state, menuItems, portions });
      return { menuItems, portions };
    });
    return menuItem;
  },
  updateMenuItem: async (menuItem) => {
    if (supabase) {
      const { id, created_at, ...updateData } = menuItem;
      updateData.price_paise = Math.round(Number(menuItem.price_full || 0) * 100);
      await supabase.from('menu_items').update(updateData).eq('id', id);
    }
    set((state) => {
      const menuItems = state.menuItems.map((item) => (item.id === menuItem.id ? menuItem : item));
      persistInventory({ ...state, menuItems });
      return { menuItems };
    });
  },
  updatePortions: async (menuItemId, portions) => {
    const nextPortions = portions.map((p) => ({
      id: p.id || crypto.randomUUID?.() || uid('portion'),
      menu_item_id: menuItemId,
      name: p.name,
      grams: Number(p.grams || 0),
      price: Number(p.price || 0),
      source: p.source || 'manual'
    }));

    if (supabase) {
      await supabase.from('portions').delete().eq('menu_item_id', menuItemId);
      if (nextPortions.length > 0) {
        await supabase.from('portions').insert(nextPortions);
        
        // Find the 'Full' portion or first portion to sync to menu_items.price_paise
        const mainPortion = nextPortions.find(p => p.name.toLowerCase() === 'full') || nextPortions[0];
        if (mainPortion) {
          const pricePaise = Math.round(Number(mainPortion.price || 0) * 100);
          await supabase.from('menu_items').update({
            price_paise: pricePaise,
            price_full: mainPortion.price,
            portion_full_grams: mainPortion.grams
          }).eq('id', menuItemId);
        }
      }
    }

    set((state) => {
      const updated = [
        ...state.portions.filter((p) => p.menu_item_id !== menuItemId),
        ...nextPortions
      ];
      // Keep menuItems client state in sync with updated pricing fields
      const mainPortion = nextPortions.find(p => p.name.toLowerCase() === 'full') || nextPortions[0];
      const menuItems = state.menuItems.map((item) => {
        if (item.id === menuItemId && mainPortion) {
          return {
            ...item,
            price_full: mainPortion.price,
            portion_full_grams: mainPortion.grams,
            price_paise: Math.round(Number(mainPortion.price || 0) * 100)
          };
        }
        return item;
      });
      persistInventory({ ...state, portions: updated, menuItems });
      return { portions: updated, menuItems };
    });
  },
  replaceRecipesForMenu: async (menuItemId, recipes) => {
    let restaurantId = null;
    if (supabase) {
      const { data } = await supabase.from('restaurants').select('id').limit(1);
      if (data && data[0]) restaurantId = data[0].id;
    }
    
    // In migration 004, the recipes table has restaurant_id, menu_item_id, portion_grams.
    // It is linked to recipe_ingredients which has recipe_id, ingredient_name, quantity, unit.
    if (supabase) {
      // 1. Delete old recipe details
      const { data: oldRecipe } = await supabase.from('recipes').select('id').eq('menu_item_id', menuItemId).single();
      if (oldRecipe?.id) {
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', oldRecipe.id);
      }
      await supabase.from('recipes').delete().eq('menu_item_id', menuItemId);

      // 2. Insert new recipe
      const recipeId = crypto.randomUUID?.() || uid('recipe');
      const baseQty = recipes[0]?.base_quantity || 1;
      const baseUnit = recipes[0]?.base_unit || 'kg';
      
      await supabase.from('recipes').insert({
        id: recipeId,
        restaurant_id: restaurantId,
        menu_item_id: menuItemId,
        portion_grams: Number(baseQty) // or map to default base portion
      });

      // 3. Insert recipe ingredients
      const ingredientsToInsert = recipes.map((r) => ({
        recipe_id: recipeId,
        ingredient_name: r.ingredient_id, // maps to local ID or name
        quantity: Number(r.quantity),
        unit: r.unit
      }));

      if (ingredientsToInsert.length > 0) {
        await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
      }
    }

    set((state) => {
      const nextRecipes = [
        ...state.recipes.filter((recipe) => recipe.menu_item_id !== menuItemId),
        ...recipes.map((recipe) => ({ ...recipe, menu_item_id: menuItemId }))
      ];
      persistInventory({ ...state, recipes: nextRecipes });
      return { recipes: nextRecipes };
    });
  },
  updateRecipes: (recipes) =>
    set((state) => {
      const nextRecipes = state.recipes.map((recipe) => recipes.find((item) => item.id === recipe.id) || recipe);
      persistInventory({ ...state, recipes: nextRecipes });
      return { recipes: nextRecipes };
    }),
  upsertExternalMapping: (mapping) =>
    set((state) => {
      const next = { ...mapping, id: mapping.id || uid('mapping') };
      const exists = state.externalMappings.some((item) => item.id === next.id || (item.source === next.source && item.external_item_name === next.external_item_name));
      const externalMappings = exists
          ? state.externalMappings.map((item) => (item.id === next.id || (item.source === next.source && item.external_item_name === next.external_item_name) ? next : item))
          : [next, ...state.externalMappings];
      persistInventory({ ...state, externalMappings });
      return { externalMappings };
    }),
  deleteExternalMapping: (id) =>
    set((state) => {
      const externalMappings = state.externalMappings.filter((item) => item.id !== id);
      persistInventory({ ...state, externalMappings });
      return { externalMappings };
    })
}));
