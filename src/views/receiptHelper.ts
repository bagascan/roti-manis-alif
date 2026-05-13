/**
 * Helper untuk memformat struk belanja printer thermal (58mm / 32 Karakter)
 */
import { formatRupiah } from '../utils/formatters';

const MAX_CHAR = 32;

interface ReceiptItem {
  productName: string;
  qty: number;
  unit: 'satuan' | string;
  harga: number;
  subtotal: number;
}

interface Transaction {
  tanggal: string | number | Date;
  customerName?: string;
  tipe: string;
  items: ReceiptItem[];
  total: number;
}

export const receiptHelper = {
  // Membuat garis pemisah
  divider: "-".repeat(MAX_CHAR),

  // Membuat teks rata tengah
  center: (text: string) => {
    const padding = Math.max(0, Math.floor((MAX_CHAR - text.length) / 2));
    return " ".repeat(padding) + text;
  },

  // Membuat format kiri-kanan (misal: Nama Barang ... Harga)
  justify: (left: string, right: string) => {
    const spaceNeeded = MAX_CHAR - (left.length + right.length);
    return left + " ".repeat(Math.max(1, spaceNeeded)) + right;
  },

  // Template Utama Struk
  generateFullReceipt: (transaction: Transaction, storeName: string = "ROTI MANIS ALIF") => {
    const date = new Date(transaction.tanggal).toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const res: string[] = [];
    res.push(receiptHelper.center(storeName));
    res.push(receiptHelper.divider);
    res.push(receiptHelper.justify("Tgl:", date));
    res.push(receiptHelper.justify("Plg:", transaction.customerName || "Umum"));
    res.push(receiptHelper.divider);

    const sales = transaction.items.filter(item => item.subtotal >= 0);
    const returns = transaction.items.filter(item => item.subtotal < 0);

    const addItemLine = (item: ReceiptItem) => {
      res.push(item.productName.substring(0, MAX_CHAR)); // Ensure product name fits within MAX_CHAR
      const detail = `${item.qty} ${item.unit === 'satuan' ? 'Pack' : 'Pcs'} x ${formatRupiah(item.harga)}`;
      const subtotal = (item.subtotal < 0 ? "-" : "") + formatRupiah(Math.abs(item.subtotal));
      res.push(receiptHelper.justify(detail, subtotal));
    };

    // Tampilkan barang penjualan
    if (sales.length > 0) {
      res.push("PENJUALAN");
      sales.forEach(addItemLine);
    }

    // Jika ada retur, beri garis pemisah lalu tampilkan barang retur
    if (returns.length > 0) {
      res.push(receiptHelper.divider);
      res.push("RETUR");
      returns.forEach(addItemLine);
    }

    res.push(receiptHelper.divider);
    res.push(receiptHelper.justify("TOTAL:", `Rp ${formatRupiah(transaction.total)}`));
    res.push("");
    res.push(receiptHelper.center("Terima Kasih Atas"));
    res.push(receiptHelper.center("Kunjungan Anda"));
    
    return res.join("\n");
  }
};