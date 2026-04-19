const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resolveUserEmail = (req) => {
  const raw = req.header('x-user-email') || req.body?.userEmail || req.query?.userEmail || '';
  const email = String(raw).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return 'guest@pricepulse.local';
  return email;
};

// @route   GET /api/transactions
// @desc    Get all transactions
router.get('/', async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const transactions = await Transaction.find({ userEmail }).sort({ date: -1 });
    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// @route   POST /api/transactions
// @desc    Add a transaction
router.post('/', async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const { amount, type, description, category } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Please provide a valid amount greater than 0' });
    }
    
    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid type (income/expense)' });
    }

    const transaction = await Transaction.create({
      amount,
      type,
      description,
      category,
      userEmail
    });

    return res.status(201).json({
      success: true,
      data: transaction
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    } else {
      console.error(`Error: ${err.message}`);
      return res.status(500).json({
        success: false,
        error: 'Server Error'
      });
    }
  }
});

// @route   DELETE /api/transactions/:id
// @desc    Delete a transaction
router.delete('/:id', async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    const transaction = await Transaction.findOne({ _id: req.params.id, userEmail });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'No transaction found'
      });
    }

    await transaction.deleteOne();

    return res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        error: 'No transaction found (Invalid ID)'
      });
    }
    console.error(`Error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

// @route   DELETE /api/transactions
// @desc    Delete all transactions (bonus)
router.delete('/', async (req, res) => {
  try {
    const userEmail = resolveUserEmail(req);
    await Transaction.deleteMany({ userEmail });
    return res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
});

module.exports = router;
