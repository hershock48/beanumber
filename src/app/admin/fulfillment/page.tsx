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
  drip?: {
    pipeline: string;
    stage: number;
    nextSend: string;
  };
}

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

export default function FulfillmentDashboard() {
  // Auth handled by middleware.ts + admin session cookie. No password
  // prompt; cookie ships automatically on every fetch.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [activeTab, setActiveTab] = useState<'queue' | 'shipped'>('queue');
  const [queueOrders, setQueueOrders] = useState<Order[]>([]);
  const [shippedOrders, setShippedOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isShipping, setIsShipping] = useState(false);

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
      const [queue, shipped] = await Promise.all([
        fetchOrders('unshipped'),
        fetchOrders('shipped'),
      ]);
      setQueueOrders(queue);
      setShippedOrders(shipped);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [fetchOrders]);

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
          {queueOrders.length} to ship · {shippedOrders.length} shipped
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
                            {/* Order # is blank under the stockpile model.
                                Show "STOCKPILE" instead of a misleading "#"
                                for orders waiting on number assignment. */}
                            {order.orderNum ? (
                              <>
                                <span className="text-lg font-bold text-gray-900">#{order.orderNum}</span>
                                {order.childName && (
                                  <span className="text-xs text-gray-500 uppercase tracking-wide">{order.childName}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded">
                                Stockpile · number assigned at ship
                              </span>
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
                      <td className="px-4 py-2 font-bold text-gray-900">#{order.orderNum}</td>
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
