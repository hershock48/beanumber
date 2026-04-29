'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type CartItem = {
  id: string;           // unique key (generated on add)
  shirtId: string;      // design id (e.g. 'flagship')
  shirtName: string;    // display name (e.g. 'The Flagship')
  color: string;
  size: string;
  continueMonthly: boolean;
  price: number;        // always 25
};

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  toggleMonthly: (id: string) => void;
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalOneTime: number;
  totalMonthly: number;
  shippingCost: number;
  totalWithShipping: number;
  itemCount: number;
  refCode: string | null;
  setRefCode: (code: string | null) => void;
};

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

let nextId = 1;

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);

  const addItem = useCallback((item: Omit<CartItem, 'id'>) => {
    setItems(prev => [...prev, { ...item, id: `cart-${nextId++}` }]);
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const toggleMonthly = useCallback((id: string) => {
    setItems(prev =>
      prev.map(i => (i.id === id ? { ...i, continueMonthly: !i.continueMonthly } : i))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setIsOpen(false);
  }, []);

  const totalOneTime = items.reduce((sum, i) => sum + i.price, 0);
  const totalMonthly = items.filter(i => i.continueMonthly).reduce((sum, i) => sum + i.price, 0);
  const itemCount = items.length;
  const shippingCost = itemCount >= 3 ? 0 : itemCount > 0 ? 5 : 0;
  const totalWithShipping = totalOneTime + shippingCost;

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, toggleMonthly, clearCart, isOpen, setIsOpen, totalOneTime, totalMonthly, shippingCost, totalWithShipping, itemCount, refCode, setRefCode }}
    >
      {children}
    </CartContext.Provider>
  );
}
