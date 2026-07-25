import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  Search,
  Filter,
  Copy,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Coins,
  Package,
  BookOpen,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Tag,
  Info
} from "lucide-react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { formatINR } from "../lib/format";

export default function MenuSetup() {
  const [activeTab, setActiveTab] = useState("ingredients");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Database state
  const [dbState, setDbState] = useState(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  // Modal control states
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState(null);

  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState(null);

  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [activeMenuComposition, setActiveMenuComposition] = useState(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryType, setCategoryType] = useState("ingredient");
  const [activeCategory, setActiveCategory] = useState(null);

  // Load costing state directly from Supabase
  const loadData = async () => {
    setLoading(true);
    try {
      // Get the restaurant ID first
      const { data: rest, error: restErr } = await supabase.from("restaurants").select("id").limit(1).single();
      if (restErr) throw restErr;
      const rid = rest.id;

      const [
        ingCats,
        ingredients,
        recCats,
        recipes,
        recComponents,
        recAddCosts,
        menuCats,
        menuItems,
        portions,
        menuComponents,
        recalcLogs,
        priceHistory
      ] = await Promise.all([
        supabase.from("ingredient_categories").select("*").eq("restaurant_id", rid).order("display_order", { ascending: true }),
        supabase.from("ingredients").select("*").eq("restaurant_id", rid).order("name", { ascending: true }),
        supabase.from("recipe_categories").select("*").eq("restaurant_id", rid).order("display_order", { ascending: true }),
        supabase.from("recipes").select("*").eq("restaurant_id", rid).order("name", { ascending: true }),
        supabase.from("recipe_components").select("*"),
        supabase.from("recipe_additional_costs").select("*"),
        supabase.from("menu_categories").select("*").eq("restaurant_id", rid).order("display_order", { ascending: true }),
        supabase.from("menu_items").select("*").eq("restaurant_id", rid).order("sort_order", { ascending: true }),
        supabase.from("portions").select("*").order("name", { ascending: true }),
        supabase.from("menu_item_components").select("*"),
        supabase.from("cost_recalculation_logs").select("*").order("recalculated_at", { ascending: false }).limit(20),
        supabase.from("ingredient_price_history").select("*, ingredients(name)").order("changed_at", { ascending: false }).limit(30)
      ]);

      setDbState({
        restaurantId: rid,
        ingredientCategories: ingCats.data || [],
        ingredients: ingredients.data || [],
        recipeCategories: recCats.data || [],
        recipes: recipes.data || [],
        recipeComponents: recComponents.data || [],
        recipeAdditionalCosts: recAddCosts.data || [],
        menuCategories: menuCats.data || [],
        menuItems: menuItems.data || [],
        portions: portions.data || [],
        menuItemComponents: menuComponents.data || [],
        costRecalculationLogs: recalcLogs.data || [],
        priceHistory: (priceHistory.data || []).map((h) => ({
          id: h.id,
          ingredientName: h.ingredients?.name || "Unknown",
          previousPrice: Number(h.previous_price),
          newPrice: Number(h.new_price),
          previousCostPerBaseUnit: Number(h.previous_cost_per_base_unit),
          newCostPerBaseUnit: Number(h.new_cost_per_base_unit),
          changedAt: h.changed_at
        }))
      });
    } catch (err) {
      setErrorMessage(err.message || "Failed to load database records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerNotification = (text, type) => {
    if (type === "success") {
      setSuccessMessage(text);
      setTimeout(() => setSuccessMessage(null), 4000);
    } else {
      setErrorMessage(text);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const getUnitBaseFactor = (unit) => {
    const u = (unit || "kg").toLowerCase().trim();
    if (["kg", "kilogram", "kilograms", "l", "litre", "litres", "liter", "liters"].includes(u)) return 1000;
    if (["dozen", "dozens"].includes(u)) return 12;
    return 1;
  };

  const getBaseUnitLabel = (unit) => {
    const u = (unit || "kg").toLowerCase().trim();
    if (["kg", "kilogram", "kilograms", "g", "gram", "grams"].includes(u)) return "g";
    if (["l", "litre", "litres", "liter", "liters", "ml", "millilitre", "millilitres"].includes(u)) return "ml";
    return "pcs";
  };

  const formatBaseUnitCost = (amount) => {
    const num = Number(amount || 0);
    if (num === 0) return "₹0.00";
    const decimals = num < 1 ? 4 : 2;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  };

  const formatDecimalINR = (amount, decimals = 2) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(Number(amount || 0));
  };

  // Save Ingredient
  const handleSaveIngredient = async () => {
    if (!activeIngredient || !activeIngredient.name || !dbState) return;
    try {
      let qtyBase = 1;
      const unit = (activeIngredient.purchase_unit || "kg").toLowerCase();
      if (["kg", "kilogram", "kilograms"].includes(unit)) qtyBase = activeIngredient.purchase_quantity * 1000;
      else if (["l", "litre", "litres", "liter", "liters"].includes(unit)) qtyBase = activeIngredient.purchase_quantity * 1000;
      else if (["dozen", "dozens"].includes(unit)) qtyBase = activeIngredient.purchase_quantity * 12;
      else qtyBase = activeIngredient.purchase_quantity;

      const costPerBaseUnit = activeIngredient.purchase_price / (qtyBase || 1);

      const row = {
        restaurant_id: dbState.restaurantId,
        category_id: activeIngredient.category_id || null,
        name: activeIngredient.name.trim(),
        purchase_price: activeIngredient.purchase_price,
        purchase_quantity: activeIngredient.purchase_quantity,
        purchase_unit: activeIngredient.purchase_unit,
        base_unit: getBaseUnitLabel(activeIngredient.purchase_unit || "kg"),
        cost_per_base_unit: costPerBaseUnit,
        supplier_name: activeIngredient.supplier_name || null,
        notes: activeIngredient.notes || null,
        current_stock: activeIngredient.current_stock || 0,
        low_stock_threshold: activeIngredient.low_stock_threshold || 1,
        is_active: activeIngredient.is_active ?? true
      };

      let err;
      if (activeIngredient.id) {
        const { error } = await supabase.from("ingredients").update(row).eq("id", activeIngredient.id);
        err = error;
      } else {
        const { error } = await supabase.from("ingredients").insert(row);
        err = error;
      }

      if (err) throw err;
      triggerNotification("Ingredient saved successfully.", "success");
      setIngredientModalOpen(false);
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to save ingredient.", "error");
    }
  };

  // Delete Ingredient
  const handleDeleteIngredient = async (id) => {
    if (!confirm("Are you sure you want to delete this ingredient?")) return;
    try {
      const { data: recComp } = await supabase.from("recipe_components").select("recipe_id").eq("ingredient_id", id);
      const { data: menuComp } = await supabase.from("menu_item_components").select("portion_id").eq("ingredient_id", id);

      if ((recComp && recComp.length > 0) || (menuComp && menuComp.length > 0)) {
        throw new Error("This ingredient is used in recipes or menu items. Remove it from those first.");
      }

      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) throw error;

      triggerNotification("Ingredient deleted successfully.", "success");
      loadData();
    } catch (err) {
      triggerNotification(err.message, "error");
    }
  };

  // Save Recipe
  const handleSaveRecipe = async () => {
    if (!activeRecipe || !activeRecipe.name || !dbState) return;
    try {
      const ingCost = activeRecipe.components.reduce((sum, c) => sum + c.calculated_cost, 0);
      const addCost = activeRecipe.additionalCosts.reduce((sum, a) => sum + Number(a.amount || 0), 0);
      const totalCost = ingCost + addCost;

      let qtyBase = 1;
      const unit = (activeRecipe.output_unit || "kg").toLowerCase();
      if (["kg", "kilogram", "kilograms"].includes(unit)) qtyBase = activeRecipe.output_quantity * 1000;
      else if (["l", "litre", "litres", "liter", "liters"].includes(unit)) qtyBase = activeRecipe.output_quantity * 1000;
      else qtyBase = activeRecipe.output_quantity;

      const costPerBaseUnit = totalCost / (qtyBase || 1);

      const recipeRow = {
        restaurant_id: dbState.restaurantId,
        recipe_category_id: activeRecipe.recipe_category_id || null,
        name: activeRecipe.name.trim(),
        description: activeRecipe.description || null,
        preparation_notes: activeRecipe.preparation_notes || null,
        output_quantity: activeRecipe.output_quantity,
        output_unit: activeRecipe.output_unit,
        output_quantity_in_base_unit: qtyBase,
        ingredient_cost: ingCost,
        additional_cost: addCost,
        total_cost: totalCost,
        cost_per_base_unit: costPerBaseUnit,
        is_active: activeRecipe.is_active ?? true
      };

      let recipeId = activeRecipe.id;
      if (recipeId) {
        const { error: recErr } = await supabase.from("recipes").update(recipeRow).eq("id", recipeId);
        if (recErr) throw recErr;
      } else {
        const { data: newRec, error: recErr } = await supabase.from("recipes").insert(recipeRow).select("id").single();
        if (recErr) throw recErr;
        recipeId = newRec.id;
      }

      // Sync components
      await supabase.from("recipe_components").delete().eq("recipe_id", recipeId);
      if (activeRecipe.components.length > 0) {
        const compRows = activeRecipe.components.map((c, idx) => {
          let cQtyBase = 1;
          const cUnit = (c.unit || "g").toLowerCase();
          if (["kg", "kilogram", "kilograms"].includes(cUnit)) cQtyBase = c.quantity * 1000;
          else if (["l", "litre", "litres", "liter", "liters"].includes(cUnit)) cQtyBase = c.quantity * 1000;
          else cQtyBase = c.quantity;

          return {
            recipe_id: recipeId,
            component_type: c.component_type,
            ingredient_id: c.ingredient_id || null,
            child_recipe_id: c.child_recipe_id || null,
            quantity: c.quantity,
            unit: c.unit,
            quantity_in_base_unit: cQtyBase,
            calculated_cost: c.calculated_cost,
            display_order: idx
          };
        });
        const { error: insComps } = await supabase.from("recipe_components").insert(compRows);
        if (insComps) throw insComps;
      }

      // Sync additional costs
      await supabase.from("recipe_additional_costs").delete().eq("recipe_id", recipeId);
      if (activeRecipe.additionalCosts.length > 0) {
        const addRows = activeRecipe.additionalCosts.map((c) => ({
          recipe_id: recipeId,
          cost_name: c.cost_name,
          amount: Number(c.amount) || 0,
          notes: c.notes || null
        }));
        const { error: insAdd } = await supabase.from("recipe_additional_costs").insert(addRows);
        if (insAdd) throw insAdd;
      }

      triggerNotification("Recipe saved successfully. Cascading recalculations triggered.", "success");
      setRecipeModalOpen(false);
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to save recipe.", "error");
    }
  };

  // Duplicate Recipe
  const handleDuplicateRecipe = async (id) => {
    try {
      const { data: rec, error: recErr } = await supabase.from("recipes").select("*").eq("id", id).single();
      if (recErr) throw recErr;

      const { data: comps } = await supabase.from("recipe_components").select("*").eq("recipe_id", id);
      const { data: adds } = await supabase.from("recipe_additional_costs").select("*").eq("recipe_id", id);

      const newName = `${rec.name} (Copy)`;
      const { data: newRec, error: insErr } = await supabase
        .from("recipes")
        .insert({
          restaurant_id: rec.restaurant_id,
          recipe_category_id: rec.recipe_category_id,
          name: newName,
          description: rec.description,
          preparation_notes: rec.preparation_notes,
          output_quantity: rec.output_quantity,
          output_unit: rec.output_unit,
          output_quantity_in_base_unit: rec.output_quantity_in_base_unit,
          ingredient_cost: rec.ingredient_cost,
          additional_cost: rec.additional_cost,
          total_cost: rec.total_cost,
          cost_per_base_unit: rec.cost_per_base_unit,
          is_active: rec.is_active
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      if (comps && comps.length > 0) {
        const compRows = comps.map((c) => ({
          recipe_id: newRec.id,
          component_type: c.component_type,
          ingredient_id: c.ingredient_id,
          child_recipe_id: c.child_recipe_id,
          quantity: c.quantity,
          unit: c.unit,
          quantity_in_base_unit: c.quantity_in_base_unit,
          calculated_cost: c.calculated_cost,
          display_order: c.display_order
        }));
        await supabase.from("recipe_components").insert(compRows);
      }

      if (adds && adds.length > 0) {
        const addRows = adds.map((a) => ({
          recipe_id: newRec.id,
          cost_name: a.cost_name,
          amount: a.amount,
          notes: a.notes
        }));
        await supabase.from("recipe_additional_costs").insert(addRows);
      }

      triggerNotification("Recipe duplicated successfully.", "success");
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to duplicate recipe.", "error");
    }
  };

  // Delete Recipe
  const handleDeleteRecipe = async (id) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    try {
      const { data: recComp } = await supabase.from("recipe_components").select("recipe_id").eq("child_recipe_id", id);
      const { data: menuComp } = await supabase.from("menu_item_components").select("portion_id").eq("recipe_id", id);

      if ((recComp && recComp.length > 0) || (menuComp && menuComp.length > 0)) {
        throw new Error("This recipe is nested inside another recipe or menu variant. Remove it from those first.");
      }

      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;

      triggerNotification("Recipe deleted successfully.", "success");
      loadData();
    } catch (err) {
      triggerNotification(err.message, "error");
    }
  };

  // Save Menu Composition
  const handleSaveMenuComposition = async () => {
    if (!activeMenuComposition) return;
    try {
      // 1. Update MenuItem details
      const { error: itemErr } = await supabase
        .from("menu_items")
        .update({
          name: activeMenuComposition.name,
          menu_category_id: activeMenuComposition.menu_category_id || null,
          item_type: activeMenuComposition.item_type,
          cost_mode: activeMenuComposition.cost_mode,
          manual_preparation_cost: activeMenuComposition.manual_preparation_cost,
          available: activeMenuComposition.is_active,
          updated_at: new Date().toISOString()
        })
        .eq("id", activeMenuComposition.menuItemId);

      if (itemErr) throw itemErr;

      // 2. Sync variants & components
      for (const v of activeMenuComposition.variants) {
        let variantId = v.id;

        let totalPrep = 0;
        if (activeMenuComposition.cost_mode === "manual") {
          totalPrep = activeMenuComposition.manual_preparation_cost;
        } else {
          totalPrep = v.components.reduce((sum, c) => sum + c.calculated_cost, 0);
        }

        const profit = v.price - totalPrep;
        const foodCostPct = v.price > 0 ? (totalPrep / v.price) * 100 : 0;
        const marginPct = v.price > 0 ? (profit / v.price) * 100 : 0;

        const variantRow = {
          menu_item_id: activeMenuComposition.menuItemId,
          name: v.name,
          grams: v.grams,
          price: v.price,
          preparation_cost: totalPrep,
          gross_profit: profit,
          food_cost_percentage: foodCostPct,
          gross_margin_percentage: marginPct,
          is_default: v.is_default,
          is_active: v.is_active,
          updated_at: new Date().toISOString()
        };

        if (variantId) {
          const { error: varErr } = await supabase.from("portions").update(variantRow).eq("id", variantId);
          if (varErr) throw varErr;
        } else {
          const { data: newVar, error: varErr } = await supabase
            .from("portions")
            .insert({ ...variantRow, source: "counter" })
            .select("id")
            .single();
          if (varErr) throw varErr;
          variantId = newVar.id;
        }

        // Sync components
        await supabase.from("menu_item_components").delete().eq("portion_id", variantId);
        if (activeMenuComposition.cost_mode === "automatic" && v.components.length > 0) {
          const compRows = v.components.map((c, idx) => {
            let cQtyBase = 1;
            const cUnit = (c.unit || "g").toLowerCase();
            if (["kg", "kilogram", "kilograms"].includes(cUnit)) cQtyBase = c.quantity * 1000;
            else if (["l", "litre", "litres", "liter", "liters"].includes(cUnit)) cQtyBase = c.quantity * 1000;
            else cQtyBase = c.quantity;

            return {
              portion_id: variantId,
              component_type: c.component_type,
              recipe_id: c.recipe_id || null,
              ingredient_id: c.ingredient_id || null,
              linked_portion_id: c.linked_portion_id || null,
              component_name: c.component_name || null,
              quantity: c.quantity,
              unit: c.unit,
              quantity_in_base_unit: cQtyBase,
              unit_cost: c.unit_cost,
              calculated_cost: c.calculated_cost,
              display_order: idx
            };
          });
          const { error: insComps } = await supabase.from("menu_item_components").insert(compRows);
          if (insComps) throw insComps;
        }
      }

      triggerNotification("Menu composition saved successfully.", "success");
      setMenuModalOpen(false);
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to save menu configuration.", "error");
    }
  };

  // Toggle Menu Item Availability (Active / Out of Stock)
  const handleToggleMenuAvailability = async (item) => {
    const nextStatus = !item.available;
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({
          available: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.id);

      if (error) throw error;
      triggerNotification(`${item.name} availability updated to ${nextStatus ? 'Available' : 'Unavailable'}.`, "success");
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to update availability.", "error");
    }
  };

  // Save Category
  const handleSaveCategory = async () => {
    if (!activeCategory || !activeCategory.name || !dbState) return;
    try {
      const table =
        categoryType === "ingredient"
          ? "ingredient_categories"
          : categoryType === "recipe"
          ? "recipe_categories"
          : "menu_categories";

      const row = {
        restaurant_id: dbState.restaurantId,
        name: activeCategory.name.trim(),
        display_order: activeCategory.display_order ?? 0,
        is_active: activeCategory.is_active ?? true
      };

      let err;
      if (activeCategory.id) {
        const { error } = await supabase.from(table).update(row).eq("id", activeCategory.id);
        err = error;
      } else {
        const { error } = await supabase.from(table).insert(row);
        err = error;
      }

      if (err) throw err;
      triggerNotification("Category saved successfully.", "success");
      setCategoryModalOpen(false);
      loadData();
    } catch (err) {
      triggerNotification(err.message || "Failed to save category.", "error");
    }
  };

  // Delete Category
  const handleDeleteCategory = async (id, type) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
      const table =
        type === "ingredient"
          ? "ingredient_categories"
          : type === "recipe"
          ? "recipe_categories"
          : "menu_categories";

      if (type === "ingredient") {
        const { data } = await supabase.from("ingredients").select("id").eq("category_id", id).limit(1);
        if (data && data.length > 0) throw new Error("This category contains ingredients. Move them first.");
      } else if (type === "recipe") {
        const { data } = await supabase.from("recipes").select("id").eq("recipe_category_id", id).limit(1);
        if (data && data.length > 0) throw new Error("This category contains recipes. Move them first.");
      } else if (type === "menu") {
        const { data } = await supabase.from("menu_items").select("id").eq("menu_category_id", id).limit(1);
        if (data && data.length > 0) throw new Error("This category contains menu items. Move them first.");
      }

      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;

      triggerNotification("Category deleted.", "success");
      loadData();
    } catch (err) {
      triggerNotification(err.message, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f1ec]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-3 text-sm font-black text-text-muted">Loading Costing Intelligence Workspace...</p>
        </div>
      </div>
    );
  }

  if (!dbState) return <p className="text-center py-10 text-red-500">Error loading workspace data.</p>;

  // Filter elements
  const filteredIngredients = dbState.ingredients.filter((ing) => {
    const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = catFilter === "all" || ing.category_id === catFilter;
    return matchesSearch && matchesCat;
  });

  const filteredRecipes = dbState.recipes.filter((rec) => {
    const matchesSearch = rec.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = catFilter === "all" || rec.recipe_category_id === catFilter;
    return matchesSearch && matchesCat;
  });

  const filteredMenuItems = dbState.menuItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = catFilter === "all" || item.menu_category_id === catFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f7f1ec]">
      {/* Top Banner Ticker */}
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-4 border-b border-[#eadfd7] bg-[#fffaf6] px-5 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] font-black uppercase text-text-dark">Cost Control Workspace</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-black text-primary uppercase">
            Recalculations Native (SQL Triggers)
          </span>
        </div>
        <div className="text-right text-xs font-bold text-text-muted">
          Active Menu Items: <b>{dbState.menuItems.length}</b> | Formulas: <b>{dbState.recipes.length}</b>
        </div>
      </div>

      {/* Main Tab Panels */}
      <div className="flex flex-1 flex-col overflow-hidden p-5 space-y-4">
        {/* Navigation Tabs bar */}
        <div className="flex shrink-0 gap-1 overflow-x-auto rounded border border-[#eadfd7] bg-white p-1">
          {[
            { key: "ingredients", label: "Master Ingredients", count: dbState.ingredients.length },
            { key: "recipes", label: "Reusable Recipes", count: dbState.recipes.length },
            { key: "menu", label: "Menu Catalog Costing", count: dbState.menuItems.length },
            { key: "categories", label: "Categories Builder" },
            { key: "audit", label: "Price Log & Recalculation Audits" }
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setSearchQuery("");
                setCatFilter("all");
              }}
              className={`rounded-sm px-4 py-2 text-[13px] font-black transition-all ${
                activeTab === t.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-[#5a4b42] hover:bg-[#fff4eb]"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-black ${
                  activeTab === t.key ? "bg-white/20 text-white" : "bg-bg text-text-muted"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div className="rounded-sm bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex gap-2 items-center shrink-0">
            <AlertTriangle size={15} className="text-red-600 shrink-0" />
            <div className="font-bold">{errorMessage}</div>
          </div>
        )}
        {successMessage && (
          <div className="rounded-sm bg-green-50 border border-green-200 p-3 text-xs text-green-800 flex gap-2 items-center shrink-0">
            <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            <div className="font-bold">{successMessage}</div>
          </div>
        )}

        {/* Tab content area */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          
          {/* Ingredients tab */}
          {activeTab === "ingredients" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5 items-center justify-between">
                <div className="flex gap-2 flex-1 max-w-lg">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-3 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Search raw materials..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                    />
                  </div>
                  <select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2.5 text-xs font-bold text-text-dark"
                  >
                    <option value="all">All Categories</option>
                    {dbState.ingredientCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIngredient({
                      purchase_price: 0,
                      purchase_quantity: 1,
                      purchase_unit: "kg",
                      is_active: true
                    });
                    setIngredientModalOpen(true);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-black text-white hover:bg-orange-700 shadow-sm"
                >
                  <Plus size={14} /> Add Ingredient
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredIngredients.map((ing) => {
                  const categoryName = dbState.ingredientCategories.find(c => c.id === ing.category_id)?.name || "Uncategorized";
                  return (
                    <div key={ing.id} className="rounded border border-[#eadfd7] bg-white p-4 shadow-card hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-[14px] text-text-dark">{ing.name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f7f1ec] text-[#7a6051] mt-1 inline-block">{categoryName}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveIngredient(ing);
                              setIngredientModalOpen(true);
                            }}
                            className="h-7 w-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteIngredient(ing.id)}
                            className="h-7 w-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs border-t pt-3 border-dashed border-[#eadfd7]">
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Purchase Cost</p>
                          <p className="font-black text-text-dark mt-0.5">{formatINR(ing.purchase_price)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Purchase Volume</p>
                          <p className="font-bold text-text-dark mt-0.5">{ing.purchase_quantity} {ing.purchase_unit}</p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Base Unit Cost</p>
                          <p className="font-black text-primary mt-0.5">{formatBaseUnitCost(ing.cost_per_base_unit)} / {ing.base_unit}</p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Supplier</p>
                          <p className="font-bold text-text-dark mt-0.5 truncate">{ing.supplier_name || "N/A"}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredIngredients.length === 0 && (
                  <div className="col-span-full py-16 text-center border border-dashed border-[#eadfd7] bg-white rounded">
                    <Package size={20} className="mx-auto text-text-muted mb-2" />
                    <h4 className="font-bold text-sm text-text-dark">No ingredients matched.</h4>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recipes tab */}
          {activeTab === "recipes" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5 items-center justify-between">
                <div className="flex gap-2 flex-1 max-w-lg">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-3 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Search reusable recipe formulas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                    />
                  </div>
                  <select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2.5 text-xs font-bold text-text-dark"
                  >
                    <option value="all">All Categories</option>
                    {dbState.recipeCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveRecipe({
                      name: "",
                      recipe_category_id: null,
                      description: "",
                      preparation_notes: "",
                      output_quantity: 1,
                      output_unit: "kg",
                      is_active: true,
                      components: [],
                      additionalCosts: []
                    });
                    setRecipeModalOpen(true);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-black text-white hover:bg-orange-700 shadow-sm"
                >
                  <Plus size={14} /> Create Recipe Formula
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRecipes.map((rec) => {
                  const categoryName = dbState.recipeCategories.find(c => c.id === rec.recipe_category_id)?.name || "Uncategorized";
                  const compsCount = dbState.recipeComponents.filter(c => c.recipe_id === rec.id).length;
                  const usedInPortionsCount = dbState.menuItemComponents.filter(c => c.component_type === "recipe" && c.recipe_id === rec.id).length;

                  return (
                    <div key={rec.id} className="rounded border border-[#eadfd7] bg-white p-4 shadow-card hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-[14px] text-text-dark">{rec.name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f7f1ec] text-[#7a6051] mt-1 inline-block">{categoryName}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const comps = dbState.recipeComponents.filter(c => c.recipe_id === rec.id).map(c => ({
                                component_type: c.component_type,
                                ingredient_id: c.ingredient_id,
                                child_recipe_id: c.child_recipe_id,
                                quantity: Number(c.quantity),
                                unit: c.unit,
                                calculated_cost: Number(c.calculated_cost)
                              }));
                              const adds = dbState.recipeAdditionalCosts.filter(a => a.recipe_id === rec.id).map(a => ({
                                cost_name: a.cost_name,
                                amount: Number(a.amount),
                                notes: a.notes || ""
                              }));

                              setActiveRecipe({
                                id: rec.id,
                                recipe_category_id: rec.recipe_category_id,
                                name: rec.name,
                                description: rec.description || "",
                                preparation_notes: rec.preparation_notes || "",
                                output_quantity: Number(rec.output_quantity),
                                output_unit: rec.output_unit,
                                is_active: rec.is_active,
                                components: comps,
                                additionalCosts: adds
                              });
                              setRecipeModalOpen(true);
                            }}
                            className="h-7 w-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRecipe(rec.id)}
                            className="h-7 w-7 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center hover:bg-orange-100"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecipe(rec.id)}
                            className="h-7 w-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs border-t pt-3 border-dashed border-[#eadfd7]">
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Yield Quantity</p>
                          <p className="font-extrabold text-text-dark mt-0.5">{rec.output_quantity} {rec.output_unit}</p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Total Batch Cost</p>
                          <p className="font-black text-text-dark mt-0.5">{formatINR(rec.total_cost)}</p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">Cost per unit</p>
                          <p className="font-black text-primary mt-0.5">
                            {formatBaseUnitCost(rec.cost_per_base_unit * (rec.output_unit.toLowerCase() === "kg" ? 100 : 1))} per {rec.output_unit.toLowerCase() === "kg" ? "100g" : rec.output_unit}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted uppercase text-[9px] font-bold">reusability</p>
                          <p className="font-bold text-text-dark mt-0.5">Used in {usedInPortionsCount} sizes</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredRecipes.length === 0 && (
                  <div className="col-span-full py-16 text-center border border-dashed border-[#eadfd7] bg-white rounded">
                    <ChefHat size={20} className="mx-auto text-text-muted mb-2" />
                    <h4 className="font-bold text-sm text-text-dark">No recipes matched.</h4>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Menu costing tab */}
          {activeTab === "menu" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5 items-center justify-between">
                <div className="flex gap-2 flex-1 max-w-lg">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-3 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Search menu items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-9 w-full rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                    />
                  </div>
                  <select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2.5 text-xs font-bold text-text-dark"
                  >
                    <option value="all">All Categories</option>
                    {dbState.menuCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMenuItems.map((item) => {
                  const categoryName = dbState.menuCategories.find(c => c.id === item.menu_category_id)?.name || "Uncategorized";
                  const itemPortions = dbState.portions.filter(p => p.menu_item_id === item.id);

                  return (
                    <div key={item.id} className="rounded border border-[#eadfd7] bg-white p-4 shadow-card hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-[14px] text-text-dark">{item.name}</h4>
                          <div className="flex gap-1.5 mt-1 items-center">
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#f7f1ec] text-[#7a6051] uppercase">{categoryName}</span>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                              item.item_type === "Veg" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            }`}>{item.item_type}</span>
                            <span className="text-[9px] text-text-muted">({item.cost_mode === "manual" ? "Manual" : "Recipe"})</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleMenuAvailability(item)}
                            className={`px-2.5 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all border ${
                              item.available
                                ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                            }`}
                          >
                            {item.available ? "● Active" : "○ Out of Stock"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const mappedVariants = itemPortions.map((p) => {
                                const components = dbState.menuItemComponents.filter(c => c.portion_id === p.id).map(c => ({
                                  component_type: c.component_type,
                                  recipe_id: c.recipe_id || undefined,
                                  ingredient_id: c.ingredient_id || undefined,
                                  linked_portion_id: c.linked_portion_id || undefined,
                                  component_name: c.component_name || undefined,
                                  quantity: Number(c.quantity),
                                  unit: c.unit,
                                  unit_cost: Number(c.unit_cost),
                                  calculated_cost: Number(c.calculated_cost)
                                }));
                                return {
                                  id: p.id,
                                  name: p.name,
                                  grams: Number(p.grams || 400),
                                  price: Number(p.price || 0),
                                  is_default: p.is_default,
                                  is_active: p.is_active,
                                  components
                                };
                              });

                              setActiveMenuComposition({
                                menuItemId: item.id,
                                name: item.name,
                                menu_category_id: item.menu_category_id,
                                item_type: item.item_type,
                                cost_mode: item.cost_mode,
                                manual_preparation_cost: Number(item.manual_preparation_cost || 0),
                                is_active: item.available,
                                variants: mappedVariants
                              });
                              setMenuModalOpen(true);
                            }}
                            className="rounded border border-[#eadfd7] px-3 py-1.5 text-[10px] font-black text-[#5a4b42] hover:bg-[#fff4eb]"
                          >
                            Cost Config
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t pt-3 space-y-2 border-[#eadfd7]">
                        {itemPortions.map((p) => (
                          <div key={p.id} className="flex justify-between items-center text-xs bg-[#fffcf9] p-2 rounded border border-[#f0e4db]">
                            <span className="font-bold text-text-dark">{p.name} ({p.grams}g)</span>
                            <div className="text-right">
                              <p className="font-black text-text-dark">{formatINR(p.price)}</p>
                              <p className="text-[10px] text-text-muted mt-0.5">
                                Food Cost: <b>{p.food_cost_percentage.toFixed(0)}%</b> | Profit: <span className="font-black text-green-700">{formatINR(p.gross_profit)}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Categories tab */}
          {activeTab === "categories" && (
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { type: "ingredient", title: "Ingredient Categories", list: dbState.ingredientCategories },
                { type: "recipe", title: "Recipe Categories", list: dbState.recipeCategories },
                { type: "menu", title: "Menu Categories", list: dbState.menuCategories }
              ].map((catGroup) => (
                <div key={catGroup.type} className="rounded border border-[#eadfd7] bg-white p-4 shadow-card">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="font-black text-xs uppercase tracking-wider text-text-dark">{catGroup.title}</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryType(catGroup.type);
                        setActiveCategory({ name: "", display_order: catGroup.list.length });
                        setCategoryModalOpen(true);
                      }}
                      className="rounded border border-[#eadfd7] px-2.5 py-1 text-[10px] font-black text-[#5a4b42] hover:bg-[#fff4eb]"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {catGroup.list.map((c) => (
                      <div key={c.id} className="flex justify-between items-center p-2 rounded bg-[#fffcf9] border border-[#f0e4db] text-xs">
                        <span className="font-bold text-text-dark">{c.name}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryType(catGroup.type);
                              setActiveCategory(c);
                              setCategoryModalOpen(true);
                            }}
                            className="text-primary hover:text-orange-700 font-bold"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c.id, catGroup.type)}
                            className="text-red-500 hover:text-red-700 font-bold ml-2"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Audit Logs tab */}
          {activeTab === "audit" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded border border-[#eadfd7] bg-white p-4 shadow-card">
                <h3 className="font-black text-xs uppercase tracking-wider text-text-dark mb-4 flex items-center gap-1.5">
                  <History size={14} className="text-primary" /> Historical price logs
                </h3>
                <div className="overflow-x-auto text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b text-text-muted uppercase font-bold text-[10px]">
                        <th className="pb-2">Ingredient</th>
                        <th className="pb-2">Old Price</th>
                        <th className="pb-2">New Price</th>
                        <th className="pb-2">Base Cost Change</th>
                        <th className="pb-2">Changed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y font-bold text-text-dark">
                      {dbState.priceHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="py-2">{h.ingredientName}</td>
                          <td className="py-2">{formatINR(h.previousPrice)}</td>
                          <td className="py-2 text-primary">{formatINR(h.newPrice)}</td>
                          <td className="py-2 text-[10px]">
                            {formatBaseUnitCost(h.previousCostPerBaseUnit)} → <b>{formatBaseUnitCost(h.newCostPerBaseUnit)}</b>
                          </td>
                          <td className="py-2 text-[10px] text-text-muted">{dayjs(h.changedAt).format("DD MMM, h:mm A")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded border border-[#eadfd7] bg-white p-4 shadow-card">
                <h3 className="font-black text-xs uppercase tracking-wider text-text-dark mb-4 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-600 animate-pulse" /> Cascading recalculations
                </h3>
                <div className="space-y-2">
                  {dbState.costRecalculationLogs.map((log) => {
                    const name = log.source_type === "ingredient"
                      ? dbState.ingredients.find(i => i.id === log.source_id)?.name
                      : dbState.recipes.find(r => r.id === log.source_id)?.name;
                    return (
                      <div key={log.id} className="p-3 bg-[#fffcf9] border border-[#f0e4db] rounded text-xs flex justify-between items-center font-bold">
                        <div>
                          <p className="text-text-dark">{name || "Deleted item"} ({log.source_type})</p>
                          <p className="text-[10px] text-text-muted mt-0.5">{dayjs(log.recalculated_at).format("DD MMM YYYY, h:mm:ss A")}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border">
                            {log.affected_recipes_count} Recipes
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border ml-1">
                            {log.affected_menu_items_count} Sizes
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DIALOGS */}

      {/* 1. Modal: Ingredient Editor */}
      {ingredientModalOpen && activeIngredient && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-sm uppercase text-text-dark">{activeIngredient.id ? "Edit Ingredient" : "Add Ingredient"}</h3>
              <button type="button" onClick={() => setIngredientModalOpen(false)} className="h-6 w-6 text-text-muted hover:text-text-dark">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Ingredient Name</label>
                <input
                  type="text"
                  placeholder="e.g. Basmati Rice, Chicken"
                  value={activeIngredient.name || ""}
                  onChange={(e) => setActiveIngredient({ ...activeIngredient, name: e.target.value })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Category</label>
                  <select
                    value={activeIngredient.category_id || ""}
                    onChange={(e) => setActiveIngredient({ ...activeIngredient, category_id: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2 text-xs font-bold text-text-dark outline-none"
                  >
                    <option value="">Select Category</option>
                    {dbState.ingredientCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Purchase Unit</label>
                  <select
                    value={activeIngredient.purchase_unit || "kg"}
                    onChange={(e) => setActiveIngredient({ ...activeIngredient, purchase_unit: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2 text-xs font-bold text-text-dark outline-none"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">litre</option>
                    <option value="ml">ml</option>
                    <option value="piece">piece</option>
                    <option value="packet">packet</option>
                    <option value="dozen">dozen</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Purchase Qty</label>
                  <input
                    type="number"
                    value={activeIngredient.purchase_quantity !== undefined && activeIngredient.purchase_quantity !== null ? activeIngredient.purchase_quantity : ""}
                    onChange={(e) => setActiveIngredient({ ...activeIngredient, purchase_quantity: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Purchase Price (₹)</label>
                  <input
                    type="number"
                    value={activeIngredient.purchase_price !== undefined && activeIngredient.purchase_price !== null ? activeIngredient.purchase_price : ""}
                    onChange={(e) => setActiveIngredient({ ...activeIngredient, purchase_price: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none"
                  />
                </div>
              </div>

              <div className="bg-[#fffcf9] p-3 border border-[#f0e4db] rounded text-xs text-text-muted">
                Calculated Base Cost: <b>{formatBaseUnitCost(Number(activeIngredient.purchase_price || 0) / (Number(activeIngredient.purchase_quantity || 1) * getUnitBaseFactor(activeIngredient.purchase_unit || "kg")))}</b> per <b>{getBaseUnitLabel(activeIngredient.purchase_unit || "kg")}</b>
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Supplier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Metro wholesale"
                  value={activeIngredient.supplier_name || ""}
                  onChange={(e) => setActiveIngredient({ ...activeIngredient, supplier_name: e.target.value })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button type="button" onClick={() => setIngredientModalOpen(false)} className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark">Cancel</button>
              <button type="button" onClick={handleSaveIngredient} className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-orange-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Recipe Editor */}
      {recipeModalOpen && activeRecipe && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-sm uppercase text-text-dark">{activeRecipe.id ? "Edit Recipe Details" : "Create Recipe"}</h3>
              <button type="button" onClick={() => setRecipeModalOpen(false)} className="h-6 w-6 text-text-muted hover:text-text-dark">
                <XCircle size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Recipe Name</label>
                <input
                  type="text"
                  placeholder="e.g. Palav Rice Base"
                  value={activeRecipe.name}
                  onChange={(e) => setActiveRecipe({ ...activeRecipe, name: e.target.value })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Category</label>
                <select
                  value={activeRecipe.recipe_category_id || ""}
                  onChange={(e) => setActiveRecipe({ ...activeRecipe, recipe_category_id: e.target.value || null })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-2 text-xs font-bold text-text-dark"
                >
                  <option value="">Select Category</option>
                  {dbState.recipeCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Yield Qty</label>
                  <input
                    type="number"
                    value={activeRecipe.output_quantity !== undefined && activeRecipe.output_quantity !== null ? activeRecipe.output_quantity : ""}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, output_quantity: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2 text-xs font-bold text-text-dark outline-none"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Yield Unit</label>
                  <select
                    value={activeRecipe.output_unit}
                    onChange={(e) => setActiveRecipe({ ...activeRecipe, output_unit: e.target.value })}
                    className="h-9 rounded border border-[#eadfd7] bg-white px-2 text-xs font-bold text-text-dark outline-none"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">litre</option>
                    <option value="ml">ml</option>
                    <option value="piece">pieces</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Ingredients sub list */}
            <div className="space-y-2 bg-[#fffcf9] p-3 border border-[#f0e4db] rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-text-muted uppercase">Formula Ingredients / Sub-Recipes</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRecipe({
                        ...activeRecipe,
                        components: [
                          ...activeRecipe.components,
                          { component_type: "ingredient", ingredient_id: dbState.ingredients[0]?.id || null, child_recipe_id: null, quantity: 100, unit: "g", calculated_cost: 0 }
                        ]
                      });
                    }}
                    className="text-[10px] font-black text-primary hover:underline"
                  >
                    + Raw Material
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const possibleRecipes = dbState.recipes.filter(r => r.id !== activeRecipe.id);
                      if (possibleRecipes.length === 0) {
                        alert("No other recipes available.");
                        return;
                      }
                      setActiveRecipe({
                        ...activeRecipe,
                        components: [
                          ...activeRecipe.components,
                          { component_type: "recipe", child_recipe_id: possibleRecipes[0].id, ingredient_id: null, quantity: 1, unit: "piece", calculated_cost: 0 }
                        ]
                      });
                    }}
                    className="text-[10px] font-black text-blue-600 hover:underline"
                  >
                    + Nested Recipe
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {activeRecipe.components.map((comp, idx) => {
                  let unitCost = 0;
                  if (comp.component_type === "ingredient") {
                    const ing = dbState.ingredients.find(i => i.id === comp.ingredient_id);
                    unitCost = ing ? ing.cost_per_base_unit : 0;
                  } else {
                    const rec = dbState.recipes.find(r => r.id === comp.child_recipe_id);
                    unitCost = rec ? rec.cost_per_base_unit : 0;
                  }

                  const factor = getUnitBaseFactor(comp.unit);
                  const calculated = comp.quantity * factor * unitCost;
                  comp.calculated_cost = calculated;

                  return (
                    <div key={idx} className="flex gap-2 items-center bg-white p-2 rounded border border-[#eadfd7] text-xs">
                      <span className="font-extrabold text-[9px] text-text-muted uppercase">{comp.component_type}</span>

                      {comp.component_type === "ingredient" ? (
                        <select
                          value={comp.ingredient_id || ""}
                          onChange={(e) => {
                            const nextC = [...activeRecipe.components];
                            nextC[idx].ingredient_id = e.target.value;
                            setActiveRecipe({ ...activeRecipe, components: nextC });
                          }}
                          className="flex-1 h-8 rounded border text-xs"
                        >
                          {dbState.ingredients.map(i => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={comp.child_recipe_id || ""}
                          onChange={(e) => {
                            const nextC = [...activeRecipe.components];
                            nextC[idx].child_recipe_id = e.target.value;
                            setActiveRecipe({ ...activeRecipe, components: nextC });
                          }}
                          className="flex-1 h-8 rounded border text-xs"
                        >
                          {dbState.recipes.filter(r => r.id !== activeRecipe.id).map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      )}

                      <input
                        type="number"
                        value={comp.quantity !== undefined && comp.quantity !== null ? comp.quantity : ""}
                        onChange={(e) => {
                          const nextC = [...activeRecipe.components];
                          nextC[idx].quantity = e.target.value;
                          setActiveRecipe({ ...activeRecipe, components: nextC });
                        }}
                        className="w-16 h-8 rounded border text-xs text-center"
                      />

                      <select
                        value={comp.unit}
                        onChange={(e) => {
                          const nextC = [...activeRecipe.components];
                          nextC[idx].unit = e.target.value;
                          setActiveRecipe({ ...activeRecipe, components: nextC });
                        }}
                        className="w-16 h-8 rounded border text-xs"
                      >
                        <option value="g">g</option>
                        <option value="kg">kg</option>
                        <option value="ml">ml</option>
                        <option value="piece">piece</option>
                      </select>

                      <span className="w-16 text-right font-bold">{formatINR(calculated)}</span>

                      <button
                        type="button"
                        onClick={() => {
                          const nextC = activeRecipe.components.filter((_, cIdx) => cIdx !== idx);
                          setActiveRecipe({ ...activeRecipe, components: nextC });
                        }}
                        className="text-red-500 hover:text-red-700 font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Costs list */}
            <div className="space-y-2 bg-[#fffcf9] p-3 border border-[#f0e4db] rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-text-muted uppercase">Additional Prep Costs (Labour, Gas, Fuel)</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveRecipe({
                      ...activeRecipe,
                      additionalCosts: [...activeRecipe.additionalCosts, { cost_name: "Labour", amount: 15, notes: "" }]
                    });
                  }}
                  className="text-[10px] font-black text-primary hover:underline"
                >
                  + Add Expense
                </button>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {activeRecipe.additionalCosts.map((add, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Expense Name"
                      value={add.cost_name}
                      onChange={(e) => {
                        const nextA = [...activeRecipe.additionalCosts];
                        nextA[idx].cost_name = e.target.value;
                        setActiveRecipe({ ...activeRecipe, additionalCosts: nextA });
                      }}
                      className="flex-1 h-8 rounded border px-2 text-xs font-bold"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={add.amount}
                      onChange={(e) => {
                        const nextA = [...activeRecipe.additionalCosts];
                        nextA[idx].amount = Number(e.target.value);
                        setActiveRecipe({ ...activeRecipe, additionalCosts: nextA });
                      }}
                      className="w-24 h-8 rounded border px-2 text-xs text-center"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextA = activeRecipe.additionalRecipeCosts.filter((_, aIdx) => aIdx !== idx);
                        setActiveRecipe({ ...activeRecipe, additionalCosts: nextA });
                      }}
                      className="text-red-500 hover:text-red-700 font-bold"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#f7f1ec] p-3 rounded text-xs font-bold grid grid-cols-4 gap-2 text-text-dark border border-[#eadfd7]">
              <div>
                <p className="text-[10px] text-text-muted uppercase">Ingredients Cost</p>
                <p className="mt-0.5">{formatDecimalINR(activeRecipe.components.reduce((sum, c) => sum + c.calculated_cost, 0))}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">Additional Cost</p>
                <p className="mt-0.5">{formatDecimalINR(activeRecipe.additionalCosts.reduce((sum, a) => sum + a.amount, 0))}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">Total Cost</p>
                <p className="mt-0.5 text-primary">
                  {formatDecimalINR(
                    activeRecipe.components.reduce((sum, c) => sum + c.calculated_cost, 0) +
                    activeRecipe.additionalCosts.reduce((sum, a) => sum + a.amount, 0)
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">Cost per base unit</p>
                <p className="mt-0.5">
                  {formatDecimalINR(
                    (activeRecipe.components.reduce((sum, c) => sum + c.calculated_cost, 0) +
                    activeRecipe.additionalCosts.reduce((sum, a) => sum + a.amount, 0)) /
                    (Number(activeRecipe.output_quantity || 1) * getUnitBaseFactor(activeRecipe.output_unit || "kg")),
                    2
                  )} / {getBaseUnitLabel(activeRecipe.output_unit)}
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button type="button" onClick={() => setRecipeModalOpen(false)} className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark">Cancel</button>
              <button type="button" onClick={handleSaveRecipe} className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-orange-700">Save Recipe</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Menu Composition Editor */}
      {menuModalOpen && activeMenuComposition && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-4xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-black text-sm uppercase text-text-dark">Menu Costing Composition: {activeMenuComposition.name}</h3>
              </div>
              <button type="button" onClick={() => setMenuModalOpen(false)} className="h-6 w-6 text-text-muted hover:text-text-dark">
                <XCircle size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 bg-[#fffcf9] p-3 border border-[#f0e4db] rounded-lg">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Cost Mode</label>
                <select
                  value={activeMenuComposition.cost_mode}
                  onChange={(e) => setActiveMenuComposition({ ...activeMenuComposition, cost_mode: e.target.value })}
                  className="h-8 rounded border bg-white px-2 text-xs font-bold"
                >
                  <option value="automatic">Automatic Recipe Costing</option>
                  <option value="manual">Manual Cost Override</option>
                </select>
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Item Type</label>
                <select
                  value={activeMenuComposition.item_type || "Veg"}
                  onChange={(e) => setActiveMenuComposition({ ...activeMenuComposition, item_type: e.target.value })}
                  className="h-8 rounded border bg-white px-2 text-xs font-bold"
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </div>

              {activeMenuComposition.cost_mode === "manual" && (
                <div className="grid gap-1">
                  <label className="text-xs font-black text-text-muted uppercase">Manual Preparation Cost (₹)</label>
                  <input
                    type="number"
                    value={activeMenuComposition.manual_preparation_cost !== undefined && activeMenuComposition.manual_preparation_cost !== null ? activeMenuComposition.manual_preparation_cost : ""}
                    onChange={(e) => setActiveMenuComposition({ ...activeMenuComposition, manual_preparation_cost: e.target.value })}
                    className="h-8 rounded border px-2 text-xs font-bold text-center"
                  />
                </div>
              )}

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Availability</label>
                <div className="flex items-center h-8">
                  <input
                    type="checkbox"
                    checked={activeMenuComposition.is_active}
                    onChange={(e) => setActiveMenuComposition({ ...activeMenuComposition, is_active: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-xs font-bold text-text-dark ml-2">Available for Sale</span>
                </div>
              </div>
            </div>

            {/* Sizes & Portions list */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-text-muted uppercase">Size Variants & Component Mappings</span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuComposition({
                      ...activeMenuComposition,
                      variants: [
                        ...activeMenuComposition.variants,
                        { name: "Regular", grams: 400, price: 180, is_default: false, is_active: true, components: [] }
                      ]
                    });
                  }}
                  className="text-[10px] font-black text-primary hover:underline"
                >
                  + Add Size Variant
                </button>
              </div>

              <div className="space-y-4">
                {activeMenuComposition.variants.map((v, vIdx) => (
                  <div key={vIdx} className="border border-[#eadfd7] rounded-lg p-4 space-y-3 bg-[#fffcf9]">
                    <div className="flex flex-wrap gap-2 items-center justify-between border-b pb-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Portion Name"
                          value={v.name}
                          onChange={(e) => {
                            const newVars = [...activeMenuComposition.variants];
                            newVars[vIdx].name = e.target.value;
                            setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                          }}
                          className="h-8 w-28 rounded border px-2 text-xs font-bold text-center"
                        />
                        <input
                          type="number"
                          placeholder="Grams"
                          value={v.grams !== undefined && v.grams !== null ? v.grams : ""}
                          onChange={(e) => {
                            const newVars = [...activeMenuComposition.variants];
                            newVars[vIdx].grams = e.target.value;
                            setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                          }}
                          className="h-8 w-20 rounded border px-2 text-xs text-center"
                        />
                        <input
                          type="number"
                          placeholder="Price"
                          value={v.price !== undefined && v.price !== null ? v.price : ""}
                          onChange={(e) => {
                            const newVars = [...activeMenuComposition.variants];
                            newVars[vIdx].price = e.target.value;
                            setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                          }}
                          className="h-8 w-24 rounded border px-2 text-xs font-bold text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newVars = activeMenuComposition.variants.filter((_, idx) => idx !== vIdx);
                          setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                        }}
                        className="text-red-500 hover:text-red-700 font-bold text-xs"
                      >
                        Remove size
                      </button>
                    </div>

                    {/* Variant component composition (if cost_mode is automatic) */}
                    {activeMenuComposition.cost_mode === "automatic" && (
                      <div className="space-y-2 bg-white p-3 rounded border border-[#eadfd7]">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-text-muted uppercase">Portion composition</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const newVars = [...activeMenuComposition.variants];
                                newVars[vIdx].components.push({
                                  component_type: "recipe",
                                  recipe_id: dbState.recipes[0]?.id || "",
                                  quantity: 100,
                                  unit: "g",
                                  unit_cost: 0,
                                  calculated_cost: 0
                                });
                                setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                              }}
                              className="text-[9px] font-black text-primary hover:underline"
                            >
                              + Recipe
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const newVars = [...activeMenuComposition.variants];
                                newVars[vIdx].components.push({
                                  component_type: "packaging",
                                  ingredient_id: dbState.ingredients[0]?.id || "",
                                  quantity: 1,
                                  unit: "piece",
                                  unit_cost: 0,
                                  calculated_cost: 0
                                });
                                setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                              }}
                              className="text-[9px] font-black text-purple-600 hover:underline"
                            >
                              + Container/Packaging
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {v.components.map((comp, cIdx) => {
                            let unitCost = 0;
                            if (comp.component_type === "recipe" && comp.recipe_id) {
                              const rec = dbState.recipes.find(r => r.id === comp.recipe_id);
                              unitCost = rec ? rec.cost_per_base_unit : 0;
                            } else if (comp.ingredient_id) {
                              const ing = dbState.ingredients.find(i => i.id === comp.ingredient_id);
                              unitCost = ing ? ing.cost_per_base_unit : 0;
                            }

                            const qtyBase = comp.quantity * getUnitBaseFactor(comp.unit);
                            const calculated = qtyBase * unitCost;
                            comp.unit_cost = unitCost;
                            comp.calculated_cost = calculated;

                            return (
                              <div key={cIdx} className="flex gap-2 items-center bg-[#fffcf9] p-2 rounded border border-[#f0e4db] text-xs">
                                <span className="font-extrabold text-[9px] text-text-muted uppercase">{comp.component_type}</span>

                                {comp.component_type === "recipe" ? (
                                  <select
                                    value={comp.recipe_id || ""}
                                    onChange={(e) => {
                                      const newVars = [...activeMenuComposition.variants];
                                      newVars[vIdx].components[cIdx].recipe_id = e.target.value;
                                      setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                                    }}
                                    className="flex-1 h-8 rounded border text-xs"
                                  >
                                    {dbState.recipes.map(r => (
                                      <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <select
                                    value={comp.ingredient_id || ""}
                                    onChange={(e) => {
                                      const newVars = [...activeMenuComposition.variants];
                                      newVars[vIdx].components[cIdx].ingredient_id = e.target.value;
                                      setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                                    }}
                                    className="flex-1 h-8 rounded border text-xs"
                                  >
                                    {dbState.ingredients.map(i => (
                                      <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                  </select>
                                )}

                                <input
                                  type="number"
                                  value={comp.quantity !== undefined && comp.quantity !== null ? comp.quantity : ""}
                                  onChange={(e) => {
                                    const newVars = [...activeMenuComposition.variants];
                                    newVars[vIdx].components[cIdx].quantity = e.target.value;
                                    setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                                  }}
                                  className="w-16 h-8 rounded border text-xs text-center"
                                />

                                <select
                                  value={comp.unit}
                                  onChange={(e) => {
                                    const newVars = [...activeMenuComposition.variants];
                                    newVars[vIdx].components[cIdx].unit = e.target.value;
                                    setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                                  }}
                                  className="w-16 h-8 rounded border text-xs"
                                >
                                  <option value="g">g</option>
                                  <option value="kg">kg</option>
                                  <option value="ml">ml</option>
                                  <option value="piece">piece</option>
                                </select>

                                <span className="w-16 text-right font-black">{formatINR(calculated)}</span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const newVars = [...activeMenuComposition.variants];
                                    newVars[vIdx].components = newVars[vIdx].components.filter((_, idx) => idx !== cIdx);
                                    setActiveMenuComposition({ ...activeMenuComposition, variants: newVars });
                                  }}
                                  className="text-red-500 hover:text-red-700 font-bold"
                                >
                                  Delete
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Variant Profit Margin Math analysis block */}
                    <div className="bg-bg p-3 rounded border text-xs font-bold text-text-dark grid grid-cols-4 gap-2">
                      <div>
                        <p className="text-[9px] text-text-muted uppercase">Portion cost</p>
                        <p className="mt-0.5">
                          {formatINR(
                            activeMenuComposition.cost_mode === "manual"
                              ? activeMenuComposition.manual_preparation_cost
                              : v.components.reduce((sum, c) => sum + c.calculated_cost, 0)
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-text-muted uppercase">Profit</p>
                        <p className="mt-0.5 text-green-700">
                          {formatINR(
                            v.price -
                            (activeMenuComposition.cost_mode === "manual"
                              ? activeMenuComposition.manual_preparation_cost
                              : v.components.reduce((sum, c) => sum + c.calculated_cost, 0))
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-text-muted uppercase">Food Cost %</p>
                        <p className="mt-0.5">
                          {(
                            v.price > 0
                              ? ((activeMenuComposition.cost_mode === "manual"
                                  ? activeMenuComposition.manual_preparation_cost
                                  : v.components.reduce((sum, c) => sum + c.calculated_cost, 0)) /
                                  v.price) *
                                100
                              : 0
                          ).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-text-muted uppercase">Gross Margin %</p>
                        <p className="mt-0.5 text-primary">
                          {(
                            v.price > 0
                              ? ((v.price -
                                  (activeMenuComposition.cost_mode === "manual"
                                    ? activeMenuComposition.manual_preparation_cost
                                    : v.components.reduce((sum, c) => sum + c.calculated_cost, 0))) /
                                  v.price) *
                                100
                              : 0
                          ).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button type="button" onClick={() => setMenuModalOpen(false)} className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark">Cancel</button>
              <button type="button" onClick={handleSaveMenuComposition} className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-orange-700">Save Composition</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Category Editor */}
      {categoryModalOpen && activeCategory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-sm uppercase text-text-dark">
                {activeCategory.id ? `Edit ${categoryType} Category` : `Create ${categoryType} Category`}
              </h3>
              <button type="button" onClick={() => setCategoryModalOpen(false)} className="h-6 w-6 text-text-muted hover:text-text-dark">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rice Items, Starters"
                  value={activeCategory.name}
                  onChange={(e) => setActiveCategory({ ...activeCategory, name: e.target.value })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none focus:border-primary"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-black text-text-muted uppercase">Display Order</label>
                <input
                  type="number"
                  value={activeCategory.display_order !== undefined && activeCategory.display_order !== null ? activeCategory.display_order : ""}
                  onChange={(e) => setActiveCategory({ ...activeCategory, display_order: e.target.value })}
                  className="h-9 rounded border border-[#eadfd7] bg-white px-3 text-xs font-bold text-text-dark outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-3">
              <button type="button" onClick={() => setCategoryModalOpen(false)} className="rounded border px-4 py-2 text-xs font-bold hover:bg-gray-50 text-text-dark">Cancel</button>
              <button type="button" onClick={handleSaveCategory} className="rounded bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-orange-700">Save Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
