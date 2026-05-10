import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Users, ShoppingCart, TrendingUp, TrendingDown, ArrowUpDown, Download, Crown, MapPin } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { db } from '../../lib/db';
import USStatesMap, { ALL_STATE_ABBRS, STATE_NAMES } from './USStatesMap';
import {
  DATE_RANGE_OPTIONS,
  getDateRange,
  getRangeFromAYearAgo,
  loadPriceLookup,
  getTransactionRevenue,
  getTransactionCustomer,
  getTransactionState,
  getTransactionOrderId,
  getProductDisplayName,
  formatCurrency,
  formatNumber,
  bucketTransactionsByDay,
} from './reportUtils';

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
  },
  labelStyle: { color: '#f3f4f6', fontWeight: 'bold' },
  itemStyle: { color: '#e5e7eb' },
};

export default function SalesCustomersReport({ peptides = [], onNavigateToProducts }) {
  const [transactions, setTransactions] = useState([]);
  const [priceLookup, setPriceLookup] = useState({});
  const [rangeId, setRangeId] = useState('last30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [revenueChartType, setRevenueChartType] = useState('area');
  const [locationSort, setLocationSort] = useState({ field: 'qty', direction: 'desc' });
  const [customerSort, setCustomerSort] = useState({ field: 'revenue', direction: 'desc' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [txs, prices] = await Promise.all([
          db.transactions.getAll(),
          loadPriceLookup(peptides),
        ]);
        setTransactions(txs);
        setPriceLookup(prices);
      } catch (e) {
        console.error('Failed to load transactions for Sales report:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [peptides]);

  const { start, end } = useMemo(
    () => getDateRange(rangeId, customStart, customEnd),
    [rangeId, customStart, customEnd]
  );

  const yearAgo = useMemo(() => getRangeFromAYearAgo(start, end), [start, end]);

  const enriched = useMemo(() => {
    return transactions.map(tx => ({
      ...tx,
      _revenue: getTransactionRevenue(tx, priceLookup),
      _qty: Math.abs(Number(tx.quantity) || 0),
      _customer: getTransactionCustomer(tx),
      _state: getTransactionState(tx),
      _orderId: getTransactionOrderId(tx) || `tx-${tx.id}`,
      _date: new Date(tx.date || tx.createdAt),
    }));
  }, [transactions, priceLookup]);

  const inRange = useMemo(() => {
    return enriched.filter(tx => {
      const t = tx._date.getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
  }, [enriched, start, end]);

  const inYearAgo = useMemo(() => {
    return enriched.filter(tx => {
      const t = tx._date.getTime();
      return t >= yearAgo.start.getTime() && t <= yearAgo.end.getTime();
    });
  }, [enriched, yearAgo]);

  const topBarMetrics = useMemo(() => {
    const orders = new Set(inRange.map(tx => tx._orderId));
    const customers = new Set(inRange.map(tx => tx._customer).filter(Boolean));
    const revenue = inRange.reduce((s, tx) => s + tx._revenue, 0);
    const yaRevenue = inYearAgo.reduce((s, tx) => s + tx._revenue, 0);
    const aov = orders.size > 0 ? revenue / orders.size : 0;

    // New vs returning: a customer is "returning" if they have any transactions before `start`
    const beforeStart = enriched.filter(tx => tx._date < start);
    const priorCustomers = new Set(beforeStart.map(tx => tx._customer).filter(Boolean));
    let newCount = 0;
    let returningCount = 0;
    customers.forEach(c => {
      if (priorCustomers.has(c)) returningCount += 1;
      else newCount += 1;
    });

    const yoyDelta = yaRevenue > 0 ? ((revenue - yaRevenue) / yaRevenue) * 100 : null;

    return {
      revenue,
      yaRevenue,
      yoyDelta,
      newCustomers: newCount,
      returningCustomers: returningCount,
      aov,
      orderCount: orders.size,
    };
  }, [inRange, inYearAgo, enriched, start]);

  const revenueOverTime = useMemo(() => {
    return bucketTransactionsByDay(inRange, start, end);
  }, [inRange, start, end]);

  const stateAggregates = useMemo(() => {
    const map = {};
    ALL_STATE_ABBRS.forEach(abbr => {
      map[abbr] = { qty: 0, revenue: 0, orders: new Set() };
    });
    inRange.forEach(tx => {
      if (!tx._state || !map[tx._state]) return;
      map[tx._state].qty += tx._qty;
      map[tx._state].revenue += tx._revenue;
      map[tx._state].orders.add(tx._orderId);
    });
    return map;
  }, [inRange]);

  const ordersByState = useMemo(() => {
    const out = {};
    Object.entries(stateAggregates).forEach(([abbr, data]) => {
      out[abbr] = data.orders.size;
    });
    return out;
  }, [stateAggregates]);

  const locationTable = useMemo(() => {
    const items = ALL_STATE_ABBRS.map(abbr => ({
      abbr,
      name: STATE_NAMES[abbr],
      qty: stateAggregates[abbr].orders.size,
      revenue: stateAggregates[abbr].revenue,
    }));
    items.sort((a, b) => {
      const aVal = a[locationSort.field] ?? 0;
      const bVal = b[locationSort.field] ?? 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return locationSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return locationSort.direction === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [stateAggregates, locationSort]);

  const customerTable = useMemo(() => {
    const map = {};
    inRange.forEach(tx => {
      const c = tx._customer || '(Unknown)';
      if (!map[c]) {
        map[c] = { customer: c, revenue: 0, qty: 0, orders: new Set(), lastOrder: tx._date };
      }
      map[c].revenue += tx._revenue;
      map[c].qty += tx._qty;
      map[c].orders.add(tx._orderId);
      if (tx._date > map[c].lastOrder) map[c].lastOrder = tx._date;
    });
    const items = Object.values(map).map(c => ({
      ...c,
      orders: c.orders.size,
      lastOrder: c.lastOrder.toLocaleDateString(),
    }));
    items.sort((a, b) => {
      const aVal = a[customerSort.field] ?? 0;
      const bVal = b[customerSort.field] ?? 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return customerSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return customerSort.direction === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [inRange, customerSort]);

  const top5ProductsByRevenue = useMemo(() => {
    const map = {};
    inRange.forEach(tx => {
      const id = tx.peptideId;
      if (!id) return;
      if (!map[id]) {
        map[id] = { peptideId: id, name: getProductDisplayName(id, peptides), qty: 0, revenue: 0 };
      }
      map[id].qty += tx._qty;
      map[id].revenue += tx._revenue;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [inRange, peptides]);

  const handleExportLocation = () => {
    const header = ['State', 'Abbreviation', 'Orders', 'Revenue (USD)'];
    const rows = locationTable.map(s => [
      `"${s.name}"`, s.abbr, s.qty, s.revenue.toFixed(2),
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csv, `pims-sales-by-location-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportCustomers = () => {
    const header = ['Customer', 'Revenue (USD)', 'Quantity', 'Orders', 'Last Order'];
    const rows = customerTable.map(c => [
      `"${String(c.customer).replace(/"/g, '""')}"`, c.revenue.toFixed(2), c.qty, c.orders, c.lastOrder,
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCSV(csv, `pims-customers-${new Date().toISOString().split('T')[0]}.csv`);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading sales data…</p>
      </div>
    );
  }

  const hasData = inRange.length > 0;
  const hasCustomerData = customerTable.some(c => c.customer !== '(Unknown)');
  const hasStateData = Object.values(ordersByState).some(v => v > 0);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date Range:</label>
          <select
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            {DATE_RANGE_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          {rangeId === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <span className="text-gray-500 dark:text-gray-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 sm:ml-auto">
            {start.toLocaleDateString()} – {end.toLocaleDateString()}
          </span>
        </div>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <TopBarMetric
                icon={<DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                label="Sales"
                value={formatCurrency(topBarMetrics.revenue)}
              />
              <TopBarMetric
                icon={<Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                label="New Customers"
                value={formatNumber(topBarMetrics.newCustomers)}
              />
              <TopBarMetric
                icon={topBarMetrics.yoyDelta != null && topBarMetrics.yoyDelta < 0
                  ? <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                  : <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                label="vs Last Year"
                value={topBarMetrics.yoyDelta == null
                  ? '—'
                  : `${topBarMetrics.yoyDelta >= 0 ? '+' : ''}${topBarMetrics.yoyDelta.toFixed(1)}%`}
                subtitle={topBarMetrics.yaRevenue > 0 ? formatCurrency(topBarMetrics.yaRevenue) : 'no data'}
                valueClass={topBarMetrics.yoyDelta != null && topBarMetrics.yoyDelta < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'}
              />
              <TopBarMetric
                icon={<ShoppingCart className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                label="Avg Order Value"
                value={formatCurrency(topBarMetrics.aov)}
              />
              <TopBarMetric
                icon={<Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
                label="Returning Customers"
                value={formatNumber(topBarMetrics.returningCustomers)}
              />
              <TopBarMetric
                icon={<ShoppingCart className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
                label="Orders"
                value={formatNumber(topBarMetrics.orderCount)}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sales Revenue</h3>
              <div className="flex gap-2">
                {['bar', 'line', 'area'].map(t => (
                  <button
                    key={t}
                    onClick={() => setRevenueChartType(t)}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${
                      revenueChartType === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              {revenueChartType === 'bar' ? (
                <BarChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="left" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => name === 'Revenue' ? formatCurrency(v) : formatNumber(v)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="qty" name="Items Sold" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : revenueChartType === 'line' ? (
                <LineChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="left" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => name === 'Revenue' ? formatCurrency(v) : formatNumber(v)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="qty" name="Items Sold" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <AreaChart data={revenueOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="left" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => name === 'Revenue' ? formatCurrency(v) : formatNumber(v)} />
                  <Legend />
                  <Area yAxisId="left" type="monotone" dataKey="qty" name="Items Sold" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Shipments by Region</h3>
              </div>
              {hasStateData ? (
                <USStatesMap ordersByState={ordersByState} />
              ) : (
                <div className="text-center py-8">
                  <USStatesMap ordersByState={ordersByState} />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 max-w-md mx-auto">
                    No shipping state data on transactions yet. Add a <code className="font-mono">state</code> or
                    {' '}<code className="font-mono">shippingState</code> field to transactions to populate the map.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sales by Location</h3>
                <button
                  onClick={handleExportLocation}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                    <tr>
                      {[
                        { id: 'name', label: 'State' },
                        { id: 'qty', label: 'Orders' },
                        { id: 'revenue', label: 'Revenue' },
                      ].map(col => (
                        <th
                          key={col.id}
                          onClick={() => setLocationSort(prev => ({
                            field: col.id,
                            direction: prev.field === col.id && prev.direction === 'desc' ? 'asc' : 'desc',
                          }))}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 select-none"
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            <ArrowUpDown className={`w-3 h-3 ${locationSort.field === col.id ? 'text-blue-600 dark:text-blue-400' : 'opacity-40'}`} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {locationTable.map(s => (
                      <tr key={s.abbr} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{s.abbr}</span>
                          {s.name}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{formatNumber(s.qty)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Most Valuable Customers</h3>
              </div>
              <button
                onClick={handleExportCustomers}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </div>
            {!hasCustomerData ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  No customer names recorded on transactions yet. Add a <code className="font-mono">customer</code> field
                  on transactions to see your most valuable customers ranked by spend.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-8">#</th>
                      {[
                        { id: 'customer', label: 'Customer' },
                        { id: 'revenue', label: 'Total Spend' },
                        { id: 'qty', label: 'Items' },
                        { id: 'orders', label: 'Orders' },
                        { id: 'lastOrder', label: 'Last Order' },
                      ].map(col => (
                        <th
                          key={col.id}
                          onClick={() => setCustomerSort(prev => ({
                            field: col.id,
                            direction: prev.field === col.id && prev.direction === 'desc' ? 'asc' : 'desc',
                          }))}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 select-none"
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            <ArrowUpDown className={`w-3 h-3 ${customerSort.field === col.id ? 'text-blue-600 dark:text-blue-400' : 'opacity-40'}`} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {customerTable.map((c, i) => (
                      <tr key={c.customer} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{c.customer}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(c.revenue)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(c.qty)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(c.orders)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{c.lastOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top 5 Products by Revenue</h3>
              {onNavigateToProducts && (
                <button
                  onClick={onNavigateToProducts}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  See all product sales data →
                </button>
              )}
            </div>
            {top5ProductsByRevenue.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No products sold in selected range</p>
            ) : (
              <div className="space-y-3">
                {top5ProductsByRevenue.map((p, idx) => {
                  const max = top5ProductsByRevenue[0].revenue || 1;
                  const pct = (p.revenue / max) * 100;
                  return (
                    <div key={p.peptideId} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">#{idx + 1}</span>
                          <span className="font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                        </span>
                        <span className="font-semibold whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.revenue)} <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">({formatNumber(p.qty)} units)</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TopBarMetric({ icon, label, value, subtitle, valueClass }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-bold ${valueClass || 'text-gray-900 dark:text-white'}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
      <DollarSign className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No sales in this range</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Sales transactions with date in this range will populate revenue, customer and location metrics.
      </p>
    </div>
  );
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
