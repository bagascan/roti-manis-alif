import { useState, useEffect, useRef } from 'react';
import { db, type Product } from '../db';
import { Search, CheckCircle2, AlertCircle, ArrowLeftRight, X } from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';

export default function TransferStokPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [transferQty, setTransferQty] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    const data = await db.products.where('status').equals('aktif').toArray();
    setProducts(data);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openTransferModal = (p: Product) => {
    if (p.stokRetur <= 0) {
      showToast('Stok retur kosong!', 'error');
      return;
    }
    setSelectedProduct(p);
    setTransferQty(0);
    setTimeout(() => qtyInputRef.current?.focus(), 100);
  };

  const handleTransfer = async () => {
    if (!selectedProduct) return;
    if (transferQty <= 0) {
      showToast('Jumlah transfer harus lebih dari 0', 'error');
      return;
    }
    if (transferQty > selectedProduct.stokRetur) {
      showToast('Jumlah melebihi stok retur!', 'error');
      return;
    }

    try {
      await db.transaction('rw', [db.products, db.adjustments], async () => {
        const p = await db.products.get(selectedProduct.id!);
        if (!p) throw new Error('Produk tidak ditemukan');

        const newStokRetur = p.stokRetur - transferQty;
        const newStokToko = p.stokToko + transferQty;

        await db.products.update(p.id!, {
          stokRetur: newStokRetur,
          stokToko: newStokToko
        });

        // Catat di riwayat penyesuaian agar terlacak
        await db.adjustments.add({
          tanggal: new Date(),
          productId: p.id!,
          tipeStok: 'stokToko',
          qtySebelum: p.stokToko,
          qtySesudah: newStokToko,
          selisih: transferQty,
          keterangan: `Transfer dari Retur ke Toko: ${transferQty} ${p.satuan}`
        });
      });

      showToast('Transfer stok berhasil!', 'success');
      setSelectedProduct(null);
      setShowConfirmModal(false);
      loadProducts();
    } catch {
      showToast('Gagal memproses transfer!', 'error');
    }
  };

  const filteredProducts = products.filter(p => 
    p.nama.toLowerCase().includes(productSearch.toLowerCase()) && p.stokRetur > 0
  );

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
        <input 
          type="text" 
          placeholder="Cari barang yang ada stok retur..." 
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-2xl text-sm outline-none focus:ring-2 ring-teal-400 shadow-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pb-20">
        {filteredProducts.map(p => (
          <button 
            key={p.id}
            onClick={() => openTransferModal(p)}
            className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm text-left active:scale-95 transition-transform"
          >
            <h4 className="text-sm font-bold text-stone-800 line-clamp-2 leading-tight h-10 mb-2">{p.nama}</h4>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] text-stone-500 font-medium">
                 <span>Toko:</span> <span className="font-bold text-green-600">{p.stokToko}</span>
              </div>
              <div className="flex justify-between text-[10px] text-stone-500 font-medium">
                 <span>Retur:</span> <span className="font-bold text-blue-600">{p.stokRetur}</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-stone-50 flex justify-center text-teal-500">
              <ArrowLeftRight size={14} />
            </div>
          </button>
        ))}
        {filteredProducts.length === 0 && (
           <div className="col-span-2 text-center py-10 text-stone-400">
             <p className="text-sm">Tidak ada barang dengan stok retur.</p>
           </div>
        )}
      </div>

      {selectedProduct && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-stone-800">Transfer Stok</h3>
              <button onClick={() => setSelectedProduct(null)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-stone-400 font-bold uppercase mb-1">Barang</p>
                <p className="text-sm font-bold text-stone-800">{selectedProduct.nama}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 p-3 bg-stone-50 rounded-2xl border border-stone-100 text-center">
                <div>
                  <p className="text-[8px] text-stone-400 uppercase font-bold">Stok Retur</p>
                  <p className="text-sm font-bold text-blue-600">{selectedProduct.stokRetur}</p>
                </div>
                <div>
                  <p className="text-[8px] text-stone-400 uppercase font-bold">Stok Toko</p>
                  <p className="text-sm font-bold text-green-600">{selectedProduct.stokToko}</p>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-stone-400 font-bold uppercase mb-1 block">Jumlah Transfer ke Toko</label>
                <input 
                  type="text" inputMode="numeric" ref={qtyInputRef}
                  value={formatRupiah(transferQty)}
                  onChange={(e) => setTransferQty(parseRupiah(e.target.value))}
                  className="w-full p-4 bg-stone-100 rounded-2xl text-xl font-bold text-stone-800 outline-none focus:ring-2 ring-teal-400"
                />
              </div>
              <button onClick={() => setShowConfirmModal(true)} className="w-full py-4 bg-stone-800 text-white rounded-2xl font-bold text-sm shadow-lg active:scale-95 transition-transform">Proses Transfer</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-stone-800 mb-2">Konfirmasi</h3>
            <p className="text-sm text-stone-500 mb-6">Pindahkan <b>{transferQty} {selectedProduct?.satuan}</b> dari stok retur ke stok toko?</p>
            <div className="flex flex-col gap-2">
              <button onClick={handleTransfer} className="py-3 bg-teal-600 text-white rounded-2xl font-bold text-sm">Ya, Transfer</button>
              <button onClick={() => setShowConfirmModal(false)} className="py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}