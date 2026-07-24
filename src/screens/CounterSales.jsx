import { useState, useEffect, useMemo } from 'react';
import { Minus, Plus, Printer, Save, Trash2, ArrowDownToLine, ReceiptText } from 'lucide-react';
import { formatINR } from '../lib/format';
import { useInventoryStore } from '../store/inventoryStore';
import { useAppStore } from '../store/appStore';
import { supabase } from '../lib/supabase';

export default function CounterSales() {
  const menuItems = useInventoryStore((state) => state.menuItems);
  const portions = useInventoryStore((state) => state.portions);
  const tableCount = useAppStore((state) => state.tableCount);
  
  const [selectedTable, setSelectedTable] = useState('Takeaway'); // 'Takeaway' or 1 to 12
  const [cart, setCart] = useState([]); // Array of { portion_id, name, price, quantity, printed_quantity }
  const [activeOrders, setActiveOrders] = useState([]); // List of active held orders from DB
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [unavailableModal, setUnavailableModal] = useState(null); // null or { items: [...], onConfirm: () => void }

  // 1. Fetch active restaurant ID
  useEffect(() => {
    async function fetchRestaurant() {
      if (!supabase) {
        window.kitchenOS?.logToFile("supabase is null in fetchRestaurant!");
        return;
      }
      // Try querying menu_items to get restaurant_id (bypasses restaurants RLS restriction)
      const { data: menuData, error: menuErr } = await supabase.from('menu_items').select('restaurant_id').limit(1);
      if (menuErr) {
        window.kitchenOS?.logToFile("menu_items query error: " + menuErr.message);
      }
      if (menuData && menuData[0]?.restaurant_id) {
        window.kitchenOS?.logToFile("Found restaurant_id from menu_items: " + menuData[0].restaurant_id);
        setRestaurantId(menuData[0].restaurant_id);
        return;
      }
      const { data, error: restErr } = await supabase.from('restaurants').select('id').limit(1);
      if (restErr) {
        window.kitchenOS?.logToFile("restaurants query error: " + restErr.message);
      }
      if (data && data[0]) {
        window.kitchenOS?.logToFile("Found restaurant_id from restaurants: " + data[0].id);
        setRestaurantId(data[0].id);
      } else {
        window.kitchenOS?.logToFile("Could not find restaurant_id anywhere!");
      }
    }
    fetchRestaurant();
  }, []);

  // 2. Fetch active orders and subscribe to real-time changes
  const fetchActiveOrders = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .neq('status', 'completed')
      .neq('status', 'cancelled');
    if (!error && data) {
      setActiveOrders(data);
    }
  };

  useEffect(() => {
    fetchActiveOrders();

    if (!supabase) return;
    const channel = supabase
      .channel('counter-orders-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchActiveOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Load selected table's active order into the cart
  useEffect(() => {
    const tableOrder = activeOrders.find(
      (order) =>
        (selectedTable === 'Takeaway' && order.order_type === 'takeaway') ||
        (selectedTable !== 'Takeaway' && order.order_type === 'dine_in' && String(order.table_number) === String(selectedTable))
    );

    if (tableOrder) {
      // Map database order items to cart structure
      const dbItems = Array.isArray(tableOrder.items) ? tableOrder.items : [];
      const mappedCart = dbItems.map((item) => ({
        portion_id: item.portion_id || item.id,
        name: item.name,
        price: Number(item.price || 0),
        grams: Number(item.portion_grams || item.grams || 0),
        quantity: Number(item.quantity || item.qty || 1),
        printed_quantity: Number(item.printed_quantity || 0)
      }));
      setCart(mappedCart);
    } else {
      setCart([]);
    }
  }, [selectedTable, activeOrders]);

  // Available portions for counter menu selection (keeps out-of-stock items visible but flagged)
  const saleItems = useMemo(() => {
    const categoryOrder = {
      'veg': 1,
      'nonveg': 2,
      'non-veg': 2,
      'desserts': 3,
      'dessert': 3
    };

    return portions
      .filter((p) => {
        if (p.source === 'swiggy' || !Number(p.price)) return false;
        return true;
      })
      .map((p) => {
        const menuItem = menuItems.find((item) => item.id === p.menu_item_id);
        return {
          ...p,
          menuName: menuItem?.name || 'Menu item',
          category: menuItem?.category || 'Veg',
          isAvailable: menuItem?.available !== false
        };
      })
      .sort((a, b) => {
        // 1. Sort by category (Veg first, then Non-Veg, then Desserts)
        const catA = String(a.category).toLowerCase().replace(/[^a-z]/g, '');
        const catB = String(b.category).toLowerCase().replace(/[^a-z]/g, '');
        
        const orderA = categoryOrder[catA] || 99;
        const orderB = categoryOrder[catB] || 99;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        // 2. Sort by base name (without the (Regular) or (Large) suffix)
        const cleanName = (str) => {
          return str
            .replace(/🟢|🔴/g, '') // remove circles
            .replace(/\(regular\)|\(large\)/gi, '') // remove suffixes
            .trim()
            .toLowerCase();
        };

        const baseA = cleanName(a.menuName);
        const baseB = cleanName(b.menuName);
        
        if (baseA !== baseB) {
          return baseA.localeCompare(baseB);
        }

        // 3. Sort by Regular vs Large (Regular first)
        const isLargeA = a.menuName.toLowerCase().includes('large');
        const isLargeB = b.menuName.toLowerCase().includes('large');
        
        if (isLargeA !== isLargeB) {
          return isLargeA ? 1 : -1; // Large comes after Regular
        }
        
        return 0;
      });
  }, [portions, menuItems]);

  // Calculate cart total
  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  // Cart operations (No owner restrictions on desktop!)
  function addToCart(item) {
    setCart((current) => {
      const exists = current.find((c) => c.portion_id === item.id);
      if (exists) {
        return current.map((c) =>
          c.portion_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      } else {
        return [
          ...current,
          {
            portion_id: item.id,
            name: `${item.menuName} - ${item.name}`,
            price: Number(item.price),
            grams: Number(item.grams || 0),
            quantity: 1,
            printed_quantity: 0
          }
        ];
      }
    });
  }

  function adjustQty(portionId, delta) {
    setCart((current) =>
      current
        .map((c) =>
          c.portion_id === portionId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  function removeFromCart(portionId) {
    setCart((current) => current.filter((c) => c.portion_id !== portionId));
  }

  // Get active order object for the selected table
  const currentActiveOrder = useMemo(() => {
    return activeOrders.find(
      (order) =>
        (selectedTable === 'Takeaway' && order.order_type === 'takeaway') ||
        (selectedTable !== 'Takeaway' && order.order_type === 'dine_in' && String(order.table_number) === String(selectedTable))
    );
  }, [selectedTable, activeOrders]);

  // Get active customer if exists, otherwise null
  async function getCustomerIdIfExists(tableNum) {
    const systemPhone = tableNum === 'Takeaway' ? 'takeaway' : `dinein_${tableNum}`;

    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('whatsapp_number', systemPhone)
      .maybeSingle();

    if (findError) {
      window.kitchenOS?.logToFile("Error looking up customer: " + findError.message);
      return null;
    }

    return existing?.id || null;
  }

  // Helper to verify item availability before checkout/holding
  const checkCartAvailability = (currentCart, onConfirmAction) => {
    const outOfStock = currentCart.filter((cartItem) => {
      const portion = portions.find(p => p.id === cartItem.portion_id);
      if (!portion) return false;
      const menuItem = menuItems.find(m => m.id === portion.menu_item_id);
      return menuItem?.available === false;
    });

    if (outOfStock.length > 0) {
      setUnavailableModal({
        items: outOfStock,
        onConfirm: () => {
          const cleanedCart = currentCart.filter(c => !outOfStock.some(o => o.portion_id === c.portion_id));
          setCart(cleanedCart);
          setUnavailableModal(null);
          onConfirmAction(cleanedCart);
        }
      });
      return false; // has unavailable items
    }
    return true; // all items available
  };

  // 4. Save/Hold Order and Print Kitchen Delta
  async function handleHoldAndPrint(currentCart = cart) {
    if (currentCart === cart) {
      const ok = checkCartAvailability(cart, (cleaned) => handleHoldAndPrint(cleaned));
      if (!ok) return;
    }

    window.kitchenOS?.logToFile("handleHoldAndPrint clicked. restaurantId: " + restaurantId + " cart.length: " + currentCart.length + " loading: " + loading);
    if (!currentCart.length || !restaurantId || loading) {
      window.kitchenOS?.logToFile("Exit early from handleHoldAndPrint because conditions not met");
      return;
    }
    setLoading(true);
    setMessage('');

    try {
      // Calculate delta items to print to kitchen
      const printItems = [];
      let isUpdate = false;

      if (currentActiveOrder) {
        isUpdate = true;
        
        // 1. Check for changed or new items in the cart
        currentCart.forEach((item) => {
          const dbItem = (currentActiveOrder.items || []).find(
            (db) => (db.portion_id || db.id) === item.portion_id
          );
          const oldQty = dbItem ? Number(dbItem.printed_quantity || dbItem.quantity || dbItem.qty || 0) : 0;
          const deltaQty = item.quantity - oldQty;

          if (deltaQty !== 0) {
            printItems.push({
              name: item.name,
              deltaQty: deltaQty,
              totalQty: item.quantity,
              action: deltaQty > 0 ? 'ADD' : 'REMOVE'
            });
          }
        });

        // 2. Check for completely deleted items (present in DB order but not in cart)
        (currentActiveOrder.items || []).forEach((dbItem) => {
          const key = dbItem.portion_id || dbItem.id;
          const cartItem = currentCart.find((item) => item.portion_id === key);
          if (!cartItem) {
            const oldQty = Number(dbItem.printed_quantity || dbItem.quantity || dbItem.qty || 0);
            printItems.push({
              name: dbItem.name,
              deltaQty: -oldQty,
              totalQty: 0,
              action: 'REMOVE'
            });
          }
        });
      } else {
        isUpdate = false;
        currentCart.forEach((item) => {
          printItems.push({
            name: item.name,
            qty: item.quantity,
            quantity: item.quantity
          });
        });
      }

      // Save order payload
      const updatedItems = currentCart.map((item) => ({
        portion_id: item.portion_id,
        name: item.name,
        price: item.price,
        portion_grams: Number(item.grams || 0),
        quantity: item.quantity,
        qty: item.quantity,
        printed_quantity: item.quantity
      }));

      const pickupCode = currentActiveOrder?.pickup_code || Math.floor(1000 + Math.random() * 9000).toString();
      const customerId = await getCustomerIdIfExists(selectedTable);

      const orderPayload = {
        restaurant_id: restaurantId,
        customer_id: customerId,
        customer_name: selectedTable === 'Takeaway' ? 'Takeaway' : `Table ${selectedTable}`,
        customer_phone: '',
        items: updatedItems,
        total_amount: currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        status: 'preparing',
        payment_confirmed: false,
        source: 'counter',
        order_type: selectedTable === 'Takeaway' ? 'takeaway' : 'dine_in',
        table_number: selectedTable === 'Takeaway' ? null : String(selectedTable),
        pickup_code: pickupCode
      };

      let orderId = currentActiveOrder?.id;

      if (orderId) {
        // Update existing order
        const { error } = await supabase
          .from('orders')
          .update({ ...orderPayload, updated_at: new Date().toISOString() })
          .eq('id', orderId);
        if (error) throw error;
      } else {
        // Insert new order
        const { data, error } = await supabase
          .from('orders')
          .insert(orderPayload)
          .select('id')
          .single();
        if (error) throw error;
        orderId = data.id;
      }

      // Print delta items physically
      if (printItems.length && window.kitchenOS?.printer?.printOrderCopies) {
        const printOrder = {
          id: orderId,
          pickup_code: pickupCode,
          customer_name: selectedTable === 'Takeaway' ? 'Takeaway' : `Table ${selectedTable}`,
          items: printItems,
          is_update: isUpdate
        };
        await window.kitchenOS.printer.printOrderCopies(printOrder, { printCustomer: false, printKitchen: true });
      }

      setMessage('Order held and kitchen copy printed successfully!');
      fetchActiveOrders();
    } catch (err) {
      console.error(err);
      const errMsg = err.message || err.details || JSON.stringify(err);
      window.kitchenOS?.logToFile("Error in handleHoldAndPrint: " + errMsg);
      setMessage(errMsg || 'Failed to save or print order.');
    } finally {
      setLoading(false);
    }
  }

  // 5. Print Client Copy Receipt
  async function handlePrintClientCopy() {
    if (!cart.length || !window.kitchenOS?.printer?.printOrderCopies) return;
    const printOrder = {
      id: currentActiveOrder?.id || 'temp',
      pickup_code: currentActiveOrder?.pickup_code || '----',
      customer_name: selectedTable === 'Takeaway' ? 'Takeaway' : `Table ${selectedTable}`,
      items: cart,
      total_amount: total
    };
    try {
      await window.kitchenOS.printer.printOrderCopies(printOrder, { printCustomer: true, printKitchen: false });
      setMessage('Client copy receipt printed successfully!');
    } catch (err) {
      console.error(err);
      setMessage('Failed to print customer receipt.');
    }
  }

  // 6. Settle and Finalize Order (Saves as Cash Completed Sales)
  async function handleSettleBill(currentCart = cart) {
    if (currentCart === cart) {
      const ok = checkCartAvailability(cart, (cleaned) => handleSettleBill(cleaned));
      if (!ok) return;
    }

    if (!currentCart.length || !restaurantId || loading) return;
    setLoading(true);
    setMessage('');

    try {
      const now = new Date().toISOString();
      const updatedItems = currentCart.map((item) => ({
        portion_id: item.portion_id,
        name: item.name,
        price: item.price,
        portion_grams: Number(item.grams || 0),
        quantity: item.quantity,
        qty: item.quantity,
        printed_quantity: item.quantity
      }));

      const pickupCode = currentActiveOrder?.pickup_code || Math.floor(1000 + Math.random() * 9000).toString();
      const currentCartTotal = currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

      if (currentActiveOrder?.id) {
        // Update existing active order
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'completed',
            payment_confirmed: true,
            items: updatedItems,
            total_amount: currentCartTotal,
            updated_at: now
          })
          .eq('id', currentActiveOrder.id);
        if (error) throw error;
      } else {
        const customerId = await getCustomerIdIfExists(selectedTable);
        // Insert new order directly as completed (e.g. direct Takeaway settle)
        const { error } = await supabase
          .from('orders')
          .insert({
            restaurant_id: restaurantId,
            customer_id: customerId,
            customer_name: selectedTable === 'Takeaway' ? 'Takeaway' : `Table ${selectedTable}`,
            customer_phone: '',
            items: updatedItems,
            total_amount: currentCartTotal,
            payment_confirmed: true,
            order_type: selectedTable === 'Takeaway' ? 'takeaway' : 'dine_in',
            table_number: selectedTable === 'Takeaway' ? null : String(selectedTable),
            status: 'completed',
            pickup_code: pickupCode,
            created_at: now,
            updated_at: now
          });
        if (error) throw error;
      }

      // Log into cash/sales ledger
      await supabase.from('expenses').insert({
        restaurant_id: restaurantId,
        type: selectedTable === 'Takeaway' ? 'Takeaway Sale' : 'Dine-In Sale',
        description: selectedTable === 'Takeaway' ? 'Finalized Takeaway Bill' : `Finalized Table ${selectedTable} Bill`,
        amount: currentCartTotal,
        date: now.split('T')[0]
      });

      // If takeaway, print order receipts (kitchen + customer copies) immediately!
      if (selectedTable === 'Takeaway' && window.kitchenOS?.printer) {
        const orderData = {
          pickup_code: pickupCode,
          customer_name: 'Takeaway',
          customer_phone: '',
          items: updatedItems,
          total_amount: currentCartTotal
        };
        await window.kitchenOS.printer.printOrderCopies(orderData, { printKitchen: true, printCustomer: true }).catch(() => {});
      }

      setMessage(selectedTable === 'Takeaway' ? 'Takeaway bill settled successfully!' : `Table ${selectedTable} bill settled successfully!`);
      setCart([]);
      fetchActiveOrders();
    } catch (err) {
      console.error(err);
      setMessage('Failed to settle bill.');
    } finally {
      setLoading(false);
    }
  }

  // 7. Clear or Cancel active order
  async function handleCancelOrder() {
    if (!currentActiveOrder) {
      setCart([]);
      return;
    }
    if (!confirm('Are you sure you want to cancel and delete this order?')) return;
    setLoading(true);

    try {
      await supabase.from('orders').delete().eq('id', currentActiveOrder.id);
      setMessage('Order cancelled successfully.');
      setCart([]);
      fetchActiveOrders();
    } catch (err) {
      console.error(err);
      setMessage('Failed to cancel order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid h-full bg-[#f7f1ec] lg:grid-cols-[1fr_380px]">
      <div className="min-h-0 overflow-y-auto p-5 scrollbar-none">
        
        {/* Dine-In Tables Selector */}
        <header className="mb-4">
          <h1 className="text-xl font-black text-text-dark">Billing Dashboard</h1>
          <p className="mt-1 text-[13px] font-semibold text-text-muted">Select Table or Takeaway mode to manage bill cart.</p>
        </header>

        <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          <button
            type="button"
            onClick={() => setSelectedTable('Takeaway')}
            className={`flex flex-col items-center justify-center p-3 rounded border text-[13px] font-black transition-all ${
              selectedTable === 'Takeaway'
                ? 'border-primary bg-primary text-white'
                : activeOrders.some((o) => o.order_type === 'takeaway')
                ? 'border-orange-300 bg-orange-50 text-orange-800'
                : 'border-[#eadfd7] bg-white text-text-dark'
            }`}
          >
            <span>Takeaway</span>
            {activeOrders.some((o) => o.order_type === 'takeaway') && (
              <span className="text-[10px] mt-1 font-bold">Active</span>
            )}
          </button>

          {Array.from({ length: tableCount }, (_, i) => i + 1).map((num) => {
            const tableOrder = activeOrders.find(
              (o) => o.order_type === 'dine_in' && String(o.table_number) === String(num)
            );
            return (
              <button
                key={num}
                type="button"
                onClick={() => setSelectedTable(num)}
                className={`flex flex-col items-center justify-center p-3 rounded border text-[13px] font-black transition-all ${
                  selectedTable === num
                    ? 'border-primary bg-primary text-white'
                    : tableOrder
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-[#eadfd7] bg-white text-text-dark'
                }`}
              >
                <span>T - {num}</span>
                {tableOrder && (
                  <span className="text-[10px] mt-1 font-extrabold">{formatINR(tableOrder.total_amount)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Menu Items Grid */}
        <h2 className="mb-3 text-lg font-black text-text-dark">Counter Menu Items</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {saleItems.map((item) => (
            <div key={item.id} className={`rounded border bg-white p-4 shadow-sm relative transition-all ${
              item.isAvailable ? 'border-[#eadfd7]' : 'border-red-200 bg-red-50/20 opacity-90'
            }`}>
              {!item.isAvailable && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-red-100 text-red-700 tracking-wider">
                  Out of Stock
                </span>
              )}
              <p className="text-[15px] font-black text-text-dark">{item.menuName}</p>
              <p className="mt-1 text-[13px] font-bold text-text-muted">{item.name} - {item.grams}g</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-black text-[#8a3a08]">{formatINR(item.price)}</span>
                {(() => {
                  const cartItem = cart.find((c) => c.portion_id === item.id);
                  const qty = cartItem ? cartItem.quantity : 0;
                  return (
                    <div className="flex items-center border border-primary rounded overflow-hidden h-7">
                      <button
                        type="button"
                        onClick={() => qty > 0 && adjustQty(item.id, -1)}
                        disabled={qty === 0}
                        className={`px-2.5 h-full text-xs font-black transition-all ${
                          qty > 0 ? 'bg-primary text-white hover:bg-opacity-90' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        -
                      </button>
                      <span className="w-8 text-center text-xs font-black text-text-dark">{qty}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.isAvailable) {
                            alert(`${item.menuName} is currently marked Out of Stock. You can add it, but must remove or confirm it before final payment.`);
                          }
                          if (qty === 0) {
                            addToCart(item);
                          } else {
                            adjustQty(item.id, 1);
                          }
                        }}
                        className="bg-primary text-white px-2.5 h-full text-xs font-black hover:bg-opacity-90"
                      >
                        +
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Summary Panel */}
      <aside className="flex flex-col border-l border-[#eadfd7] bg-white p-5">
        <h2 className="text-lg font-black text-text-dark">
          {selectedTable === 'Takeaway' ? 'Takeaway Order' : `Table ${selectedTable} Order`}
        </h2>
        
        {/* Cart items list */}
        <div className="mt-4 max-h-[280px] overflow-y-auto space-y-4 pr-1">
          {cart.length === 0 ? (
            <p className="text-sm font-semibold text-text-muted mt-10 text-center">Cart is empty.</p>
          ) : (
            cart.map((item) => (
              <div key={item.portion_id} className="flex items-start justify-between border-b border-[#f7f1ec] pb-3">
                <div className="max-w-[180px]">
                  <p className="text-sm font-black text-text-dark">{item.name}</p>
                  <p className="text-xs font-bold text-text-muted mt-0.5">
                    {formatINR(item.price)} each • Printed: {item.printed_quantity}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-black text-primary">{formatINR(item.price * item.quantity)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustQty(item.portion_id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded border border-[#eadfd7] text-text-dark"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="text-sm font-black">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => adjustQty(item.portion_id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded bg-primary text-white"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.portion_id)}
                      className="ml-2 flex h-7 w-7 items-center justify-center rounded bg-red-50 text-red-600 border border-red-200"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer controls */}
        <div className="mt-4 border-t border-[#eadfd7] pt-4">
          <div className="flex justify-between text-lg font-black text-text-dark">
            <span>Total Amount</span>
            <span>{formatINR(total)}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {selectedTable !== 'Takeaway' && (
              <button
                type="button"
                disabled={!cart.length || loading}
                onClick={() => handleHoldAndPrint()}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-primary py-2.5 text-xs font-black text-white disabled:bg-text-muted"
              >
                <ArrowDownToLine size={15} /> Hold & Print
              </button>
            )}
            <button
              type="button"
              disabled={!cart.length || loading}
              onClick={handlePrintClientCopy}
              className={`inline-flex items-center justify-center gap-1.5 rounded border border-[#eadfd7] py-2.5 text-xs font-black text-text-dark disabled:bg-[#f7f1ec] ${
                selectedTable === 'Takeaway' ? 'col-span-2' : ''
              }`}
            >
              <ReceiptText size={15} /> Client Copy
            </button>
          </div>

          <button
            type="button"
            disabled={!cart.length || (selectedTable !== 'Takeaway' && !currentActiveOrder) || loading}
            onClick={() => handleSettleBill()}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded bg-emerald-600 py-2.5 text-xs font-black text-white disabled:bg-text-muted"
          >
            <Printer size={15} /> Settle Bill (Cash)
          </button>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCancelOrder}
              disabled={loading}
              className="w-full text-center py-2 text-xs font-bold text-red-600 hover:underline disabled:text-text-muted"
            >
              Cancel Order
            </button>
          </div>

          {message && (
            <p className="mt-3 text-center text-xs font-bold text-success">{message}</p>
          )}
        </div>
      </aside>

      {/* Non-Availability Checkout Interceptor Modal */}
      {unavailableModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#eadfd7] rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 mx-auto">
              <Trash2 size={24} />
            </span>
            <div>
              <h3 className="text-base font-black text-text-dark uppercase tracking-wider">Out of Stock Items Detected</h3>
              <p className="text-xs font-semibold text-text-muted mt-1">
                The following items in your cart are currently marked Out of Stock:
              </p>
            </div>
            
            <div className="bg-red-50/50 rounded border border-red-100 p-3 text-left space-y-1.5">
              {unavailableModal.items.map((item) => (
                <div key={item.portion_id} className="flex justify-between items-center text-xs font-bold text-red-800">
                  <span>{item.name}</span>
                  <span>Qty: {item.quantity}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUnavailableModal(null)}
                className="h-10 rounded border border-[#eadfd7] bg-white text-xs font-black uppercase text-text-dark hover:bg-gray-50"
              >
                Freshly Edit Cart
              </button>
              <button
                type="button"
                onClick={unavailableModal.onConfirm}
                className="h-10 rounded bg-red-600 text-xs font-black uppercase text-white hover:bg-red-700"
              >
                Remove & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
