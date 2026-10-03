/**
 * Helper untuk memformat struk belanja printer thermal (58mm / 32 Karakter)
 */
import { formatRupiah } from '../utils/formatters';
import { getPaymentHistory, getRemainingDebt, type PaymentRecord } from '../utils/payments';

const MAX_CHAR = 32;

interface ReceiptItem {
  productName?: string;
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
  status: 'lunas' | 'belum_lunas';
  total: number;
  bayar: number;
  payments?: PaymentRecord[];
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
  generateFullReceipt: (transaction: Transaction, storeName: string = "ROTI MANIS ARIF") => {
    const date = new Date(transaction.tanggal).toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const res: string[] = [];
    res.push(receiptHelper.center(storeName));
    
    const address = localStorage.getItem('store_address');
    if (address) {
      res.push(receiptHelper.center(address.substring(0, MAX_CHAR)));
    }
    const phone = localStorage.getItem('store_phone');
    if (phone) {
      res.push(receiptHelper.center(phone));
    }

    res.push(receiptHelper.divider);
    res.push(receiptHelper.justify("Tgl:", date));
    res.push(receiptHelper.justify("Plg:", transaction.customerName || "Umum"));
    res.push(receiptHelper.divider);

    const sales = transaction.items.filter(item => item.subtotal >= 0);
    const returns = transaction.items.filter(item => item.subtotal < 0);

    const addItemLine = (item: ReceiptItem) => {
      res.push((item.productName || "Produk").substring(0, MAX_CHAR)); // Ensure product name fits within MAX_CHAR
      const detail = `${item.qty} ${item.unit === 'satuan' ? 'Pack' : 'Pcs'} x ${formatRupiah(item.harga)}`;
      const subtotal = (item.subtotal < 0 ? "-" : "") + formatRupiah(Math.abs(item.subtotal));
      res.push(receiptHelper.justify(detail, subtotal));
    };

    // Tampilkan barang penjualan
    if (sales.length > 0) {
      res.push("PEMBELIAN");
      sales.forEach(addItemLine);
    }

    // Jika ada retur, beri garis pemisah lalu tampilkan barang retur
    if (returns.length > 0) {
      res.push(receiptHelper.divider);
      res.push("RETUR");
      returns.forEach(addItemLine);
    }

    res.push(receiptHelper.divider);

    const totalSales = sales.reduce((acc, item) => acc + item.subtotal, 0);
    const totalReturns = returns.reduce((acc, item) => acc + Math.abs(item.subtotal), 0);

    if (totalSales > 0 && totalReturns > 0) {
      res.push(receiptHelper.justify("TOT. PEMBELIAN:", `Rp ${formatRupiah(totalSales)}`));
      res.push(receiptHelper.justify("TOT. RETUR:", `-Rp ${formatRupiah(totalReturns)}`));
    }

    res.push(receiptHelper.justify("TOTAL:", `Rp ${formatRupiah(transaction.total)}`));

    if (transaction.bayar > transaction.total) {
      const kembalian = transaction.bayar - transaction.total;
      res.push(receiptHelper.justify("KEMBALI:", `Rp ${formatRupiah(kembalian)}`));
    }

    const paymentHistory = getPaymentHistory(transaction);
    const remainingDebt = getRemainingDebt(transaction);

    if (paymentHistory.length > 0) {
      res.push(receiptHelper.divider);
      res.push(receiptHelper.center(`RIWAYAT BAYAR (${paymentHistory.length}x)`));

      paymentHistory.forEach((payment, idx) => {
        const isLast = idx === paymentHistory.length - 1;
        const isPaidOff = isLast && payment.sisa <= 0;
        const tgl = new Date(payment.tanggal).toLocaleDateString("id-ID", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        res.push(receiptHelper.justify(`#${idx + 1} ${tgl}`, `Rp ${formatRupiah(payment.jumlah)}`));
        res.push(
          receiptHelper.justify(
            isPaidOff ? "Status" : `Sisa stlh ke-${idx + 1}`,
            isPaidOff ? "LUNAS" : `-Rp ${formatRupiah(payment.sisa)}`
          )
        );
      });

      res.push(receiptHelper.divider);
      res.push(receiptHelper.justify("TOTAL BAYAR:", `Rp ${formatRupiah(transaction.bayar)}`));
      if (remainingDebt > 0) {
        res.push(receiptHelper.justify("SISA HUTANG:", `Rp ${formatRupiah(remainingDebt)}`));
      }
    } else if (transaction.status === 'belum_lunas') {
      res.push(receiptHelper.justify("KURANG:", `- Rp ${formatRupiah(remainingDebt)}`));
    }

    res.push("");
    const footer = localStorage.getItem('receipt_footer') || "Terima Kasih Atas\nKunjungan Anda";
    footer.split('\n').forEach(line => {
      if (line.trim()) res.push(receiptHelper.center(line.trim()));
    });
    
    return res.join("\n");
  }
};