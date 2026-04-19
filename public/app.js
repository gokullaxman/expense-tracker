const balance = document.getElementById('balance');
const money_plus = document.getElementById('money-plus');
const money_minus = document.getElementById('money-minus');
const list = document.getElementById('list');
const form = document.getElementById('form');
const desc = document.getElementById('desc');
const amount = document.getElementById('amount');
const type = document.getElementById('type');
const category = document.getElementById('category');
const errorMsg = document.getElementById('error-msg');
const clearAllBtn = document.getElementById('clearAllBtn');

let transactions = [];
let pieChartInstance = null;
let barChartInstance = null;
let trendChartInstance = null;
let cashflowChartInstance = null;

// Track error timeout IDs to debounce/cancel stacked timeouts
let errorTimeoutId = null;

// ─── INIT ICONS ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Single global icon pass at startup
  lucide.createIcons();
});

// ─── CHART.JS DEFAULTS ─────────────────────────────────────────
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#71717A';
Chart.defaults.animation.duration = 250; // snappier chart transitions

// ─── FORMATTERS ────────────────────────────────────────────────
const formatMoney = (number) => {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(number);
};

const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-IN', options);
};

// ─── SHOW ERROR (debounced) ─────────────────────────────────────
function showError(msg, duration = 3000) {
  errorMsg.innerText = msg;
  if (errorTimeoutId) clearTimeout(errorTimeoutId);
  if (duration > 0) {
    errorTimeoutId = setTimeout(() => {
      errorMsg.innerText = '';
      errorTimeoutId = null;
    }, duration);
  }
}

// ─── FETCH TRANSACTIONS ─────────────────────────────────────────
async function getTransactions() {
  try {
    // Render from cache immediately for perceived speed
    const cachedTransactions = localStorage.getItem('transactions');
    if (cachedTransactions) {
      transactions = JSON.parse(cachedTransactions);
      init();
    }

    const res = await fetch('/api/transactions');
    const data = await res.json();

    if (data.success) {
      transactions = data.data;
      localStorage.setItem('transactions', JSON.stringify(transactions));
      init();
    }
  } catch (err) {
    console.error('Error fetching transactions:', err);
    showError('Unable to fetch data from the server. Using cached data if available.', 0);
  }
}

// ─── ADD TRANSACTION ───────────────────────────────────────────
async function addTransaction(e) {
  e.preventDefault();

  if (desc.value.trim() === '' || amount.value.trim() === '') {
    showError('Please provide a valid description and amount');
    return;
  }

  const transactionData = {
    description: desc.value,
    amount: +amount.value,
    type: type.value,
    category: category.value
  };

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionData)
    });

    const data = await res.json();

    if (data.success) {
      transactions.unshift(data.data);
      localStorage.setItem('transactions', JSON.stringify(transactions));
      desc.value = '';
      amount.value = '';
      type.value = 'expense';
      category.value = 'Other';
      showError('', 0); // clear error immediately
      // Optimistic DOM: prepend just the new item instead of full rebuild
      prependTransactionDOM(data.data);
      updateValues();
      updateCharts();
    } else {
      showError(Array.isArray(data.error) ? data.error.join(', ') : data.error);
    }
  } catch (err) {
    console.error(err);
    showError('Server error processing your request.');
  }
}

// ─── DELETE TRANSACTION ────────────────────────────────────────
async function removeTransaction(id) {
  try {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      transactions = transactions.filter(t => t._id !== id);
      localStorage.setItem('transactions', JSON.stringify(transactions));

      // Remove only the matching DOM element — no full list rebuild
      const item = list.querySelector(`[data-id="${id}"]`);
      if (item) item.remove();

      updateValues();
      updateCharts();
    }
  } catch (err) {
    console.error(err);
  }
}

// ─── CLEAR ALL ─────────────────────────────────────────────────
async function clearAllTransactions(e) {
  if (e) e.preventDefault();

  try {
    const res = await fetch('/api/transactions', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      transactions = [];
      localStorage.removeItem('transactions');
      init();
    }
  } catch (err) {
    console.error(err);
  }
}

