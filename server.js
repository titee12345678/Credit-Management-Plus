const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'credit-management-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Serve static files (CSS, JS, images)
app.use(express.static('public'));

// Serve login page for root
app.get('/', (req, res) => {
  if (!req.session.user) {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// API Routes

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }

    if (!user) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    req.session.user = {
      id: user.id,
      username: user.username
    };

    res.json({ success: true, user: { id: user.id, username: user.username } });
  });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการออกจากระบบ' });
    }
    res.json({ success: true });
  });
});

// Get current user
app.get('/api/current-user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// ดึงข้อมูลรายการทั้งหมด (ของ user ที่ login)
app.get('/api/expenses', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY start_date DESC, created_at DESC', [userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ expenses: rows });
  });
});

// ดึงข้อมูลรายการตาม ID
app.get('/api/expenses/:id', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, userId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ expense: row });
  });
});

// เพิ่มรายการใหม่
app.post('/api/expenses', requireAuth, (req, res) => {
  const { amount, installments, interest_rate, description, start_date, card_name, billing_cycle_day, payment_due_day, category } = req.body;
  const userId = req.session.user.id;

  if (!amount || !installments) {
    res.status(400).json({ error: 'Amount and installments are required' });
    return;
  }

  const principal = parseFloat(amount);
  const numInstallments = parseInt(installments);
  const interestRate = parseFloat(interest_rate) || 0;

  // คำนวณ monthly_payment พร้อมดอกเบี้ยแบบ Flat Rate
  let monthlyPayment;
  if (interestRate > 0) {
    // สูตรดอกเบี้ยแบบ Flat Rate
    const r = interestRate / 100; // แปลงเป็นทศนิยม
    const totalInterest = principal * r * numInstallments; // ดอกเบี้ยรวม
    const totalAmount = principal + totalInterest; // ยอดรวมที่ต้องจ่าย
    monthlyPayment = totalAmount / numInstallments; // ค่างวดต่อเดือน
  } else {
    // ไม่มีดอกเบี้ย
    monthlyPayment = principal / numInstallments;
  }

  const totalPaid = 0;
  const remainingBalance = principal;
  const installmentsPaid = 0;
  const startDate = start_date || new Date().toISOString().split('T')[0];

  const billingDay = billing_cycle_day || 16;
  const paymentDay = payment_due_day || 5;

  // คำนวณวันที่จะผ่อนหมดตาม billing cycle logic
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const purchaseDate = new Date(startYear, startMonth - 1, startDay);
  const purchaseDay = purchaseDate.getDate();
  const purchaseMonth = purchaseDate.getMonth();
  const purchaseYear = purchaseDate.getFullYear();

  // คำนวณวันครบกำหนดชำระงวดแรก
  let firstPaymentDate;
  if (purchaseDay >= billingDay) {
    // ซื้อตั้งแต่วันตัดรอบ (16) ขึ้นไป → ยอดเข้าบิลเดือนหน้า → ชำระเดือนที่ 2
    firstPaymentDate = new Date(purchaseYear, purchaseMonth + 2, paymentDay);
  } else {
    // ซื้อก่อนวันตัดรอบ (1-15) → ยอดเข้าบิลเดือนนี้ → ชำระเดือนถัดไป
    firstPaymentDate = new Date(purchaseYear, purchaseMonth + 1, paymentDay);
  }

  // คำนวณวันผ่อนหมด = วันชำระงวดสุดท้าย (งวดแรก + จำนวนงวด - 1)
  const endDate = new Date(firstPaymentDate);
  endDate.setMonth(endDate.getMonth() + parseInt(installments) - 1);

  const endYear = endDate.getFullYear();
  const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
  const endDay = String(endDate.getDate()).padStart(2, '0');
  const endDateStr = `${endYear}-${endMonth}-${endDay}`;

  db.run(
    `INSERT INTO expenses (amount, installments, monthly_payment, interest_rate, total_paid, remaining_balance, installments_paid, description, category, card_name, start_date, end_date, billing_cycle_day, payment_due_day, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [amount, installments, monthlyPayment, interestRate, totalPaid, remainingBalance, installmentsPaid, description || '', category || 'อื่นๆ', card_name || '', startDate, endDateStr, billingDay, paymentDay, userId],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        id: this.lastID,
        message: 'Expense added successfully'
      });
    }
  );
});

// แก้ไขรายการ
app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const { amount, installments, interest_rate, description, total_paid, start_date, installments_paid, card_name, billing_cycle_day, payment_due_day, category } = req.body;
  const id = req.params.id;
  const userId = req.session.user.id;

  const principal = parseFloat(amount);
  const numInstallments = parseInt(installments);
  const interestRate = parseFloat(interest_rate) || 0;

  // คำนวณ monthly_payment พร้อมดอกเบี้ยแบบ Flat Rate
  let monthlyPayment;
  if (interestRate > 0) {
    // สูตรดอกเบี้ยแบบ Flat Rate
    const r = interestRate / 100;
    const totalInterest = principal * r * numInstallments;
    const totalAmount = principal + totalInterest;
    monthlyPayment = totalAmount / numInstallments;
  } else {
    monthlyPayment = principal / numInstallments;
  }

  const paidAmount = total_paid !== undefined ? parseFloat(total_paid) : 0;
  const remainingBalance = principal - paidAmount;

  // ใช้ค่า installments_paid ที่ส่งมาจาก frontend
  const instPaid = installments_paid !== undefined ? parseInt(installments_paid) : 0;

  const billingDay = billing_cycle_day || 16;
  const paymentDay = payment_due_day || 5;

  // คำนวณวันที่จะผ่อนหมดตาม billing cycle logic
  const [startYear, startMonth, startDay] = start_date.split('-').map(Number);
  const purchaseDate = new Date(startYear, startMonth - 1, startDay);
  const purchaseDay = purchaseDate.getDate();
  const purchaseMonth = purchaseDate.getMonth();
  const purchaseYear = purchaseDate.getFullYear();

  // คำนวณวันครบกำหนดชำระงวดแรก
  let firstPaymentDate;
  if (purchaseDay >= billingDay) {
    // ซื้อตั้งแต่วันตัดรอบ (16) ขึ้นไป → ยอดเข้าบิลเดือนหน้า → ชำระเดือนที่ 2
    firstPaymentDate = new Date(purchaseYear, purchaseMonth + 2, paymentDay);
  } else {
    // ซื้อก่อนวันตัดรอบ (1-15) → ยอดเข้าบิลเดือนนี้ → ชำระเดือนถัดไป
    firstPaymentDate = new Date(purchaseYear, purchaseMonth + 1, paymentDay);
  }

  // คำนวณวันผ่อนหมด = วันชำระงวดสุดท้าย
  const endDate = new Date(firstPaymentDate);
  endDate.setMonth(endDate.getMonth() + parseInt(installments) - 1);

  const endYear = endDate.getFullYear();
  const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
  const endDay = String(endDate.getDate()).padStart(2, '0');
  const endDateStr = `${endYear}-${endMonth}-${endDay}`;

  db.run(
    `UPDATE expenses
     SET amount = ?, installments = ?, monthly_payment = ?, interest_rate = ?,
         total_paid = ?, remaining_balance = ?, description = ?,
         start_date = ?, end_date = ?, installments_paid = ?,
         card_name = ?, billing_cycle_day = ?, payment_due_day = ?, category = ?
     WHERE id = ? AND user_id = ?`,
    [amount, installments, monthlyPayment, interestRate, paidAmount, remainingBalance, description || '', start_date, endDateStr, instPaid, card_name || '', billing_cycle_day || 16, payment_due_day || 5, category || 'อื่นๆ', id, userId],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({
        message: 'Expense updated successfully',
        changes: this.changes
      });
    }
  );
});

// อัปเดตยอดชำระ (ชำระแบบรายงวด)
app.patch('/api/expenses/:id/payment', requireAuth, (req, res) => {
  const { payment_amount, payment_date } = req.body;
  const id = req.params.id;
  const userId = req.session.user.id;

  db.get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [id, userId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    if (!row) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    const paymentAmt = parseFloat(payment_amount);
    const newTotalPaid = row.total_paid + paymentAmt;
    const newRemainingBalance = row.amount - newTotalPaid;

    // คำนวณจำนวนงวดที่ชำระแล้ว (ปัดเศษลง)
    const newInstallmentsPaid = Math.floor(newTotalPaid / row.monthly_payment);

    db.run(
      `UPDATE expenses SET total_paid = ?, remaining_balance = ?, installments_paid = ? WHERE id = ? AND user_id = ?`,
      [newTotalPaid, newRemainingBalance, newInstallmentsPaid, id, userId],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        // บันทึกประวัติการชำระเงิน พร้อมวันที่ชำระ
        const payDate = payment_date || new Date().toISOString().split('T')[0];
        db.run(
          `INSERT INTO payment_history (expense_id, payment_amount, installment_number, payment_date)
           VALUES (?, ?, ?, ?)`,
          [id, paymentAmt, newInstallmentsPaid, payDate],
          function(err) {
            if (err) {
              console.error('Error logging payment history:', err.message);
            }
          }
        );

        res.json({
          message: 'Payment updated successfully',
          total_paid: newTotalPaid,
          remaining_balance: newRemainingBalance,
          installments_paid: newInstallmentsPaid,
          payment_date: payDate
        });
      }
    );
  });
});

// ลบรายการ
app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, userId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      message: 'Expense deleted successfully',
      changes: this.changes
    });
  });
});

// ดึงประวัติการชำระเงิน
app.get('/api/expenses/:id/history', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  // ต้องตรวจสอบว่า expense นี้เป็นของ user ที่ login อยู่
  db.get('SELECT id FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, userId], (err, expense) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    db.all(
      'SELECT * FROM payment_history WHERE expense_id = ? ORDER BY payment_date DESC',
      [req.params.id],
      (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({ history: rows });
      }
    );
  });
});

// คำนวณสรุปรายเดือน
app.get('/api/summary', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.all('SELECT * FROM expenses WHERE user_id = ?', [userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const totalMonthlyPayment = rows.reduce((sum, row) => sum + row.monthly_payment, 0);
    const totalRemaining = rows.reduce((sum, row) => sum + row.remaining_balance, 0);
    const totalPaid = rows.reduce((sum, row) => sum + row.total_paid, 0);
    const totalExpenses = rows.reduce((sum, row) => sum + row.amount, 0);

    // ดึงข้อมูลวงเงิน
    db.get('SELECT * FROM budget WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId], (err, budget) => {
      const totalBudget = budget ? budget.total_budget : 0;
      const usedBudget = totalExpenses;
      const remainingBudget = totalBudget - usedBudget;

      res.json({
        total_monthly_payment: totalMonthlyPayment.toFixed(2),
        total_remaining: totalRemaining.toFixed(2),
        total_paid: totalPaid.toFixed(2),
        total_expenses: rows.length,
        total_budget: totalBudget.toFixed(2),
        used_budget: usedBudget.toFixed(2),
        remaining_budget: remainingBudget.toFixed(2)
      });
    });
  });
});

// ดึงข้อมูลวงเงิน
app.get('/api/budget', requireAuth, (req, res) => {
  const userId = req.session.user.id;
  db.get('SELECT * FROM budget WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ budget: row || { total_budget: 0 } });
  });
});

// อัปเดตวงเงิน
app.put('/api/budget', requireAuth, (req, res) => {
  const { total_budget, description } = req.body;
  const userId = req.session.user.id;

  if (!total_budget) {
    res.status(400).json({ error: 'Total budget is required' });
    return;
  }

  // ลบวงเงินเก่าของ user นี้
  db.run('DELETE FROM budget WHERE user_id = ?', [userId], (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    // เพิ่มวงเงินใหม่
    db.run(
      'INSERT INTO budget (total_budget, description, user_id) VALUES (?, ?, ?)',
      [parseFloat(total_budget), description || 'วงเงินที่ใช้ได้', userId],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }
        res.json({
          message: 'Budget updated successfully',
          id: this.lastID
        });
      }
    );
  });
});

// ดึงข้อมูลปฏิทินการชำระ
app.get('/api/calendar', requireAuth, (req, res) => {
  const { year, month } = req.query;
  const userId = req.session.user.id;

  if (!year || !month) {
    res.status(400).json({ error: 'Year and month are required' });
    return;
  }

  // ดึงรายการทั้งหมดของ user รวมถึงที่ชำระครบแล้ว
  db.all('SELECT * FROM expenses WHERE user_id = ?', [userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    const targetYear = parseInt(year);
    const targetMonth = parseInt(month) - 1; // JavaScript months are 0-indexed

    // คำนวณรายการที่ต้องชำระในเดือนนี้
    const payments = [];

    rows.forEach(expense => {
      // Parse dates as local dates to avoid timezone issues
      const [startYear, startMonth, startDay] = expense.start_date.split('-').map(Number);
      const purchaseDate = new Date(startYear, startMonth - 1, startDay);
      const billingCycleDay = expense.billing_cycle_day || 16; // วันตัดรอบ
      const paymentDueDay = expense.payment_due_day || 5; // วันครบกำหนดชำระ

      // คำนวณวันครบกำหนดชำระงวดแรกตาม billing cycle logic
      const purchaseDay = purchaseDate.getDate();
      const purchaseMonth = purchaseDate.getMonth();
      const purchaseYear = purchaseDate.getFullYear();

      let firstPaymentDate;
      if (purchaseDay >= billingCycleDay) {
        // ซื้อตั้งแต่วันตัดรอบ (16) ขึ้นไป → ยอดเข้าบิลเดือนหน้า → ชำระเดือนที่ 2
        firstPaymentDate = new Date(purchaseYear, purchaseMonth + 2, paymentDueDay);
      } else {
        // ซื้อก่อนวันตัดรอบ (1-15) → ยอดเข้าบิลเดือนนี้ → ชำระเดือนถัดไป
        firstPaymentDate = new Date(purchaseYear, purchaseMonth + 1, paymentDueDay);
      }

      // วนลูปแต่ละงวด โดยบวกทีละ 1 เดือนจากวันชำระงวดแรก
      for (let installmentNumber = 1; installmentNumber <= expense.installments; installmentNumber++) {
        // คำนวณวันชำระของงวดนี้ (งวดแรก + (งวดปัจจุบัน - 1) เดือน)
        const paymentDueDate = new Date(firstPaymentDate);
        paymentDueDate.setMonth(firstPaymentDate.getMonth() + (installmentNumber - 1));

        // ตรวจสอบว่าวันครบกำหนดตรงกับเดือนที่เลือกหรือไม่
        if (paymentDueDate.getFullYear() === targetYear &&
            paymentDueDate.getMonth() === targetMonth) {

          // ตรวจสอบว่างวดนี้ชำระแล้วหรือยัง
          const isPaid = installmentNumber <= expense.installments_paid;
          const isOverdue = new Date() > paymentDueDate && !isPaid;

          // Format date as YYYY-MM-DD without timezone conversion
          const year = paymentDueDate.getFullYear();
          const month = String(paymentDueDate.getMonth() + 1).padStart(2, '0');
          const day = String(paymentDueDate.getDate()).padStart(2, '0');
          const formattedDate = `${year}-${month}-${day}`;

          payments.push({
            expense_id: expense.id,
            description: expense.description,
            category: expense.category,
            installment_number: installmentNumber,
            total_installments: expense.installments,
            payment_amount: expense.monthly_payment,
            payment_due_date: formattedDate,
            is_paid: isPaid,
            is_overdue: isOverdue,
            billing_cycle_day: expense.billing_cycle_day,
            payment_due_day: expense.payment_due_day
          });
        }
      }
    });

    // เรียงตามวันครบกำหนด
    payments.sort((a, b) => new Date(a.payment_due_date) - new Date(b.payment_due_date));

    // คำนวณยอดรวม
    const totalAmount = payments.reduce((sum, p) => sum + p.payment_amount, 0);
    const paidAmount = payments.filter(p => p.is_paid).reduce((sum, p) => sum + p.payment_amount, 0);
    const unpaidAmount = payments.filter(p => !p.is_paid).reduce((sum, p) => sum + p.payment_amount, 0);
    const overdueAmount = payments.filter(p => p.is_overdue).reduce((sum, p) => sum + p.payment_amount, 0);

    res.json({
      year: targetYear,
      month: targetMonth + 1,
      payments: payments,
      summary: {
        total_amount: totalAmount.toFixed(2),
        paid_amount: paidAmount.toFixed(2),
        unpaid_amount: unpaidAmount.toFixed(2),
        overdue_amount: overdueAmount.toFixed(2),
        total_payments: payments.length,
        paid_count: payments.filter(p => p.is_paid).length,
        unpaid_count: payments.filter(p => !p.is_paid).length,
        overdue_count: payments.filter(p => p.is_overdue).length
      }
    });
  });
});

// Serve index.html
// API สำหรับชำระหลายรายการพร้อมกัน
app.post('/api/bulk-payment', requireAuth, async (req, res) => {
  const { payments } = req.body;
  const userId = req.session.user.id;

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    res.status(400).json({ error: 'Invalid payments data' });
    return;
  }

  let success_count = 0;
  let error_count = 0;
  const errors = [];

  // ประมวลผลแต่ละรายการทีละรายการ
  for (const payment of payments) {
    try {
      const { expense_id, payment_amount, payment_date } = payment;

      // ดึงข้อมูล expense โดยต้องเป็นของ user ที่ login
      const expense = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM expenses WHERE id = ? AND user_id = ?', [expense_id, userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!expense) {
        errors.push({ expense_id, error: 'Expense not found' });
        error_count++;
        continue;
      }

      // คำนวณยอดใหม่
      const newTotalPaid = parseFloat(expense.total_paid) + parseFloat(payment_amount);
      const newRemainingBalance = parseFloat(expense.amount) - newTotalPaid;
      const newInstallmentsPaid = expense.installments_paid + 1;

      // อัพเดท expense
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE expenses
           SET total_paid = ?, remaining_balance = ?, installments_paid = ?
           WHERE id = ? AND user_id = ?`,
          [newTotalPaid, newRemainingBalance, newInstallmentsPaid, expense_id, userId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // บันทึกประวัติการชำระ
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO payment_history (expense_id, payment_amount, installment_number, payment_date)
           VALUES (?, ?, ?, ?)`,
          [expense_id, payment_amount, newInstallmentsPaid, payment_date || new Date().toISOString().split('T')[0]],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      success_count++;
    } catch (error) {
      console.error('Error processing payment:', error);
      errors.push({ expense_id: payment.expense_id, error: error.message });
      error_count++;
    }
  }

  res.json({
    success_count,
    error_count,
    errors: errors.length > 0 ? errors : undefined
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
