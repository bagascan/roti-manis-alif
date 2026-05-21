/// <reference types="vite-plugin-pwa/react" />
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { receiptHelper } from './views/receiptHelper'
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
  RefreshCw
} from 'lucide-react'
import { formatRupiah } from './utils/formatters'

// Bluetooth Interfaces
interface BluetoothGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
}
interface BluetoothGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothGATTCharacteristic>;
}
interface BluetoothGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothGATTServer>;
  getPrimaryService(service: string | number): Promise<BluetoothGATTService>;
}
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothGATTServer;
}
interface RequestDeviceOptions {
  filters?: Array<{ services?: Array<string | number>; name?: string; namePrefix?: string }>;
  optionalServices?: Array<string | number>;
  acceptAllDevices?: boolean;
}

interface Bluetooth extends EventTarget {
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface ExtendedNavigator extends Navigator {
  bluetooth?: Bluetooth;
}

type View = 'menu' | 'barang' | 'pelanggan' | 'kasir' | 'riwayat' | 'laporan' | 'restok' | 'penyesuaian' | 'supplier' | 'pengaturan' | 'pengeluaran' | 'laporan-retur' | 'transfer-stok'

// Helper untuk mengubah Logo (Base64/URL) menjadi ESC/POS Bit Image
const getLogoBytes = async (base64: string): Promise<Uint8Array | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const width = 160; // Lebar logo dalam pixel (kelipatan 8, aman untuk 58mm)
      const height = Math.floor(img.height * (width / img.width));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      
      // Gambar dengan background putih (menghindari transparansi jadi hitam)
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;
      const bytesWidth = width / 8;
      const data = new Uint8Array(bytesWidth * height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < bytesWidth; x++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const pxIndex = (y * width + (x * 8 + bit)) * 4;
            const r = pixels[pxIndex];
            const g = pixels[pxIndex + 1];
            const b = pixels[pxIndex + 2];
            const alpha = pixels[pxIndex + 3];
            const luminance = alpha < 128 ? 255 : (r * 0.299 + g * 0.587 + b * 0.114);
            if (luminance < 128) byte |= (1 << (7 - bit));
          }
          data[y * bytesWidth + x] = byte;
        }
      }

      const header = new Uint8Array([
        0x1B, 0x61, 0x01, // Center Alignment
        0x1D, 0x76, 0x30, 0x00,
        bytesWidth & 0xFF, (bytesWidth >> 8) & 0xFF,
        height & 0xFF, (height >> 8) & 0xFF
      ]);
      const res = new Uint8Array(header.length + data.length);
      res.set(header); res.set(data, header.length);
      resolve(res);
    };
    img.onerror = () => resolve(null);
    img.src = base64;
  });
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('menu')
  const [todayStats, setTodayStats] = useState({ sales: 0, returns: 0, transProfit: 0 });
  const [initError, setInitError] = useState<string | null>(null);
  
  // Sinkronisasi status printer ke Ref untuk menghindari re-trigger pada useEffect
  const isPrinterReadyRef = useRef(false);
  const [isPrinterReady, setIsPrinterReady] = useState(false);
  useEffect(() => { isPrinterReadyRef.current = isPrinterReady; }, [isPrinterReady]);

  const [editingTransactionForKasir, setEditingTransactionForKasir] = useState<EnrichedTransaction | null>(null);

    const navigateTo = (view: View) => {
    window.history.pushState({ view }, '');
    setCurrentView(view);
  };

  // Handle Navigation (Back Button HP & Browser)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const view = event.state?.view || 'menu';
      setCurrentView(view);
      if (view !== 'kasir') setEditingTransactionForKasir(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  // Global Printer State & Refs
  const [isConnecting, setIsConnecting] = useState(false);
  const [printerAddress, setPrinterAddress] = useState(localStorage.getItem('printer_address') || '');
   const isConnectingRef = useRef(false);
  const bluetoothDeviceRef = useRef<BluetoothDevice | null>(null);
  const gattServerRef = useRef<BluetoothGATTServer | null>(null);
  const printerCharacteristicRef = useRef<BluetoothGATTCharacteristic | null>(null);
   const attemptConnection = useCallback(async (device: BluetoothDevice) => {
    setIsConnecting(true);

    const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
    const CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

    try {
      if (!device.gatt) throw new Error('GATT not available');
      const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
      
      gattServerRef.current = server;
      const service = await server.getPrimaryService(SERVICE_UUID);
      
      const characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
      printerCharacteristicRef.current = characteristic;
      setIsPrinterReady(true);

      if (device.name) {
        setPrinterAddress(device.name);
        localStorage.setItem('printer_address', device.name);
        localStorage.setItem('printer_id', device.id);
      }

      // Listener untuk mendeteksi jika printer mati atau di luar jangkauan (Auto Putus)
      device.addEventListener('gattserverdisconnected', () => {
        setIsPrinterReady(false);
        gattServerRef.current = null;
        printerCharacteristicRef.current = null;
      });

      return true;
    } catch {
      setIsPrinterReady(false);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);
  // Mekanisme PWA Update Prompt
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r) return;

      // 1. Cek update segera setelah registrasi selesai
      r.update();

      // 2. Cek update setiap kali aplikasi kembali aktif (misal setelah pindah app atau HP nyala)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          r.update();
        }
      });

      // 3. Cek berkala setiap 1 jam
      setInterval(() => {
        r.update();
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('SW registration error', error);
    }
  });

  const handleSearchBluetooth = async () => {
    const nav = navigator as ExtendedNavigator;
    if (!nav.bluetooth) return false;
    if (isConnectingRef.current) return false;
    isConnectingRef.current = true;
    setIsConnecting(true);

    const SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });
      if (device) {
        bluetoothDeviceRef.current = device;
        return await attemptConnection(device);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isConnectingRef.current = false;
      setIsConnecting(false);
    }
    return false;
  };

  const handleAutoConnect = useCallback(async (force = false) => {
    if (isPrinterReady && !force) return;
    
    if (isConnectingRef.current && !force) return;

    // Coba gunakan kembali device yang sudah ada di memory jika tersedia
    const nav = navigator as ExtendedNavigator;

    // 1. Jika device masih ada di memori (pindah-pindah menu tanpa refresh)
    if (bluetoothDeviceRef.current && !force) {
      await attemptConnection(bluetoothDeviceRef.current);
      return;
    }

    // 2. Jika device hilang dari memori (setelah aplikasi ditutup/restart)
    // Kita gunakan getDevices untuk mengambil kembali izin yang sudah pernah diberikan.
    if (nav.bluetooth?.getDevices) {
      isConnectingRef.current = true;
      setIsConnecting(true);
      try {
        const devices = await nav.bluetooth.getDevices();
        const savedId = localStorage.getItem('printer_id');
        const printer = devices.find(d => d.id === savedId) || devices[0];
        
        if (printer) {
          bluetoothDeviceRef.current = printer;
          await attemptConnection(printer);
        }
      } catch (e) {
        console.error("Auto-connect error:", e);
      } finally {
        isConnectingRef.current = false;
        setIsConnecting(false);
      }
    }
  }, [isPrinterReady, attemptConnection]);

  const printReceipt = async (transaction: EnrichedTransaction) => {
    if (!printerCharacteristicRef.current) {
      const success = await handleSearchBluetooth();
      if (!success) return false;
    }

    try {
      const logoBase64 = localStorage.getItem('app_logo') || '/logo.jpeg';
      const logoBuffer = await getLogoBytes(logoBase64);
      
      const text = receiptHelper.generateFullReceipt(transaction);
      const encoder = new TextEncoder();
      
      // Gabungkan Inisialisasi, Logo, dan Teks
      const init = new Uint8Array([0x1B, 0x40]); // Initialize
      const alignLeft = new Uint8Array([0x1B, 0x61, 0x00]); // Reset ke rata kiri
      const data = encoder.encode(text + "\n\n\n\n"); // Add spacing for tear off
      
      let totalLength = init.length + alignLeft.length + data.length;
      if (logoBuffer) totalLength += logoBuffer.length;

      const combined = new Uint8Array(totalLength);
      combined.set(init);
      
      let offset = init.length;
      if (logoBuffer) {
        combined.set(logoBuffer, offset);
        offset += logoBuffer.length;
      }
      combined.set(alignLeft, offset);
      offset += alignLeft.length;
      combined.set(data, offset);

      // Printer thermal (58mm) memiliki batas MTU yang sempit (biasanya 20 bytes).
      // Mengirim data besar sekaligus sering menyebabkan error atau printer terputus.
      // Kita kirim data dalam potongan kecil (chunks).
      const CHUNK_SIZE = 20;
      for (let i = 0; i < combined.length; i += CHUNK_SIZE) {
        const chunk = combined.slice(i, i + CHUNK_SIZE);
        await printerCharacteristicRef.current!.writeValue(chunk);
        // Tambahkan delay kecil antar chunk untuk stabilitas printer thermal 58mm
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      return true;
    } catch (error) {
      console.error('Print error:', error);
      setIsPrinterReady(false);
      gattServerRef.current = null;
      printerCharacteristicRef.current = null;
      return false;
    }
  };

  const fetchTodayData = useCallback(async () => {
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      const [trans, products] = await Promise.all([
        db.transactions.where('tanggal').between(start, end, true, true).toArray(),
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
          }
        });
      });
      // Laba Transaksi = (Penjualan - Modal) - Retur
      const tProfit = (sales - cogs) - returns;

      setTodayStats({ sales, returns, transProfit: tProfit });
    } catch (err) {
      console.error("Initialization Error:", err);
      setInitError("Gagal memuat data. Struktur database mungkin berubah.");
    }
  }, []);

  // Effect untuk Logika Data & Auto Connect
  useEffect(() => {
    let cashierInterval: number | undefined;

    if (currentView === 'menu') {
      fetchTodayData();
    } else if (currentView === 'kasir') {
      // Hanya jalankan auto-connect saat masuk menu kasir
      handleAutoConnect();

      // Jalankan auto-connect berkala khusus saat di menu kasir jika printer belum siap (Auto Konek)
      cashierInterval = window.setInterval(() => {
        // Gunakan Ref agar interval tidak ter-reset setiap kali status printer berubah
        if (!isPrinterReadyRef.current && !isConnectingRef.current) {
          handleAutoConnect();
        }
      }, 5000); // Mencoba menyambung setiap 5 detik
    }

    return () => {
      if (cashierInterval) clearInterval(cashierInterval);
    };
  }, [currentView, fetchTodayData, handleAutoConnect]); // isPrinterReady dihapus dari sini agar tidak loop

  if (initError) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h1 className="text-lg font-bold text-stone-800 mb-2">Terjadi Kesalahan System</h1>
        <p className="text-sm text-stone-500 mb-6">{initError}</p>
        <button 
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="px-6 py-3 bg-stone-800 text-white rounded-2xl font-bold text-sm"
        >
          Reset Aplikasi & Data Cache
        </button>
      </div>
    );
  }

  const menuItems = [
    { id: 'kasir', label: 'Kasir', icon: <ShoppingCart size={20} />, color: 'bg-green-100 text-green-700' },
    { id: 'barang', label: 'Barang', icon: <Package size={20} />, color: 'bg-amber-100 text-amber-700' },
    { id: 'pelanggan', label: 'Pelanggan', icon: <Users size={20} />, color: 'bg-orange-100 text-orange-700' },
    { id: 'supplier', label: 'Supplier', icon: <Truck size={20} />, color: 'bg-indigo-100 text-indigo-700' },
    { id: 'riwayat', label: 'Riwayat', icon: <History size={20} />, color: 'bg-blue-100 text-blue-700' },
    { id: 'restok', label: 'Restok', icon: <PackagePlus size={20} />, color: 'bg-rose-100 text-rose-700' },
    { id: 'pengeluaran', label: 'Kas Operasional', icon: <Wallet size={20} />, color: 'bg-red-100 text-red-700' },
    { id: 'penyesuaian', label: 'Stok Opname', icon: <Settings2 size={20} />, color: 'bg-slate-100 text-stone-700' },
    { id: 'pengaturan', label: 'Pengaturan', icon: <Settings size={20} />, color: 'bg-stone-200 text-stone-700' },
    { id: 'laporan-retur', label: 'Laporan Retur', icon: <RotateCcw size={20} />, color: 'bg-indigo-100 text-indigo-700' },
    { id: 'laporan', label: 'Laporan', icon: <BarChart3 size={20} />, color: 'bg-purple-100 text-purple-700' },
    { id: 'transfer-stok', label: 'Transfer Stok', icon: <ArrowLeftRight size={20} />, color: 'bg-teal-100 text-teal-700' },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col">
      {currentView === 'menu' ? (
        <>
          {/* Render Menu Utama */}
          <header className="p-5 pb-10 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-b-[2rem] shadow-md">
            <div className="max-w-md mx-auto flex items-center gap-4">
              <img src={localStorage.getItem('app_logo') || '/logo.jpeg'} alt="Logo" className="w-16 h-16 rounded-2xl object-cover border-2 border-white/50 shadow-lg" />
              <div>
                <p className="text-orange-100 text-xs font-medium tracking-widest uppercase">Selamat Datang</p>
                <h1 className="text-2xl font-extrabold mt-0.5 uppercase">ROTI MANIS ARIF</h1>
                <div className="mt-2 text-[11px] text-orange-50 font-medium leading-tight">
                  <p className="mb-0.5">Laporan Hari Ini</p>
                  <p>Total Penjualan : Rp {formatRupiah(todayStats.sales)}</p>
                  <p>Total Retur : Rp {formatRupiah(todayStats.returns)}</p>
                  <p className="font-extrabold text-white">Laba Transaksi : Rp {formatRupiah(todayStats.transProfit)}</p>
                </div>
              </div>
            </div>
          </header>
          <main className="max-w-md mx-auto -mt-6 p-3">
            <div className="grid grid-cols-3 gap-2">
              {menuItems.map((item) => (
                <button key={item.id} onClick={() => navigateTo(item.id as View)} className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-stone-100 active:scale-95 transition-transform">
                  <div className={`p-2.5 rounded-xl mb-1.5 ${item.color}`}>{item.icon}</div>
                  <span className="text-xs font-bold text-stone-700">{item.label}</span>
                </button>
              ))}
            </div>
          </main>
          <footer className="mt-6 pb-4 text-center text-stone-400 text-xs">&copy; 2026 Roti Manis Arif • Mobile POS</footer>
        </>
      ) : (
        <>
          {/* Render Halaman Fitur */}
          <header className="p-4 bg-white border-b flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => window.history.length > 1 ? window.history.back() : navigateTo('menu')} className="p-2 hover:bg-stone-100 rounded-full transition-colors"><ChevronLeft size={20} /></button>
              <h1 className="text-base font-bold capitalize">{currentView.replace('-', ' ')}</h1>
            </div>

            {currentView === 'kasir' && (
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${isPrinterReady ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${isPrinterReady ? 'bg-green-500 animate-pulse' : 'bg-stone-400'}`} />
                  {isPrinterReady ? printerAddress : 'Printer Offline'}
                </div>
                {!isPrinterReady && (
                  <button onClick={handleSearchBluetooth} className="p-1.5 bg-stone-100 text-stone-600 rounded-lg active:scale-95 transition-transform" title="Hubungkan Printer">
                    <RefreshCw size={14} className={isConnecting ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>
            )}
          </header>
          {currentView === 'barang' && <ProductPage />}
          {currentView === 'supplier' && <SupplierPage />}
          {currentView === 'pelanggan' && <CustomerPage />}
          {currentView === 'restok' && <RestockPage />}
          {currentView === 'riwayat' && (
            <HistoryPage 
              isPrinterReady={isPrinterReady} onPrint={printReceipt} onSearchBluetooth={handleSearchBluetooth} 
              onEditTransaction={(t) => { setEditingTransactionForKasir(t); navigateTo('kasir'); }} 
            />
          )}
          {currentView === 'penyesuaian' && <PenyesuaianPage />}
          {currentView === 'pengeluaran' && <ExpensePage />}
          {currentView === 'pengaturan' && <SettingsPage isPrinterReady={isPrinterReady} printerAddress={printerAddress} onSearchBluetooth={handleSearchBluetooth} printerCharacteristic={printerCharacteristicRef.current} />}
          {currentView === 'laporan-retur' && <LaporanReturPage />}
          {currentView === 'laporan' && <LaporanPage />}
          {currentView === 'transfer-stok' && <TransferStokPage />}
          {currentView === 'kasir' && <KasirPage editData={editingTransactionForKasir} isPrinterReady={isPrinterReady} onSearchBluetooth={handleSearchBluetooth} onPrint={printReceipt} onFinished={() => { const wasEditing = !!editingTransactionForKasir; setEditingTransactionForKasir(null); if (wasEditing) window.history.back(); }} />}
        </>
      )}

      {/* PWA Update Notification - Selalu muncul di semua view jika ada update */}
      {needRefresh && (
        <div 
          onClick={() => updateServiceWorker(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-stone-900 text-white px-5 py-4 rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom border border-amber-500 cursor-pointer active:scale-95 transition-transform"
        >
          <div className="bg-amber-500 p-2 rounded-xl text-stone-900">
            <RefreshCw size={20} className="animate-spin" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold leading-none mb-1">Versi Baru Tersedia!</p>
            <p className="text-[10px] text-stone-400 font-medium">Klik di sini untuk update aplikasi</p>
          </div>
        </div>
      )}

    </div>
  );
}
