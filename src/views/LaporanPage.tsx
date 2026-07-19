import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, Transaction, Expense, Customer, Product, Restock, Adjustment, Transfer } from '../db';
import { Search, BarChart3, TrendingUp, TrendingDown, Wallet, Package, ArrowLeftRight } from 'lucide-react';
import { formatRupiah, getLocalDateString } from '../utils/formatters';

export default function LaporanPage() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(getLocalDateString(firstOfMonth));
  const [endDate, setEndDate] = useState(getLocalDateString(now));
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activityLimit, setActivityLimit] = useState(30);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);
  useEffect(() => { setActivityLimit(30); }, [debouncedSearch]);
  const [transactions, setTransactions] = useState<(Transaction & { customerName: string })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [restocks, setRestocks] = useState<Restock[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const loadData = useCallback(async () => {
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const localStart = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);
    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const localEnd = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);

    try {
      const [tData, eData, cData, pData, rData, aData, trData] = await Promise.all([
        db.transactions.where('tanggal').between(localStart, localEnd, true, true).toArray(),
        db.expenses.where('tanggal').between(localStart, localEnd, true, true).toArray() as Promise<Expense[]>,
        db.customers.toArray() as Promise<Customer[]>,
        db.products.toArray() as Promise<Product[]>,
        db.restocks.where('tanggal').between(localStart, localEnd, true, true).toArray(),
        db.adjustments.where('tanggal').between(localStart, localEnd, true, true).toArray(),
        db.transfers.where('tanggal').between(localStart, localEnd, true, true).toArray()
      ]);
      
      const enrichedT: (Transaction & { customerName: string })[] = tData.map(t => ({
        ...t,
        customerName: t.customerId ? (cData.find(c => c.id === t.customerId)?.nama || 'Umum') : 'Umum'
      }));

      setTransactions(enrichedT);
      setProducts(pData);
      setExpenses(eData);
      setRestocks(rData);
      setAdjustments(aData);
      setTransfers(trData);
      setLoading(false);
    } catch (err) {
      console.error('LaporanPage: gagal muat data penuh, fallback ke data dasar', err);
      try {
        const [tData, eData, cData, pData, rData] = await Promise.all([
          db.transactions.where('tanggal').between(localStart, localEnd, true, true).toArray(),
          db.expenses.where('tanggal').between(localStart, localEnd, true, true).toArray() as Promise<Expense[]>,
          db.customers.toArray() as Promise<Customer[]>,
          db.products.toArray() as Promise<Product[]>,
          db.restocks.where('tanggal').between(localStart, localEnd, true, true).toArray(),
        ]);
        const enrichedT = tData.map(t => ({
          ...t,
          customerName: t.customerId ? (cData.find(c => c.id === t.customerId)?.nama || 'Umum') : 'Umum'
        }));
        setTransactions(enrichedT);
        setProducts(pData);
        setExpenses(eData);
        setRestocks(rData);
        setLoading(false);
      } catch (err2) {
        console.error('LaporanPage: fallback pun gagal', err2);
        setLoading(false);
      }
    }
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredActivities = useMemo(() => {
    const search = debouncedSearch.toLowerCase();
    return [
      ...transactions.map(t => ({ ...t, activityType: 'transaction' as const })),
      ...expenses.map(e => ({ ...e, activityType: 'expense' as const }))
    ].filter(item => {
      if (item.activityType === 'transaction') {
        const t = item as Transaction & { customerName: string };
        return t.customerName.toLowerCase().includes(search) || t.id?.toString().includes(search);
      } else {
        const e = item as Expense;
        return e.keterangan.toLowerCase().includes(search) || e.kategori.toLowerCase().includes(search);
      }
    }).sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [transactions, expenses, debouncedSearch]);

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const displayedActivities = useMemo(() => filteredActivities.slice(0, activityLimit), [filteredActivities, activityLimit]);

  const { grossSales, grossReturns, totalExpenses, totalOtherIncome, totalKulaan, totalTransferStok, netProfit, transProfit, totalGrossProfit } = useMemo(() => {
    let gSales = 0;
    let gReturns = 0;
    let tCOGS = 0;

    for (const t of transactions) {
      for (const item of t.items) {
        const product = productMap.get(item.productId);
        const isi = product?.isiPerSatuan || 1;
        const costPerUnitSold = item.unit === 'satuan' ? item.hargaBeli : item.hargaBeli / isi;
        const itemCost = costPerUnitSold * item.qty;

        if (item.subtotal >= 0) {
          gSales += item.subtotal;
          tCOGS += itemCost;
        } else {
          gReturns += Math.abs(item.subtotal);
        }
      }
    }

    const tExp = expenses.filter(e => e.tipe !== 'pemasukkan').reduce((acc, e) => acc + e.nominal, 0);
    const tIncome = expenses.filter(e => e.tipe === 'pemasukkan').reduce((acc, e) => acc + e.nominal, 0);
    const tKulaan = restocks.reduce((acc, r) => acc + r.total, 0);
    
    let tTransferDariAdjustments = 0;
    for (const a of adjustments) {
      if (a.keterangan.includes('Transfer dari Retur ke Toko')) {
        const product = productMap.get(a.productId);
        const productPrice = product?.hargaJual || 0;
        tTransferDariAdjustments += a.selisih * productPrice;
      }
    }

    const tTransferDariTransfers = transfers.reduce((acc, tr) => acc + tr.total, 0);

    const tTransferStok = tTransferDariAdjustments + tTransferDariTransfers;

    const tGrossProfit = gSales - tCOGS;
    const tProfit = tGrossProfit - gReturns + tTransferStok;
    const nProfit = tProfit - tExp + tIncome;

    return { 
      grossSales: gSales, 
      grossReturns: gReturns, 
      totalExpenses: tExp, 
      totalOtherIncome: tIncome, 
      totalKulaan: tKulaan, 
      totalTransferStok: tTransferStok,
      netProfit: nProfit,
      transProfit: tProfit,
      totalGrossProfit: tGrossProfit
    };
  }, [transactions, productMap, expenses, restocks, adjustments, transfers]);

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 bg-stone-50 flex items-center justify-center">
        <div className="text-center text-stone-400">
          <div className="animate-spin w-8 h-8 border-4 border-stone-200 border-t-teal-600 rounded-full mx-auto mb-3" />
          <p className="text-sm">Memuat laporan...</p>
        </div>
      </main>
    );
  }

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
            <TrendingUp size={12} className="text-emerald-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Laba Kotor (Margin)</p>
          </div>
          <p className="text-sm font-bold text-emerald-600">Rp {formatRupiah(totalGrossProfit)}</p>
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
            <BarChart3 size={12} className="text-blue-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Laba Transaksi (Netto)</p>
          </div>
          <p className="text-sm font-bold text-blue-600">Rp {formatRupiah(transProfit)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-red-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Pengeluaran</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(totalExpenses)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-blue-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Pemasukkan Lain</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(totalOtherIncome)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <Package size={12} className="text-amber-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Kulaan (Restok)</p>
          </div>
          <p className="text-sm font-bold text-stone-700">Rp {formatRupiah(totalKulaan)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowLeftRight size={12} className="text-teal-500" />
            <p className="text-[9px] text-stone-400 uppercase font-bold">Transfer Stok</p>
          </div>
          <p className="text-sm font-bold text-teal-600">Rp {formatRupiah(totalTransferStok)}</p>
        </div>
        <div className="bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-700">
          <div className="flex items-center gap-1.5 mb-1">
            <BarChart3 size={12} className="text-green-400" />
            <p className="text-[9px] text-stone-500 uppercase font-bold">Laba Bersih (Setelah Biaya)</p>
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
        {displayedActivities.map((item, idx) => {
          if (item.activityType === 'transaction') {
            return (
              <div key={`trans-${item.id}-${idx}`} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-xs font-bold text-stone-800">#{item.id}</h3>
                  </div>
                  <p className="text-[10px] text-stone-400">{new Date(item.tanggal).toLocaleDateString('id-ID')} • {item.customerName}</p>
                </div>
                <p className="text-sm font-bold text-stone-700">{item.total < 0 ? '-' : ''}Rp {formatRupiah(Math.abs(item.total))}</p>
              </div>
            );
          } else {
            return (
              <div key={`exp-${item.id}-${idx}`} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm flex justify-between items-center border-l-4 border-l-red-400">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase ${item.tipe === 'pemasukkan' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>{item.tipe === 'pemasukkan' ? 'PEMASUKKAN' : 'PENGELUARAN'}</span>
                    <h3 className="text-xs font-bold text-stone-800">{item.kategori}</h3>
                  </div>
                  <p className="text-[10px] text-stone-400">{new Date(item.tanggal).toLocaleDateString('id-ID')} • {item.keterangan}</p>
                </div>
                <p className={`text-sm font-bold ${item.tipe === 'pemasukkan' ? 'text-blue-600' : 'text-red-600'}`}>{item.tipe === 'pemasukkan' ? '' : '-'}Rp {formatRupiah(item.nominal)}</p>
              </div>
            );
          }
        })}
        {displayedActivities.length < filteredActivities.length && (
          <button
            onClick={() => setActivityLimit(prev => prev + 30)}
            className="w-full py-3 text-sm font-bold text-teal-600 bg-white rounded-xl border border-stone-100 shadow-sm active:scale-95 transition-transform"
          >
            Muat lebih banyak ({filteredActivities.length - displayedActivities.length} tersisa)
          </button>
        )}
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