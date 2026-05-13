import { useState, useEffect, useRef } from 'react';
import { db, type Expense } from '../db';
import { Plus, Search, CheckCircle2, AlertCircle, Edit3, Trash2, Calendar } from 'lucide-react';
import { formatRupiah } from '../utils/formatters';

export default function ExpensePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{ id?: number; type: 'save' | 'delete' } | null>(null);

  const [formData, setFormData] = useState<Omit<Expense, 'id'>>({
    tanggal: new Date(),
    kategori: 'Lainnya',
    keterangan: '',
    nominal: 0
  });

  const keteranganInputRef = useRef<HTMLInputElement>(null);

  const categories = ['Gaji', 'Listrik/Air', 'Sewa', 'Bensin', 'Alat', 'Lainnya'];

  useEffect(() => { loadData(); }, []);
  const loadData = async () => { setExpenses(await db.expenses.orderBy('tanggal').reverse().toArray()); };

  useEffect(() => {
    if (showForm) {
      keteranganInputRef.current?.focus();
    }
  }, [showForm]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await db.expenses.update(editingId, formData);
        showToast('Pengeluaran diperbarui!', 'success');
      } else {
        await db.expenses.add(formData);
        showToast('Pengeluaran dicatat!', 'success');
      }
      resetForm();
      loadData();
    } catch { showToast('Gagal memproses!', 'error'); }
    setShowConfirmModal(null);
  };

  const handleDelete = async (id: number) => {
    await db.expenses.delete(id);
    showToast('Data dihapus!', 'success');
    loadData();
    setShowConfirmModal(null);
  };

  const resetForm = () => {
    setFormData({ tanggal: new Date(), kategori: 'Lainnya', keterangan: '', nominal: 0 });
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (e: Expense) => {
    setEditingId(e.id!);
    setFormData({ ...e });
    setShowForm(true);
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
            <h3 className="text-lg font-bold text-stone-800 mb-2">{showConfirmModal.type === 'save' ? 'Simpan Data?' : 'Hapus Data?'}</h3>
            <p className="text-sm text-stone-500 mb-6">Pastikan data yang dimasukkan sudah benar.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => showConfirmModal.type === 'save' ? handleSave() : handleDelete(showConfirmModal.id!)} className="py-3 bg-red-600 text-white rounded-2xl font-bold text-sm">Ya, Lanjutkan</button>
              <button onClick={() => setShowConfirmModal(null)} className="py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-100 mb-4">
        <p className="text-xs text-stone-400 uppercase font-bold">Total Pengeluaran</p>
        <p className="text-xl font-bold text-rose-600">Rp {formatRupiah(expenses.reduce((acc, curr) => acc + curr.nominal, 0))}</p>
      </div>

      <button 
        onClick={() => showForm ? resetForm() : setShowForm(true)}
        className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-xl text-base font-bold shadow-md active:scale-95 transition-transform"
      >
        <Plus size={16} /> {showForm ? 'Batal' : editingId ? 'Batal Edit' : 'Catat Pengeluaran'}
      </button>

      {showForm && (
        <form onSubmit={e => { e.preventDefault(); setShowConfirmModal({ type: 'save' }); }} className="bg-white p-3 rounded-2xl shadow-md border border-red-100 mb-4 space-y-2 animate-in fade-in slide-in-from-top-4">
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Kategori</label>
            <select value={formData.kategori} onChange={e => setFormData({...formData, kategori: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-red-400">
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Keterangan</label>
            <input type="text" ref={keteranganInputRef} required value={formData.keterangan} onChange={e => setFormData({...formData, keterangan: e.target.value})} className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-red-400" placeholder="Misal: Bayar listrik Januari" />
          </div>
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1 block">Nominal (Rp)</label>
            <input 
              type="text" required 
              value={formatRupiah(formData.nominal)} 
              onChange={e => setFormData({...formData, nominal: parseInt(e.target.value.replace(/\./g, '')) || 0})} 
              className="w-full p-2.5 bg-stone-100 rounded-lg text-sm outline-none focus:ring-2 ring-red-400" 
              inputMode="numeric" 
            />
          </div>
          <button type="submit" className="w-full mt-2 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-bold shadow-md">
            {editingId ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}
          </button>
        </form>
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
        <input type="text" placeholder="Cari keterangan..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-200 rounded-xl text-xs outline-none shadow-sm" />
      </div>

      <div className="space-y-2 pb-12">
        {expenses.filter(e => e.keterangan.toLowerCase().includes(searchTerm.toLowerCase())).map(e => (
          <div key={e.id} className="bg-white border border-stone-100 p-3 rounded-xl shadow-sm">
            <div className="flex justify-between items-start mb-1.5">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 uppercase">{e.kategori}</span>
                  <span className="text-[9px] text-stone-400 flex items-center gap-1"><Calendar size={10}/> {new Date(e.tanggal).toLocaleDateString('id-ID')}</span>
                </div>
                <h3 className="text-xs font-bold text-stone-800">{e.keterangan}</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(e)} className="p-2 bg-amber-50 text-amber-600 rounded-lg"><Edit3 size={14}/></button>
                <button onClick={() => setShowConfirmModal({ type: 'delete', id: e.id })} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 size={14}/></button>
              </div>
            </div>
            <div className="pt-1.5 border-t border-stone-50">
              <p className="text-base font-bold text-red-600">Rp {formatRupiah(e.nominal)}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}