import { useState, useEffect, useRef } from 'react';
import { db, type Supplier } from '../db';
import { Plus, Truck, Phone, MapPin, Search, CheckCircle2, AlertCircle, Edit3 } from 'lucide-react';

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<Supplier, 'id'>>({ nama: '', telepon: '', alamat: '', status: 'aktif' });
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) {
      nameInputRef.current?.focus();
    }
  }, [showForm]);

  useEffect(() => { loadSuppliers(); }, []);
  const loadSuppliers = async () => { setSuppliers(await db.suppliers.toArray()); };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await db.suppliers.update(editingId, formData);
        showToast('Supplier diperbarui!', 'success');
      } else {
        await db.suppliers.add(formData);
        showToast('Supplier berhasil disimpan!', 'success');
      }
      setFormData({ nama: '', telepon: '', alamat: '', status: 'aktif' });
      setEditingId(null);
      setShowForm(false);
      loadSuppliers();
    } catch {
      showToast('Gagal menyimpan supplier!', 'error');
    }
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id!);
    setFormData({ ...s });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-indigo-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}

      <button 
        onClick={() => {
          if (showForm && editingId) {
            setEditingId(null);
            setFormData({ nama: '', telepon: '', alamat: '', status: 'aktif' });
          }
          setShowForm(!showForm);
        }}
        className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md"
      >
        <Plus size={16} /> {showForm ? 'Batal' : editingId ? 'Batal Edit' : 'Tambah Supplier'}
      </button>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white p-3 rounded-2xl shadow-md border border-indigo-100 mb-4 space-y-2">
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Nama Supplier</label>
            <input type="text" ref={nameInputRef} required value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Status</label>
            <div className="flex gap-2">
              {(['aktif', 'nonaktif'] as const).map((st) => (
                <button
                  key={st} type="button"
                  onClick={() => setFormData({...formData, status: st})}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold capitalize border-2 transition-all ${formData.status === st ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-100 text-stone-400'}`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Telepon</label>
            <input type="tel" value={formData.telepon} onChange={e => setFormData({...formData, telepon: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Alamat</label>
            <input type="text" value={formData.alamat} onChange={e => setFormData({...formData, alamat: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-indigo-400" />
          </div>
          <button type="submit" className="w-full mt-2 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-bold shadow-md active:scale-95 transition-transform">
            {editingId ? 'Simpan Perubahan' : 'Simpan Supplier'}
          </button>
        </form>
      )}

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
        <input 
          type="text" 
          placeholder="Cari nama supplier..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-2 py-1.5 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:ring-2 ring-indigo-400 shadow-sm"
        />
      </div>

      <div className="space-y-2">
        {suppliers
          .filter(s => s.nama.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((s) => (
          <div key={s.id} className={`bg-white border p-3 rounded-xl shadow-sm transition-opacity ${s.status === 'nonaktif' ? 'opacity-60 border-stone-200' : 'border-stone-100'}`}>
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <h3 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Truck size={12} className="text-indigo-500" /> {s.nama}
                </h3>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit ${s.status !== 'nonaktif' ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'}`}>
                  {(s.status || 'aktif').toUpperCase()}
                </span>
              </div>
              <button 
                onClick={() => startEdit(s)}
                className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg active:bg-indigo-100"
              >
                <Edit3 size={12} />
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Phone size={10} /> {s.telepon || '-'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <MapPin size={10} /> {s.alamat || '-'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}