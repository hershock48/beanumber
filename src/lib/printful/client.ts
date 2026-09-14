/**
 * Printful API v1 client. Thin fetch wrapper; every call returns the
 * parsed `result` or throws with Printful's own error message.
 *
 * Env:
 *   PRINTFUL_API_KEY        Private token from Printful > Settings > API.
 *   PRINTFUL_STORE_ID       Optional. Needed only when the token can see
 *                           more than one store (sent as X-PF-Store-Id).
 *   PRINTFUL_AUTO_CONFIRM   'true' sends orders straight to production.
 *                           Anything else creates DRAFTS that Kevin
 *                           confirms in the Printful dashboard. Start
 *                           with drafts; flip once the first pieces
 *                           come back right.
 *   PRINTFUL_WEBHOOK_SECRET Shared secret in the webhook URL query
 *                           string (Printful v1 webhooks are unsigned).
 */

const BASE = 'https://api.printful.com';

export class PrintfulError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'PrintfulError';
  }
}

export function isPrintfulConfigured(): boolean {
  return !!process.env.PRINTFUL_API_KEY;
}

export function printfulAutoConfirm(): boolean {
  return process.env.PRINTFUL_AUTO_CONFIRM === 'true';
}

function headers(): Record<string, string> {
  const key = process.env.PRINTFUL_API_KEY;
  if (!key) throw new Error('PRINTFUL_API_KEY is not set');
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (process.env.PRINTFUL_STORE_ID) h['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  return h;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: { code?: number; result?: T; error?: { message?: string } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // fall through with the raw text in the error
  }
  if (!res.ok) {
    const message =
      json?.error?.message || (typeof json?.result === 'string' ? json.result : '') || text.slice(0, 300);
    throw new PrintfulError(`Printful ${method} ${path} failed (${res.status}): ${message}`, res.status, json);
  }
  return json.result as T;
}

// ── Orders ──────────────────────────────────────────────────────

export interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
  email?: string;
  phone?: string;
}

export interface PrintfulFile {
  /** Placement id: 'front' (alias 'default'), 'back', 'sleeve_left', 'label_outside', ... */
  type: string;
  url: string;
}

export interface PrintfulItemInput {
  external_id?: string;
  variant_id: number;
  quantity: number;
  retail_price?: string;
  name?: string;
  files: PrintfulFile[];
}

export interface PrintfulOrderInput {
  external_id: string;
  shipping?: string;
  recipient: PrintfulRecipient;
  items: PrintfulItemInput[];
  retail_costs?: { currency: string; subtotal?: string; shipping?: string; tax?: string; total?: string };
  packing_slip?: {
    email?: string;
    phone?: string;
    message?: string;
    logo_url?: string;
    store_name?: string;
    custom_order_id?: string;
  };
}

export interface PrintfulOrder {
  id: number;
  external_id: string | null;
  status: string;
  shipping: string;
  created: number;
  updated: number;
  costs?: { currency: string; subtotal: string; shipping: string; tax: string; total: string };
  shipments?: Array<{
    id: number;
    carrier: string;
    service: string;
    tracking_number: string;
    tracking_url: string;
    ship_date: string;
  }>;
  items?: Array<{ id: number; external_id: string | null; variant_id: number; status?: string }>;
}

/**
 * Create an order. With confirm=true it goes straight to production;
 * otherwise it sits as a draft in the Printful dashboard until Kevin
 * confirms it there (or we call confirmOrder).
 */
export async function createOrder(input: PrintfulOrderInput, confirm: boolean): Promise<PrintfulOrder> {
  return call<PrintfulOrder>('POST', `/orders?confirm=${confirm ? 'true' : 'false'}`, input);
}

export async function confirmOrder(orderId: number | string): Promise<PrintfulOrder> {
  return call<PrintfulOrder>('POST', `/orders/${orderId}/confirm`);
}

export async function getOrder(orderIdOrExternal: number | string): Promise<PrintfulOrder> {
  return call<PrintfulOrder>('GET', `/orders/${orderIdOrExternal}`);
}

export async function cancelOrder(orderId: number | string): Promise<PrintfulOrder> {
  return call<PrintfulOrder>('DELETE', `/orders/${orderId}`);
}

/** Quote an order before placing it (costs + shipping) without creating anything. */
export async function estimateOrder(input: PrintfulOrderInput): Promise<{ costs: PrintfulOrder['costs'] }> {
  return call<{ costs: PrintfulOrder['costs'] }>('POST', '/orders/estimate-costs', input);
}

// ── Webhooks ────────────────────────────────────────────────────

export const WEBHOOK_TYPES = [
  'package_shipped',
  'order_failed',
  'order_canceled',
  'order_put_hold',
  'order_remove_hold',
  'order_updated',
] as const;

export async function setWebhook(url: string): Promise<unknown> {
  return call('POST', '/webhooks', { url, types: WEBHOOK_TYPES });
}

export async function getWebhook(): Promise<unknown> {
  return call('GET', '/webhooks');
}

// ── Store ───────────────────────────────────────────────────────

export async function listStores(): Promise<Array<{ id: number; name: string; type: string }>> {
  return call('GET', '/stores');
}
