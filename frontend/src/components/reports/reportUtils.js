import { db } from '../../lib/db';

export const DATE_RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'last7days', label: 'Last 7 Days' },
  { id: 'last2weeks', label: 'Last 2 Weeks' },
  { id: 'last30days', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'last3months', label: 'Last 3 Months' },
  { id: 'thisYear', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

export function getDateRange(rangeId, customStart, customEnd) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (rangeId) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'thisWeek': {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'last7days':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last2weeks':
      start.setDate(start.getDate() - 14);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last30days':
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth': {
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      const endLast = new Date(now.getFullYear(), now.getMonth(), 0);
      endLast.setHours(23, 59, 59, 999);
      return { start, end: endLast };
    }
    case 'last3months':
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      break;
    case 'thisYear':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      return {
        start: customStart ? new Date(customStart) : new Date(0),
        end: customEnd ? new Date(`${customEnd}T23:59:59`) : new Date(),
      };
    default:
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export function getRangeFromAYearAgo(start, end) {
  const yearAgoStart = new Date(start);
  yearAgoStart.setFullYear(yearAgoStart.getFullYear() - 1);
  const yearAgoEnd = new Date(end);
  yearAgoEnd.setFullYear(yearAgoEnd.getFullYear() - 1);
  return { start: yearAgoStart, end: yearAgoEnd };
}

// Heuristics for pulling sale revenue from various fields users may have on transactions/orders.
export function getTransactionRevenue(tx, priceLookup = {}) {
  const total = Number(tx.total ?? tx.amount ?? tx.subtotal ?? tx.revenue ?? 0);
  if (total > 0) return total;
  const qty = Math.abs(Number(tx.quantity) || 0);
  const unit = Number(tx.unitPrice ?? tx.price ?? priceLookup[tx.peptideId] ?? 0);
  return qty * unit;
}

export function getTransactionCustomer(tx) {
  return tx.customer ?? tx.customerName ?? tx.buyer ?? tx.customerEmail ?? null;
}

export function getTransactionState(tx) {
  const raw = (tx.state ?? tx.shippingState ?? tx.billingState ?? tx.region ?? '').toString().trim().toUpperCase();
  if (!raw) return null;
  if (raw.length === 2) return raw;
  // try to map full state name
  return STATE_NAME_TO_ABBR[raw] || null;
}

const STATE_NAME_TO_ABBR = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
};

export function getTransactionOrderId(tx) {
  return tx.orderId ?? tx.invoiceId ?? tx.orderNumber ?? null;
}

// Returns a map of peptideId -> unit price for revenue estimates.
export async function loadPriceLookup(peptides = []) {
  const lookup = {};
  try {
    const priceData = (await db.settings.get('priceData')) || {};
    Object.entries(priceData).forEach(([key, tiers]) => {
      // tiers is an object of { price, retail, ... }
      const value = Number(tiers?.price || tiers?.retail || Object.values(tiers || {}).find(v => Number(v) > 0));
      if (Number(value) > 0) lookup[key] = Number(value);
    });
  } catch (e) {
    // ignore
  }
  // Fallback: take batch pimsSale as a unit price
  try {
    const batches = await db.batches.getAll();
    batches.forEach(b => {
      const id = b.productId || b.peptideId;
      if (!id) return;
      const price = Number(b.pimsSale) || 0;
      if (!lookup[id] && price > 0) lookup[id] = price;
    });
  } catch (e) {
    // ignore
  }
  // Final fallback: any salePrice/price field on peptide itself
  peptides.forEach(p => {
    const id = p.peptideId || p.id;
    if (!id || lookup[id]) return;
    const price = Number(p.salePrice ?? p.price ?? 0);
    if (price > 0) lookup[id] = price;
  });
  return lookup;
}

export function getProductDisplayName(peptideId, peptides = []) {
  const p = peptides.find(pp => pp.peptideId === peptideId || pp.id === peptideId);
  if (!p) return peptideId;
  return p.nickname || p.peptideName || p.peptideId;
}

export function formatCurrency(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('en-US');
}

export function formatDateBucket(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function bucketTransactionsByDay(transactions, start, end) {
  const dayMs = 86400000;
  const days = Math.max(1, Math.ceil((end - start) / dayMs) + 1);
  const buckets = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    buckets.push({ date, qty: 0, revenue: 0, label: formatDateBucket(date) });
  }
  transactions.forEach(tx => {
    const txDate = new Date(tx.date || tx.createdAt);
    const idx = Math.floor((txDate - start) / dayMs);
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].qty += Math.abs(Number(tx.quantity) || 0);
      buckets[idx].revenue += Number(tx._revenue) || 0;
    }
  });
  return buckets;
}
