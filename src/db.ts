import Dexie, { type Table } from 'dexie';

export interface Product {
  id?: number;
  nama: string;
  hargaBeli: number;
  hargaJual: number;
  stokToko: number;
  stokRetur: number;
  satuan: string; // Contoh: "Pack"
  isiPerSatuan: number; // Contoh: 10 (artinya 1 pack isi 10 pcs)
  kategori: string;
  status: 'aktif' | 'nonaktif';
  supplierId?: number;
}

export interface Supplier {
  id?: number;
  nama: string;
  telepon: string;
  alamat: string;
  status: 'aktif' | 'nonaktif';
}

export interface Customer {
  id?: number;
  nama: string;
  maps: string;
  telepon: string;
  status: 'aktif' | 'nonaktif';
  hutang: number;
}

export interface Transaction {
  id?: number;
  tanggal: Date;
  customerId?: number;
  tipe: 'penjualan' | 'retur';
  total: number;
  bayar: number;
  status: 'lunas' | 'belum_lunas';
  // unit: 'satuan' merujuk pada Pack, 'pcs' merujuk pada bijian
  items: { productId: number; qty: number; unit: 'satuan' | 'pcs'; harga: number; hargaBeli: number; subtotal: number }[];
}

export interface Restock {
  id?: number;
  tanggal: Date;
  supplierId: number;
  total: number;
  items: { productId: number; qty: number; unit: 'satuan' | 'pcs'; hargaBeli: number; hargaJual: number; subtotal: number }[];
}

export interface Expense {
  id?: number;
  tanggal: Date;
  kategori: string;
  keterangan: string;
  nominal: number;
  tipe: 'pemasukkan' | 'pengeluaran';
}

export interface Adjustment {
  id?: number;
  tanggal: Date;
  productId: number;
  tipeStok: 'stokToko' | 'stokRetur';
  qtySebelum: number;
  qtySesudah: number;
  selisih: number;
  keterangan: string;
}

export class AlifDatabase extends Dexie {
  products!: Table<Product>;
  customers!: Table<Customer>;
  suppliers!: Table<Supplier>;
  restocks!: Table<Restock>;
  expenses!: Table<Expense>;
  adjustments!: Table<Adjustment>;
  transactions!: Table<Transaction>;

  constructor() {
    super('AlifBakeryDB');
    this.version(19).stores({
      products: '++id, nama, kategori, supplierId, status',
      customers: '++id, nama, telepon, status, hutang',
      suppliers: '++id, nama, telepon, status',
      restocks: '++id, tanggal, supplierId',
      expenses: '++id, tanggal, kategori, tipe',
      adjustments: '++id, tanggal, productId',
      transactions: '++id, tanggal, customerId, tipe, status',
    });
  }
}

export const db = new AlifDatabase();