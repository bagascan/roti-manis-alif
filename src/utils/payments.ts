import type { PaymentRecord, Transaction } from '../db';

export type { PaymentRecord };

type PayableTransaction = Pick<Transaction, 'tanggal' | 'total' | 'bayar' | 'payments'>;

/**
 * Mengembalikan riwayat pembayaran sebuah transaksi, selalu terurut dari yang pertama.
 *
 * Transaksi lama (sebelum fitur ini ada) tidak punya array `payments`, hanya angka
 * `bayar` yang sudah representsi. Untuk data seperti itu kita synthesise satu baris
 * dari tanggal transaksi agar nota tetap menampilkan riwayat yang masuk akal.
 */
export function getPaymentHistory(transaction: PayableTransaction): PaymentRecord[] {
  const total = transaction.total || 0;
  const bayar = transaction.bayar || 0;

  if (transaction.payments && transaction.payments.length > 0) {
    return [...transaction.payments]
      .filter(p => p && typeof p.jumlah === 'number')
      .map(p => ({
        tanggal: p.tanggal ? new Date(p.tanggal) : transaction.tanggal,
        jumlah: p.jumlah,
        sisa: p.sisa ?? 0
      }))
      .sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());
  }

  if (bayar <= 0) return [];

  return [
    {
      tanggal: transaction.tanggal,
      jumlah: Math.min(bayar, total),
      sisa: Math.max(0, total - bayar)
    }
  ];
}

/** Sisa hutang yang belum dibayar. */
export function getRemainingDebt(transaction: PayableTransaction): number {
  return Math.max(0, (transaction.total || 0) - (transaction.bayar || 0));
}

/**
 * Membentuk array `payments` untuk transaksi baru. Baris pertama berisi pembayaran
 * saat transaksi dibuat, `sisa` adalah sisa hutang setelah pembayaran tersebut.
 */
export function buildInitialPayments(
  tanggal: Date,
  total: number,
  bayar: number
): PaymentRecord[] {
  if (bayar <= 0) return [];

  const capped = Math.min(bayar, total);
  return [
    {
      tanggal,
      jumlah: capped,
      sisa: Math.max(0, total - capped)
    }
  ];
}

/**
 * Menyinkronkan ledger saat transaksi diedit (total / item / pembayaran awal berubah).
 *
 * Cicilan yang sudah tercatat (entri ke-2 dan seterusnya) tetap dijaga tanggal dan
 * nominalnya, hanya pembayaran awal yang disesuaikan dengan nilai `bayar` baru,
 * lalu `sisa` semua entri dihitung ulang dari akumulasi.
 */
export function syncPayments(
  existing: PaymentRecord[] | undefined,
  tanggal: Date,
  total: number,
  initialBayar: number
): PaymentRecord[] {
  const installments = existing && existing.length > 1
    ? existing.slice(1).map(p => ({ tanggal: new Date(p.tanggal), jumlah: p.jumlah }))
    : [];

  const rows: Array<Omit<PaymentRecord, 'sisa'>> = [];
  if (initialBayar > 0) {
    rows.push({ tanggal: existing?.[0]?.tanggal ? new Date(existing[0].tanggal) : tanggal, jumlah: Math.min(initialBayar, total) });
  }
  rows.push(...installments);

  let cumulative = 0;
  return rows.map(row => {
    cumulative += row.jumlah;
    return {
      tanggal: row.tanggal,
      jumlah: row.jumlah,
      sisa: Math.max(0, total - cumulative)
    };
  });
}
