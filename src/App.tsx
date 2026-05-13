/// <reference types="vite-plugin-pwa/react" />
import { useState, useEffect, useCallback } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import type { EnrichedTransaction } from './views/HistoryPage' // Import type for editing transaction
import { db } from './db'
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
import { formatRupiah } from './utils/formatters';

type View = 'menu' | 'barang' | 'pelanggan' | 'kasir' | 'riwayat' | 'laporan' | 'restok' | 'penyesuaian' | 'supplier' | 'pengaturan' | 'pengeluaran' | 'laporan-retur' | 'transfer-stok'

export default function App() {
  const [currentView, setCurrentView] = useState<View>('menu')

  // Mekanisme PWA Update Prompt
  const {
    needRefresh: [needRefresh]
  } = useRegisterSW();

  const [totalSalesToday, setTotalSalesToday] = useState(0);
  const [itemsSoldToday, setItemsSoldToday] = useState(0);
  const [totalReturnsToday, setTotalReturnsToday] = useState(0);
  const [itemsReturnedToday, setItemsReturnedToday] = useState(0);
  const [totalExpensesToday, setTotalExpensesToday] = useState(0);
  const [netProfitToday, setNetProfitToday] = useState(0);
  const [editingTransactionForKasir, setEditingTransactionForKasir] = useState<EnrichedTransaction | null>(null);

  // This useEffect was for totalExpenses, but now we need a more comprehensive summary for today
  // I'll replace it with fetchTodaySummary
  // useEffect(() => {
  //   const fetchTotalExpenses = async () => {
  //     const expenses = await db.expenses.toArray();
  //     const total = expenses.reduce((sum, exp) => sum + exp.nominal, 0);
  //     setTotalExpenses(total);
  //   };
  //   fetchTotalExpenses();
  // }, [currentView]); // Recalculate if we return to menu

  const fetchTodaySummary = useCallback(async () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const [transactionsToday, expensesToday, productsData] = await Promise.all([
      db.transactions.where('tanggal').between(startOfDay, endOfDay, true, true).toArray(),
      db.expenses.where('tanggal').between(startOfDay, endOfDay, true, true).toArray(),
      db.products.toArray() // Need products to calculate total pcs
    ]);

    let salesTotal = 0;
    let salesQty = 0;
    let returnsTotal = 0;
    let returnsQty = 0;
    let cogsTotal = 0; // Cost of Goods Sold (Modal)

    transactionsToday.forEach(t => {
      t.items.forEach(item => {
        const product = productsData.find(p => p.id === item.productId);
        const isi = product?.isiPerSatuan || 1;
        const qtyInPcs = item.unit === 'satuan' ? item.qty * isi : item.qty;

        // Hitung modal barang (hargaBeli di transaksi adalah harga per Pack)
        const costPerUnitSold = item.unit === 'satuan' ? item.hargaBeli : item.hargaBeli / isi;
        const totalItemCost = costPerUnitSold * item.qty;

        if (item.subtotal >= 0) {
          salesTotal += item.subtotal;
          salesQty += qtyInPcs;
          cogsTotal += totalItemCost;
        } else {
          returnsTotal += Math.abs(item.subtotal);
          returnsQty += qtyInPcs;
          cogsTotal -= totalItemCost; // Modal berkurang karena barang kembali ke stok
        }
      });
    });

    const expensesTotal = expensesToday.reduce((sum, exp) => sum + exp.nominal, 0);

    setTotalSalesToday(salesTotal);
    setItemsSoldToday(salesQty);
    setTotalReturnsToday(returnsTotal);
    setItemsReturnedToday(returnsQty);
    setTotalExpensesToday(expensesTotal);
    setNetProfitToday((salesTotal - returnsTotal - cogsTotal) - expensesTotal);
  }, []); // No dependencies needed here as it always calculates for 'today'

  useEffect(() => {
    if (currentView === 'menu') { // Only fetch when on the main menu
      fetchTodaySummary();
    }
  }, [currentView, fetchTodaySummary]); // Recalculate if we return to menu or fetchTodaySummary changes

  const menuItems = [
    { id: 'barang', label: 'Barang', icon: <Package size={20} />, color: 'bg-amber-100 text-amber-700' },
    { id: 'pelanggan', label: 'Pelanggan', icon: <Users size={20} />, color: 'bg-orange-100 text-orange-700' },
    { id: 'kasir', label: 'Kasir', icon: <ShoppingCart size={20} />, color: 'bg-green-100 text-green-700' },
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
            onClick={() => setCurrentView('menu')}
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

        {/* Quick Stats / Summary Card */}
        <section className="mt-4 p-4 bg-stone-800 text-stone-100 rounded-2xl shadow-lg space-y-2">
          <h3 className="font-bold text-sm mb-1">Ringkasan Hari Ini</h3>
          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Total Penjualan</span>
            <span className="font-semibold">Rp {formatRupiah(totalSalesToday)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Barang Terjual</span>
            <span>{itemsSoldToday} pcs</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Total Returan</span>
            <span className="font-semibold">Rp {formatRupiah(totalReturnsToday)}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-b border-stone-700 pb-2">
            <span className="text-stone-400">Barang Diretur</span>
            <span>{itemsReturnedToday} pcs</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-stone-400">Total Pengeluaran</span>
            <span className="font-semibold">Rp {formatRupiah(totalExpensesToday)}</span>
          </div>
          <div className="flex justify-between items-center pt-2">
             <span className="text-stone-300 text-base">Laba Bersih</span>
            <span className="font-extrabold text-xl text-green-400">Rp {formatRupiah(netProfitToday)}</span>
          </div>
        </section>
      </main>

      <footer className="mt-6 pb-4 text-center text-stone-400 text-xs">
        &copy; 2026 Roti Manis Alif • Mobile POS
      </footer>
    </div>
  )
}
