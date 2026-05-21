import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../db';
import { Search, Package, TrendingUp, RotateCcw, Calendar, X, Users } from 'lucide-react';
import { formatRupiah, getLocalDateString } from '../utils/formatters';

interface ProductStats {
  id: number;
  nama: string;
  satuan: string;
  terjual: number;
  retur: number;
  nilaiTerjual: number;
  nilaiRetur: number;
}

interface CustomerProductDetail {
  customerId: number;
  customerName: string;
  totalTerjual: number;
  totalRetur: number;
  nilaiTerjual: number;
  nilaiRetur: number;
}

export default function LaporanProdukPage() {
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<ProductStats | null>(null);
  const [customerProductDetails, setCustomerProductDetails] = useState<CustomerProductDetail[]>([]);

  const loadData = useCallback(async () => {
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const localStart = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);

    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const localEnd = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);

    const [transactions, products] = await Promise.all([
      db.transactions
        .where('tanggal')
        .between(localStart, localEnd, true, true)
        .toArray(),
      db.products.toArray()
    ]);

    const statsMap: Record<number, ProductStats> = {};
    
    // Inisialisasi map dengan semua produk
    products.forEach(p => {
      statsMap[p.id!] = {
        id: p.id!,
        nama: p.nama,
        satuan: p.satuan,
        terjual: 0,
        retur: 0,
        nilaiTerjual: 0,
        nilaiRetur: 0
      };
    });

    // Akumulasi data dari transaksi
    transactions.forEach(t => {
      t.items.forEach(item => {
        if (!statsMap[item.productId]) return;
        
        if (item.subtotal >= 0) {
          statsMap[item.productId].terjual += item.qty;
          statsMap[item.productId].nilaiTerjual += item.subtotal;
        } else {
          statsMap[item.productId].retur += item.qty;
          statsMap[item.productId].nilaiRetur += Math.abs(item.subtotal);
        }
      });
    });

    setStats(Object.values(statsMap).sort((a, b) => b.terjual - a.terjual));
  }, [startDate, endDate]);

  const fetchCustomerProductDetails = useCallback(async (productId: number) => {
    const [yearStart, monthStart, dayStart] = startDate.split('-').map(Number);
    const localStart = new Date(yearStart, monthStart - 1, dayStart, 0, 0, 0, 0);

    const [yearEnd, monthEnd, dayEnd] = endDate.split('-').map(Number);
    const localEnd = new Date(yearEnd, monthEnd - 1, dayEnd, 23, 59, 59, 999);

    const [transactions, customers] = await Promise.all([
      db.transactions
        .where('tanggal')
        .between(localStart, localEnd, true, true)
        .toArray(),
      db.customers.toArray()
    ]);

    const customerMap: Record<number, CustomerProductDetail> = {};

    transactions.forEach(t => {
      t.items.forEach(item => {
        if (item.productId === productId) {
          const customerId = t.customerId || 0; // Use 0 for 'Umum'
          if (!customerMap[customerId]) {
            customerMap[customerId] = {
              customerId: customerId,
              customerName: customers.find(c => c.id === customerId)?.nama || 'Umum',
              totalTerjual: 0,
              totalRetur: 0,
              nilaiTerjual: 0,
              nilaiRetur: 0,
            };
          }

          if (item.subtotal >= 0) {
            customerMap[customerId].totalTerjual += item.qty;
            customerMap[customerId].nilaiTerjual += item.subtotal;
          } else {
            customerMap[customerId].totalRetur += item.qty;
            customerMap[customerId].nilaiRetur += Math.abs(item.subtotal);
          }
        }
      });
    });
    setCustomerProductDetails(Object.values(customerMap).sort((a, b) => b.nilaiTerjual - a.nilaiTerjual));
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => 
    stats.filter(s => s.nama.toLowerCase().includes(searchTerm.toLowerCase())),
    [stats, searchTerm]
  );

  const handleProductCardClick = async (productStats: ProductStats) => {
    setSelectedProductForDetail(productStats);
    await fetchCustomerProductDetails(productStats.id!);
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Package size={20} className="text-stone-600" />
        <h2 className="text-lg font-bold text-stone-800">Laporan Produk</h2>
      </div>
      {/* Date Filters */}
      <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl shadow-sm border border-stone-100">
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 flex items-center gap-1"><Calendar size={10} /> Dari</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-xs font-bold outline-none" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 flex items-center gap-1"><Calendar size={10} /> Sampai</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-xs font-bold outline-none" />
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input 
          type="text" 
          placeholder="Cari nama produk..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm outline-none shadow-sm"
        />
      </div>

      {/* List of Products Stats */}
      <div className="space-y-2 pb-10">
        {filtered.map(s => (
          <button key={s.id} onClick={() => handleProductCardClick(s)} className="w-full bg-white border border-stone-100 p-3 rounded-xl shadow-sm text-left active:scale-95 transition-transform">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-sm font-bold text-stone-800">{s.nama}</h3>
              <span className="text-[10px] font-bold text-stone-400 uppercase bg-stone-50 px-2 py-0.5 rounded">ID: #{s.id}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={14}/></div>
                <div>
                  <p className="text-[9px] text-stone-400 uppercase font-bold">Terjual</p>
                  <p className="text-xs font-bold text-stone-700">{s.terjual} {s.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(s.nilaiTerjual)})</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><RotateCcw size={14}/></div>
                <div>
                  <p className="text-[9px] text-stone-400 uppercase font-bold">Retur</p>
                  <p className="text-xs font-bold text-stone-700">{s.retur} {s.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(s.nilaiRetur)})</span></p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
       {/* Customer Detail Modal */}
      {selectedProductForDetail && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-stone-800">Detail Pelanggan</h3>
                <p className="text-xs text-stone-400">Produk: <span className="font-bold">{selectedProductForDetail.nama}</span></p>
              </div>
              <button onClick={() => setSelectedProductForDetail(null)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {customerProductDetails.length === 0 ? (
                <div className="text-center py-10 text-stone-300">
                  <Users size={40} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">Tidak ada data pelanggan untuk produk ini.</p>
                </div>
              ) : (
                customerProductDetails.map(customer => (
                  <div key={customer.customerId} className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <h4 className="text-sm font-bold text-stone-800 mb-2">{customer.customerName}</h4>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-50">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={14}/></div>
                        <div>
                          <p className="text-[9px] text-stone-400 uppercase font-bold">Terjual</p>
                          <p className="text-xs font-bold text-stone-700">{customer.totalTerjual} {selectedProductForDetail.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(customer.nilaiTerjual)})</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><RotateCcw size={14}/></div>
                        <div>
                          <p className="text-[9px] text-stone-400 uppercase font-bold">Retur</p>
                          <p className="text-xs font-bold text-stone-700">{customer.totalRetur} {selectedProductForDetail.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(customer.nilaiRetur)})</span></p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}