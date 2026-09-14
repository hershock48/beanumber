'use client';

/**
 * The seasonal line on /shirts: the pieces Printful prints and ships.
 * Reads the catalog (src/lib/products.ts) and renders one card per
 * available Printful product with a color picker, a size row, and the
 * same two-button add pattern the tees use (Shirt + Stay first).
 *
 * Renders nothing while no seasonal product is marked available, so
 * the section can ship dark and light up when Kevin flips the flag.
 */

import { useState } from 'react';
import { useCart } from '@/components/CartContext';
import { PRODUCTS, type Product } from '@/lib/products';

function SeasonalCard({ product }: { product: Product }) {
  const [color, setColor] = useState(product.colors[0]);
  const [size, setSize] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const { addItem } = useCart();

  function add(continueMonthly: boolean) {
    if (!size) {
      setError('Please select a size.');
      return;
    }
    setError(null);
    addItem({
      shirtId: product.id,
      shirtName: product.name,
      color: color.name,
      size,
      continueMonthly,
      price: product.price,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  const dark = color.ink === 'white';

  return (
    <div className="flex flex-col md:flex-row gap-6 md:gap-14 items-center" id={product.id}>
      {/* Swatch stands in for a mockup: the garment color with the
          number stamp. Printful's own mockups can replace this later. */}
      <div className="flex-1 w-full">
        <div
          className="aspect-[4/5] w-full flex flex-col items-center justify-center border transition-colors duration-300"
          style={{ backgroundColor: color.hex, borderColor: dark ? '#333' : '#e8e0d4' }}
        >
          <p
            className="text-[11px] uppercase tracking-[0.3em] mb-2"
            style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}
          >
            Order #
          </p>
          <p
            className="text-5xl font-bold tracking-[0.15em]"
            style={{ fontFamily: '"Courier New", ui-monospace, monospace', color: dark ? '#fff' : '#0d0d0d' }}
          >
            0047
          </p>
          <p className="text-xs mt-4" style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>
            {product.name} · {color.name}
          </p>
        </div>
        <p className="text-xs text-[#999] mt-3 text-center">
          Sample shown. Every piece is printed with its own number on the back.
        </p>
      </div>

      <div className="flex-1 w-full">
        <h2 className="text-3xl md:text-4xl text-[#0d0d0d] mb-1" style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
          {product.name}
        </h2>
        <p className="text-2xl text-[#D4A843] mb-4" style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 700 }}>
          ${product.price}
        </p>
        <p className="text-sm sm:text-base text-[#666] leading-relaxed mb-2">{product.description}</p>
        <p className="text-xs text-[#aaa]">Adult S to 2XL · Unisex · Printed to order, ships in about two weeks</p>

        <div className="mt-6">
          <p className="text-xs text-[#999] uppercase tracking-wider font-bold mb-2">Color</p>
          <div className="flex gap-2 flex-wrap mb-5">
            {product.colors.map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c.name}
                title={c.name}
                className={`w-9 h-9 border-2 transition-all cursor-pointer ${
                  color.name === c.name ? 'border-[#0d0d0d] scale-110' : 'border-[#e8e0d4] hover:border-[#999]'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
            <span className="self-center text-xs text-[#666] ml-1">{color.name}</span>
          </div>

          <p className="text-xs text-[#999] uppercase tracking-wider font-bold mb-2">Size</p>
          <div className="flex gap-2 flex-wrap mb-4">
            {product.sizes.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSize(s);
                  setError(null);
                }}
                className={`w-12 h-10 text-sm font-semibold border transition-all cursor-pointer ${
                  size === s ? 'bg-[#0d0d0d] text-white border-[#0d0d0d]' : 'bg-white text-[#555] border-[#e8e0d4] hover:border-[#999]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => add(true)}
              className="flex-1 bg-[#D4A843] text-[#0d0d0d] px-6 py-4 font-bold text-sm uppercase tracking-wider hover:bg-[#c49a3a] transition-colors cursor-pointer"
            >
              {justAdded ? 'Added' : `${product.name} + Stay · $${product.price} + $25/mo`}
            </button>
            <button
              type="button"
              onClick={() => add(false)}
              className="sm:w-40 border border-[#0d0d0d] text-[#0d0d0d] px-4 py-3 font-semibold text-sm hover:bg-[#0d0d0d] hover:text-white transition-colors cursor-pointer"
            >
              {justAdded ? 'Added' : `Just the ${product.name.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SeasonalDrop() {
  const seasonal = PRODUCTS.filter(p => p.fulfillment === 'printful' && p.available);
  if (seasonal.length === 0) return null;
  return (
    <section className="px-5 pb-24 border-t border-[#e8e0d4] pt-16">
      <div className="max-w-6xl mx-auto">
        <p className="text-xs font-bold text-[#D4A843] uppercase tracking-[0.3em] mb-3 text-center">The fall drop</p>
        <h2 className="text-3xl md:text-4xl text-[#0d0d0d] mb-12 text-center" style={{ fontFamily: 'var(--font-lora), serif', fontWeight: 600 }}>
          Same number. Warmer.
        </h2>
        <div className="space-y-16 md:space-y-28">
          {seasonal.map(p => (
            <SeasonalCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
