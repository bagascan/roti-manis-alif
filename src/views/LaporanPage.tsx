import { useState, useEffect, useCallback } from 'react';
import { db, Transaction, Expense, Customer, Product } from '../db';
import { Search, BarChart3, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { formatRupiah, getLocalDateString } from '../utils/formatters';

export default function LaporanPage() {
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [transactions, setTransactions] = useState<(Transaction & { customerName: string })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const loadData = useCallback(async () => { // Wrapped in useCallback
    // Construct dates in local time to avoid timezone ambiguities
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const localStart = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);

    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const localEnd = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);

    const [tData, eData, cData, pData] = await Promise.all([
      db.transactions.where('tanggal').between(localStart, localEnd, true, true).toArray(), // Use localStart and localEnd
      db.expenses.where('tanggal').between(localStart, localEnd, true, true).toArray() as Promise<Expense[]>,
      db.customers.toArray() as Promise<Customer[]>,
      db.products.toArray() as Promise<Product[]>
    ]);
    
    const enrichedT: (Transaction & { customerName: string })[] = tData.map(t => ({
      ...t,
      customerName: t.customerId ? (cData.find(c => c.id === t.customerId)?.nama || 'Umum') : 'Umum'
    }));

    setTransactions(enrichedT);
    setProducts(pData);
    setExpenses(eData);
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredActivities = [
    ...transactions.map(t => ({ ...t, activityType: 'transaction' as const })),
    ...expenses.map(e => ({ ...e, activityType: 'expense' as const }))
  ].filter(item => {
    const search = searchTerm.toLowerCase();
    if (item.activityType === 'transaction') {
      const t = item as Transaction & { customerName: string };
      return t.customerName.toLowerCase().includes(search) || t.id?.toString().includes(search);
    } else {
      const e = item as Expense;
      return e.keterangan.toLowerCase().includes(search) || e.kategori.toLowerCase().includes(search);
    }
  }).sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

  let grossSales = 0;
  let grossReturns = 0;
  let totalCOGS = 0;

  transactions.forEach(t => {
    t.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      const isi = product?.isiPerSatuan || 1;
      const costPerUnitSold = item.unit === 'satuan' ? item.hargaBeli : item.hargaBeli / isi;
      const itemCost = costPerUnitSold * item.qty;

      if (item.subtotal >= 0) {
        grossSales += item.subtotal;
        totalCOGS += itemCost;
      } else {
        grossReturns += Math.abs(item.subtotal);
        totalCOGS -= itemCost;
      }
    });
  });

  const totalExpenses = expenses.reduce((acc, e) => acc + e.nominal, 0);
  const netProfit = (grossSales - grossReturns - totalCOGS) - totalExpenses;

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50 space-y-4">
      {/* Date Filters */}
      <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl shadow-sm border border-stone-100">
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Dari</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-xs font-bold outline-none" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block">Sampai</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-xs font-bold outline-none" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-green-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Penjualan Kotor</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(grossSales)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-blue-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Total Retur</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(grossReturns)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-red-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Pengeluaran</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(totalExpenses)}</p>
        </div>
        <div className="bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-700">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={12} className="text-green-400" />
            <p className="text-[9px] text-stone-500 uppercase font-bold">Laba Bersih</p>
          </div>
          <p className="text-sm font-bold text-green-400">Rp {formatRupiah(netProfit)}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input 
          type="text" 
          placeholder="Cari ID transaksi atau pelanggan..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm outline-none shadow-sm"
        />
      </div>

      {/* Transaction List */}
      <div className="space-y-2 pb-10">
        <h4 className="text-[10px] font-bold text-stone-400 uppercase px-1">Aktivitas Periode Ini</h4>
        {filteredActivities.map((item, idx) => {
          if (item.activityType === 'transaction') {
            return (
              <div key={`trans-${item.id}-${idx}`} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${item.tipe === 'penjualan' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'} uppercase`}>{item.tipe}</span>
                    <h3 className="text-xs font-bold text-stone-800">#{item.id}</h3>
                  </div>
                  <p className="text-[10px] text-stone-400">{new Date(item.tanggal).toLocaleDateString('id-ID')} • {item.customerName}</p>
                </div>
                <p className={`text-sm font-bold ${item.tipe === 'penjualan' ? 'text-stone-700' : 'text-blue-600'}`}>{item.tipe === 'retur' ? '-' : ''}Rp {formatRupiah(item.total)}</p>
              </div>
            );
          } else {
            return (
              <div key={`exp-${item.id}-${idx}`} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-l-red-400">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 uppercase">PENGELUARAN</span>
                    <h3 className="text-xs font-bold text-stone-800">{item.kategori}</h3>
                  </div>
                  <p className="text-[10px] text-stone-400">{new Date(item.tanggal).toLocaleDateString('id-ID')} • {item.keterangan}</p>
                </div>
                <p className="text-sm font-bold text-red-600">-Rp {formatRupiah(item.nominal)}</p>
              </div>
            );
          }
        })}
        {filteredActivities.length === 0 && (
          <div className="text-center py-10 text-stone-300">
            <BarChart3 size={40} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">Tidak ada data transaksi</p>
          </div>
        )}
      </div>
    </main>
  );
}