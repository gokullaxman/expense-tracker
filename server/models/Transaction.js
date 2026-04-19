const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: [true, 'User email is required'],
    trim: true,
    lowercase: true,
  },
  amount: {
    type: Number,
    required: [true, 'Please add a positive or negative number'],
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: 'Amount must be greater than 0'
    }
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: [true, 'Please specify if this is an income or expense']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [100, 'Description cannot be more than 100 characters']
  },
  category: {
    type: String,
    default: 'Other'
  },
  date: {
    type: Date,
    default: Date.now
  }
});

// Compound index: fast lookups for a user's transactions sorted by date
TransactionSchema.index({ userEmail: 1, date: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
