import { useState, useEffect, useRef } from 'react';
import { db, type Product } from '../db';
import { Plus, Package, Info, Search, Edit3, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';

export default function ProductPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{ id?: number; type: 'save' | 'delete' } | null>(null);

  const [formData, setFormData] = useState<Omit<Product, 'id'>>({
    nama: '',
    hargaBeli: 0,
    hargaJual: 0,
    stokToko: 0,
    stokRetur: 0,
    satuan: 'Pack',
    isiPerSatuan: 1,
    kategori: 'Roti',
    status: 'aktif'
  });

  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    if (showForm) {
      nameInputRef.current?.focus();
    }
  }, [showForm]);

  const loadProducts = async () => {
    const data = await db.products.toArray();
    setProducts(data);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await db.products.update(editingId, formData);
        showToast('Produk diperbarui!', 'success');
      } else {
        await db.products.add(formData);
        showToast('Produk baru ditambahkan!', 'success');
      }
      resetForm();
      loadProducts();
    } catch {
      showToast('Gagal menyimpan produk!', 'error');
    }
    setShowConfirmModal(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await db.products.delete(id);
      showToast('Produk berhasil dihapus!', 'success');
      loadProducts();
    } catch {
      showToast('Gagal menghapus produk!', 'error');
    }
    setShowConfirmModal(null);
  };

  const resetForm = () => {
    setFormData({
      nama: '',
      hargaBeli: 0,
      hargaJual: 0,
      stokToko: 0,
      stokRetur: 0,
      satuan: 'Pack',
      isiPerSatuan: 1,
      kategori: 'Roti',
      status: 'aktif'
    });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id!);
    // Explicitly pick properties for form data to avoid unused variable warnings 
    // that often arise from destructuring patterns like { id: _, ...rest }.
    setFormData({
      nama: p.nama,
      hargaBeli: p.hargaBeli,
      hargaJual: p.hargaJual,
      stokToko: p.stokToko,
      stokRetur: p.stokRetur,
      satuan: p.satuan,
      isiPerSatuan: p.isiPerSatuan,
      kategori: p.kategori,
      status: p.status
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredProducts = products.filter(p => 
    p.nama.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 overflow-y-auto p-3 bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-800 mb-1.5">
              {showConfirmModal.type === 'delete' ? 'Hapus Produk?' : 'Simpan Produk?'}
            </h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              {showConfirmModal.type === 'delete' ? 'Data produk akan dihapus permanen. Anda yakin?' : 'Pastikan data produk sudah benar.'}
            </p>
            <div className="flex flex-col gap-1.5">
              <button 
                onClick={() => showConfirmModal.type === 'delete' ? handleDelete(showConfirmModal.id!) : handleSave()} 
                className={`py-2.5 ${showConfirmModal.type === 'delete' ? 'bg-red-600' : 'bg-stone-800'} text-white rounded-xl font-bold text-xs`}
              >
                Ya, Lanjutkan
              </button>
              <button onClick={() => setShowConfirmModal(null)} className="py-2.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Mini Stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white p-2 rounded-xl shadow-sm border border-stone-100">
          <p className="text-xs text-stone-400 uppercase font-bold">Total Produk</p>
          <p className="text-base font-bold text-stone-700">{products.length} Item</p>
        </div>
        <div className="bg-white p-2 rounded-xl shadow-sm border border-stone-100">
          <p className="text-xs text-stone-400 uppercase font-bold">Nilai Aset</p>
          <p className="text-base font-bold text-amber-600">
            Rp {products.reduce((acc, p) => acc + (p.hargaBeli * p.stokToko), 0).toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {/* Add Button Area */}
      <button 
        onClick={() => showForm ? resetForm() : setShowForm(true)}
        className={`w-full mb-3 flex items-center justify-center gap-2 py-2.5 ${showForm ? 'bg-stone-100 text-stone-600' : 'bg-amber-500 text-white'} rounded-xl text-sm font-bold active:scale-95 transition-transform shadow-sm`}
      >
        {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? 'Batal' : editingId ? 'Batal Edit' : 'Tambah Produk Baru'}
      </button>

      {/* Compact Form */}
      {showForm && (
        <form onSubmit={e => { e.preventDefault(); setShowConfirmModal({ type: 'save' }); }} className="bg-white p-3 rounded-2xl shadow-md border border-amber-100 mb-4 space-y-2 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-xs font-bold text-stone-500">Nama Barang</label>
              <input type="text" ref={nameInputRef} required value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full p-2 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100 focus:ring-1 ring-amber-400" />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-500">Harga Beli</label>
              <input type="text" inputMode="numeric" value={formatRupiah(formData.hargaBeli)} onChange={e => setFormData({...formData, hargaBeli: parseRupiah(e.target.value)})} className="w-full p-2 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100" />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-500">Harga Jual</label>
              <input type="text" inputMode="numeric" value={formatRupiah(formData.hargaJual)} onChange={e => setFormData({...formData, hargaJual: parseRupiah(e.target.value)})} className="w-full p-2 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100" />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-500">Satuan (Utama)</label>
              <input type="text" value={formData.satuan} onChange={e => setFormData({...formData, satuan: e.target.value})} className="w-full p-2 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100" />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-500">Isi per {formData.satuan}</label>
              <input type="number" value={formData.isiPerSatuan} onChange={e => setFormData({...formData, isiPerSatuan: Number(e.target.value)})} className="w-full p-2 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-stone-500 mb-1 block">Status</label>
              <div className="flex gap-2">
                {(['aktif', 'nonaktif'] as const).map((st) => (
                  <button
                    key={st} type="button"
                    onClick={() => setFormData({...formData, status: st})}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize border-2 transition-all ${formData.status === st ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-100 text-stone-400'}`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button type="submit" className="w-full mt-2 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-bold shadow-md">
            {editingId ? 'Simpan Perubahan' : 'Simpan Produk'}
          </button>
        </form>
      )}

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input 
          type="text" 
          placeholder="Cari produk..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 ring-amber-400 shadow-sm"
        />
      </div>

      {/* Product List */}
      <div className="space-y-2 pb-10">
        {filteredProducts.length === 0 && (
          <div className="text-center py-10 text-stone-300">
            <Package size={40} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">Belum ada data barang</p>
          </div>
        )}
        {filteredProducts.map((p) => {
          const hargaPcs = Math.round(p.hargaJual / p.isiPerSatuan);
          return (
            <div key={p.id} className={`bg-white border p-3 rounded-2xl shadow-sm transition-opacity ${p.status === 'nonaktif' ? 'opacity-60 border-stone-200' : 'border-stone-100'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-bold text-stone-800">{p.nama}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 font-bold uppercase">#{p.id}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'}`}>
                      {p.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(p)} className="p-2 bg-amber-50 text-amber-600 rounded-lg active:bg-amber-100"><Edit3 size={14} /></button>
                  <button onClick={() => setShowConfirmModal({ type: 'delete', id: p.id })} className="p-2 bg-rose-50 text-rose-600 rounded-lg active:bg-rose-100"><Trash2 size={14} /></button>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 border-t border-stone-50 pt-2.5">
                <div className="flex flex-col">
                  <span className="text-[10px] text-stone-400 uppercase font-bold">Stok Toko</span>
                  <span className="text-xs font-bold text-green-600">{p.stokToko} <span className="text-[10px] font-normal text-stone-400">{p.satuan}</span></span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-stone-400 uppercase font-bold">Stok Retur</span>
                  <span className="text-xs font-bold text-rose-500">{p.stokRetur} <span className="text-[10px] font-normal text-stone-400">{p.satuan}</span></span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] text-stone-400 uppercase font-bold">Harga Jual</span>
                  <span className="text-xs font-bold text-stone-700">Rp {p.hargaJual.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between">
                {p.isiPerSatuan > 1 ? (
                  <div className="flex items-center gap-1 text-[10px] text-blue-500 bg-blue-50 w-fit px-1.5 py-0.5 rounded-md font-bold">
                    <Info size={10} /> 1 {p.satuan} = {p.isiPerSatuan} Pcs (Rp {hargaPcs.toLocaleString('id-ID')}/pcs)
                  </div>
                ) : <div />}
                <div className="text-[10px] text-stone-400 font-medium">H. Beli: <span className="text-stone-500 font-bold">Rp {p.hargaBeli.toLocaleString('id-ID')}</span></div>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  );
}
