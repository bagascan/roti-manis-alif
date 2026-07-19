import { useState, useEffect, useRef, useMemo } from 'react';
import { db, type Transaction, type Customer, type Product } from '../db';
import { Search, History, Calendar, User, X, Edit3, Trash2, CheckCircle2, AlertCircle, Printer, Wallet, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';


// Define enriched types for display
type EnrichedTransactionItem = Transaction['items'][number] & { productName?: string };
export type EnrichedTransaction = Omit<Transaction, 'items'> & {
  customerName?: string;
  items: EnrichedTransactionItem[];
  grossProfit?: number;
  returnAmount?: number;
  transferAmount?: number;
  netProfit?: number;
};

interface HistoryProps {
  isPrinterReady: boolean;
  onPrint: (transaction: EnrichedTransaction) => Promise<boolean>;
  onSearchBluetooth: () => Promise<boolean>;
  onEditTransaction: (transaction: EnrichedTransaction) => void;
}

export default function HistoryPage({ isPrinterReady, onPrint, onSearchBluetooth, onEditTransaction }: HistoryProps) {
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'lunas' | 'belum_lunas'>('lunas');
  const [detailTransaction, setDetailTransaction] = useState<EnrichedTransaction | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptDataForModal, setReceiptDataForModal] = useState<EnrichedTransaction | null>(null);
  const [pelunasanData, setPelunasanData] = useState<{ show: boolean; transaction: EnrichedTransaction | null; amount: number }>({ show: false, transaction: null, amount: 0 });
  const [showConfirmModal, setShowConfirmModal] = useState<{ id?: number; type: 'delete' } | null>(null);
  const [swipedId, setSwipedId] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferItems, setTransferItems] = useState<{ productId: number; productName: string; maxQty: number; qty: number; harga: number }[]>([]);
  const [displayLimit, setDisplayLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredTransactions = useMemo(() =>
    transactions.filter(t =>
      (statusFilter === 'belum_lunas' ? t.status === 'belum_lunas' : (t.status === 'lunas' || !t.status)) &&
      (t.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.items.some(item => item.productName?.toLowerCase().includes(searchTerm.toLowerCase())))
    ),
    [transactions, statusFilter, searchTerm]
  );

  const displayedTransactions = useMemo(() =>
    filteredTransactions.slice(0, displayLimit),
    [filteredTransactions, displayLimit]
  );

  useEffect(() => {
    setDisplayLimit(50);
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && displayLimit < filteredTransactions.length) {
        setDisplayLimit(prev => prev + 30);
      }
    }, { rootMargin: '200px' });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [displayLimit, filteredTransactions.length]);

  const showToast = (message: string, type: 'success' | 'error') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent, id: number) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.targetTouches[0].clientX;
    // Geser kiri untuk buka, geser kanan untuk tutup
    if (diff > 60) setSwipedId(id);
    if (diff < -60) setSwipedId(null);
  };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [tData, cData, pData, trData] = await Promise.all([
      db.transactions.orderBy('tanggal').reverse().toArray(),
      db.customers.toArray() as Promise<Customer[]>,
      db.products.toArray() as Promise<Product[]>,
      db.transfers.toArray()
    ]);

    const transfersByTransaction: Record<number, number> = {};
    trData.forEach(tr => {
      if (tr.transactionId) {
        transfersByTransaction[tr.transactionId] = (transfersByTransaction[tr.transactionId] || 0) + tr.total;
      }
    });

    const enriched = tData.map(t => ({
      ...t,
      customerName: t.customerId ? cData.find(c => c.id === t.customerId)?.nama : 'Umum',
      items: t.items.map(item => ({
        ...item,
        productName: pData.find(p => p.id === item.productId)?.nama || 'Produk Terhapus'
      }))
    }));
		
		const transactionsWithStats = enriched.map(t => {
      let grossProfit = 0;
      let returnAmount = 0;

      t.items.forEach(item => {
        const product = pData.find(p => p.id === item.productId);
        const isi = product?.isiPerSatuan || 1;
        // Normalisasi harga beli jika unit yang terjual adalah pcs
        const unitCost = item.unit === 'satuan' ? item.hargaBeli : item.hargaBeli / isi;
        const itemProfit = (item.harga - unitCost) * item.qty;

        if (item.subtotal >= 0) {
          grossProfit += itemProfit;
        } else {
          returnAmount += Math.abs(item.subtotal);
        }
      });
      const transferAmount = transfersByTransaction[t.id!] || 0;
      return { ...t, grossProfit, returnAmount, transferAmount, netProfit: grossProfit - returnAmount + transferAmount };
    });

    setTransactions(transactionsWithStats);
  };

  const handlePrintOrShowModal = (t: EnrichedTransaction) => {
    if (!isPrinterReady) {
      setReceiptDataForModal(t);
      setShowReceiptModal(true);
    } else {
      onPrint(t);
    }
  };

  useEffect(() => { setSwipedId(null); }, [statusFilter, searchTerm]);

  const handleDelete = async (id: number) => {
    const t = await db.transactions.get(id);
    if (t) {
      try {
        await db.transaction('rw', [db.products, db.transactions, db.customers], async () => {
          for (const item of t.items) {
            const p = await db.products.get(item.productId);
            if (p) {
              const stockChange = Number(item.unit === 'satuan' ? item.qty : item.qty / p.isiPerSatuan);
              
              // Periksa subtotal item secara individu untuk menentukan jenis pergerakan stok
              if (item.subtotal >= 0) {
                await db.products.update(p.id!, { stokToko: Number(p.stokToko || 0) + stockChange }); // Kembalikan ke stok toko
              } else {
                await db.products.update(p.id!, { stokRetur: Number(p.stokRetur || 0) - stockChange }); // Kurangi dari stok retur
              }
            }
          }
          if (t.customerId && t.status === 'belum_lunas') {
            const cust = await db.customers.get(t.customerId);
            if (cust) {
              const sisaHutangTrans = t.total - (t.bayar || 0);
              await db.customers.update(t.customerId, { hutang: Math.max(0, (cust.hutang || 0) - sisaHutangTrans) });
            }
          }
          await db.transactions.delete(id);
          showToast('Transaksi dihapus & stok dikembalikan!', 'success');
          loadData();
        });
      } catch (error) {
        showToast('Gagal menghapus transaksi atau mengembalikan stok!', 'error');
        console.error('Error deleting transaction:', error);
      }
    }
    setShowConfirmModal(null);
  };

  const startEditTransaction = async (transaction: EnrichedTransaction) => {
    try {
      await db.transaction('rw', [db.products, db.customers], async () => {
        for (const item of transaction.items) {
          const p = await db.products.get(item.productId);
          if (p) {
            const stockChange = Number(item.unit === 'satuan' ? item.qty : item.qty / p.isiPerSatuan);
            
            // Periksa subtotal item secara individu saat mengembalikan stok untuk pengeditan
            if (item.subtotal >= 0) {
              await db.products.update(p.id!, { stokToko: Number(p.stokToko || 0) + stockChange }); // Kembalikan ke stok toko
            } else {
              await db.products.update(p.id!, { stokRetur: Number(p.stokRetur || 0) - stockChange }); // Kurangi dari stok retur
            }
          }
        }
        if (transaction.customerId && transaction.status === 'belum_lunas') {
          const cust = await db.customers.get(transaction.customerId);
          if (cust) {
            const sisaHutangTrans = transaction.total - (transaction.bayar || 0);
            await db.customers.update(transaction.customerId, { hutang: Math.max(0, (cust.hutang || 0) - sisaHutangTrans) });
          }
        }
      });
      showToast('Stok dikembalikan untuk pengeditan.', 'success');
      onEditTransaction(transaction); // Pass data to Kasir and navigate
    } catch (error) {
      showToast('Gagal mengembalikan stok lama untuk pengeditan!', 'error');
      console.error('Error reverting stock for edit:', error);
    }
  };

  const confirmPelunasan = async () => {
    if (!pelunasanData.transaction) return;
    
    try {
      await db.transaction('rw', [db.transactions, db.customers], async () => {
        const newBayar = (pelunasanData.transaction!.bayar || 0) + pelunasanData.amount;
        const newStatus = newBayar >= pelunasanData.transaction!.total ? 'lunas' : 'belum_lunas';
        await db.transactions.update(pelunasanData.transaction!.id!, { bayar: newBayar, status: newStatus });
        
        if (pelunasanData.transaction!.customerId) {
          const cust = await db.customers.get(pelunasanData.transaction!.customerId);
          if (cust) {
            await db.customers.update(cust.id!, { hutang: Math.max(0, (cust.hutang || 0) - pelunasanData.amount) });
          }
        }
      });
      showToast('Pelunasan berhasil dicatat!', 'success');
      setPelunasanData({ show: false, transaction: null, amount: 0 });
      setDetailTransaction(null);
      loadData();
    } catch { showToast('Gagal mencatat pelunasan', 'error'); }
  };

  const openTransferModal = () => {
    if (!detailTransaction) return;
    const returItems = detailTransaction.items.filter(i => i.subtotal < 0);
    const items = returItems.map(i => ({
      productId: i.productId,
      productName: i.productName || 'Produk',
      maxQty: i.qty,
      qty: i.qty,
      harga: Math.abs(i.subtotal) / i.qty
    }));
    // Hanya buka jika ada item retur
    if (items.length === 0) {
      showToast('Tidak ada barang retur di transaksi ini', 'error');
      return;
    }
    setTransferItems(items);
    setShowTransferModal(true);
  };

  const handleProcessTransfer = async () => {
    if (!detailTransaction) return;
    const itemsToTransfer = transferItems.filter(i => i.qty > 0);
    if (itemsToTransfer.length === 0) {
      showToast('Tidak ada barang yang ditransfer', 'error');
      return;
    }

    try {
      await db.transaction('rw', [db.products, db.transfers], async () => {
        const transferItemsData = [];
        for (const item of itemsToTransfer) {
          const p = await db.products.get(item.productId);
          if (!p) continue;

          const stokReturSebelum = p.stokRetur;
          const stokReturSesudah = p.stokRetur - item.qty;

          await db.products.update(p.id!, {
            stokRetur: stokReturSesudah,
            stokToko: p.stokToko + item.qty
          });

          transferItemsData.push({
            productId: item.productId,
            productName: item.productName,
            qty: item.qty,
            harga: item.harga,
            subtotal: item.qty * item.harga,
            stokReturSebelum,
            stokReturSesudah
          });
        }

        const total = transferItemsData.reduce((acc, i) => acc + i.subtotal, 0);

        await db.transfers.add({
          tanggal: new Date(),
          transactionId: detailTransaction.id!,
          customerId: detailTransaction.customerId,
          customerName: detailTransaction.customerName || 'Umum',
          items: transferItemsData,
          total
        });
      });

      showToast('Transfer stok retur berhasil!', 'success');
      setShowTransferModal(false);
      setDetailTransaction(null);
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Gagal memproses transfer!', 'error');
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-800 mb-1.5">Hapus Transaksi?</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Stok barang akan dikembalikan ke kondisi sebelum transaksi ini. Anda yakin?</p>
            <div className="flex flex-col gap-1.5">
              <button onClick={() => handleDelete(showConfirmModal.id!)} className="py-2.5 bg-red-600 text-white rounded-xl font-bold text-xs">Ya, Hapus</button>
              <button onClick={() => setShowConfirmModal(null)} className="py-2.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs">Batal</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
        <input
          type="text"
          placeholder="Cari transaksi (nama pelanggan/produk)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-2xl text-base outline-none focus:ring-2 ring-blue-400 shadow-sm"
        />
      </div>

      {/* Tabs Filter */}
      <div className="flex bg-stone-200/50 p-1 rounded-xl mb-4">
        <button 
          onClick={() => setStatusFilter('lunas')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${statusFilter === 'lunas' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}
        >
          Selesai
        </button>
        <button 
          onClick={() => setStatusFilter('belum_lunas')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${statusFilter === 'belum_lunas' ? 'bg-rose-500 text-white shadow-sm' : 'text-stone-500'}`}
        >
          Belum Lunas
        </button>
      </div>

      <div className="space-y-3 pb-4">
        {displayedTransactions.map(t => (
            <div key={t.id} className="relative overflow-hidden rounded-2xl group">
              {/* Revealed Actions Background (Area tombol yang muncul saat digeser) */}
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
                <button onClick={() => { setSwipedId(null); handlePrintOrShowModal(t); }} className="p-3 bg-blue-600 text-white rounded-xl shadow-lg active:scale-90 transition-transform"><Printer size={18}/></button>
                <button onClick={() => { setSwipedId(null); startEditTransaction(t); }} className="p-3 bg-amber-500 text-white rounded-xl shadow-lg active:scale-90 transition-transform"><Edit3 size={18}/></button>
                <button onClick={() => { setSwipedId(null); setShowConfirmModal({ type: 'delete', id: t.id! }); }} className="p-3 bg-rose-600 text-white rounded-xl shadow-lg active:scale-90 transition-transform"><Trash2 size={18}/></button>
              </div>

              {/* Main Card Foreground (Area depan yang bisa digeser) */}
              <div 
                onClick={() => swipedId === t.id ? setSwipedId(null) : setDetailTransaction(t)}
                onTouchStart={handleTouchStart}
                onTouchMove={(e) => handleTouchMove(e, t.id!)}
                style={{ transform: swipedId === t.id ? 'translateX(-180px)' : 'translateX(0)' }}
                className="bg-white border border-stone-100 p-4 rounded-2xl shadow-sm cursor-pointer active:bg-stone-50 transition-transform duration-300 relative select-none z-10"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-base font-bold text-stone-800">Transaksi #{t.id}</h3>
                    <div className="flex items-center gap-2 text-xs text-stone-400 mt-0.5">
                      <Calendar size={12} /> {new Date(t.tanggal).toLocaleDateString('id-ID')}
                      <User size={12} className="ml-1" /> {t.customerName}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status === 'belum_lunas' ? 'bg-rose-500 text-white' : 'bg-blue-100 text-blue-700'} uppercase`}>
                      {t.status === 'belum_lunas' ? 'Belum Lunas' : 'Lunas'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-end pt-3 border-t border-stone-50">
                  <div className="flex flex-col">
                    <span className="text-xs text-stone-400 uppercase font-bold">Items</span>
                    <span className="text-sm font-bold text-stone-700">{t.items.length} Macam</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-stone-400 uppercase font-bold">Total</span>
                    <p className="text-base font-bold text-blue-600">Rp {formatRupiah(t.total)}</p>
                  </div>
                </div>

                {t.status === 'belum_lunas' && (
                  <div className="flex justify-between items-center mt-2 px-2 py-1.5 bg-rose-50/50 rounded-xl border border-rose-100">
                    <div className="text-[10px] font-bold text-stone-500 uppercase">Dibayar: <span className="text-green-600">Rp {formatRupiah(t.bayar || 0)}</span></div>
                    <div className="text-[10px] font-bold text-stone-500 uppercase text-right">Kurang: <span className="text-rose-600">Rp {formatRupiah(t.total - (t.bayar || 0))}</span></div>
                  </div>
                )}

                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-1 pt-3 mt-2 border-t border-stone-50">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-stone-400 uppercase font-bold">Kotor</span>
                    <span className="text-xs font-bold text-green-600">Rp {formatRupiah(t.grossProfit || 0)}</span>
                  </div>
                  <div className="flex flex-col text-center">
                    <span className="text-[10px] text-stone-400 uppercase font-bold">Retur</span>
                    <span className="text-xs font-bold text-rose-600">Rp {formatRupiah(t.returnAmount || 0)}</span>
                  </div>
                  <div className="flex flex-col text-center">
                    <span className="text-[10px] text-stone-400 uppercase font-bold">Transfer</span>
                    <span className="text-xs font-bold text-teal-600">Rp {formatRupiah(t.transferAmount || 0)}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-stone-400 uppercase font-bold">Bersih</span>
                    <span className={`text-xs font-bold ${(t.netProfit || 0) >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                      Rp {formatRupiah(t.netProfit || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        {filteredTransactions.length === 0 && transactions.length > 0 && (
          <div className="text-center py-10 text-stone-300">
            <Search size={48} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">Tidak ditemukan.</p>
          </div>
        )}
        {transactions.length === 0 && (
          <div className="text-center py-10 text-stone-300">
            <History size={48} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">Belum ada riwayat transaksi.</p>
          </div>
        )}
        {displayLimit < filteredTransactions.length && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            <div className="animate-spin h-6 w-6 border-2 border-stone-300 border-t-teal-600 rounded-full" />
          </div>
        )}
      </div>
      <div className="h-16" />

      {/* Detail Transaction Modal */}
      {detailTransaction && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                 <h3 className="text-lg font-bold text-stone-800">Detail Transaksi #{detailTransaction.id}</h3>
                </div>
                 <p className="text-xs text-stone-400">{new Date(detailTransaction.tanggal).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} • {detailTransaction.customerName}</p>
              </div>
              <div className="flex items-center gap-2">
                {detailTransaction.items.some(i => i.subtotal < 0) && (
                  <button onClick={openTransferModal} className="p-2 bg-teal-50 text-teal-600 rounded-full active:scale-95 transition-transform"><ArrowLeftRight size={16} /></button>
                )}
                <button onClick={() => handlePrintOrShowModal(detailTransaction)} className="p-2 bg-blue-50 text-blue-600 rounded-full active:scale-95 transition-transform"><Printer size={16} /></button>
                <button onClick={() => setDetailTransaction(null)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {detailTransaction.items.map((item, idx) => (
                <div key={idx} className={`p-3 rounded-xl border ${item.subtotal < 0 ? 'bg-rose-50/50 border-rose-100' : 'bg-stone-50 border-stone-100'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className={`text-sm font-bold ${item.subtotal < 0 ? 'text-rose-700' : 'text-stone-700'}`}>{item.productName}</h4>
                    <span className="text-xs bg-white px-2 py-0.5 rounded border border-stone-100 text-stone-500 font-bold uppercase">
                      {item.qty} {item.unit === 'satuan' ? 'Pack' : 'Pcs'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-stone-400 font-bold uppercase text-[9px]">Harga Jual</p>
                      <p className={`font-bold ${item.subtotal < 0 ? 'text-rose-600' : 'text-stone-600'}`}>Rp {formatRupiah(item.harga)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-stone-400 font-bold uppercase text-[9px]">Harga Beli</p>
                      <p className="text-stone-500">Rp {formatRupiah(item.hargaBeli)}</p>
                    </div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-stone-200/50 flex justify-between items-center">
                    <span className="text-stone-400 font-bold uppercase text-[9px]">Subtotal</span>
                    <span className={`text-sm font-black ${item.subtotal < 0 ? 'text-rose-600' : 'text-blue-600'}`}>{item.subtotal < 0 ? '-' : ''}Rp {formatRupiah(Math.abs(item.subtotal))}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-stone-50 border-t space-y-2 rounded-b-2xl">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-stone-400 uppercase">Total Tagihan</span>
                <span className="text-sm font-bold text-stone-800">Rp {formatRupiah(detailTransaction.total)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-stone-400 uppercase">Telah Dibayar</span>
                <span className="text-sm font-bold text-green-600">Rp {formatRupiah(detailTransaction.bayar || detailTransaction.total)}</span>
              </div>
              {detailTransaction.status === 'belum_lunas' && (
                <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                  <span className="text-sm font-bold text-stone-600">Sisa Piutang</span>
                  <span className="text-lg font-black text-rose-600">Rp {formatRupiah(detailTransaction.total - (detailTransaction.bayar || 0))}</span>
                </div>
              )}
              {detailTransaction.status === 'belum_lunas' && (
                <button 
                  onClick={() => setPelunasanData({ 
                    show: true, 
                    transaction: detailTransaction, 
                    amount: detailTransaction.total - (detailTransaction.bayar || 0) 
                  })}
                  className="w-full mt-2 py-3 bg-green-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                >
                  <Wallet size={16} /> Bayar Pelunasan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pelunasan Modal */}
      {pelunasanData.show && pelunasanData.transaction && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-xl">
                <Wallet size={20} />
              </div>
              <h3 className="text-lg font-bold text-stone-800">Pelunasan</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Sisa Hutang</label>
                <p className="text-lg font-black text-rose-600">Rp {formatRupiah(pelunasanData.transaction.total - (pelunasanData.transaction.bayar || 0))}</p>
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-stone-400 uppercase block mb-1">Jumlah Bayar</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  value={formatRupiah(pelunasanData.amount)}
                  onChange={(e) => setPelunasanData({ ...pelunasanData, amount: parseRupiah(e.target.value) })}
                  className="w-full p-3 bg-stone-100 rounded-xl text-lg font-bold text-green-600 outline-none focus:ring-2 ring-green-400"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button onClick={confirmPelunasan} className="py-3 bg-stone-800 text-white rounded-2xl font-bold text-sm">Simpan Pembayaran</button>
                <button onClick={() => setPelunasanData({ show: false, transaction: null, amount: 0 })} className="py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Stok Modal */}
      {showTransferModal && detailTransaction && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-stone-800">Transfer Stok Retur</h3>
                <p className="text-xs text-stone-400">{detailTransaction.customerName} • #{detailTransaction.id}</p>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {transferItems.map(item => (
                <div key={item.productId} className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm font-bold text-stone-700">{item.productName}</h4>
                    <span className="text-[10px] text-stone-400 font-bold">Retur: {item.maxQty}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase shrink-0">Transfer ke Toko:</label>
                    <input
                      type="text" inputMode="numeric"
                      value={formatRupiah(item.qty)}
                      onChange={(e) => {
                        const val = parseRupiah(e.target.value);
                        setTransferItems(prev => prev.map(i =>
                          i.productId === item.productId ? { ...i, qty: Math.min(Math.max(val, 0), i.maxQty) } : i
                        ));
                      }}
                      className="w-20 px-2 py-1.5 bg-white rounded-lg text-sm font-bold text-stone-800 outline-none focus:ring-2 ring-teal-400 text-center"
                    />
                  </div>
                  <p className="text-xs text-teal-600 font-bold mt-1.5">
                    Subtotal: Rp {formatRupiah(item.qty * item.harga)}
                  </p>
                </div>
              ))}
            </div>
            <div className="p-4 bg-stone-50 border-t rounded-b-2xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-stone-500">Total Nilai Transfer</span>
                <span className="text-lg font-black text-teal-600">Rp {formatRupiah(transferItems.reduce((acc, i) => acc + i.qty * i.harga, 0))}</span>
              </div>
              <button
                onClick={handleProcessTransfer}
                className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              >
                <ArrowLeftRight size={16} /> Proses Transfer Stok
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nota yang tadinya belum terpanggil */}
      {showReceiptModal && receiptDataForModal && (
        <ReceiptModal 
          transaction={receiptDataForModal}
          isPrinterReady={isPrinterReady}
          onConnect={onSearchBluetooth}
          onClose={() => setShowReceiptModal(false)}
          onPrint={onPrint}
        />
      )}
    </main>
  );
}

/* NEW RECEIPT MODAL COMPONENT */
export const ReceiptModal = ({ 
  transaction, 
  onClose, 
  onPrint,
  isPrinterReady,
  onConnect
}: { 
  transaction: EnrichedTransaction; 
  onClose: () => void; 
  onPrint: (t: EnrichedTransaction) => void;
  isPrinterReady?: boolean;
  onConnect?: () => Promise<boolean>;
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  const formatRupiah = (value: number | string) => {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.toString().replace(/\./g, '')) : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('id-ID');
  };

  const salesItems = transaction.items.filter(i => i.subtotal >= 0);
  const returnItems = transaction.items.filter(i => i.subtotal < 0);
  const totalSales = salesItems.reduce((acc, item) => acc + item.subtotal, 0);
  const totalReturns = returnItems.reduce((acc, item) => acc + Math.abs(item.subtotal), 0);

  const renderReceiptCanvas = (): Promise<Blob | null> => {
    return new Promise(resolve => {
      const W = 400;
      const PAD = 20;
      const CW = W - PAD * 2;
      let y = PAD;

      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = 2000;
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, 2000);

      const t = (text: string, x: number, yp: number, align: CanvasTextAlign = 'left', bold = false, color = '#000', size = 11) => {
        ctx.font = `${bold ? 'bold ' : ''}${size}px monospace`;
        ctx.textAlign = align;
        ctx.fillStyle = color;
        ctx.fillText(text, x, yp);
      };
      const line = (yp: number) => {
        ctx.fillStyle = '#333';
        ctx.fillRect(PAD, yp, CW, 1);
      };
      const center = (text: string, yp: number, bold = false, color = '#000', size = 11) => t(text, W / 2, yp, 'center', bold, color, size);

      const logoData = localStorage.getItem('app_logo');
      const drawContent = (img: HTMLImageElement | null) => {
        y = PAD;

        if (img && img.complete && img.naturalWidth > 0) {
          const logoSize = 64;
          ctx.drawImage(img, W / 2 - logoSize / 2, y, logoSize, logoSize);
          y += logoSize + 8;
        }
        center('ROTI MANIS ARIF', y, true, '#000', 15);
        y += 18;
        const addr = localStorage.getItem('store_address') || '';
        if (addr) { center(addr, y, false, '#555', 9); y += 13; }
        const phone = localStorage.getItem('store_phone') || '';
        if (phone) { center(phone, y, false, '#555', 9); y += 13; }
        y += 4;

        line(y); y += 8;
        t(`Tanggal: ${new Date(transaction.tanggal).toLocaleString('id-ID')}`, PAD, y, 'left', false, '#333', 9);
        y += 13;
        t(`Pelanggan: ${transaction.customerName || 'Umum'}`, PAD, y, 'left', false, '#333', 9);
        y += 8;
        line(y); y += 8;

        const drawItems = (items: typeof salesItems, label: string, color: string) => {
          if (items.length === 0) return;
          center(label, y, true, color, 10);
          y += 14;
          items.forEach(item => {
            const name = item.productName || '';
            const qtyStr = `${item.qty} ${item.unit === 'satuan' ? 'Pack' : 'Pcs'} x ${formatRupiah(item.harga)}`;
            const sub = Math.abs(item.subtotal);
            t(name, PAD, y, 'left', false, color, 10);
            t(`Rp ${formatRupiah(sub)}`, W - PAD, y, 'right', true, color, 10);
            y += 12;
            t(qtyStr, PAD, y, 'left', false, '#888', 9);
            y += 14;
          });
        };

        drawItems(salesItems, 'PEMBELIAN', '#000');
        if (salesItems.length > 0 && returnItems.length > 0) { line(y); y += 8; }
        drawItems(returnItems, 'RETUR', '#c00');

        line(y); y += 8;

        if (totalSales > 0 && totalReturns > 0) {
          t('TOT. PEMBELIAN:', PAD, y, 'left', false, '#333', 10);
          t(`Rp ${formatRupiah(totalSales)}`, W - PAD, y, 'right', false, '#000', 10);
          y += 14;
          t('TOT. RETUR:', PAD, y, 'left', false, '#333', 10);
          t(`-Rp ${formatRupiah(totalReturns)}`, W - PAD, y, 'right', false, '#c00', 10);
          y += 14;
        }
        t('TOTAL:', PAD, y, 'left', true, '#000', 12);
        t(`Rp ${formatRupiah(transaction.total)}`, W - PAD, y, 'right', true, '#000', 12);
        y += 16;
        t('BAYAR:', PAD, y, 'left', false, '#333', 10);
        t(`Rp ${formatRupiah(transaction.bayar || 0)}`, W - PAD, y, 'right', false, '#000', 10);
        y += 14;

        if (transaction.status === 'belum_lunas') {
          t('KURANG:', PAD, y, 'left', true, '#c00', 10);
          t(`-Rp ${formatRupiah(transaction.total - (transaction.bayar || 0))}`, W - PAD, y, 'right', true, '#c00', 10);
          y += 14;
        }
        if ((transaction.bayar || 0) > transaction.total) {
          t('KEMBALI:', PAD, y, 'left', false, '#333', 10);
          t(`Rp ${formatRupiah((transaction.bayar || 0) - transaction.total)}`, W - PAD, y, 'right', false, '#000', 10);
          y += 14;
        }

        y += 8;
        const footer = localStorage.getItem('receipt_footer') || 'Terima Kasih Atas\nKunjungan Anda';
        footer.split('\n').forEach(l => {
          center(l, y, false, '#555', 9);
          y += 13;
        });

        y += 16;
        canvas.toBlob(blob => resolve(blob), 'image/png');
      };

      if (logoData) {
        const img = new Image();
        img.onload = () => drawContent(img);
        img.onerror = () => drawContent(null);
        img.src = logoData;
      } else {
        const img = new Image();
        img.onload = () => drawContent(img);
        img.onerror = () => drawContent(null);
        img.src = '/logo.jpeg';
      }
    });
  };

  const handleShareImage = async () => {
    if (isSharing) return;
    setIsSharing(true);

    try {
      const blob = await renderReceiptCanvas();
      if (!blob) return;

      const file = new File([blob], `Nota-${transaction.id}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Nota Roti Manis Arif #${transaction.id}` });
      } else {
        const link = document.createElement('a');
        link.download = `Nota-${transaction.id}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (error) {
      console.error('Error sharing receipt image:', error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-stone-800">Nota Transaksi #{transaction.id}</h3>
          <button onClick={onClose} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
        </div>
        <div ref={receiptRef} className="flex-1 overflow-y-auto p-6 space-y-2 text-sm font-mono bg-white">
          <div className="flex flex-col items-center mb-4">
            <img 
              src={localStorage.getItem('app_logo') || '/logo.jpeg'} 
              alt="Logo" 
              className="w-24 h-24 object-contain mb-2" 
              onError={(e) => { (e.target as HTMLImageElement).src = '/logo.jpeg'; }}
            />
            <p className="text-center font-bold text-lg uppercase">ROTI MANIS ARIF</p>
            <p className="text-center text-[10px] leading-tight text-stone-600 max-w-[200px]">{localStorage.getItem('store_address') || ''}</p>
            <p className="text-center text-[10px] text-stone-600">{localStorage.getItem('store_phone') || ''}</p>
          </div>
          <p>---------------------------------</p>
          <div className="text-[10px] space-y-0.5">
            <p>Tanggal: {new Date(transaction.tanggal).toLocaleString('id-ID')}</p>
            <p>Pelanggan: {transaction.customerName || 'Umum'}</p>
          </div>
          <p>---------------------------------</p>
          {transaction.items.some(i => i.subtotal >= 0) && (
            <div className="space-y-2">
              <p className="font-bold mb-1">PEMBELIAN</p>
              {transaction.items.filter(i => i.subtotal >= 0).map((item, idx) => {
                const itemSubtotal = formatRupiah(Math.abs(item.subtotal));
                return (
                  <div key={`sale-${idx}`} className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <p>{item.productName}</p>
                      <p className="text-[10px] text-stone-500">{item.qty} {item.unit === 'satuan' ? 'Pack' : 'Pcs'} x {formatRupiah(item.harga)}</p>
                    </div>
                    <p className="text-right font-bold">Rp {itemSubtotal}</p>
                  </div>
                );
              })}
            </div>
          )}
          {transaction.items.some(i => i.subtotal < 0) && (
            <div className="space-y-2">
              <p>---------------------------------</p>
              <p className="font-bold mb-1">RETUR</p>
              {transaction.items.filter(i => i.subtotal < 0).map((item, idx) => {
                const itemSubtotal = formatRupiah(Math.abs(item.subtotal));
                return (
                  <div key={`retur-${idx}`} className="flex justify-between items-start gap-2">
                    <div className="flex-1 text-rose-600">
                      <p>{item.productName}</p>
                      <p className="text-[10px]">{item.qty} {item.unit === 'satuan' ? 'Pack' : 'Pcs'} x {formatRupiah(item.harga)}</p>
                    </div>
                    <p className="text-right font-bold text-rose-600">-Rp {itemSubtotal}</p>
                  </div>
                );
              })}
            </div>
          )}
          <p>---------------------------------</p>
           {totalSales > 0 && totalReturns > 0 && (
            <div className="space-y-0.5">
              <div className="flex justify-between">
                <span>TOT. PEMBELIAN:</span>
                <span>Rp {formatRupiah(totalSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>TOT. RETUR:</span>
                <span>-Rp {formatRupiah(totalReturns)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>TOTAL:</span>
            <span>Rp {formatRupiah(transaction.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>BAYAR:</span>
            <span>Rp {formatRupiah(transaction.bayar || 0)}</span>
          </div>
          {transaction.status === 'belum_lunas' && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>KURANG:</span>
              <span>- Rp {formatRupiah(transaction.total - (transaction.bayar || 0))}</span>
            </div>
          )}
          {transaction.bayar > transaction.total && (
            <div className="flex justify-between">
              <span>KEMBALI:</span>
              <span>Rp {formatRupiah(transaction.bayar - transaction.total)}</span>
            </div>
          )}
          <div className="text-center mt-4 text-[10px] text-stone-600 whitespace-pre-line leading-tight">
            {localStorage.getItem('receipt_footer') || 'Terima Kasih Atas\nKunjungan Anda'}
          </div>
        </div>
        <div className="p-4 bg-stone-50 border-t flex flex-col gap-2 rounded-b-2xl">
          {!isPrinterReady ? (
            <button 
              onClick={onConnect} 
              className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md"
            >
              <RefreshCw size={16} /> Hubungkan Printer
            </button>
          ) : (
            <button 
              onClick={() => onPrint(transaction)} 
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <Printer size={16} /> Cetak Nota
            </button>
          )}
          <button 
            onClick={handleShareImage}
            disabled={isSharing}
            className={`w-full py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all ${isSharing ? 'bg-stone-400 text-white cursor-not-allowed' : 'bg-green-500 text-white'}`}
          >
            {isSharing ? (
              <><RefreshCw size={16} className="animate-spin" /> Memproses...</>
            ) : (
              <><img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WhatsApp" className="h-4 w-4" /> Bagikan ke WhatsApp</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};