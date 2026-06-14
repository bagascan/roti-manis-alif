import { useState, useEffect, useRef } from 'react';
import { db, type Adjustment, type Product, type Transfer } from '../db';
import { Search, CheckCircle2, AlertCircle, Edit3, Trash2, Calendar, X, ArrowLeftRight } from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';

export default function PenyesuaianPage() {
  const [adjustments, setAdjustments] = useState<(Adjustment & { productName?: string })[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<'productGrid' | 'history'>('productGrid');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedProductForAdjustment, setSelectedProductForAdjustment] = useState<Product | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{ id?: number; type: 'save' | 'delete' } | null>(null);

  const [formData, setFormData] = useState<Omit<Adjustment, 'id'>>({
    tanggal: new Date(),
    productId: 0,
    tipeStok: 'stokToko',
    qtySebelum: 0,
    qtySesudah: 0,
    selisih: 0,
    keterangan: ''
  });

  const productSearchRef = useRef<HTMLInputElement>(null);
  const qtySesudahInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [adjData, pData, trData] = await Promise.all([
      db.adjustments.orderBy('tanggal').reverse().toArray(),
      db.products.toArray(),
      db.transfers.orderBy('tanggal').reverse().toArray()
    ]);

    const enriched = adjData.map(adj => ({
      ...adj,
      productName: pData.find(p => p.id === adj.productId)?.nama || 'Produk Terhapus'
    }));

    setAdjustments(enriched);
    setTransfers(trData);
    setProducts(pData.filter(p => p.status === 'aktif'));
  };

  useEffect(() => {
    if (showAdjustmentModal) {
      productSearchRef.current?.focus();
      qtySesudahInputRef.current?.focus();
    }
  }, [showAdjustmentModal]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdjustmentModal = (product: Product) => {
    setSelectedProductForAdjustment(product);
    setFormData(prev => ({
      ...prev,
      productId: product.id!,
      qtySebelum: product.stokToko, // Default to stokToko
      qtySesudah: product.stokToko,
      selisih: 0
    }));
    setEditingId(null); // Reset editing state
    setShowAdjustmentModal(true);
  };

  const handleQtyChange = (newQty: number) => {
    const currentProduct = products.find(p => p.id === formData.productId);
    if (!currentProduct) return;

    const qtySebelum = formData.tipeStok === 'stokToko' ? currentProduct.stokToko : currentProduct.stokRetur;
    const selisih = newQty - qtySebelum;

    setFormData(prev => ({
      ...prev,
      qtySesudah: newQty,
      selisih: selisih,
      qtySebelum: qtySebelum
    }));
  };

  const handleSave = async () => {
    try {
      const product = await db.products.get(formData.productId);
      if (!product) {
        showToast('Produk tidak ditemukan!', 'error');
        return;
      }

      const updatedStock = { ...product };
      if (formData.tipeStok === 'stokToko') {
        updatedStock.stokToko = formData.qtySesudah;
      } else {
        updatedStock.stokRetur = formData.qtySesudah;
      }

      await db.products.update(product.id!, updatedStock);

      if (editingId) {
        await db.adjustments.update(editingId, formData);
        showToast('Penyesuaian diperbarui!', 'success');
      } else {
        await db.adjustments.add(formData);
        showToast('Penyesuaian stok dicatat!', 'success');
      }
      resetAdjustmentForm();
      loadData();
    } catch { showToast('Gagal memproses!', 'error'); }
    setShowConfirmModal(null);
  };

  const handleDelete = async (id: number) => {
    const adj = await db.adjustments.get(id);
    if (adj) {
      const product = await db.products.get(adj.productId);
      if (product) {
        const updatedStock = { ...product };
        if (adj.tipeStok === 'stokToko') {
          updatedStock.stokToko -= adj.selisih; // Revert stock
        } else {
          updatedStock.stokRetur -= adj.selisih; // Revert stock
        }
        await db.products.update(product.id!, updatedStock);
      }
      await db.adjustments.delete(id);
      showToast('Penyesuaian dihapus & stok dikembalikan', 'success');
      loadData();
    }
    setShowConfirmModal(null);
  };

  const resetAdjustmentForm = () => {
    setFormData({ tanggal: new Date(), productId: 0, tipeStok: 'stokToko', qtySebelum: 0, qtySesudah: 0, selisih: 0, keterangan: '' });
    setEditingId(null);
    setProductSearch('');
    setSelectedProductForAdjustment(null);
    setShowAdjustmentModal(false);
  };

  const startEdit = (adj: Adjustment) => {
    setEditingId(adj.id!);
    setFormData({ ...adj });
    setProductSearch(products.find(p => p.id === adj.productId)?.nama || '');
    setSelectedProductForAdjustment(products.find(p => p.id === adj.productId) || null);
    setShowAdjustmentModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-stone-800 mb-2">{showConfirmModal.type === 'save' ? 'Simpan Penyesuaian?' : 'Hapus Penyesuaian?'}</h3>
            <p className="text-sm text-stone-500 mb-6">{showConfirmModal.type === 'save' ? 'Stok barang akan disesuaikan otomatis.' : 'Stok barang akan dikembalikan ke kondisi sebelum penyesuaian.'}</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => showConfirmModal.type === 'save' ? handleSave() : handleDelete(showConfirmModal.id!)} className="py-3 bg-slate-600 text-white rounded-2xl font-bold text-sm">Ya, Lanjutkan</button>
              <button onClick={() => setShowConfirmModal(null)} className="py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="p-3 bg-white border-b space-y-2 shadow-sm z-10">
        <div className="flex bg-stone-100 p-0.5 rounded-lg">
          <button 
            onClick={() => setView('productGrid')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'productGrid' ? 'bg-white shadow-sm text-slate-600' : 'text-stone-400'}`}
          >
            Produk
          </button>
          <button 
            onClick={() => setView('history')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'history' ? 'bg-white shadow-sm text-slate-600' : 'text-stone-400'}`}
          >
            Riwayat
          </button>
        </div>

        {view === 'productGrid' && (
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
            <input 
              type="text" 
              placeholder="Cari produk..." 
              ref={productSearchRef}
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100 focus:ring-2 ring-slate-400"
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'productGrid' ? (
          <div className="grid grid-cols-2 gap-2.5 pb-20">
            {products
              .filter(p => p.nama.toLowerCase().includes(productSearch.toLowerCase()))
              .map(p => (
                <button 
                  key={p.id}
                  onClick={() => openAdjustmentModal(p)}
                  className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm text-left active:scale-95 transition-transform"
                >
                  <h4 className="text-sm font-bold text-stone-800 line-clamp-2 leading-tight h-10 mb-2">{p.nama}</h4>
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span className="text-stone-500">Toko: <span className="font-bold text-green-600">{p.stokToko}</span></span>
                    <span className="text-stone-500">Retur: <span className="font-bold text-rose-600">{p.stokRetur}</span></span>
                  </div>
                </button>
              ))
            }
          </div>
        ) : (
          <div className="space-y-2 pb-12">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
              <input type="text" placeholder="Cari riwayat penyesuaian..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm outline-none shadow-sm" />
            </div>
            {[
              ...adjustments
                .filter(adj => adj.productName?.toLowerCase().includes(searchTerm.toLowerCase()) || adj.keterangan.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(adj => ({ type: 'adjustment' as const, data: adj, sortDate: new Date(adj.tanggal).getTime() })),
              ...transfers
                .filter(tr => tr.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || tr.items.some(i => i.productName.toLowerCase().includes(searchTerm.toLowerCase())))
                .map(tr => ({ type: 'transfer' as const, data: tr, sortDate: new Date(tr.tanggal).getTime() }))
            ].sort((a, b) => b.sortDate - a.sortDate).map(item => {
              if (item.type === 'adjustment') {
                const adj = item.data as Adjustment & { productName?: string };
                return (
                  <div key={`adj-${adj.id}`} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-600 uppercase">{adj.tipeStok === 'stokToko' ? 'Toko' : 'Retur'}</span>
                          <span className="text-xs text-stone-400 flex items-center gap-1"><Calendar size={10}/> {new Date(adj.tanggal).toLocaleDateString('id-ID')}</span>
                        </div>
                        <h3 className="text-sm font-bold text-stone-800">{adj.productName}</h3>
                        <p className="text-xs text-stone-500 mt-0.5">{adj.keterangan}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(adj)} className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Edit3 size={14}/></button>
                        <button onClick={() => setShowConfirmModal({ type: 'delete', id: adj.id })} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-stone-50 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-stone-400 uppercase font-bold">Sebelum</span>
                        <span className="text-sm font-bold text-stone-700">{adj.qtySebelum}</span>
                      </div>
                      <div className="flex flex-col text-center">
                        <span className="text-[10px] text-stone-400 uppercase font-bold">Sesudah</span>
                        <span className="text-sm font-bold text-stone-700">{adj.qtySesudah}</span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-[10px] text-stone-400 uppercase font-bold">Selisih</span>
                        <span className={`text-sm font-bold ${adj.selisih >= 0 ? 'text-green-600' : 'text-red-600'}`}>{adj.selisih}</span>
                      </div>
                    </div>
                  </div>
                );
              } else {
                const tr = item.data as Transfer;
                return (
                  <div key={`tr-${tr.id}`} className="bg-white border border-teal-100 p-3 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 uppercase flex items-center gap-1"><ArrowLeftRight size={10}/> Transfer Stok</span>
                          <span className="text-xs text-stone-400 flex items-center gap-1"><Calendar size={10}/> {new Date(tr.tanggal).toLocaleDateString('id-ID')}</span>
                        </div>
                        <h3 className="text-sm font-bold text-stone-800">{tr.customerName}</h3>
                        <p className="text-[10px] text-stone-400">Transaksi #{tr.transactionId}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 mt-1.5">
                      {tr.items.map((ti, idx) => (
                        <div key={idx} className="bg-stone-50 p-2 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-stone-700">{ti.productName}</span>
                            <span className="text-[10px] font-bold text-teal-600">Rp {formatRupiah(ti.subtotal)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                            <div>
                              <span className="text-stone-400 uppercase font-bold">Retur Sebelum</span>
                              <p className="text-xs font-bold text-stone-700">{ti.stokReturSebelum}</p>
                            </div>
                            <div>
                              <span className="text-stone-400 uppercase font-bold">Sesudah</span>
                              <p className="text-xs font-bold text-stone-700">{ti.stokReturSesudah}</p>
                            </div>
                            <div>
                              <span className="text-stone-400 uppercase font-bold">Selisih</span>
                              <p className="text-xs font-bold text-rose-600">-{ti.qty}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-teal-50 flex justify-between items-center">
                      <span className="text-[10px] text-stone-400 uppercase font-bold">Total Nominal</span>
                      <span className="text-sm font-black text-teal-600">Rp {formatRupiah(tr.total)}</span>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Adjustment Modal */}
      {showAdjustmentModal && selectedProductForAdjustment && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-stone-800">Penyesuaian Stok</h3>
                <p className="text-[10px] text-stone-400">Produk: <span className="font-bold">{selectedProductForAdjustment.nama}</span></p>
              </div>
              <button onClick={resetAdjustmentForm} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); setShowConfirmModal({ type: 'save' }); }} className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-500 mb-1 block">Jenis Stok</label>
                <div className="flex gap-2">
                  {(['stokToko', 'stokRetur'] as const).map(tipe => (
                    <button
                      key={tipe} type="button"
                      onClick={() => {
                        const qty = tipe === 'stokToko' ? (selectedProductForAdjustment?.stokToko || 0) : (selectedProductForAdjustment?.stokRetur || 0);
                        setFormData(prev => ({ ...prev, tipeStok: tipe, qtySebelum: qty, qtySesudah: qty, selisih: 0 }));
                      }}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold capitalize border-2 transition-all ${formData.tipeStok === tipe ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-100 text-stone-400'}`}
                    >
                      {tipe === 'stokToko' ? 'Stok Toko' : 'Stok Retur'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 mb-1 block">Qty Sesudah</label>
                <input
                  type="text" required
                  ref={qtySesudahInputRef}
                  value={formatRupiah(formData.qtySesudah)}
                  onChange={e => handleQtyChange(parseRupiah(e.target.value))}
                  className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-slate-400"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-stone-500 mb-1 block">Keterangan</label>
                <input type="text" value={formData.keterangan} onChange={e => setFormData({...formData, keterangan: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-slate-400" placeholder="Misal: Koreksi stok fisik" />
              </div>

              <div className="grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <div>
                  <p className="text-[8px] text-stone-400 uppercase font-bold">Sebelum</p>
                  <p className="text-xs font-bold text-stone-700">{formData.qtySebelum}</p>
                </div>
                <div>
                  <p className="text-[8px] text-stone-400 uppercase font-bold">Sesudah</p>
                  <p className="text-xs font-bold text-stone-700">{formData.qtySesudah}</p>
                </div>
                <div>
                  <p className="text-[8px] text-stone-400 uppercase font-bold">Selisih</p>
                  <p className={`text-xs font-bold ${formData.selisih >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formData.selisih}</p>
                </div>
              </div>

              <button type="submit" className="w-full mt-2 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-bold shadow-md">
                {editingId ? 'Simpan Perubahan' : 'Catat Penyesuaian'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirmModal && showConfirmModal.type === 'delete' && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-800 mb-1.5">Hapus Penyesuaian?</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Stok barang akan dikembalikan ke kondisi sebelum penyesuaian. Anda yakin?</p>
            <div className="flex flex-col gap-1.5">
              <button onClick={() => handleDelete(showConfirmModal.id!)} className="py-2.5 bg-red-600 text-white rounded-xl font-bold text-xs">Ya, Hapus</button>
              <button onClick={() => setShowConfirmModal(null)} className="py-2.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal (for form submission) */}
      {showConfirmModal && showConfirmModal.type === 'save' && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-800 mb-1.5">Simpan Penyesuaian?</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Stok barang akan disesuaikan otomatis. Anda yakin?</p>
            <div className="flex flex-col gap-1.5">
              <button onClick={handleSave} className="py-2.5 bg-slate-600 text-white rounded-xl font-bold text-xs">Ya, Simpan</button>
              <button onClick={() => setShowConfirmModal(null)} className="py-2.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs">Batal</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
      