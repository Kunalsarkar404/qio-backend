const mongoose = require('mongoose');

/**
 * Matches mobile WalletTransaction (src/store/wallet.tsx):
 * { id, title, amount, type: credit|debit, date }
 * `date` is a display label (Today / Yesterday / Just now / 12 Jul)
 */
const transactionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    /** Optional override for seeded / display labels */
    dateLabel: { type: String, default: '' },
  },
  { timestamps: true },
);

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      default: 10000,
      min: 0,
    },
    transactions: {
      type: [transactionSchema],
      default: [],
    },
    lastMonthlyBonusDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

function formatTxnDate(createdAt, dateLabel) {
  if (dateLabel) return dateLabel;
  if (!createdAt) return '';

  const d = new Date(createdAt);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  if (ms < 5 * 60 * 1000) return 'Just now';

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday - startThat) / 86400000);

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function serializeTransaction(txn) {
  if (!txn) return null;
  const o = typeof txn.toObject === 'function' ? txn.toObject() : { ...txn };
  return {
    id: String(o._id),
    title: o.title,
    amount: o.amount,
    type: o.type,
    date: formatTxnDate(o.createdAt, o.dateLabel),
  };
}

function serializeWallet(wallet) {
  const txns = (wallet.transactions || [])
    .slice()
    .reverse()
    .slice(0, 50)
    .map(serializeTransaction);

  return {
    balance: wallet.balance,
    transactions: txns,
  };
}

module.exports = mongoose.model('Wallet', walletSchema);
module.exports.serializeWallet = serializeWallet;
module.exports.serializeTransaction = serializeTransaction;
module.exports.formatTxnDate = formatTxnDate;
