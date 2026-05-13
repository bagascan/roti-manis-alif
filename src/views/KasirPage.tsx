import { useState, useEffect, useRef } from 'react';
import { db, type Transaction, type Product, type Customer } from '../db';
import { ReceiptModal, type EnrichedTransaction } from './HistoryPage';
import { 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  ShoppingCart, 
  Plus,
  Minus,
  X,
  ArrowRight,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { formatRupiah, parseRupiah } from '../utils/formatters';

interface CartItem extends Product {
  cartQty: number;
  cartUnit: 'satuan' | 'pcs';
  cartHargaJual: number;
  itemMode: 'penjualan' | 'retur'; // Menambahkan properti itemMode
}

interface KasirProps {
  editData?: EnrichedTransaction | null;
  onFinished?: () => void;
}

export default function KasirPage({ editData, onFinished }: KasirProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Kasir State
  const [mode, setMode] = useState<'penjualan' | 'retur'>('penjualan');
  const [selectedCustomer, setSelectedCustomer] = useState<number>(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<EnrichedTransaction | null>(null);
  const [jumlahBayar, setJumlahBayar] = useState<number>(0);
  
  // UI State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const calculateItemAmount = (item: CartItem) => {
    return item.cartQty * item.cartHargaJual;
  };

  const totalPenjualanAmount = cart.reduce((acc, item) => acc + (item.itemMode === 'penjualan' ? calculateItemAmount(item) : 0), 0);
  const totalReturAmount = cart.reduce((acc, item) => acc + (item.itemMode === 'retur' ? calculateItemAmount(item) : 0), 0);
  const totalCart = totalPenjualanAmount - totalReturAmount; // Net Grand Total
    // Validasi global untuk memastikan tidak ada harga jual di bawah modal di seluruh keranjang
  const isCartInvalid = cart.some(item => {
    const minPrice = item.cartUnit === 'satuan' ? item.hargaBeli : Math.ceil(item.hargaBeli / item.isiPerSatuan);
    return item.cartHargaJual < minPrice;
  });
  const isPaymentInvalid = totalCart > 0 && jumlahBayar <= 0;
  useEffect(() => {
    loadData();
    if (editData) {
      setMode(editData.tipe);
      setSelectedCustomer(editData.customerId || 0);
      setCustomerSearch(editData.customerName || '');
      // Mapping items from transaction to cart
      const loadCart = async () => {
        const allProducts = await db.products.toArray();
        const items: CartItem[] = editData.items.map(item => {
          const p = allProducts.find(prod => prod.id === item.productId);
          return {
            ...p!,
            cartQty: item.qty,
            cartUnit: item.unit,
            cartHargaJual: item.harga,
            itemMode: (item.subtotal < 0 ? 'retur' : 'penjualan') as 'penjualan' | 'retur'
          };
        });
        setCart(items);
        setJumlahBayar(editData.bayar);
      };
      loadCart();
    }
  }, [editData]);

  useEffect(() => {
     if (showCartModal && !editData) setJumlahBayar(totalCart);
  }, [showCartModal, totalCart, editData]);


  const loadData = async () => {
    const [pData, cData] = await Promise.all([
      db.products.where('status').equals('aktif').toArray(),
      db.customers.where('status').equals('aktif').toArray()
    ]);
    setProducts(pData);
    setCustomers(cData);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id && item.itemMode === mode);
    if (existing) {
      setCart(cart.map(item => (item.id === product.id && item.itemMode === mode) ? { ...item, cartQty: item.cartQty + 1 } : item));
    } else {
      setCart([...cart, { ...product, cartQty: 1, cartUnit: 'satuan', cartHargaJual: product.hargaJual, itemMode: mode }]);
    }
    showToast(`${product.nama} masuk keranjang`, 'success');
  };

  const updateCartItem = (id: number, itemMode: 'penjualan' | 'retur', updates: Partial<CartItem>) => {
    setCart(cart.map(item => (item.id === id && item.itemMode === itemMode) ? { ...item, ...updates } : item));
  };

  const removeFromCart = (id: number, itemMode: 'penjualan' | 'retur') => {
    setCart(cart.filter(item => !(item.id === id && item.itemMode === itemMode)));
  };

  const resetKasir = () => {
    setCart([]);
    setSelectedCustomer(0);
    setCustomerSearch('');
    setJumlahBayar(0);
    setProductSearch('');
    setShowCartModal(false);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || isCartInvalid || isPaymentInvalid) return;
    try {
      const status = jumlahBayar >= totalCart ? 'lunas' : 'belum_lunas';
      
      if (status === 'belum_lunas') {
        if (!selectedCustomer) {
          showToast('Pilih pelanggan untuk transaksi belum lunas!', 'error');
          return;
        }
      }

      await db.transaction('rw', [db.products, db.transactions, db.customers], async () => {
        const allProducts = await db.products.toArray();
        const transactionItems = [];
        for (const item of cart) {
          const stockChange = item.cartUnit === 'satuan' ? item.cartQty : item.cartQty / item.isiPerSatuan;
          const p = await db.products.get(item.id!);
          
          if (p) {
            if (mode === 'penjualan') {
              await db.products.update(p.id!, { stokToko: p.stokToko - stockChange });
            } else {
              await db.products.update(p.id!, { stokRetur: p.stokRetur + stockChange });
            }
          }

          transactionItems.push({
            productId: item.id!,
            qty: item.cartQty, // Menggunakan cartQty
            unit: item.cartUnit,
            harga: item.cartHargaJual,
            hargaBeli: item.hargaBeli,
            subtotal: calculateItemAmount(item) * (item.itemMode === 'retur' ? -1 : 1) // Subtotal di DB tetap dengan tanda
          });
        }

        const payload: Transaction = {
          tanggal: new Date(),
          customerId: selectedCustomer || undefined,
          tipe: mode,
          total: totalCart,
          bayar: jumlahBayar,
          status: status,
          items: transactionItems
        };

        if (selectedCustomer && status === 'belum_lunas') {
          const cust = await db.customers.get(selectedCustomer);
          if (cust) {
            await db.customers.update(selectedCustomer, { hutang: (cust.hutang || 0) + (totalCart - jumlahBayar) });
          }
        }

         const enrichedItems = transactionItems.map(item => ({
          ...item,
          productName: allProducts.find(p => p.id === item.productId)?.nama || 'Produk'
        }));

        const enriched: EnrichedTransaction = {
          ...payload,
          customerName: customerSearch || 'Umum',
          items: enrichedItems
        };

        if (editData?.id) {
          // Untuk update seluruh objek, gunakan put dengan id yang sudah ada
          await db.transactions.put({ ...payload, id: editData.id });
          showToast('Transaksi berhasil diperbarui!', 'success');
        } else {
          const newId = await db.transactions.add(payload);
          enriched.id = newId as number;
         showToast('Transaksi berhasil disimpan!', 'success');
        }
      // ALUR AUTO-PRINT
        const printerAddr = localStorage.getItem('printer_address');
        if (printerAddr) {
          showToast(`Mencetak Nota ke ${printerAddr}...`, 'success');
          resetKasir();
          if (onFinished) onFinished();
        } else {
          setReceiptData(enriched);
          setShowReceiptModal(true);
        }
      });

      loadData();
    } catch {
      showToast('Gagal memproses transaksi!', 'error');
    }
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-stone-50">
      {toast && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-xl animate-bounce ${toast.type === 'success' ? 'bg-stone-800 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-bold">{toast.message}</span>
        </div>
      )}

      {/* Header POS */}
      <div className="p-3 bg-white border-b space-y-2 shadow-sm z-10">
        <div className="flex gap-2">
          <button 
            onClick={() => setMode('penjualan')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${mode === 'penjualan' ? 'bg-green-600 border-green-600 text-white shadow-md' : 'bg-white border-stone-100 text-stone-400'}`}
          >
            PENJUALAN
          </button>
          <button 
            onClick={() => setMode('retur')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg border-2 transition-all ${mode === 'retur' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-stone-100 text-stone-400'}`}
          >
            <RotateCcw size={12} className="inline mr-1" /> MODE RETUR
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="relative">
            <div className="flex items-center gap-2 bg-stone-50 p-2 rounded-xl border border-stone-100 focus-within:ring-2 ring-amber-400">
              <User size={16} className="text-stone-400" />
              <input 
                type="text"
                placeholder="Cari Pelanggan..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                className="flex-1 bg-transparent text-sm font-medium outline-none"
              />
            </div>
            {showCustomerDropdown && (
              <div className="absolute z-20 w-full bg-white border border-stone-200 rounded-lg shadow-md mt-0.5 max-h-32 overflow-y-auto">
                <button onClick={() => { setSelectedCustomer(0); setCustomerSearch('Umum'); setShowCustomerDropdown(false); }} className="w-full text-left p-2 text-xs text-stone-700 hover:bg-stone-50 border-b border-stone-50">Umum</button>
                {customers.filter(c => c.nama.toLowerCase().includes(customerSearch.toLowerCase())).map(c => (
                  <button key={c.id} onClick={() => { setSelectedCustomer(c.id!); setCustomerSearch(c.nama); setShowCustomerDropdown(false); }} className="w-full text-left p-2 text-xs text-stone-700 hover:bg-stone-50 border-b border-stone-50 last:border-0">{c.nama}</button>
                ))}
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
              className="w-full pl-8 pr-2 py-1.5 bg-stone-50 rounded-lg text-sm outline-none border border-stone-100 focus:ring-2 ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 pb-20">
          {products
            .filter(p => p.nama.toLowerCase().includes(productSearch.toLowerCase()))
            .map(p => (
              <button 
                key={p.id}
                onClick={() => addToCart(p)}
                className={`bg-white p-2.5 rounded-xl border shadow-sm text-left active:scale-95 transition-transform ${mode === 'retur' ? 'border-blue-400 ring-1 ring-blue-50' : 'border-stone-100'}`}
              >
                {mode === 'penjualan' && (
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[10px] font-bold text-stone-400 uppercase leading-none">S: {formatRupiah(p.stokToko)}</span>
                    <div className="p-0.5 bg-green-50 text-green-600 rounded">
                      <Plus size={12} />
                    </div>
                  </div>
                )}
                {mode === 'retur' && (
                  <div className="flex justify-end mb-1.5">
                    <div className="p-0.5 bg-blue-50 text-blue-600 rounded">
                      <RotateCcw size={12} />
                    </div>
                  </div>
                )}
                <h4 className="text-sm font-bold text-stone-800 line-clamp-2 leading-tight h-10">{p.nama}</h4>
                <p className={`mt-1 text-xs font-extrabold ${mode === 'retur' ? 'text-blue-600' : 'text-green-600'}`}>Rp {formatRupiah(p.hargaJual)}</p>
              </button>
            ))
          }
        </div>
      </div>

      {/* Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-3 right-3 z-50">
          <button 
            onClick={() => setShowCartModal(true)}
            className={`w-full p-3 rounded-2xl shadow-xl flex items-center justify-between active:scale-95 transition-transform ${mode === 'retur' ? 'bg-blue-900 text-white' : 'bg-stone-900 text-white'}`}
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart size={18} />
                <span className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-stone-900">
                  {cart.length}
                </span>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-stone-400 uppercase leading-none mb-0.5">{mode === 'retur' ? 'Total Refund' : 'Total Belanja'}</p>
                <p className="text-lg font-extrabold leading-none">Rp {formatRupiah(totalCart)}</p>
              </div>
            </div>
            <div className="bg-white/20 p-1.5 rounded-full">
              <ArrowRight size={16} />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal / Review Drawer */}
      {showCartModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-4 pb-1.5 flex justify-between items-center border-b">
              <div>
                <h3 className="text-lg font-bold text-stone-800">Review {mode === 'retur' ? 'Retur' : 'Pesanan'}</h3>
                <p className="text-xs text-stone-400 font-bold uppercase">{customerSearch || 'Umum'}</p>
              </div>
              <button onClick={() => setShowCartModal(false)} className="p-1.5 bg-stone-100 rounded-full text-stone-400"><X size={16} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.map(item => (
                <div key={`${item.id}-${item.itemMode}`} className={`flex flex-col bg-stone-50 p-3 rounded-xl space-y-2.5 relative ${item.itemMode === 'retur' ? 'border border-red-400' : 'border border-green-400'}`}>
                  <button onClick={() => removeFromCart(item.id!, item.itemMode)} className="absolute top-0.5 right-2 p-1 bg-stone-100 rounded-full text-rose-500 hover:text-rose-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col flex-1">
                      <span className={`text-[10px] font-bold uppercase leading-none mb-1 ${item.itemMode === 'retur' ? 'text-rose-500' : 'text-green-600'}`}>
                        {item.itemMode === 'retur' ? 'Barang Retur' : 'Penjualan'}
                      </span>
                      <h4 className="text-sm font-bold text-stone-800 line-clamp-1">{item.nama}</h4>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {(['satuan', 'pcs'] as const).map(u => (
                        <button 
                          key={u}
                          onClick={() => {
                            if (item.cartUnit === u) return;
                            // Reset ke harga katalog produk saat pindah unit agar tidak membawa 
                            // kesalahan input atau koreksi modal ke unit yang baru.
                            const newPrice = u === 'pcs' 
                              ? Math.round(item.hargaJual / item.isiPerSatuan)
                              : item.hargaJual;

                            updateCartItem(item.id!, item.itemMode, { 
                              cartUnit: u, 
                              cartHargaJual: newPrice
                            });
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${item.cartUnit === u ? (mode === 'retur' ? 'bg-blue-500 text-white' : 'bg-green-600 text-white') : 'bg-white text-stone-400 border border-stone-100'}`}
                        >
                          {u === 'satuan' ? item.satuan : 'Pcs'}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center bg-white border border-stone-200 rounded-lg p-1 shadow-sm w-fit">
                      <button 
                        onClick={() => item.cartQty > 1 ? updateCartItem(item.id!, item.itemMode, { cartQty: item.cartQty - 1 }) : removeFromCart(item.id!, item.itemMode)}
                        className="p-1 text-stone-400 hover:text-rose-500 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        value={item.cartQty === 0 ? '' : formatRupiah(item.cartQty)}
                        onChange={(e) => updateCartItem(item.id!, item.itemMode, { cartQty: parseRupiah(e.target.value) })}
                        onBlur={() => { if (item.cartQty === 0) updateCartItem(item.id!, item.itemMode, { cartQty: 1 }); }}
                        className="w-12 text-center text-sm font-bold text-stone-800 bg-transparent outline-none"
                        inputMode="numeric"
                      />
                      <button 
                        onClick={() => updateCartItem(item.id!, item.itemMode, { cartQty: item.cartQty + 1 })}
                        className="p-1 text-stone-400 hover:text-green-600 transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-stone-400 uppercase leading-none">Subtotal</p>
                      <p className={`text-xs font-extrabold ${item.itemMode === 'retur' ? 'text-red-600' : 'text-green-600'}`}>Rp {formatRupiah(calculateItemAmount(item) * (item.itemMode === 'retur' ? -1 : 1))}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100">
                    {(() => {
                      const minPrice = item.cartUnit === 'satuan' ? item.hargaBeli : Math.ceil(item.hargaBeli / item.isiPerSatuan);
                      const isLowPrice = item.cartHargaJual < minPrice;
                      return (
                        <>
                          <label className={`text-[10px] font-bold block mb-0.5 transition-colors ${isLowPrice ? 'text-rose-500 animate-pulse' : 'text-stone-400'}`}>
                            Harga Jual {isLowPrice && `(Minimal Modal Rp ${formatRupiah(minPrice)})`}
                          </label>
                          <input 
                            type="text" 
                            value={formatRupiah(item.cartHargaJual)} 
                            onChange={(e) => updateCartItem(item.id!, item.itemMode, { cartHargaJual: parseRupiah(e.target.value) })}
                            onBlur={() => {
                              if (isLowPrice) {
                                showToast(`Harga ditingkatkan ke modal Rp ${formatRupiah(minPrice)}`, 'error');
                                updateCartItem(item.id!, item.itemMode, { cartHargaJual: minPrice });
                              }
                            }}
                            className={`w-full bg-white p-1 text-base border rounded-md outline-none focus:ring-1 font-bold text-stone-700 transition-all ${
                              isLowPrice ? 'border-rose-400 ring-rose-500 bg-rose-50' : 'border-stone-200 ring-amber-400'
                            }`}
                            inputMode="numeric"
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-stone-50 border-t space-y-2">
              <div className="bg-white p-3 rounded-xl border border-stone-200 mb-2">
                <label className="text-[10px] font-bold text-stone-400 block mb-1 uppercase">Jumlah Bayar Sekarang (Rp)</label>
                <input 
                  type="text" 
                  value={formatRupiah(jumlahBayar)} 
                  onChange={(e) => setJumlahBayar(parseRupiah(e.target.value))}
                  className="w-full text-xl font-black text-green-600 outline-none" 
                  inputMode="numeric"
                />
              </div>

              {totalPenjualanAmount > 0 && (
                <div className="flex justify-between items-center text-base">
                  <span className="text-stone-500">Total Penjualan</span>
                  <span className="font-bold text-green-600">Rp {formatRupiah(totalPenjualanAmount)}</span>
                </div>
              )}
              {totalReturAmount > 0 && (
                <div className="flex justify-between items-center text-base">
                  <span className="text-stone-500">Total Retur</span>
                  <span className="font-bold text-red-600">Rp {formatRupiah(totalReturAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-stone-200">
                <span className="text-stone-500 font-medium">Net Grand Total</span>
                <span className="text-2xl font-black text-stone-900">Rp {formatRupiah(totalCart)}</span>
              </div>
              <button 
                onClick={handleCheckout} // Tombol ini hanya akan muncul jika valid
                className={`w-full py-3 text-white rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${mode === 'retur' ? 'bg-blue-600 shadow-blue-200' : 'bg-green-600 shadow-green-200'}`}
              >
                <CheckCircle2 size={18} />
                Simpan Transaksi
              </button>
              {(isCartInvalid || isPaymentInvalid) && (
                <div className="w-full py-3 bg-stone-300 text-stone-600 rounded-xl font-black text-lg shadow-none flex items-center justify-center gap-2 cursor-not-allowed">
                  <AlertCircle size={18} />
                  {isCartInvalid ? 'Harga di Bawah Modal' : 'Jumlah Bayar Tidak Valid'}
                </div>
              )}
              {cart.length === 0 && (
                <div className="w-full py-3 bg-stone-300 text-stone-600 rounded-xl font-black text-lg shadow-none flex items-center justify-center gap-2 cursor-not-allowed">
                  <ShoppingCart size={18} />
                  Keranjang Kosong
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nota Otomatis */}
      {showReceiptModal && receiptData && (
        <ReceiptModal 
          transaction={receiptData}
          onClose={() => {
            setShowReceiptModal(false);
            resetKasir();
            if (onFinished) onFinished();
          }}
          onPrint={(t) => showToast(`Mencetak Nota #${t.id}...`, 'success')}
        />
      )}

    </main>
  );
}