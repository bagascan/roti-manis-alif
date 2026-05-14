import { useState, useEffect, useCallback } from 'react';
import { db, type Transaction } from '../db';
import { Search, RotateCcw } from 'lucide-react';
import { formatRupiah, getLocalDateString } from '../utils/formatters';

// Define enriched types for retur display to provide type safety and avoid using 'any'
type EnrichedReturItem = Transaction['items'][number] & { productName: string };
type EnrichedRetur = Omit<Transaction, 'items'> & {
  customerName: string;
  items: EnrichedReturItem[];
};

export default function LaporanReturPage() {
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [data, setData] = useState<EnrichedRetur[]>([]);

  const loadData = useCallback(async () => {
    // Construct dates in local time to avoid timezone ambiguities
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const localStart = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);

    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const localEnd = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);

    const [transactions, products, customers] = await Promise.all([
      db.transactions
        .where('tanggal')
        .between(localStart, localEnd, true, true)
        .toArray(),
      db.products.toArray(), // Ensure Product type is imported if needed for this toArray()
      db.customers.toArray() // Ensure Customer type is imported if needed for this toArray()
    ]);

    const enriched: EnrichedRetur[] = transactions
      .map(t => {
        const returnItems = t.items.filter(item => item.subtotal < 0);
        if (returnItems.length === 0) return null;

        return {
          ...t,
          total: returnItems.reduce((acc, item) => acc + Math.abs(item.subtotal), 0),
          customerName: t.customerId ? (customers.find(c => c.id === t.customerId)?.nama || 'Umum') : 'Umum',
          items: returnItems.map(item => ({
            ...item,
            productName: products.find(p => p.id === item.productId)?.nama || 'Produk Terhapus'
          }))
        };
      })
      .filter((t): t is EnrichedRetur => t !== null);

    setData(enriched);
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter berdasarkan item retur yang sudah difilter di loadData
  // Total refund dan total qty juga harus berdasarkan item retur saja
  const filtered = data.filter(t => 
    t.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.items.some(i => i.productName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalRefund = filtered.reduce((acc, t) => acc + t.total, 0);
  const totalQty = filtered.reduce((acc, t) => acc + t.items.reduce((sum: number, i) => sum + i.qty, 0), 0);
  
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

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <p className="text-[9px] text-stone-400 uppercase font-bold">Total Nilai Retur</p>
          <p className="text-base font-bold text-blue-600">Rp {formatRupiah(totalRefund)}</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <p className="text-[9px] text-stone-400 uppercase font-bold">Total Barang</p>
          <p className="text-base font-bold text-stone-700">{totalQty} Pcs</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input 
          type="text" 
          placeholder="Cari produk atau pelanggan..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm outline-none shadow-sm"
        />
      </div>

      {/* List of Returns */}
      <div className="space-y-2 pb-10">
        {filtered.map(t => (
          <div key={t.id} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-xs font-bold text-stone-800">Retur #{t.id}</h3>
                <p className="text-[10px] text-stone-400">{new Date(t.tanggal).toLocaleDateString('id-ID')} • {t.customerName}</p>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Rp {formatRupiah(t.total)}</span>
            </div>
            <div className="space-y-1">
              {t.items.map((item: EnrichedReturItem, idx: number) => (
                <div key={idx} className="flex justify-between text-[11px] text-stone-600">
                  <span>{item.productName}</span>
                  <span className="font-bold">{item.qty} {item.unit === 'satuan' ? 'Pack' : 'Pcs'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-10 text-stone-300">
            <RotateCcw size={40} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">Tidak ada data retur di periode ini</p>
          </div>
        )}
      </div>
    </main>
  );
}