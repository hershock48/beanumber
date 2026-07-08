'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import {
  canApplyPromoToCart,
  discountedAmountCents,
  type PromoCode,
} from '@/lib/promo-codes';
import { isFreeShippingWindowActive } from '@/lib/free-shipping-window';

export type CartItem = {
  id: string;           // unique key (generated on add)
  shirtId: string;      // design id (e.g. 'flagship')
  shirtName: string;    // display name (e.g. 'The Flagship')
  color: string;
  size: string;
  continueMonthly: boolean;
  price: number;        // always 25
};

/**
 * Computed promo result for the UI. `applicable: true` means the
 * code is valid AND the current cart can use it (right shape, not
 * expired). `applicable: false` means the code is set but can&rsquo;t
 * apply right now — usually because the cart has monthly opt-ins
 * and the code is shirt-only. The `reason` carries the inline
 * message for the pill/banner.
 */
export type PromoState =
  | { applicable: true; code: PromoCode; oneTimeDiscountDollars: number }
  | { applicable: false; rawCode: string; reason: string }
  | null;

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  toggleMonthly: (id: string) => void;
  clearCart: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  totalOneTime: number;          // pre-discount one-time total
  totalMonthly: number;
  shippingCost: number;
  totalWithShipping: number;     // one-time + shipping, pre-discount (kept for back-compat)
  totalOneTimeDiscounted: number; // post-discount one-time total
  totalWithShippingDiscounted: number; // post-discount + shipping
  itemCount: number;
  refCode: string | null;
  setRefCode: (code: string | null) => void;
  /** Raw code string entered by the user, before validation. */
  promoCodeRaw: string | null;
  setPromoCode: (code: string | null) => void;
  /** Computed validation + applicability result for the UI. */
  promo: PromoState;
};

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

let nextId = 1;

const PROMO_STORAGE_KEY = 'ban_cart_promo_code';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [promoCodeRaw, setPromoCodeRawState] = useState<string | null>(null);

  // Rehydrate promo code from sessionStorage on mount so navigation
  // (shirts page → kid page → back) doesn&rsquo;t drop the code the user
  // arrived with via /shirts?code=WIN10. sessionStorage (not local)
  // because the code dies with the tab session — codes are not
  // meant to be permanent loyalty tags.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(PROMO_STORAGE_KEY);
      if (stored && stored.trim().length > 0) {
        setPromoCodeRawState(stored.trim().toUpperCase());
      }
    } catch {
      // sessionStorage can throw in private-mode iframes; safe to ignore.
    }
  }, []);

  const setPromoCode = useCallback((code: string | null) => {
    const normalized =
      code && typeof code === 'string'
        ? code.trim().toUpperCase()
        : null;
    setPromoCodeRawState(normalized);
    try {
      if (normalized) {
        window.sessionStorage.setItem(PROMO_STORAGE_KEY, normalized);
      } else {
        window.sessionStorage.removeItem(PROMO_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

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
  const hasMonthly = items.some(i => i.continueMonthly);
  // Free shipping if any of:
  //   - cart is empty (no shipping to charge)
  //   - buyer has 3+ shirts (bulk perk)
  //   - buyer added monthly to at least one shirt (shirt+monthly is
  //     always free ship by policy)
  //   - the FREE_SHIPPING_UNTIL window is currently active (site-wide
  //     temporary promo; must be exposed via NEXT_PUBLIC_* to reach
  //     this client-side check)
  const shippingCost =
    itemCount === 0
      ? 0
      : itemCount >= 3 || hasMonthly || isFreeShippingWindowActive()
      ? 0
      : 5;
  const totalWithShipping = totalOneTime + shippingCost;

  // Compute promo applicability against the current cart shape. Re-
  // runs whenever the cart shape or the raw code changes.
  let promo: PromoState = null;
  if (promoCodeRaw) {
    const result = canApplyPromoToCart(promoCodeRaw, { hasMonthly });
    if (result.ok) {
      // Discount only the one-time portion of the cart. Per-cent off
      // calculated in cents on the line-item subtotal to stay in
      // sync with the server-side checkout pricing.
      const subtotalCents = totalOneTime * 100;
      const discountedCents = discountedAmountCents(
        subtotalCents,
        result.code.percentOff
      );
      const discountDollars = (subtotalCents - discountedCents) / 100;
      promo = {
        applicable: true,
        code: result.code,
        oneTimeDiscountDollars: discountDollars,
      };
    } else {
      promo = {
        applicable: false,
        rawCode: promoCodeRaw,
        reason: result.reason,
      };
    }
  }

  const totalOneTimeDiscounted =
    promo?.applicable ? totalOneTime - promo.oneTimeDiscountDollars : totalOneTime;
  const totalWithShippingDiscounted = totalOneTimeDiscounted + shippingCost;

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        toggleMonthly,
        clearCart,
        isOpen,
        setIsOpen,
        totalOneTime,
        totalMonthly,
        shippingCost,
        totalWithShipping,
        totalOneTimeDiscounted,
        totalWithShippingDiscounted,
        itemCount,
        refCode,
        setRefCode,
        promoCodeRaw,
        setPromoCode,
        promo,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
