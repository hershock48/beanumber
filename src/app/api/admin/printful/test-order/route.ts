/**
 * Printful test order: one piece to any address, through the exact
 * path a real checkout takes (fulfillment row, number assignment,
 * print files, Printful order). With PRINTFUL_AUTO_CONFIRM unset it
 * lands as a DRAFT in the Printful dashboard, where Kevin can look at
 * the mockup and the files, then confirm and pay, or delete it.
 *
 * GET  renders a small form (cookie-authed, so Kevin can just open it).
 * POST { productId, color, size, name, street1, street2?, city, state, zip, email }
 *
 * Auth: cookie or X-Admin-Token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { fulfillments } from '@/lib/db/schema';
import { getProduct, isValidSelection, PRODUCTS } from '@/lib/products';
import { submitPrintfulOrder } from '@/lib/printful/orders';
import { isPrintfulConfigured, printfulAutoConfirm } from '@/lib/printful/client';

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ error: 'PRINTFUL_API_KEY is not set' }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const s = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).trim() : '');
  const productId = s('productId');
  const color = s('color');
  const size = s('size');
  const product = getProduct(productId);
  if (!product || product.fulfillment !== 'printful' || !isValidSelection(productId, color, size)) {
    return NextResponse.json({ error: 'Pick a Printful product, one of its colors, and one of its sizes.' }, { status: 400 });
  }
  for (const k of ['name', 'street1', 'city', 'state', 'zip']) {
    if (!s(k)) return NextResponse.json({ error: `${k} is required` }, { status: 400 });
  }

  const inserted = await db
    .insert(fulfillments)
    .values({
      design: product.design,
      shirtColor: color,
      size,
      buyerName: s('name'),
      buyerEmail: s('email') || null,
      shipName: s('name'),
      shipStreet1: s('street1'),
      shipStreet2: s('street2') || null,
      shipCity: s('city'),
      shipState: s('state'),
      shipZip: s('zip'),
      production: 'Pending',
      shipping: 'Not Shipped',
      orderDate: new Date().toISOString().slice(0, 10),
      notes: 'TEST ORDER placed from /api/admin/printful/test-order. Not a sale.',
      productId: product.id,
      fulfillmentSource: 'printful',
      printfulStatus: 'unsubmitted',
    })
    .returning({ id: fulfillments.id });

  const result = await submitPrintfulOrder(inserted[0].id);
  return NextResponse.json(
    { ...result, draft: !printfulAutoConfirm() },
    { status: result.ok ? 200 : 502 }
  );
}

export async function GET(request: NextRequest) {
  if (!verifyAdminToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const printful = PRODUCTS.filter(p => p.fulfillment === 'printful');
  const options = printful
    .map(p => `<option value="${p.id}">${p.name} ($${p.price})</option>`)
    .join('');
  const colorsJson = JSON.stringify(
    Object.fromEntries(printful.map(p => [p.id, { colors: p.colors.map(c => c.name), sizes: p.sizes }]))
  );
  const mode = printfulAutoConfirm()
    ? 'AUTO-CONFIRM is on: this order goes straight to production and is charged.'
    : 'Draft mode: the order lands in the Printful dashboard as a draft. Nothing is charged until you confirm it there.';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Printful test order</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;background:#f5f5f5;color:#0d0d0d;padding:40px 20px;display:flex;justify-content:center}
.card{background:#fff;border-left:4px solid #D4A843;padding:28px;max-width:520px;width:100%;box-shadow:0 2px 8px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 6px}p{font-size:13px;color:#666;margin:0 0 16px}label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}
input,select{width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:14px;box-sizing:border-box}
button{margin-top:16px;width:100%;background:#0d0d0d;color:#fff;border:0;padding:12px;font-weight:600;border-radius:6px;cursor:pointer}
button:disabled{background:#999}.out{margin-top:14px;font-size:13px;white-space:pre-wrap;background:#f0fdf4;padding:10px;border-radius:6px;display:none}.out.err{background:#fef2f2}</style></head>
<body><div class="card"><h1>Printful test order</h1><p>${mode}</p>
<form id="f"><label>Piece</label><select name="productId" id="productId">${options}</select>
<label>Color</label><select name="color" id="color"></select>
<label>Size</label><select name="size" id="size"></select>
<label>Ship to name</label><input name="name" required>
<label>Street</label><input name="street1" required>
<label>Street 2</label><input name="street2">
<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px"><div><label>City</label><input name="city" required></div><div><label>State</label><input name="state" maxlength="2" placeholder="MI" required></div><div><label>ZIP</label><input name="zip" required></div></div>
<label>Email for the shipped notice (optional)</label><input name="email" type="email">
<button type="submit" id="go">Place test order</button></form><div class="out" id="out"></div></div>
<script>
const C=${colorsJson};const pid=document.getElementById('productId'),col=document.getElementById('color'),sz=document.getElementById('size');
function fill(){const c=C[pid.value];col.innerHTML=c.colors.map(x=>'<option>'+x+'</option>').join('');sz.innerHTML=c.sizes.map(x=>'<option>'+x+'</option>').join('');}
pid.onchange=fill;fill();
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const b=document.getElementById('go'),o=document.getElementById('out');b.disabled=true;b.textContent='Placing...';
const data=Object.fromEntries(new FormData(e.target).entries());
try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const j=await r.json();o.style.display='block';o.className='out'+(r.ok?'':' err');
o.textContent=r.ok?('Printful order '+j.printfulOrderId+' ('+j.status+'), shirt #'+j.shirtNumber+(j.draft?'. Draft: open Printful to review and confirm.':'')):('Failed: '+(j.error||r.status));}
catch(err){o.style.display='block';o.className='out err';o.textContent='Network error: '+err.message}
b.disabled=false;b.textContent='Place test order';};
</script></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
