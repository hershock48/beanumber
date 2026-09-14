'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../_components/AdminShell';

interface Order {
  id: string;
  orderNum: string;
  design: string;
  shirtColor: string;
  size: string;
  vinylFront: string;
  vinylBack: string;
  buyer: string;
  email: string;
  shipName: string;
  shipStreet1: string;
  shipStreet2: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipping: string;
  childName: string;
  orderDate: string;
  notes: string;
  hasAddress: boolean;
  // Printful line (2026-09-14). 'inhouse' rows are Kevin's queue.
  source: 'inhouse' | 'printful' | string;
  productId: string;
  printfulOrderId: string;
  printfulStatus: string;
  tracking: string;
  trackingUrl: string;
  lastError: string;
  shippedAt: string;
  drip?: {
    pipeline: string;
    stage: number;
    nextSend: string;
  };
}

const PRINTFUL_STATUS_LABELS: Record<string, string> = {
  unsubmitted: 'Not sent yet',
  failed: 'Failed',
  draft: 'Draft (confirm in Printful)',
  pending: 'Pending',
  onhold: 'On hold',
  inprocess: 'In production',
  partial: 'Partly shipped',
  fulfilled: 'Shipped',
  canceled: 'Canceled',
};

const PIPELINE_LABELS: Record<string, string> = {
  shirt_nurture: 'Shirt Nurture',
  donor_convert: 'Donor Convert',
  sponsor_onboard: 'Sponsor Onboard',
  shirt_sponsor: 'Shirt → Sponsor',
  monthly_donor: 'Monthly Donor',
};

const PIPELINE_MAX: Record<string, number> = {
  shirt_nurture: 4,
  donor_convert: 3,
  sponsor_onboard: 3,
  shirt_sponsor: 4,
  monthly_donor: 3,
};

/** "1, 2, 3, 4, 7, 9, 10" becomes "1-4, 7, 9-10" for the stock field. */
function compressRanges(nums: number[]): string {
  const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(', ');
}

