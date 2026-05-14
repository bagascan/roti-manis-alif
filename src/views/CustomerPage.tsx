import { useState, useEffect, useRef } from 'react';
import { db, type Customer } from '../db';
import { Plus, Users, Phone, Search, CheckCircle2, AlertCircle, Edit3, MapPin } from 'lucide-react';
import { formatRupiah } from '../utils/formatters';

export default function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [formData, setFormData] = useState<Omit<Customer, 'id'>>({
    nama: '',
    telepon: '',
    status: 'aktif',
    hutang: 0,
    maps: ''
  });

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => { setCustomers(await db.customers.toArray()); };

  useEffect(() => {
    if (showForm) {
      nameInputRef.current?.focus();
    }
  }, [showForm]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await db.customers.update(editingId, formData);
        showToast('Data pelanggan diperbarui!', 'success');
      } else {
        await db.customers.add(formData);
        showToast('Pelanggan baru ditambahkan!', 'success');
      }
      setFormData({ nama: '', telepon: '', status: 'aktif', hutang: 0, maps: '' });
      setEditingId(null);
      setShowForm(false);
      setShowConfirmModal(false);
      loadData();
    } catch {
      showToast('Gagal menyimpan data!', 'error');
    }
  };

  const startEdit = (c: Customer) => {
    setEditingId(c.id!);
    setFormData({ ...c });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-stone-800 mb-2">Konfirmasi Simpan</h3>
            <p className="text-sm text-stone-500 mb-6">Simpan data pelanggan "{formData.nama}"?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
              <button onClick={handleSave} className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm">Ya, Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <p className="text-[9px] text-stone-400 uppercase font-bold">Total Pelanggan</p>
          <p className="text-lg font-bold text-stone-700">{customers.length} Orang</p>
        </div>
        <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100">
          <p className="text-[9px] text-stone-400 uppercase font-bold">Total Piutang</p>
          <p className="text-lg font-bold text-rose-600">Rp {formatRupiah(customers.reduce((acc, c) => acc + (c.hutang || 0), 0))}</p>
        </div>
      </div>

      <button 
        onClick={() => {
          if (showForm && editingId) {
            setEditingId(null);
          setFormData({ nama: '', telepon: '', status: 'aktif', hutang: 0, maps: '' });
          }
          setShowForm(!showForm);
        }}
        className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold shadow-md active:scale-95 transition-transform"
      >
        <Plus size={16} /> {showForm ? 'Batal' : editingId ? 'Batal Edit' : 'Tambah Pelanggan'}
      </button>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); setShowConfirmModal(true); }} className="bg-white p-3 rounded-2xl shadow-md border border-orange-100 mb-4 space-y-2 animate-in fade-in slide-in-from-top-4">
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Nama Pelanggan</label>
            <input type="text" ref={nameInputRef} required value={formData.nama} onChange={e => setFormData({...formData, nama: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-orange-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Telepon</label>
            <input type="tel" value={formData.telepon} onChange={e => setFormData({...formData, telepon: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-orange-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Link Google Maps</label>
            <input type="url" value={formData.maps || ''} onChange={e => setFormData({...formData, maps: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-orange-400" placeholder="https://goo.gl/maps/..." />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Status</label>
            <div className="flex gap-2">
              {(['aktif', 'nonaktif'] as const).map((st) => (
                <button
                  key={st} type="button"
                  onClick={() => setFormData({...formData, status: st})}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold capitalize border-2 transition-all ${formData.status === st ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-100 text-stone-400'}`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="w-full mt-2 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-bold shadow-md">
            {editingId ? 'Simpan Perubahan' : 'Simpan Pelanggan'}
          </button>
        </form>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input 
          type="text" 
          placeholder="Cari nama atau telepon..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:ring-2 ring-orange-400 shadow-sm"
        />
      </div>

      <div className="space-y-2">
        {customers
          .filter(c => c.nama.toLowerCase().includes(searchTerm.toLowerCase()) || c.telepon.includes(searchTerm))
          .map((c) => (
          <div key={c.id} className={`bg-white border p-3 rounded-xl shadow-sm transition-opacity ${c.status === 'nonaktif' ? 'opacity-60 border-stone-200' : 'border-stone-100'}`}>
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
                  <Users size={14} className="text-orange-500" /> {c.nama}
                </h3>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit ${c.status === 'aktif' ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'}`}>
                  {c.status.toUpperCase()}
                </span>
              </div>
              <button 
                onClick={() => startEdit(c)}
                className="p-2 bg-orange-50 text-orange-600 rounded-lg active:bg-orange-100"
              >
                <Edit3 size={14} />
              </button>
            </div>
            <div className="mt-2 py-2 border-y border-stone-50 flex justify-between items-center">
               <span className="text-[10px] text-stone-400 uppercase font-bold">Total Hutang</span>
               <span className={`text-sm font-bold ${c.hutang > 0 ? 'text-rose-600' : 'text-stone-400'}`}>Rp {formatRupiah(c.hutang || 0)}</span>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Phone size={12} /> {c.telepon || '-'}
              </div>
              {c.maps && (
                <a 
                  href={c.maps} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-500 mt-1 hover:underline"
                >
                  <MapPin size={12} /> Buka Lokasi (Maps)
                </a>
              )}
            </div>
          </div>
        ))}
        {customers.length === 0 && (
          <div className="text-center py-10 text-stone-300">
            <Users size={40} className="mx-auto mb-1.5 opacity-20" />
            <p className="text-sm">Belum ada data pelanggan</p>
          </div>
        )}
      </div>
    </main>
  );
}