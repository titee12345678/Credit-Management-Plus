const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// สร้างฐานข้อมูล SQLite
const db = new sqlite3.Database(path.join(__dirname, 'expenses.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

// สร้างตารางฐานข้อมูล
function initDatabase() {
  // สร้างตาราง users ก่อน
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table ready');
      insertDefaultUsers();
    }
  });

  // สร้างตาราง expenses
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      installments INTEGER NOT NULL,
      installments_paid INTEGER DEFAULT 0,
      total_paid REAL NOT NULL,
      remaining_balance REAL NOT NULL,
      monthly_payment REAL NOT NULL,
      interest_rate REAL DEFAULT 0,
      description TEXT,
      category TEXT DEFAULT 'อื่นๆ',
      card_name TEXT,
      start_date DATE,
      end_date DATE,
      billing_cycle_day INTEGER DEFAULT 16,
      payment_due_day INTEGER DEFAULT 5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Expenses table ready');
      // เพิ่มคอลัมน์ category และ interest_rate ถ้ายังไม่มี
      addCategoryColumn();
    }
  });
}

// เพิ่ม users เริ่มต้น
function insertDefaultUsers() {
  const users = [
    { username: 'teejakkrit', password: '1221' },
    { username: 'veeva', password: '1221' }
  ];

  users.forEach(user => {
    db.run(
      'INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)',
      [user.username, user.password],
      (err) => {
        if (err) {
          console.error('Error inserting user:', err.message);
        } else {
          console.log(`User ${user.username} added`);
        }
      }
    );
  });
}

// เพิ่มคอลัมน์ category สำหรับตารางที่มีอยู่แล้ว
function addCategoryColumn() {
  db.run(`ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'อื่นๆ'`, (err) => {
    if (err) {
      // ถ้า error แสดงว่ามี column อยู่แล้ว ไม่ต้องทำอะไร
      console.log('Category column already exists or error:', err.message);
    } else {
      console.log('Category column added');
    }
    addInterestRateColumn();
  });
}

// เพิ่มคอลัมน์ interest_rate สำหรับตารางที่มีอยู่แล้ว
function addInterestRateColumn() {
  db.run(`ALTER TABLE expenses ADD COLUMN interest_rate REAL DEFAULT 0`, (err) => {
    if (err) {
      console.log('Interest rate column already exists or error:', err.message);
    } else {
      console.log('Interest rate column added');
    }
    createPaymentHistoryTable();
  });
}

// สร้างตารางประวัติการชำระเงิน
function createPaymentHistoryTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      payment_amount REAL NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      installment_number INTEGER,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating payment_history table:', err.message);
    } else {
      console.log('Payment history table ready');
      createBudgetTable();
    }
  });
}

// สร้างตารางวงเงิน
function createBudgetTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total_budget REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating budget table:', err.message);
    } else {
      console.log('Budget table ready');
      insertDefaultBudget();
    }
  });
}

// เพิ่มวงเงินเริ่มต้นสำหรับแต่ละ user
function insertDefaultBudget() {
  // เพิ่มวงเงินเริ่มต้นสำหรับ user ทั้งสอง
  const users = [1, 2]; // user_id 1 (teejakkrit) and 2 (veeva)

  users.forEach(userId => {
    db.get('SELECT COUNT(*) as count FROM budget WHERE user_id = ?', [userId], (err, row) => {
      if (err) {
        console.error('Error checking budget:', err.message);
        return;
      }

      if (row.count === 0) {
        db.run(
          'INSERT INTO budget (user_id, total_budget, description) VALUES (?, ?, ?)',
          [userId, 50000, 'วงเงินเริ่มต้น'],
          (err) => {
            if (err) {
              console.error(`Error inserting default budget for user ${userId}:`, err.message);
            } else {
              console.log(`Default budget inserted for user ${userId}`);
            }
          }
        );
      }
    });
  });

  // ข้ามการเพิ่มข้อมูลตัวอย่าง (ให้ user เพิ่มเอง)
}

// เพิ่มข้อมูลตัวอย่าง
function insertSampleData() {
  db.get('SELECT COUNT(*) as count FROM expenses', (err, row) => {
    if (err) {
      console.error('Error checking data:', err.message);
      return;
    }

    if (row.count === 0) {
      const sampleData = [
        { amount: 864.75, installments: 1 },
        { amount: 2559, installments: 4 },
        { amount: 2304, installments: 4 },
        { amount: 2120.72, installments: 1 },
        { amount: 364, installments: 1 },
        { amount: 391, installments: 1 },
        { amount: 253, installments: 1 }
      ];

      const stmt = db.prepare(`
        INSERT INTO expenses (amount, installments, monthly_payment, total_paid, remaining_balance, installments_paid, description, card_name, start_date, end_date, billing_cycle_day, payment_due_day)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      sampleData.forEach((data, index) => {
        const monthlyPayment = data.amount / data.installments;
        const totalPaid = 0;
        const remainingBalance = data.amount;
        const installmentsPaid = 0;
        const startDate = new Date().toISOString().split('T')[0];

        // คำนวณวันที่จะผ่อนหมด (เพิ่มจำนวนเดือนตามจำนวนงวด)
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + data.installments);
        const endDateStr = endDate.toISOString().split('T')[0];

        const cardName = index % 2 === 0 ? 'บัตรกรุงเทพ' : 'บัตรกสิกร';

        stmt.run(
          data.amount,
          data.installments,
          monthlyPayment,
          totalPaid,
          remainingBalance,
          installmentsPaid,
          'รายการตัวอย่าง',
          cardName,
          startDate,
          endDateStr,
          16, // วันตัดรอบ
          5   // วันจ่ายเงิน
        );
      });

      stmt.finalize(() => {
        console.log('Sample data inserted');
      });
    }
  });
}

module.exports = db;
