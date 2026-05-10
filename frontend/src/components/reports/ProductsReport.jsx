import { useEffect, useMemo, useState } from 'react';
import { Package, TrendingUp, ShoppingCart, BarChart3, ArrowUpDown, Download } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { db } from '../../lib/db';
import {
  DATE_RANGE_OPTIONS,
  getDateRange,
  loadPriceLookup,
  getTransactionRevenue,
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

export default function ProductsReport({ peptides = [] }) {
  const [transactions, setTransactions] = useState([]);
  const [priceLookup, setPriceLookup] = useState({});
  const [rangeId, setRangeId] = useState('last30days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [allSort, setAllSort] = useState({ field: 'qty', direction: 'desc' });
  const [allMode, setAllMode] = useState('qty'); // qty or revenue
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
        console.error('Failed to load transactions for Products report:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [peptides]);

  const { start, end } = useMemo(
    () => getDateRange(rangeId, customStart, customEnd),
    [rangeId, customStart, customEnd]
  );

  const inRange = useMemo(() => {
    const startMs = start.getTime();
    const endMs = end.getTime();
    return transactions
      .filter(tx => {
        const t = new Date(tx.date || tx.createdAt).getTime();
        return t >= startMs && t <= endMs;
      })
      .map(tx => ({
        ...tx,
        _revenue: getTransactionRevenue(tx, priceLookup),
        _qty: Math.abs(Number(tx.quantity) || 0),
      }));
  }, [transactions, priceLookup, start, end]);

  const metrics = useMemo(() => {
    const totalProducts = inRange.reduce((sum, tx) => sum + tx._qty, 0);
    const uniqueProducts = new Set(inRange.map(tx => tx.peptideId)).size;

    // Group by order if order id exists, else each transaction is a one-item order
    const orderGroups = {};
    inRange.forEach(tx => {
      const orderId = getTransactionOrderId(tx) || `tx-${tx.id}`;
      if (!orderGroups[orderId]) orderGroups[orderId] = { items: 0, qty: 0 };
      orderGroups[orderId].items += 1;
      orderGroups[orderId].qty += tx._qty;
    });
    const orderCount = Object.keys(orderGroups).length;
    const avgProductsPerOrder = orderCount > 0
      ? Object.values(orderGroups).reduce((sum, o) => sum + o.qty, 0) / orderCount
      : 0;

    return {
      totalProducts,
      uniqueProducts,
      avgProductsPerOrder,
      orderCount,
      totalRevenue: inRange.reduce((sum, tx) => sum + tx._revenue, 0),
    };
  }, [inRange]);

  const productBreakdown = useMemo(() => {
    const map = {};
    inRange.forEach(tx => {
      const id = tx.peptideId;
      if (!id) return;
      if (!map[id]) {
        map[id] = {
          peptideId: id,
          name: getProductDisplayName(id, peptides),
          qty: 0,
          revenue: 0,
          transactions: 0,
        };
      }
      map[id].qty += tx._qty;
      map[id].revenue += tx._revenue;
      map[id].transactions += 1;
    });
    return Object.values(map);
  }, [inRange, peptides]);

  const top5ByQty = useMemo(
    () => [...productBreakdown].sort((a, b) => b.qty - a.qty).slice(0, 5),
    [productBreakdown]
  );
  const top5ByRevenue = useMemo(
    () => [...productBreakdown].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [productBreakdown]
  );

  const sortedAll = useMemo(() => {
    const items = [...productBreakdown];
    items.sort((a, b) => {
      const aVal = a[allSort.field] ?? 0;
      const bVal = b[allSort.field] ?? 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return allSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return allSort.direction === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [productBreakdown, allSort]);

  const itemsOverTime = useMemo(
    () => bucketTransactionsByDay(inRange, start, end),
    [inRange, start, end]
  );

  const handleAllSort = (field) => {
    setAllSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleExportProducts = () => {
    const header = ['Product', 'Peptide ID', 'Quantity Sold', 'Revenue (USD)', 'Transactions'];
    const rows = sortedAll.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.peptideId,
      p.qty,
      p.revenue.toFixed(2),
      p.transactions,
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pims-products-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 dark:border-blue-400" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading Products data…</p>
      </div>
    );
  }

  const hasData = inRange.length > 0;

  return (
    <div className="space-y-6">
      <DateRangeControls
        rangeId={rangeId}
        setRangeId={setRangeId}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
      />

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={<Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />}
              label="Total Products Ordered"
              value={formatNumber(metrics.totalProducts)}
              subtitle={`across ${formatNumber(metrics.orderCount)} order${metrics.orderCount === 1 ? '' : 's'}`}
            />
            <MetricCard
              icon={<BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" />}
              label="Unique Products Ordered"
              value={formatNumber(metrics.uniqueProducts)}
              subtitle="distinct SKUs"
            />
            <MetricCard
              icon={<ShoppingCart className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
              label="Products per Order"
              value={metrics.avgProductsPerOrder.toFixed(2)}
              subtitle="average"
            />
            <MetricCard
              icon={<TrendingUp className="w-6 h-6 text-orange-600 dark:text-orange-400" />}
              label="Revenue"
              value={formatCurrency(metrics.totalRevenue)}
              subtitle="in selected range"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Items Sold Over Time</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {start.toLocaleDateString()} – {end.toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                {['bar', 'line', 'area'].map(t => (
                  <button
                    key={t}
                    onClick={() => setChartType(t)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      chartType === t
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
              {chartType === 'bar' ? (
                <BarChart data={itemsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="qty" name="Items Sold" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart data={itemsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend />
                  <Line type="monotone" dataKey="qty" name="Items Sold" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                </LineChart>
              ) : (
                <AreaChart data={itemsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                  <XAxis dataKey="label" stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend />
                  <Area type="monotone" dataKey="qty" name="Items Sold" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductsCard title="Top 5 Products by Quantity" items={top5ByQty} mode="qty" />
            <TopProductsCard title="Top 5 Products by Revenue" items={top5ByRevenue} mode="revenue" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                All Products by {allMode === 'qty' ? 'Quantity' : 'Revenue'}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setAllMode('qty'); setAllSort({ field: 'qty', direction: 'desc' }); }}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${
                    allMode === 'qty'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  By Quantity
                </button>
                <button
                  onClick={() => { setAllMode('revenue'); setAllSort({ field: 'revenue', direction: 'desc' }); }}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${
                    allMode === 'revenue'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  By Revenue
                </button>
                <button
                  onClick={handleExportProducts}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-8">#</th>
                    {[
                      { id: 'name', label: 'Product' },
                      { id: 'peptideId', label: 'ID' },
                      { id: 'qty', label: 'Qty Sold' },
                      { id: 'revenue', label: 'Revenue' },
                      { id: 'transactions', label: 'Orders' },
                    ].map(col => (
                      <th
                        key={col.id}
                        onClick={() => handleAllSort(col.id)}
                        className="px-3 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 select-none whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown className={`w-3 h-3 ${allSort.field === col.id ? 'text-blue-600 dark:text-blue-400' : 'opacity-40'}`} />
                          {allSort.field === col.id && (
                            <span className="text-blue-600 dark:text-blue-400">
                              {allSort.direction === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sortedAll.map((p, i) => (
                    <tr key={p.peptideId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{p.peptideId}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{formatNumber(p.qty)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.revenue)}</td>
                      <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{formatNumber(p.transactions)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 font-semibold sticky bottom-0">
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-right">{formatNumber(metrics.totalProducts)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(metrics.totalRevenue)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(productBreakdown.reduce((s, p) => s + p.transactions, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DateRangeControls({ rangeId, setRangeId, customStart, setCustomStart, customEnd, setCustomEnd }) {
  return (
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
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subtitle }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function TopProductsCard({ title, items, mode }) {
  const max = Math.max(...items.map(i => mode === 'qty' ? i.qty : i.revenue), 1);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No data in selected range</p>
      ) : (
        <div className="space-y-3">
          {items.map((p, idx) => {
            const val = mode === 'qty' ? p.qty : p.revenue;
            const pct = (val / max) * 100;
            return (
              <div key={p.peptideId} className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5">#{idx + 1}</span>
                    <span className="font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                  </span>
                  <span className={`font-semibold whitespace-nowrap ml-2 ${
                    mode === 'qty' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {mode === 'qty' ? formatNumber(p.qty) : formatCurrency(p.revenue)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${mode === 'qty' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
      <Package className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No sales data in this range</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Sales transactions recorded in this date range will populate the Products report.
        Use Record Sale from the inventory table to add transactions, or import sales data.
      </p>
    </div>
  );
}
