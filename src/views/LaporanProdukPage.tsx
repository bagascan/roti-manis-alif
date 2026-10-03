import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../db';
import { Search, Package, TrendingUp, RotateCcw, Calendar, X, Users, ArrowUpDown, ChevronDown } from 'lucide-react';
import { formatRupiah, getLocalDateString } from '../utils/formatters';

type SortKey = 'tanggalAwal' | 'nilaiTerjual' | 'totalTerjual' | 'totalRetur' | 'nilaiRetur' | 'customerName';

interface ProductStats {
  id: number;
  nama: string;
  satuan: string;
  terjual: number;
  retur: number;
  nilaiTerjual: number;
  nilaiRetur: number;
}

interface CustomerTransactionDetail {
  transactionId: number;
  tanggal: Date;
  qtyTerjual: number;
  nilaiTerjual: number;
  qtyRetur: number;
  nilaiRetur: number;
}

interface CustomerProductDetail {
  customerId: number;
  customerName: string;
  tanggalAwal: number;
  totalTerjual: number;
  totalRetur: number;
  nilaiTerjual: number;
  nilaiRetur: number;
  transaksi: CustomerTransactionDetail[];
}

export default function LaporanProdukPage() {
  const [startDate, setStartDate] = useState(getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<ProductStats | null>(null);
  const [customerProductDetails, setCustomerProductDetails] = useState<CustomerProductDetail[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('tanggalAwal');
  const [sortAsc, setSortAsc] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);

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

    // Hanya produk yang benar-benar ada transaksi (penjualan atau retur) di periode ini
setStats(
      Object.values(statsMap)
        .filter(p => p.terjual > 0 || p.retur > 0)
        .sort((a, b) => b.terjual - a.terjual)
    );
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
      const relevant = t.items.filter(item => item.productId === productId);
      if (relevant.length === 0) return;

      const customerId = t.customerId || 0; // 0 = pelanggan Umum
      const tanggalMs = new Date(t.tanggal).getTime();

      if (!customerMap[customerId]) {
        customerMap[customerId] = {
          customerId,
          customerName: customers.find(c => c.id === customerId)?.nama || 'Umum',
          tanggalAwal: tanggalMs,
          totalTerjual: 0,
          totalRetur: 0,
          nilaiTerjual: 0,
          nilaiRetur: 0,
          transaksi: [],
        };
      }

      const entry = customerMap[customerId];
      if (tanggalMs < entry.tanggalAwal) entry.tanggalAwal = tanggalMs;

      const perTransaction: CustomerTransactionDetail = {
        transactionId: t.id ?? 0,
        tanggal: new Date(t.tanggal),
        qtyTerjual: 0,
        nilaiTerjual: 0,
        qtyRetur: 0,
        nilaiRetur: 0,
      };

      relevant.forEach(item => {
        if (item.subtotal >= 0) {
          entry.totalTerjual += item.qty;
          entry.nilaiTerjual += item.subtotal;
          perTransaction.qtyTerjual += item.qty;
          perTransaction.nilaiTerjual += item.subtotal;
        } else {
          entry.totalRetur += item.qty;
          entry.nilaiRetur += Math.abs(item.subtotal);
          perTransaction.qtyRetur += item.qty;
          perTransaction.nilaiRetur += Math.abs(item.subtotal);
        }
      });

      entry.transaksi.push(perTransaction);
    });

    Object.values(customerMap).forEach(c => {
      c.transaksi.sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());
    });

    setCustomerProductDetails(Object.values(customerMap));
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!selectedProductForDetail) {
      setCustomerSearch('');
      setSortKey('tanggalAwal');
      setSortAsc(true);
      setExpandedCustomerId(null);
    }
  }, [selectedProductForDetail]);

  const sortedCustomers = useMemo(() => {
    const search = customerSearch.toLowerCase().trim();
    const filteredList = search
      ? customerProductDetails.filter(c => c.customerName.toLowerCase().includes(search))
      : customerProductDetails;

    const dir = sortAsc ? 1 : -1;
    return [...filteredList].sort((a, b) => {
      if (sortKey === 'customerName') return a.customerName.localeCompare(b.customerName, 'id') * dir;
      return ((a[sortKey] as number) - (b[sortKey] as number)) * dir;
    });
  }, [customerProductDetails, sortKey, sortAsc, customerSearch]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'tanggalAwal', label: 'Transaksi Pertama' },
    { key: 'nilaiTerjual', label: 'Nilai Pembelian' },
    { key: 'totalTerjual', label: 'Jumlah Pembelian' },
    { key: 'totalRetur', label: 'Jumlah Retur' },
    { key: 'nilaiRetur', label: 'Nilai Retur' },
    { key: 'customerName', label: 'Nama Pelanggan' },
  ];

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
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-stone-300">
            <Package size={40} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">
              {searchTerm
                ? `Produk "${searchTerm}" tidak ditemukan.`
                : 'Tidak ada produk terjual atau diretur pada periode ini.'}
            </p>
          </div>
        ) : (
          filtered.map(s => (
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
                    <p className="text-xs font-bold text-stone-700">{(s.terjual).toLocaleString('id-ID')} {s.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(s.nilaiTerjual)})</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><RotateCcw size={14}/></div>
                  <div>
                    <p className="text-[9px] text-stone-400 uppercase font-bold">Retur</p>
                    <p className="text-xs font-bold text-stone-700">{(s.retur).toLocaleString('id-ID')} {s.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(s.nilaiRetur)})</span></p>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
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
            {customerProductDetails.length > 0 && (
              <div className="px-4 py-3 border-b bg-stone-50 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                  <input
                    type="text"
                    placeholder="Cari pelanggan..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {sortOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (sortKey === opt.key) setSortAsc(prev => !prev);
                        else {
                          setSortKey(opt.key);
                          // Tanggal & nama ascend = paling lama/tertua dulu
                          setSortAsc(opt.key === 'tanggalAwal' || opt.key === 'customerName');
                        }
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
                        sortKey === opt.key ? 'bg-teal-600 text-white' : 'bg-white text-stone-500 border border-stone-200'
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.key && (sortAsc ? <ArrowUpDown size={10} /> : <ArrowUpDown size={10} className="rotate-180" />)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {customerProductDetails.length === 0 ? (
                <div className="text-center py-10 text-stone-300">
                  <Users size={40} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">Tidak ada data pelanggan untuk produk ini.</p>
                </div>
              ) : sortedCustomers.length === 0 ? (
                <div className="text-center py-10 text-stone-300">
                  <Search size={40} className="mx-auto mb-2 opacity-20" />
                  <p className="text-xs">Pelanggan "{customerSearch}" tidak ditemukan.</p>
                </div>
              ) : (
                sortedCustomers.map(customer => {
                  const isExpanded = expandedCustomerId === customer.customerId;
                  const firstDate = new Date(customer.tanggalAwal);
                  return (
                    <div key={customer.customerId} className="bg-stone-50 rounded-xl border border-stone-100 overflow-hidden">
                      <button
                        onClick={() => setExpandedCustomerId(isExpanded ? null : customer.customerId)}
                        className="w-full p-3 text-left active:scale-[0.99] transition-transform"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-stone-800 truncate">{customer.customerName}</h4>
                            <p className="text-[10px] text-stone-400 mt-0.5">
                              {customer.transaksi.length} transaksi · pertama {firstDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <ChevronDown size={16} className={`text-stone-400 flex-shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-stone-200/60">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-green-50 text-green-600 rounded-lg"><TrendingUp size={14}/></div>
                            <div>
                              <p className="text-[9px] text-stone-400 uppercase font-bold">Terjual</p>
                              <p className="text-xs font-bold text-stone-700">{customer.totalTerjual.toLocaleString('id-ID')} {selectedProductForDetail.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(customer.nilaiTerjual)})</span></p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><RotateCcw size={14}/></div>
                            <div>
                              <p className="text-[9px] text-stone-400 uppercase font-bold">Retur</p>
                              <p className="text-xs font-bold text-stone-700">{customer.totalRetur.toLocaleString('id-ID')} {selectedProductForDetail.satuan} <span className="text-[10px] text-stone-400 font-medium">(Rp {formatRupiah(customer.nilaiRetur)})</span></p>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-stone-200/60">
                          <p className="text-[9px] font-bold uppercase text-stone-400 mb-1.5">
                            Rincian Transaksi ({customer.transaksi.length})
                          </p>
                          <div className="space-y-1">
                            {customer.transaksi.map((trx, idx) => (
                              <div key={`trx-${trx.transactionId}-${idx}`} className="bg-white rounded-lg border border-stone-100 p-2">
                                <div className="flex justify-between items-baseline">
                                  <span className="text-[10px] font-bold text-stone-700">
                                    <span className="text-stone-400 font-normal">#{idx + 1}</span>{' '}
                                    {trx.tanggal.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    <span className="text-stone-400 font-normal ml-1">{trx.tanggal.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </span>
                                  <span className="text-[10px] text-stone-400 font-normal">#{trx.transactionId}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                  {trx.qtyTerjual > 0 && (
                                    <span className="text-[10px] font-bold text-green-600">
                                      +{trx.qtyTerjual.toLocaleString('id-ID')} {selectedProductForDetail.satuan}
                                      <span className="text-stone-400 font-normal"> (Rp {formatRupiah(trx.nilaiTerjual)})</span>
                                    </span>
                                  )}
                                  {trx.qtyRetur > 0 && (
                                    <span className="text-[10px] font-bold text-rose-600">
                                      -{trx.qtyRetur.toLocaleString('id-ID')} {selectedProductForDetail.satuan}
                                      <span className="text-stone-400 font-normal"> (Rp {formatRupiah(trx.nilaiRetur)})</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}