// ─── BUILD ONE TRANSACTION ELEMENT ────────────────────────────
function buildTransactionEl(transaction, index) {
  const sign = transaction.type === 'income' ? '+' : '-';
  const item = document.createElement('li');
  item.classList.add(transaction.type === 'income' ? 'plus' : 'minus');
  item.dataset.id = transaction._id; // used for targeted removal
  item.style.animationDelay = `${index * 0.05}s`;

  const txIcon = transaction.type === 'income' ? 'arrow-up-right' : 'arrow-down-left';

  item.innerHTML = `
    <div class="transaction-main">
      <div class="transaction-icon-box">
        <i data-lucide="${txIcon}"></i>
      </div>
      <div class="transaction-info">
        <span class="transaction-desc">${transaction.description}</span>
        <span class="transaction-meta">
          <i data-lucide="tag" style="width:10px; height:10px; margin-right: 2px;"></i> ${transaction.category} 
          &nbsp;&bull;&nbsp; ${formatDate(transaction.date)}
        </span>
      </div>
    </div>
    <div class="transaction-actions">
      <span class="transaction-amount">${sign}${formatMoney(Math.abs(transaction.amount))}</span>
      <button class="delete-btn" onclick="removeTransaction('${transaction._id}')" title="Delete record">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;
  return item;
}

// Append to the bottom (used in full list rebuild)
function addTransactionDOM(transaction, index) {
  const item = buildTransactionEl(transaction, index);
  list.appendChild(item);
  lucide.createIcons({ nodes: [item] }); // Only process new node, not entire DOM
}

// Prepend a single new item (used in optimistic add)
function prependTransactionDOM(transaction) {
  const item = buildTransactionEl(transaction, 0);
  list.prepend(item);
  lucide.createIcons({ nodes: [item] }); // Only process new node
}

// ─── UPDATE BALANCE/INCOME/EXPENSE ────────────────────────────
function updateValues() {
  const income  = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const total   = income - expense;

  balance.innerText    = formatMoney(total);
  money_plus.innerText = `+${formatMoney(income)}`;
  money_minus.innerText = `-${formatMoney(expense)}`;
}

// ─── UPDATE CHARTS (in-place, no destroy/recreate) ─────────────
function updateCharts() {
  const incomeTransactions  = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');

  const incomeTotal  = incomeTransactions.reduce((acc, t) => acc + t.amount, 0);
  const expenseTotal = expenseTransactions.reduce((acc, t) => acc + t.amount, 0);

  // ── Pie / Doughnut ────────────────────────────────────────────
  const pieCtx = document.getElementById('pieChart').getContext('2d');

  if (pieChartInstance) {
    // Update data in-place — no flickery destroy/recreate
    pieChartInstance.data.datasets[0].data = [incomeTotal, expenseTotal];
    pieChartInstance.update('none'); // 'none' skips animation on data refresh (instant)
  } else {
    pieChartInstance = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['Income', 'Expense'],
        datasets: [{
          data: [incomeTotal, expenseTotal],
          backgroundColor: ['#16A34A', '#DC2626'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        cutout: '75%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 20 }
          }
        }
      }
    });
  }

  // ── Bar (Category Expenses) ───────────────────────────────────
  const categoryTotals = {};
  expenseTransactions.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const categories = Object.keys(categoryTotals);
  const catData    = Object.values(categoryTotals);
  const barCtx     = document.getElementById('barChart').getContext('2d');

  if (barChartInstance) {
    // Update labels and data in-place
    barChartInstance.data.labels = categories;
    barChartInstance.data.datasets[0].data = catData;
    barChartInstance.update('none');
  } else {
    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [{
          label: 'Expenses by Category',
          data: catData,
          backgroundColor: '#E5E2DC',
          hoverBackgroundColor: '#18181B',
          borderRadius: 6,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            padding: 12,
            titleFont: { size: 13, family: "'Inter', sans-serif" },
            bodyFont: { size: 14, family: "'Inter', sans-serif" }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#E5E7EB', borderDash: [5, 5] },
            border: { display: false }
          },
          x: {
            grid: { display: false },
            border: { display: false }
          }
        }
      }
    });
  }

  // ── Daily Data Processing (for Time Series) ───────────────────
  const dailyData = {};
  
  // Sort transactions oldest to newest
  const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

  sortedTransactions.forEach(t => {
    // Format "MMM DD" for X-axis labels
    const dateObj = new Date(t.date);
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (!dailyData[dateStr]) {
      dailyData[dateStr] = { income: 0, expense: 0 };
    }
    if (t.type === 'income') {
      dailyData[dateStr].income += t.amount;
    } else {
      dailyData[dateStr].expense += t.amount;
    }
  });

  const dates = Object.keys(dailyData);
  // Get up to the last 7 active days
  const recentDates = dates.slice(-7);
  
  const dailyExpenses = recentDates.map(date => dailyData[date].expense);
  const dailyIncomes = recentDates.map(date => dailyData[date].income);

  // ── Trend (Line Chart) ──────────────────────────────────────────
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  
  if (trendChartInstance) {
    trendChartInstance.data.labels = recentDates;
    trendChartInstance.data.datasets[0].data = dailyExpenses;
    trendChartInstance.update('none');
  } else {
    trendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: recentDates,
        datasets: [{
          label: 'Daily Expenses',
          data: dailyExpenses,
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827', padding: 12,
            titleFont: { size: 13, family: "'Inter', sans-serif" },
            bodyFont: { size: 14, family: "'Inter', sans-serif" }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#E5E7EB', borderDash: [5, 5] }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  // ── Cash Flow (Grouped Bar Chart) ──────────────────────────────
  const cashflowCtx = document.getElementById('cashflowChart').getContext('2d');
  
  if (cashflowChartInstance) {
    cashflowChartInstance.data.labels = recentDates;
    cashflowChartInstance.data.datasets[0].data = dailyIncomes;
    cashflowChartInstance.data.datasets[1].data = dailyExpenses;
    cashflowChartInstance.update('none');
  } else {
    cashflowChartInstance = new Chart(cashflowCtx, {
      type: 'bar',
      data: {
        labels: recentDates,
        datasets: [
          {
            label: 'Income',
            data: dailyIncomes,
            backgroundColor: '#16A34A',
            borderRadius: 4
          },
          {
            label: 'Expense',
            data: dailyExpenses,
            backgroundColor: '#DC2626',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            backgroundColor: '#111827', padding: 12,
            titleFont: { size: 13, family: "'Inter', sans-serif" },
            bodyFont: { size: 14, family: "'Inter', sans-serif" }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#E5E7EB', borderDash: [5, 5] }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
  }
}

// ─── FULL INIT (used on first load + clear all) ────────────────
function init() {
  list.innerHTML = '';
  transactions.forEach((tx, index) => addTransactionDOM(tx, index));
  updateValues();
  updateCharts();
}

init();

// Fetch initial data from server
getTransactions();

// ─── EVENT LISTENERS ───────────────────────────────────────────
form.addEventListener('submit', addTransaction);
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', clearAllTransactions);
}