export default function FulfillmentDashboard() {
  // Auth handled by middleware.ts + admin session cookie. No password
  // prompt; cookie ships automatically on every fetch.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [activeTab, setActiveTab] = useState<'queue' | 'printful' | 'shipped'>('queue');
  const [queueOrders, setQueueOrders] = useState<Order[]>([]);
  const [printfulOrders, setPrintfulOrders] = useState<Order[]>([]);
  const [shippedOrders, setShippedOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isShipping, setIsShipping] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  // Stocked numbers: every number ever printed on an in-house tee. The
  // Printful assigner skips these. Edited as one text field.
  const [stockText, setStockText] = useState('');
  const [stockCount, setStockCount] = useState<number | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const fetchOrders = useCallback(async (status: string) => {
    const res = await fetch(`/api/admin/fulfillment/list?status=${status}`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    const data = await res.json();
    return data.orders as Order[];
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [queue, printful, shipped] = await Promise.all([
        fetchOrders('unshipped'),
        fetchOrders('printful'),
        fetchOrders('shipped'),
      ]);
      setQueueOrders(queue);
      setPrintfulOrders(printful);
      setShippedOrders(shipped);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setIsLoading(false);
    }
    try {
      const res = await fetch('/api/admin/stocked-numbers');
      if (res.ok) {
        const data = await res.json();
        const nums: number[] = data.numbers || [];
        setStockCount(nums.length);
        setStockText(compressRanges(nums));
      }
    } catch {
      // The panel shows "unknown" and the save still works.
    }
  }, [fetchOrders]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/admin/printful/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillmentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      setSuccessMessage(`Sent to Printful: order ${data.printfulOrderId} (${data.status}), shirt #${data.shirtNumber}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingId(null);
    }
  };

  const handleSaveStock = async () => {
    setStockSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const res = await fetch('/api/admin/stocked-numbers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: stockText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setStockCount(data.count);
      setStockText(compressRanges(data.numbers || []));
      setSuccessMessage(`Stocked numbers saved: ${data.count} number${data.count === 1 ? '' : 's'} reserved for in-house tees.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStockSaving(false);
    }
  };

  // Auto-load on mount.
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === queueOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queueOrders.map(o => o.id)));
    }
  };

  const handleShip = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Mark ${count} order${count === 1 ? '' : 's'} as shipped? This starts the drip email countdown.`)) return;

    setIsShipping(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await fetch('/api/admin/fulfillment/ship', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordIds: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ship failed');

      setSuccessMessage(data.message);
      setSelectedIds(new Set());

      // Reload data
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsShipping(false);
    }
  };

  // Group orders by size for queue view
  const groupBySize = (orders: Order[]) => {
    const groups: Record<string, Order[]> = {};
    for (const o of orders) {
      const size = o.size || 'Unknown';
      if (!groups[size]) groups[size] = [];
      groups[size].push(o);
    }
    return groups;
  };

  const sizeGroups = groupBySize(queueOrders);

  return (
    <AdminShell activeTab="fulfillment">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <h1 className="text-lg font-bold text-[#0d0d0d]">Fulfillment</h1>
        <p className="text-xs text-[#666]">
          {queueOrders.length} to ship · {printfulOrders.length} at Printful · {shippedOrders.length} shipped
        </p>
      </div>

      {/* Success/error banners */}
      {successMessage && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage('')} className="text-green-600 hover:text-green-800 font-bold">×</button>
          </div>
        </div>
      )}
      {error && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Tabs + actions */}
      <div className="max-w-6xl mx-auto px-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'queue'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              To Ship ({queueOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('printful')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'printful'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Printful ({printfulOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('shipped')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'shipped'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Shipped ({shippedOrders.length})
            </button>
          </div>

          {activeTab === 'queue' && queueOrders.length > 0 && (
            <div className="flex items-center gap-3">
              {/* PirateShip batch: downloads every unshipped order as
                  the import-ready CSV (one row per ADDRESS — multiple
                  shirts to one person share a label). Upload it on
                  pirateship.com → Import Spreadsheet, pay, print.
                  This button is the replacement for hand-copying
                  addresses out of the Stripe dashboard. */}
              <a
                href="/api/admin/fulfillment-csv?status=ready"
                className="px-3 py-1.5 text-sm bg-[#D4A843] text-gray-900 rounded-md hover:bg-[#c49a3a] font-semibold"
              >
                ⬇ PirateShip CSV
              </a>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 font-medium"
              >
                🖨 Print Slips
              </button>
              <button
                onClick={selectAll}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 font-medium"
              >
                {selectedIds.size === queueOrders.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleShip}
                  disabled={isShipping}
                  className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 font-semibold disabled:bg-gray-400"
                >
                  {isShipping ? 'Shipping...' : `Mark ${selectedIds.size} Shipped`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Queue view */}
      {activeTab === 'queue' && (
        <div className="max-w-6xl mx-auto px-4 pb-12">
          {queueOrders.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">All caught up</p>
              <p className="text-sm mt-1">No orders waiting to ship.</p>
            </div>
          ) : (
            Object.entries(sizeGroups).map(([size, orders]) => (
              <div key={size} className="mb-6">
                <div className="bg-gray-900 text-white text-xs font-bold tracking-widest px-3 py-1.5 rounded-t-md uppercase">
                  Size: {size}
                </div>
                <div className="space-y-0">
                  {orders.map(order => (
                    <div
                      key={order.id}
                      className={`bg-white border border-gray-200 border-t-0 px-4 py-3 flex items-start gap-3 transition-colors ${
                        selectedIds.has(order.id) ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'border-l-4 border-l-transparent'
                      }`}
                    >
                      {/* Checkbox */}
                      <label className="flex items-center pt-0.5 cursor-pointer print:hidden">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </label>

                      {/* Order info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-2">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {/* Order # is left blank for stockpile orders.
                                We do not track which number ships to which
                                buyer — Kevin doesn't need that metric.
                                Only show #N when the field is set (portal
                                repeats and legacy assignments). */}
                            {order.orderNum && (
                              <>
                                <span className="text-lg font-bold text-gray-900">#{order.orderNum}</span>
                                {order.childName && (
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">{order.childName}</span>
                                )}
                              </>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{order.orderDate}</span>
                        </div>

                        <div className="flex items-start justify-between gap-6">
                          {/* Shirt spec — color + size made more prominent */}
                          <div>
                            <p className="text-base font-bold text-gray-900">
                              {order.shirtColor} · Size {order.size}
                            </p>
                            <p className="text-xs text-gray-500">
                              {order.design} · Ink: {order.vinylFront}/{order.vinylBack}
                            </p>
                          </div>

                          {/* Address */}
                          {order.hasAddress ? (
                            <div className="text-right text-xs text-gray-600 leading-snug flex-shrink-0">
                              <p className="font-semibold">{order.shipName}</p>
                              <p>{order.shipStreet1}</p>
                              {order.shipStreet2 && <p>{order.shipStreet2}</p>}
                              <p>{order.shipCity}, {order.shipState} {order.shipZip}</p>
                            </div>
                          ) : (
                            <div className="text-right text-xs text-red-600 font-semibold flex-shrink-0">
                              ADDRESS MISSING<br />
                              <span className="font-normal text-gray-500">{order.buyer} · {order.email}</span>
                            </div>
                          )}
                        </div>

                        {order.notes && (
                          <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 inline-block">
                            Note: {order.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Printful view: rows Printful prints and ships. Nothing here is
          Kevin's to ship; a stuck row shows its error and a Retry. */}
      {activeTab === 'printful' && (
        <div className="max-w-6xl mx-auto px-4 pb-12">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 text-xs text-gray-600">
            <p>
              These pieces are printed and shipped by Printful. Drafts wait in the Printful dashboard until you confirm them there.
              When a package ships, the row moves to Shipped on its own and the buyer gets tracking by email.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <a href="/api/admin/printful/test-order" className="text-[#b58a2a] font-semibold hover:underline">Place a test order</a>
              <button onClick={() => setStockOpen(o => !o)} className="text-[#b58a2a] font-semibold hover:underline">
                {stockOpen ? 'Hide' : 'Edit'} stocked numbers{stockCount != null ? ` (${stockCount})` : ''}
              </button>
            </div>
            {stockOpen && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-gray-700 font-semibold mb-1">Numbers printed on in-house tees</p>
                <p className="mb-2">
                  List every number you have ever pressed onto a tee, sold or not. Printful pieces will never use one of these,
                  so a hoodie can never land on the same number as a tee in the pile. Ranges are fine: 1-53, 60, 62-70.
                </p>
                <textarea
                  id="stocked-numbers"
                  value={stockText}
                  onChange={e => setStockText(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                  placeholder="1-53, 60, 62-70"
                />
                <button
                  onClick={handleSaveStock}
                  disabled={stockSaving}
                  className="mt-2 px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 font-semibold disabled:bg-gray-400"
                >
                  {stockSaving ? 'Saving...' : 'Save stocked numbers'}
                </button>
              </div>
            )}
          </div>

          {printfulOrders.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">Nothing at Printful</p>
              <p className="text-sm mt-1">Seasonal orders show here from checkout until they ship.</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Number</th>
                    <th className="text-left px-4 py-2">Buyer</th>
                    <th className="text-left px-4 py-2">Piece</th>
                    <th className="text-left px-4 py-2">Printful</th>
                    <th className="text-left px-4 py-2">Ordered</th>
                    <th className="text-right px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {printfulOrders.map(order => {
                    const stuck = order.printfulStatus === 'failed' || order.printfulStatus === 'unsubmitted' || !order.printfulOrderId;
                    return (
                      <tr key={order.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-2 font-bold text-gray-900">{order.orderNum ? `#${order.orderNum}` : <span className="text-gray-400 font-normal">not assigned</span>}</td>
                        <td className="px-4 py-2">
                          <p className="text-gray-900">{order.buyer}</p>
                          <p className="text-xs text-gray-400">{order.email}</p>
                          {!order.hasAddress && <p className="text-xs text-red-600 font-semibold">Address missing</p>}
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-gray-700">{order.design}</p>
                          <p className="text-xs text-gray-400">{order.shirtColor} · {order.size}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className={stuck ? 'text-red-700 font-semibold' : 'text-gray-700'}>
                            {PRINTFUL_STATUS_LABELS[order.printfulStatus] || order.printfulStatus || 'Not sent yet'}
                          </p>
                          {order.printfulOrderId && <p className="text-xs text-gray-400">order {order.printfulOrderId}</p>}
                          {order.lastError && <p className="text-xs text-red-600 mt-1 max-w-xs break-words">{order.lastError}</p>}
                          {order.trackingUrl && (
                            <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#b58a2a] hover:underline">
                              Track {order.tracking}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{order.orderDate}</td>
                        <td className="px-4 py-2 text-right">
                          {stuck && (
                            <button
                              onClick={() => handleRetry(order.id)}
                              disabled={retryingId === order.id}
                              className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 font-semibold disabled:bg-gray-400"
                            >
                              {retryingId === order.id ? 'Sending...' : 'Retry'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Shipped view */}
      {activeTab === 'shipped' && (
        <div className="max-w-6xl mx-auto px-4 pb-12">
          {shippedOrders.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">No shipped orders yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2">Order</th>
                    <th className="text-left px-4 py-2">Buyer</th>
                    <th className="text-left px-4 py-2">Shirt</th>
                    <th className="text-left px-4 py-2">Child</th>
                    <th className="text-left px-4 py-2">Drip Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shippedOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-bold text-gray-900">
                        #{order.orderNum}
                        {order.shipping === 'Handed in Person' && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wide align-middle">
                            In person
                          </span>
                        )}
                        {order.source === 'printful' && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-semibold uppercase tracking-wide align-middle">
                            Printful
                          </span>
                        )}
                        {order.trackingUrl && (
                          <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className="block text-xs font-normal text-[#b58a2a] hover:underline">
                            Track
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-gray-900">{order.buyer}</p>
                        <p className="text-xs text-gray-400">{order.email}</p>
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-gray-700">{order.design}</p>
                        <p className="text-xs text-gray-400">{order.shirtColor} · {order.size}</p>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{order.childName || '—'}</td>
                      <td className="px-4 py-2">
                        {order.drip ? (
                          <div>
                            <div className="flex items-center gap-1 mb-0.5">
                              {Array.from({ length: PIPELINE_MAX[order.drip.pipeline] || 4 }, (_, i) => (
                                <div
                                  key={i}
                                  className={`w-2 h-2 rounded-full ${
                                    i < order.drip!.stage
                                      ? 'bg-amber-500'
                                      : i === order.drip!.stage && order.drip!.nextSend
                                        ? 'border border-amber-500 bg-white'
                                        : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                              <span className="text-xs text-gray-400 ml-1">
                                {order.drip.stage}/{PIPELINE_MAX[order.drip.pipeline] || '?'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              {PIPELINE_LABELS[order.drip.pipeline] || order.drip.pipeline}
                              {order.drip.nextSend && (
                                <span className={order.drip.nextSend <= new Date().toISOString().split('T')[0] ? ' text-red-600 font-semibold' : ' text-green-600'}>
                                  {' '}· Next: {order.drip.nextSend}
                                </span>
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No drip</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Print styles — hides everything except the queue cards */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          /* Hide header nav, tabs, buttons */
          .bg-white.border-b { display: none !important; }
          .flex.items-center.justify-between.mb-4 { display: none !important; }
          /* Show only queue content */
          .bg-gray-50 { background: white !important; padding: 0 !important; }
          /* Clean up cards for print */
          .bg-white.border { border: 1px solid #ccc !important; margin-bottom: 4px !important; }
          .bg-gray-900.text-white { background: #333 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Hide checkboxes */
          input[type="checkbox"] { display: none !important; }
          label { display: none !important; }
          /* Hide shipped tab content */
          table { display: none !important; }
        }
      `}</style>
    </AdminShell>
  );
}
