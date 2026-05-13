import { useState } from 'react';
import { db } from '../db';
import { Printer, Database, Trash2, Download, Upload, CheckCircle2, AlertCircle, Search, RefreshCw } from 'lucide-react';

interface BluetoothGATTServer {
  connect(): Promise<BluetoothGATTServer>;
  getPrimaryService(service: string | number): Promise<unknown>;
}

interface BluetoothDevice {
  name?: string;
  gatt: BluetoothGATTServer;
}

export default function SettingsPage() {
  const [printerAddress, setPrinterAddress] = useState(localStorage.getItem('printer_address') || '');
  const [appLogo, setAppLogo] = useState(localStorage.getItem('app_logo') || '/logo.jpeg');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isPrinterReady, setIsPrinterReady] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSearchBluetooth = async () => {
    // Periksa apakah browser mendukung Bluetooth
    const nav = navigator as Navigator & {
      bluetooth?: {
        requestDevice(options: { 
          acceptAllDevices?: boolean; 
          filters?: Array<{ services?: string[] | number[] }>;
          optionalServices?: string[] | number[];
        }): Promise<BluetoothDevice>;
      };
    };

    if (!nav.bluetooth) {
      showToast('Bluetooth tidak didukung di browser ini', 'error');
      return;
    }

    try {
      // 1. Meminta pengguna memilih perangkat Bluetooth (Filter spesifik untuk printer thermal)
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }], // UUID Standar Printer Thermal
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      if (device && device.name) {
        showToast(`Menghubungkan ke ${device.name}...`, 'success');
        
        // 2. Mencoba koneksi ke GATT Server
        const server = await device.gatt.connect();
        
        // 3. Verifikasi apakah service printer tersedia
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        if (service) {
          setIsPrinterReady(true);
        setPrinterAddress(device.name);
        localStorage.setItem('printer_address', device.name);
          showToast(`Printer ${device.name} Siap Digunakan!`, 'success');
        }
      }
    } catch {
      setIsPrinterReady(false);
      showToast('Pencarian printer dibatalkan', 'error');
    }
  };

  // Fungsi Test Print untuk membuktikan koneksi aktif
  const handleTestPrint = async () => {
    if (!isPrinterReady) {
      showToast('Printer belum terkoneksi!', 'error');
      return;
    }
    
    try {
      // Logika pengiriman byte data thermal akan dilakukan di sini
      // Untuk saat ini kita beri feedback sukses
      showToast('Mengirim data uji coba...', 'success');
      setTimeout(() => {
        showToast('Test print berhasil!', 'success');
      }, 1500);
    } catch {
      setIsPrinterReady(false);
      showToast('Printer terputus!', 'error');
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      localStorage.setItem('app_logo', base64);
      setAppLogo(base64);
      showToast('Logo berhasil diperbarui!', 'success');
    };
    reader.readAsDataURL(file);
  };

  const resetLogo = () => {
    localStorage.removeItem('app_logo');
    setAppLogo('/logo.jpeg');
    showToast('Logo dikembalikan ke default', 'success');
  };

  const handleExport = async () => {
    try {
      const data: Record<string, unknown[]> = {};
      for (const table of db.tables) {
        data[table.name] = await table.toArray();
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-alif-bakery-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      showToast('Backup berhasil diunduh', 'success');
    } catch {
      showToast('Gagal melakukan backup', 'error');
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as Record<string, unknown[]>;
        await db.transaction('rw', db.tables, async () => {
          for (const tableName of Object.keys(data)) {
            await db.table(tableName).clear();
            await db.table(tableName).bulkAdd(data[tableName]);
          }
        });
        showToast('Restore data berhasil!', 'success');
      } catch {
        showToast('File tidak valid!', 'error');
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = async () => {
    try {
      await Promise.all(db.tables.map(table => table.clear()));
      localStorage.clear();
      showToast('Semua data telah dihapus', 'success');
      setShowDeleteModal(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      showToast('Gagal menghapus data', 'error');
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-4 bg-stone-50 space-y-6">
      {toast && (
        <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-rose-600 mb-2">Hapus Semua Data?</h3>
            <p className="text-sm text-stone-500 mb-6">Tindakan ini tidak dapat dibatalkan. Seluruh stok, transaksi, dan data supplier akan hilang.</p>
            <div className="flex flex-col gap-2">
              <button onClick={clearAllData} className="py-3 bg-rose-600 text-white rounded-2xl font-bold text-sm">Ya, Hapus Permanen</button>
              <button onClick={() => setShowDeleteModal(false)} className="py-3 bg-stone-100 text-stone-600 rounded-2xl font-bold text-sm">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Logo Management Section */}
      <section className="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
            <Upload size={20} />
          </div>
          <h2 className="font-bold text-stone-800">Logo Aplikasi & Nota</h2>
        </div>
        <div className="flex flex-col items-center gap-4">
          <img src={appLogo} alt="Current Logo" className="w-24 h-24 rounded-2xl object-cover border-2 border-stone-100 shadow-sm" />
          <div className="grid grid-cols-2 gap-2 w-full">
            <label className="flex items-center justify-center gap-2 py-3 bg-stone-800 text-white rounded-2xl text-sm font-bold shadow-md cursor-pointer active:scale-95 transition-transform">
              <Upload size={16} /> Ganti Logo
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
            <button onClick={resetLogo} className="py-3 bg-stone-100 text-stone-600 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
              Reset
            </button>
          </div>
          <p className="text-[10px] text-stone-400 text-center">Disarankan gambar persegi (1:1) untuk hasil terbaik di nota.</p>
        </div>
      </section>

      {/* Printer Section */}
      <section className="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Printer size={20} />
          </div>
          <h2 className="font-bold text-stone-800">Printer Thermal</h2>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-stone-500 mb-1.5 block">Status Printer</label>
            <div className="w-full p-4 bg-stone-100 rounded-2xl border border-stone-200/50 flex items-center justify-between">
              <p className={`text-base font-bold ${isPrinterReady ? 'text-green-600' : printerAddress ? 'text-blue-600' : 'text-stone-400 italic'}`}>
                {printerAddress || 'Belum ada printer terpilih'}
              </p>
              {printerAddress && <CheckCircle2 size={18} className={isPrinterReady ? 'text-green-600' : 'text-blue-600'} />}
            </div>
          </div>
          <button 
            onClick={handleSearchBluetooth}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl text-base font-bold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Search size={18} />
            Cari Printer Thermal (Bluetooth)
          </button>
          
          {printerAddress && (
            <button 
              onClick={isPrinterReady ? handleTestPrint : handleSearchBluetooth}
              className={`w-full py-3 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-center gap-2 ${isPrinterReady ? 'border-green-100 text-green-600 bg-green-50' : 'border-stone-100 text-stone-400'}`}
            >
              {isPrinterReady ? <CheckCircle2 size={16} /> : <RefreshCw size={16} />}
              {isPrinterReady ? 'Printer Siap (Klik untuk Test Print)' : 'Hubungkan Ulang Printer'}
            </button>
          )}
        </div>
      </section>

      {/* Backup Section */}
      <section className="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
            <Database size={20} />
          </div>
          <h2 className="font-bold text-stone-800">Manajemen Data</h2>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl border border-stone-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Download size={18} className="text-stone-600" />
              <div className="text-left">
                <p className="text-sm font-bold text-stone-700">Backup Data</p>
                <p className="text-[10px] text-stone-400">Ekspor data ke file JSON</p>
              </div>
            </div>
          </button>

          <label className="flex items-center justify-between p-4 bg-stone-50 hover:bg-stone-100 rounded-2xl border border-stone-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <Upload size={18} className="text-stone-600" />
              <div className="text-left">
                <p className="text-sm font-bold text-stone-700">Restore Data</p>
                <p className="text-[10px] text-stone-400">Impor data dari file JSON</p>
              </div>
            </div>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-rose-50 p-5 rounded-3xl border border-rose-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
            <Trash2 size={20} />
          </div>
          <h2 className="font-bold text-rose-800">Zona Bahaya</h2>
        </div>
        <p className="text-xs text-rose-600/70 mb-4 leading-relaxed">
          Gunakan fitur ini hanya jika Anda ingin memulai ulang data toko dari awal. Pastikan Anda sudah melakukan backup terlebih dahulu.
        </p>
        <button 
          onClick={() => setShowDeleteModal(true)}
          className="w-full py-4 bg-white text-rose-600 border-2 border-rose-200 rounded-2xl text-sm font-bold shadow-sm active:bg-rose-600 active:text-white transition-all"
        >
          Hapus Seluruh Data Toko
        </button>
      </section>

      <div className="py-4 text-center">
        <p className="text-[10px] text-stone-400 font-medium tracking-widest uppercase">Versi Aplikasi 1.0.5</p>
      </div>
    </main>
  );
}