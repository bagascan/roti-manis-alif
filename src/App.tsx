/// <reference types="vite-plugin-pwa/react" />
import { useState, useEffect, useCallback } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { db } from './db'
import type { EnrichedTransaction } from './views/HistoryPage' // Import type for editing transaction
import ProductPage from './views/ProductPage'
import SupplierPage from './views/SupplierPage'
import PenyesuaianPage from './views/PenyesuaianPage'
import KasirPage from './views/KasirPage'
import CustomerPage from './views/CustomerPage'
import HistoryPage from './views/HistoryPage'
import RestockPage from './views/RestockPage'
import ExpensePage from './views/ExpensePage'
import SettingsPage from './views/SettingsPage'
import LaporanPage from './views/LaporanPage'
import LaporanReturPage from './views/LaporanReturPage'
import TransferStokPage from './views/TransferStokPage'
import { 
  Package, 
  Users, 
  ShoppingCart, 
  History, 
  BarChart3, 
  ChevronLeft,
  PackagePlus,
  Settings2,
  Truck,
  RotateCcw,
  ArrowLeftRight,
  Settings,
  Wallet,
  AlertCircle,
} from 'lucide-react'
import { formatRupiah } from './utils/formatters'

type View = 'menu' | 'barang' | 'pelanggan' | 'kasir' | 'riwayat' | 'laporan' | 'restok' | 'penyesuaian' | 'supplier' | 'pengaturan' | 'pengeluaran' | 'laporan-retur' | 'transfer-stok'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('menu')
  const [todayStats, setTodayStats] = useState({ sales: 0, profit: 0 });

  // Mekanisme PWA Update Prompt
  const {
    needRefresh: [needRefresh]
  } = useRegisterSW();
  const [editingTransactionForKasir, setEditingTransactionForKasir] = useState<EnrichedTransaction | null>(null);

  const fetchTodayData = useCallback(async () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const [trans, exp, products] = await Promise.all([
      db.transactions.where('tanggal').between(start, end, true, true).toArray(),
      db.expenses.where('tanggal').between(start, end, true, true).toArray(),
      db.products.toArray()
    ]);

    let sales = 0;
    let returns = 0;
    let cogs = 0;
    
    trans.forEach(t => {
      t.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const isi = product?.isiPerSatuan || 1;
        const costPerUnit = item.unit === 'satuan' ? item.hargaBeli : item.hargaBeli / isi;
        const itemCost = costPerUnit * item.qty;

        if (item.subtotal >= 0) {
          sales += item.subtotal;
          cogs += itemCost;
        } else {
          returns += Math.abs(item.subtotal);
          cogs -= itemCost;
        }
      });
    });

    const expensesTotal = exp.reduce((acc, e) => acc + e.nominal, 0);
    const profit = (sales - returns - cogs) - expensesTotal;

    setTodayStats({ sales, profit });
  }, []);

  useEffect(() => {
    if (currentView === 'menu') fetchTodayData();
  }, [currentView, fetchTodayData]);

  const menuItems = [
    { id: 'kasir', label: 'Kasir', icon: <ShoppingCart size={20} />, color: 'bg-green-100 text-green-700' },
    { id: 'barang', label: 'Barang', icon: <Package size={20} />, color: 'bg-amber-100 text-amber-700' },
    { id: 'pelanggan', label: 'Pelanggan', icon: <Users size={20} />, color: 'bg-orange-100 text-orange-700' },
    { id: 'supplier', label: 'Supplier', icon: <Truck size={20} />, color: 'bg-indigo-100 text-indigo-700' },
    { id: 'riwayat', label: 'Riwayat', icon: <History size={20} />, color: 'bg-blue-100 text-blue-700' },
    { id: 'restok', label: 'Restok', icon: <PackagePlus size={20} />, color: 'bg-rose-100 text-rose-700' },
    { id: 'pengeluaran', label: 'Pengeluaran', icon: <Wallet size={20} />, color: 'bg-red-100 text-red-700' },
    { id: 'penyesuaian', label: 'Stok Opname', icon: <Settings2 size={20} />, color: 'bg-slate-100 text-stone-700' },
    { id: 'pengaturan', label: 'Pengaturan', icon: <Settings size={20} />, color: 'bg-stone-200 text-stone-700' },
    { id: 'laporan-retur', label: 'Laporan Retur', icon: <RotateCcw size={20} />, color: 'bg-indigo-100 text-indigo-700' }, // New menu item
    { id: 'laporan', label: 'Laporan', icon: <BarChart3 size={20} />, color: 'bg-purple-100 text-purple-700' },
    { id: 'transfer-stok', label: 'Transfer Stok', icon: <ArrowLeftRight size={20} />, color: 'bg-teal-100 text-teal-700' },
  ]

  if (currentView !== 'menu') {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col">
        <header className="p-4 bg-white border-b flex items-center gap-4">
          <button 
            onClick={() => window.history.back()}
            className="p-2 hover:bg-stone-100 rounded-full transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-bold capitalize">{currentView}</h1>
        </header>
        {currentView === 'barang' ? <ProductPage /> :
         currentView === 'supplier' ? <SupplierPage /> :
         currentView === 'pelanggan' ? <CustomerPage /> :
         currentView === 'restok' ? <RestockPage /> :
         currentView === 'riwayat' ? (
           <HistoryPage 
             onEditTransaction={(transaction) => {
               setEditingTransactionForKasir(transaction);
               setCurrentView('kasir');
             }}
           />
         ) :
         currentView === 'penyesuaian' ? <PenyesuaianPage /> :
         currentView === 'pengeluaran' ? <ExpensePage /> :
         currentView === 'pengaturan' ? <SettingsPage /> :
         currentView === 'laporan-retur' ? <LaporanReturPage /> :
         currentView === 'laporan' ? <LaporanPage /> : 
         currentView === 'transfer-stok' ? <TransferStokPage /> : 
         currentView === 'kasir' ? (
             <KasirPage 
               editData={editingTransactionForKasir} 
               onFinished={() => {
                 const wasEditing = editingTransactionForKasir !== null;
                 setEditingTransactionForKasir(null);
                 // Hanya pindah ke riwayat jika sebelumnya memang sedang mengedit transaksi lama
                 if (wasEditing) setCurrentView('riwayat');
               }} 
             />
           ) : null}

        {/* PWA Update Notification */}
        {needRefresh && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] bg-stone-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in border border-amber-500/20">
            <AlertCircle size={20} className="text-amber-500" />
            <span className="text-sm font-bold">Memperbarui versi aplikasi...</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* Header / Hero Section */}
      <header className="p-5 pb-10 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-b-[2rem] shadow-md">
        <div className="max-w-md mx-auto flex items-center gap-4">
          <img src={localStorage.getItem('app_logo') || '/logo.jpeg'} alt="Logo" className="w-16 h-16 rounded-2xl object-cover border-2 border-white/50 shadow-lg" />
          <div>
            <p className="text-orange-100 text-xs font-medium tracking-widest uppercase">Selamat Datang</p>
            <h1 className="text-2xl font-extrabold mt-0.5 uppercase">ROTI MANIS ALIF</h1>
            <div className="mt-2 text-[11px] text-orange-50 font-medium leading-tight">
              <p className="opacity-80 mb-0.5">Laporan Hari Ini</p>
              <p>Total Penjualan : Rp {formatRupiah(todayStats.sales)}</p>
              <p>Total Laba Bersih : Rp {formatRupiah(todayStats.profit)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Menu Grid */}
      <main className="max-w-md mx-auto -mt-6 p-3">
        <div className="grid grid-cols-3 gap-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as View)}
              className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-stone-100 active:scale-95 transition-transform"
            >
              <div className={`p-2.5 rounded-xl mb-1.5 ${item.color}`}>
                {item.icon}
              </div>
              <span className="text-xs font-bold text-stone-700">{item.label}</span>
            </button>
          ))}
        </div>
      </main>

      <footer className="mt-6 pb-4 text-center text-stone-400 text-xs">
        &copy; 2026 Roti Manis Alif • Mobile POS
      </footer>
    </div>
  )
}
