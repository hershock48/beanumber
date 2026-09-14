/**
 * The product catalog. One source of truth for what can be bought,
 * what it costs, which colors and sizes exist, and who makes it.
 *
 * Two fulfillment sources:
 *
 *   inhouse   The 2026 tees. Kevin screen-prints and ships from the
 *             stockpile; the number is pressed on before shipping and
 *             is not known at purchase. Rows land in the admin
 *             shirts-to-ship queue.
 *
 *   printful  The seasonal line (long sleeve, hoodie). The webhook
 *             assigns the number at order time, posts the order to
 *             Printful with the per-number print file, and Printful
 *             prints and ships. Kevin never touches the garment.
 *             See src/lib/printful/.
 *
 * Checkout (create-cart-checkout) validates every cart line against
 * this file, and prices come from here, never from the client.
 *
 * PLACEHOLDER decisions, flagged for Kevin (2026-09-14): the seasonal
 * prices, the color list, and `available` on both seasonal pieces.
 * They ship hidden (available: false) until he rules.
 */

import { PRINTFUL_VARIANTS } from './printful/catalog-variants';

export type FulfillmentSource = 'inhouse' | 'printful';

export interface ProductColor {
  /** Display name, also the value stored on cart lines and fulfillment rows. */
  name: string;
  /** Swatch for the storefront. */
  hex: string;
  /** Ink color for the print files: white on dark garments, black on light. */
  ink: 'white' | 'black';
  /** Printful catalog variant id per size. Absent for in-house products. */
  printfulVariants?: Record<string, number>;
}

export interface Product {
  /** URL slug and checkout key. Stored on cart lines as shirtId. */
  id: string;
  /** Display name. For tees this is the colorway; for seasonal pieces the garment. */
  name: string;
  /** What lands in fulfillments.design and on the packing slip. */
  design: string;
  garment: 'tee' | 'long-sleeve' | 'hoodie';
  price: number;
  description: string;
  sizes: readonly string[];
  colors: ProductColor[];
  fulfillment: FulfillmentSource;
  /** Printful catalog product id (the garment), for printful products. */
  printfulProductId?: number;
  /** Shown on /shirts. Seasonal pieces stay hidden until Kevin rules on price and colors. */
  available: boolean;
}

export const ADULT_SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
export const YOUTH_SIZES = ['Youth S', 'Youth M', 'Youth L', 'Youth XL'] as const;
const TEE_SIZES = [...ADULT_SIZES, ...YOUTH_SIZES] as const;

const TEE_DESCRIPTION =
  "A heavyweight cotton tee, screen-printed by hand. Every shirt gets a unique number, pressed on after you order. Each is one of a kind. That number belongs to a specific child at our campus in Northern Uganda. Type it into beanumber.org and you'll meet them.";

const SEASONAL_DESCRIPTION =
  'Printed to order with a unique number on the back. That number belongs to a specific child at our campus in Northern Uganda. Type it into beanumber.org and you meet them.';

/** The four 2026 tee colorways. Each is its own product card with one fixed color. */
function tee(id: string, name: string, hex: string, ink: 'white' | 'black'): Product {
  return {
    id,
    name,
    design: 'Number Tee',
    garment: 'tee',
    price: 25,
    description: TEE_DESCRIPTION,
    sizes: TEE_SIZES,
    colors: [{ name, hex, ink }],
    fulfillment: 'inhouse',
    available: true,
  };
}

function printfulColors(
  key: keyof typeof PRINTFUL_VARIANTS,
  inks: Record<string, 'white' | 'black'>
): ProductColor[] {
  const entry = PRINTFUL_VARIANTS[key];
  return Object.entries(entry.colors).map(([name, c]) => ({
    name,
    hex: c.hex,
    ink: inks[name] ?? 'white',
    printfulVariants: c.sizes,
  }));
}

export const PRODUCTS: Product[] = [
  tee('onyx', 'Onyx', '#1a1a1a', 'white'),
  tee('meadow', 'Meadow', '#5f7a4a', 'white'),
  tee('blossom', 'Blossom', '#e8b4c0', 'black'),
  tee('sky', 'Sky', '#9ec5e8', 'black'),
  {
    id: 'long-sleeve',
    name: 'Long sleeve',
    design: 'Long Sleeve',
    garment: 'long-sleeve',
    // PLACEHOLDER price: lands at about $28 from Printful (base $18.66,
    // back print $5.25, US shipping $3.99). Kevin to confirm.
    price: 38,
    description: SEASONAL_DESCRIPTION,
    sizes: ADULT_SIZES,
    colors: printfulColors('longSleeve', {
      Black: 'white',
      Navy: 'white',
      'Heather Forest': 'white',
      White: 'black',
    }),
    fulfillment: 'printful',
    printfulProductId: PRINTFUL_VARIANTS.longSleeve.productId,
    available: false,
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    design: 'Hoodie',
    garment: 'hoodie',
    // PLACEHOLDER price: lands at about $35 from Printful (base $22.63,
    // back print $5.25, US shipping $7.19). Kevin to confirm.
    price: 50,
    description: SEASONAL_DESCRIPTION,
    sizes: ADULT_SIZES,
    colors: printfulColors('hoodie', {
      Black: 'white',
      Navy: 'white',
      'Sport Grey': 'black',
      'Forest Green': 'white',
    }),
    fulfillment: 'printful',
    printfulProductId: PRINTFUL_VARIANTS.hoodie.productId,
    available: false,
  },
];

export function getProduct(id: string): Product | null {
  return PRODUCTS.find(p => p.id === id) ?? null;
}

export function getProductColor(product: Product, colorName: string): ProductColor | null {
  return product.colors.find(c => c.name === colorName) ?? null;
}

/** True when the id, color and size all exist on one product. */
export function isValidSelection(id: string, color: string, size: string): boolean {
  const p = getProduct(id);
  if (!p) return false;
  if (!p.sizes.includes(size)) return false;
  return !!getProductColor(p, color);
}

/** Products the storefront should show right now. */
export function availableProducts(): Product[] {
  return PRODUCTS.filter(p => p.available);
}

/** Printful variant id for a color and size, or null when not a Printful product. */
export function printfulVariantId(product: Product, color: string, size: string): number | null {
  const c = getProductColor(product, color);
  const id = c?.printfulVariants?.[size];
  return typeof id === 'number' ? id : null;
}
