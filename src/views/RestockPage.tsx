import { useState, useEffect, useRef } from 'react';
import { db, type Restock, type Product, type Supplier } from '../db';
import { 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Calendar, 
  Truck, 
  ShoppingCart, 
  Plus,
  Minus,
  X,
  ArrowRight,
  Edit3
} from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';

interface CartItem extends Product {
  cartQty: number;
  cartUnit: 'satuan' | 'pcs';
  cartHargaBeli: number;
  cartHargaJual: number;
}

type EnrichedRestockItem = Restock['items'][number] & { productName?: string };
type EnrichedRestock = Omit<Restock, 'items'> & { 
  supplierName?: string; 
  productName?: string; 
  items: EnrichedRestockItem[];
};

export default function RestockPage() {
  const [view, setView] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]); // Keep suppliers for the dropdown
  const [restocks, setRestocks] = useState<EnrichedRestock[]>([]);
  
  // POS State
  const [selectedSupplier, setSelectedSupplier] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [editingRestock, setEditingRestock] = useState<EnrichedRestock | null>(null);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [detailRestock, setDetailRestock] = useState<EnrichedRestock | null>(null);

  // UI State
  const [productSearch, setProductSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<number | null>(null);

  // Refs
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus pada kolom pencarian saat masuk menu POS
  useEffect(() => {
    if (view === 'pos' && !showCartModal && !detailRestock) {
      searchRef.current?.focus();
    }
  }, [view, showCartModal, detailRestock]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [rData, pData, sData] = await Promise.all([
      db.restocks.orderBy('tanggal').reverse().toArray(),
      db.products.toArray(),
      db.suppliers.toArray() as Promise<Supplier[]>
    ]);

    const enriched = rData.map(r => ({
      ...r,
      items: r.items.map(item => ({
        ...item,
        productName: pData.find(p => p.id === item.productId)?.nama || 'Produk Terhapus'
      })),
      productName: r.items.map(item => pData.find(p => p.id === item.productId)?.nama).join(', ') || 'Produk Terhapus', // Join all product names for search
      supplierName: sData.find(s => s.id === r.supplierId)?.nama || 'Supplier Terhapus'
    }));

    setRestocks(enriched as EnrichedRestock[]);
    setProducts(pData.filter(p => p.status === 'aktif'));
    setSuppliers(sData.filter(s => s.status === 'aktif'));
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // POS Logic
  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, cartQty: item.cartQty + 1 } : item));
    } else {
      setCart([...cart, { ...product, cartQty: 1, cartUnit: 'satuan', cartHargaBeli: product.hargaBeli, cartHargaJual: product.hargaJual }]);
    }
    showToast(`${product.nama} ditambah`, 'success');
  };

  const updateCartItem = (id: number, updates: Partial<CartItem>) => {
    setCart(cart.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const removeFromCart = (id: number) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const calculateSubtotal = (item: CartItem) => {
    const price = item.cartUnit === 'satuan' ? item.cartHargaBeli : item.cartHargaBeli / item.isiPerSatuan;
    return item.cartQty * price;
  };

  const totalCart = cart.reduce((acc, item) => acc + calculateSubtotal(item), 0);

  const handleProcessRestock = async () => {
    if (selectedSupplier === 0) {
      showToast('Pilih supplier terlebih dahulu!', 'error');
      return;
    }
    if (cart.length === 0) return;
    try {
      await db.transaction('rw', [db.products, db.restocks], async () => {
       
        const restockItems = [];
        for (const item of cart) {
          const stockChange = item.cartUnit === 'satuan' ? item.cartQty : item.cartQty / item.isiPerSatuan;
          
          // Update Product Stock, Buying Price, and Selling Price
          const p = await db.products.get(item.id!);
          if (p) {
            await db.products.update(p.id!, { 
              stokToko: p.stokToko + stockChange,
              hargaBeli: item.cartHargaBeli,
              hargaJual: item.cartHargaJual
            });
          }

          restockItems.push({
            productId: item.id!,
            qty: item.cartQty,
            unit: item.cartUnit,
            hargaBeli: item.cartHargaBeli,
            hargaJual: item.cartHargaJual,
            subtotal: calculateSubtotal(item)
          });
        }

        if (editingRestock) {
          await db.restocks.update(editingRestock.id!, {
            tanggal: new Date(), // Update date to current date for edit
            supplierId: selectedSupplier,
            total: totalCart,
            items: restockItems
          });
          showToast('Restok berhasil diperbarui!', 'success');
        } else {
          await db.restocks.add({ tanggal: new Date(), supplierId: selectedSupplier, total: totalCart, items: restockItems });
          showToast('Restok berhasil diproses!', 'success');
        }
      });

      setEditingRestock(null); // Clear editing state after successful update
      setCart([]);
      setSelectedSupplier(0);
      setSupplierSearch('');
      setShowCartModal(false);
      loadData();
        } catch {
      showToast('Gagal memproses transaksi!', 'error');
      // If an error occurs during update, consider re-applying the original restock's stock changes
    }
  };

  const handleDelete = async (id: number) => {
    const r = await db.restocks.get(id);
    if (r) {
      for (const item of r.items) {
        const p = await db.products.get(item.productId);
        if (p) {
          const change = item.unit === 'satuan' ? item.qty : item.qty / p.isiPerSatuan;
          await db.products.update(p.id!, { stokToko: p.stokToko - change });
        }
      }
      await db.restocks.delete(id);
      showToast('Restok dihapus & stok dikurangi', 'success');
      loadData();
    }
    setShowDeleteModal(null);
  };

  const startEditRestock = async (restock: EnrichedRestock) => {
    // 1. Revert stock changes from the original restock entry
    try {
      await db.transaction('rw', db.products, async () => {
        for (const item of restock.items) {
          const p = await db.products.get(item.productId);
          if (p) {
            const change = item.unit === 'satuan' ? item.qty : item.qty / p.isiPerSatuan;
            await db.products.update(p.id!, { stokToko: p.stokToko - change });
          }
        }
      });
      showToast('Stok dikembalikan untuk pengeditan.', 'success');
    } catch (error) {
      showToast('Gagal mengembalikan stok lama!', 'error');
      console.error('Error reverting stock for edit:', error);
      return; // Stop if stock reversion fails
    }

    setEditingRestock(restock);
    setView('pos');
    setSelectedSupplier(restock.supplierId);
    setSupplierSearch(restock.supplierName || '');
    setCart(restock.items.map(item => ({ ...products.find(p => p.id === item.productId)!, cartQty: item.qty, cartUnit: item.unit, cartHargaBeli: item.hargaBeli, cartHargaJual: item.hargaJual })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}

        {/* Header Controls */}
      <div className="p-3 bg-white border-b space-y-2 shadow-sm z-10">
        <div className="flex bg-stone-100 p-0.5 rounded-lg">
          <button 
            onClick={() => setView('pos')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${view === 'pos' ? 'bg-white shadow-sm text-rose-600' : 'text-stone-400'}`}
          >
            Input Restok
          </button>
          <button 
            onClick={() => setView('history')}
            className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${view === 'history' ? 'bg-white shadow-sm text-rose-600' : 'text-stone-400'}`}
          >
            Riwayat
          </button>
        </div>

        {view === 'pos' && (
          <div className="space-y-1.5">
            <div className="relative">
              <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-100 focus-within:ring-2 ring-rose-400">
                <Truck size={16} className="text-stone-400" />
                <input 
                  type="text"
                  placeholder="Pilih Supplier..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                  className="flex-1 bg-transparent text-xs font-medium outline-none"
                />
              </div>
              {showSupplierDropdown && (
                <div className="absolute z-20 w-full bg-white border border-stone-200 rounded-lg shadow-md mt-0.5 max-h-32 overflow-y-auto">
                  {suppliers
                    .filter(s => s.nama.toLowerCase().includes(supplierSearch.toLowerCase()))
                    .map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSupplier(s.id!);
                          setSupplierSearch(s.nama);
                          setShowSupplierDropdown(false);
                        }}
                        className="w-full text-left p-2 text-xs text-stone-700 hover:bg-stone-50 border-b border-stone-50 last:border-0"
                      >
                        {s.nama}
                      </button>
                    ))
                  }
                  {suppliers.filter(s => s.nama.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                    <div className="p-3 text-sm text-stone-400 italic text-center">Supplier tidak ditemukan</div>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
              <input 
                type="text" 
                placeholder="Cari produk..." 
                ref={searchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 bg-stone-50 rounded-lg text-xs outline-none border border-stone-100 focus:ring-2 ring-rose-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {view === 'pos' ? (
          <div className="grid grid-cols-2 gap-3 pb-20">
            {products
              .filter(p => p.nama.toLowerCase().includes(productSearch.toLowerCase()))
              .map(p => (
                <button 
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm text-left active:scale-95 transition-transform"
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[10px] font-bold text-stone-400 uppercase leading-none">S: {p.stokToko}</span>
                    <div className="p-0.5 bg-rose-50 text-rose-600 rounded">
                      <Plus size={12} />
                    </div>
                  </div>
                  <h4 className="text-sm font-bold text-stone-800 line-clamp-2 leading-tight h-10">{p.nama}</h4>
                  <p className="mt-1 text-xs font-extrabold text-rose-600">Rp {formatRupiah(p.hargaBeli)}</p>
                </button>
              ))
            }
          </div>
        ) : (
          <div className="space-y-2 pb-12">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
              <input type="text" placeholder="Cari riwayat..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-lg text-xs outline-none shadow-sm" />
            </div>
            {restocks
              .filter(r => 
                r.productName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                r.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(r => (
              <div key={r.id} onClick={() => setDetailRestock(r)} className="bg-white border border-stone-100 p-3 rounded-lg shadow-sm cursor-pointer active:bg-stone-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-stone-800">Batch Restok #{r.id}</h3>
                    <div className="flex items-center gap-1.5 text-[9px] text-stone-400 mt-0.5">
                      <Calendar size={10}/> {new Date(r.tanggal).toLocaleDateString('id-ID')}
                      <Truck size={10} className="ml-0.5"/> {r.supplierName}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); startEditRestock(r); }} className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><Edit3 size={12}/></button>
                    <button onClick={(e) => { e.stopPropagation(); setShowDeleteModal(r.id!); }} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><Trash2 size={12}/></button>
                  </div>
                </div>
                <div className="flex justify-between items-end pt-2 border-t border-stone-50">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-stone-400 uppercase font-bold">Items</span>
                    <span className="text-[10px] font-bold text-stone-700">{r.items.length} Macam</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-stone-400 uppercase font-bold">Total</span>
                    <p className="text-xs font-bold text-rose-600">Rp {formatRupiah(r.total)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Button */}
      {view === 'pos' && cart.length > 0 && (
        <div className="fixed bottom-4 left-3 right-3 z-50">
          <button 
            onClick={() => setShowCartModal(true)}
            className="w-full bg-stone-900 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart size={18} />
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-stone-900">
                  {cart.length}
                </span>
              </div>
              <div className="text-left">
                <p className="text-[9px] font-bold text-stone-400 uppercase leading-none mb-0.5">Total Restok</p>
                <p className="text-base font-extrabold leading-none">Rp {formatRupiah(totalCart)}</p>
              </div>
            </div>
            <div className="bg-white/20 p-1.5 rounded-full">
              <ArrowRight size={16} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal / Checkout Drawer */}
      {showCartModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end">
          <div className="bg-white w-full rounded-t-[2.5rem] max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-6 pb-2 flex justify-between items-center">
              <h3 className="text-lg font-bold text-stone-800">Review Restok</h3>
              <button onClick={() => setShowCartModal(false)} className="p-2 bg-stone-100 rounded-full text-stone-400"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-2.5 relative">
                  <button onClick={() => removeFromCart(item.id!)} className="absolute top-2 right-2 p-1 bg-stone-100 rounded-full text-stone-400 hover:text-rose-500 transition-colors">
                    <X size={12} />
                  </button>
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="text-xs font-bold text-stone-800 line-clamp-1 flex-1">{item.nama}</h4>
                    <div className="flex gap-1.5 shrink-0">
                      {(['satuan', 'pcs'] as const).map(u => (
                        <button 
                          key={u}
                          onClick={() => updateCartItem(item.id!, { cartUnit: u })}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${item.cartUnit === u ? 'bg-rose-500 text-white' : 'bg-white text-stone-400 border border-stone-100'}`}
                        >
                          {u === 'satuan' ? item.satuan : 'Pcs'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center bg-white border border-stone-200 rounded-lg p-1 shadow-sm w-fit">
                      <button 
                        onClick={() => item.cartQty > 1 ? updateCartItem(item.id!, { cartQty: item.cartQty - 1 }) : removeFromCart(item.id!)}
                        className="p-1 text-stone-400 hover:text-rose-500 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        value={item.cartQty === 0 ? '' : formatRupiah(item.cartQty)}
                        onChange={(e) => {
                          const num = parseRupiah(e.target.value);
                          updateCartItem(item.id!, { cartQty: num });
                        }}
                        onBlur={() => {
                          if (item.cartQty === 0) updateCartItem(item.id!, { cartQty: 1 });
                        }}
                        className="w-12 text-center text-xs font-bold text-stone-800 bg-transparent outline-none"
                        inputMode="numeric"
                      />
                      <button 
                        onClick={() => updateCartItem(item.id!, { cartQty: item.cartQty + 1 })}
                        className="p-1 text-stone-400 hover:text-rose-500 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-bold text-stone-400 uppercase leading-none">Subtotal</p>
                      <p className="text-[11px] font-extrabold text-rose-600">Rp {formatRupiah(calculateSubtotal(item))}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                    <div>
                      <label className="text-[8px] font-bold text-stone-400 block mb-0.5">Harga Beli Baru</label>
                      <input 
                        type="text" 
                        value={formatRupiah(item.cartHargaBeli)} 
                        onChange={(e) => updateCartItem(item.id!, { cartHargaBeli: parseRupiah(e.target.value) })}
                        className="w-full bg-white p-1 text-[15px] border border-stone-200 rounded-md outline-none focus:ring-1 ring-rose-400 font-bold text-stone-700" 
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-stone-400 block mb-0.5">Harga Jual Baru</label>
                      <input 
                        type="text" 
                        value={formatRupiah(item.cartHargaJual)} 
                        onChange={(e) => updateCartItem(item.id!, { cartHargaJual: parseRupiah(e.target.value) })}
                        className="w-full bg-white p-1 text-[15px] border border-stone-200 rounded-md outline-none focus:ring-1 ring-rose-400 font-bold text-stone-700" 
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-stone-50 border-t space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-stone-500">Grand Total</span>
                <span className="text-xl font-black text-stone-900">Rp {formatRupiah(totalCart)}</span>
              </div>
              <button 
                onClick={handleProcessRestock}
                disabled={selectedSupplier === 0}
                className="w-full py-3 bg-rose-600 disabled:bg-stone-300 text-white rounded-xl font-black text-base shadow-lg shadow-rose-200 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Simpan Restok
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Restock Modal */}
      {detailRestock && (
        <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl flex flex-col max-h-[80vh] shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-stone-800">Detail Restok #{detailRestock.id}</h3>
                <p className="text-[10px] text-stone-400">{new Date(detailRestock.tanggal).toLocaleDateString('id-ID')} • {detailRestock.supplierName}</p>
              </div>
              <button onClick={() => setDetailRestock(null)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {detailRestock.items.map((item, idx) => (
                <div key={idx} className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-xs font-bold text-stone-700">{item.productName}</h4>
                    <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-stone-100 text-stone-500 font-bold uppercase">
                      {item.qty} {item.unit === 'satuan' ? 'Pack' : 'Pcs'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <p className="text-stone-400 font-bold uppercase text-[8px]">Harga Beli</p>
                      <p className="text-stone-600 font-bold">Rp {formatRupiah(item.hargaBeli)}</p>
                    </div>
                    <div>
                      <p className="text-stone-400 font-bold uppercase text-[8px]">Harga Jual</p>
                      <p className="text-stone-600 font-bold">Rp {formatRupiah(item.hargaJual)}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-stone-200/50 flex justify-between items-center">
                    <span className="text-stone-400 font-bold uppercase text-[8px]">Subtotal</span>
                    <span className="text-xs font-black text-rose-600">Rp {formatRupiah(item.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-stone-50 border-t flex justify-between items-center rounded-b-2xl">
              <span className="text-xs font-bold text-stone-500">Total Transaksi</span>
              <span className="text-lg font-black text-stone-900">Rp {formatRupiah(detailRestock.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xs rounded-2xl p-4 shadow-xl animate-in zoom-in-95">
            <h3 className="text-base font-bold text-stone-800 mb-1.5">Hapus Riwayat?</h3>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">Stok barang akan dikurangi kembali secara otomatis. Anda yakin?</p>
            <div className="flex flex-col gap-1.5">
              <button onClick={() => handleDelete(showDeleteModal)} className="py-2.5 bg-rose-600 text-white rounded-xl font-bold text-xs">Ya, Hapus</button>
              <button onClick={() => setShowDeleteModal(null)} className="py-2.5 bg-stone-100 text-stone-600 rounded-xl font-bold text-xs">Batal</button>
            </div>
              </div>
            </div>
        )}
    </main>
  );
}