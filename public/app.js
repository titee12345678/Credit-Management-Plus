// State
let expenses = [];
let editMode = false;
let currentFilter = 'pending';
let currentCalendarYear = new Date().getFullYear();
let currentCalendarMonth = new Date().getMonth() + 1; // 1-12
let currentMonthPayments = []; // เก็บรายการชำระของเดือนปัจจุบัน

// DOM Elements
const expenseForm = document.getElementById('expenseForm');
const expenseTableBody = document.getElementById('expenseTableBody');
const cancelBtn = document.getElementById('cancelBtn');
const paymentModal = document.getElementById('paymentModal');
const paymentForm = document.getElementById('paymentForm');
const budgetModal = document.getElementById('budgetModal');
const budgetForm = document.getElementById('budgetForm');
const editBudgetBtn = document.getElementById('editBudgetBtn');
const bulkPaymentModal = document.getElementById('bulkPaymentModal');
const bulkPaymentForm = document.getElementById('bulkPaymentForm');
const bulkPaymentBtn = document.getElementById('bulkPaymentBtn');

// Chart instances
let budgetChart = null;
let paymentStatusChart = null;
let monthlyPaymentChart = null;
let yearlyChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Load current user info
    loadCurrentUser();

    loadExpenses();
    loadSummary();
    initCharts();
    populateYearSelector();
    populateCalendarYearSelector();
    loadCalendar();

    // ตั้งค่า default date เป็นวันนี้
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const startDateInput = document.getElementById('startDate');
    if (startDateInput && !startDateInput.value) {
        startDateInput.value = todayStr;
    }

    // ตั้งค่า default billing cycle และ payment due day (ถ้ามี)
    const billingCycleDayInput = document.getElementById('billingCycleDay');
    const paymentDueDayInput = document.getElementById('paymentDueDay');
    if (billingCycleDayInput) {
        billingCycleDayInput.value = billingCycleDayInput.value || 16;
    }
    if (paymentDueDayInput) {
        paymentDueDayInput.value = paymentDueDayInput.value || 5;
    }

    // คำนวณ end date ครั้งแรกถ้ามีข้อมูลครบ
    setTimeout(() => {
        calculateEndDate();
    }, 100);

    // Year selector change event
    document.getElementById('yearSelect').addEventListener('change', function() {
        updateYearlyChart(parseInt(this.value));
    });

    // Filter selector change event
    document.getElementById('filterSelect').addEventListener('change', function() {
        currentFilter = this.value;
        renderExpenses();
    });

    // Calendar navigation events
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        currentCalendarMonth--;
        if (currentCalendarMonth < 1) {
            currentCalendarMonth = 12;
            currentCalendarYear--;
        }
        updateCalendarSelectors();
        loadCalendar();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        currentCalendarMonth++;
        if (currentCalendarMonth > 12) {
            currentCalendarMonth = 1;
            currentCalendarYear++;
        }
        updateCalendarSelectors();
        loadCalendar();
    });

    document.getElementById('calendarMonthSelect').addEventListener('change', function() {
        currentCalendarMonth = parseInt(this.value);
        loadCalendar();
    });

    document.getElementById('calendarYearSelect').addEventListener('change', function() {
        currentCalendarYear = parseInt(this.value);
        loadCalendar();
    });

    expenseForm.addEventListener('submit', handleFormSubmit);
    cancelBtn.addEventListener('click', resetForm);
    paymentForm.addEventListener('submit', handlePaymentSubmit);
    budgetForm.addEventListener('submit', handleBudgetSubmit);
    editBudgetBtn.addEventListener('click', openBudgetModal);
    bulkPaymentBtn.addEventListener('click', openBulkPaymentModal);
    bulkPaymentForm.addEventListener('submit', handleBulkPaymentSubmit);

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Auto-calculate end date when start date, installments, or billing cycle settings change
    const startDateField = document.getElementById('startDate');
    const installmentsField = document.getElementById('installments');
    const interestRateField = document.getElementById('interestRate');
    const billingCycleDayField = document.getElementById('billingCycleDay');
    const paymentDueDayField = document.getElementById('paymentDueDay');

    // Auto-select interest rate based on installments (แนะนำ 0.74% สำหรับ 6-10 งวด)
    if (installmentsField && interestRateField) {
        const suggestInterestRate = function() {
            const installments = parseInt(installmentsField.value) || 0;
            if (installments >= 6 && installments <= 10) {
                interestRateField.value = '0.74';
            } else {
                interestRateField.value = '0';
            }
        };

        installmentsField.addEventListener('input', suggestInterestRate);
        installmentsField.addEventListener('change', suggestInterestRate);
    }

    if (startDateField && installmentsField) {
        startDateField.addEventListener('change', calculateEndDate);
        startDateField.addEventListener('input', calculateEndDate);
        installmentsField.addEventListener('change', calculateEndDate);
        installmentsField.addEventListener('input', calculateEndDate);
        installmentsField.addEventListener('keyup', calculateEndDate);

        console.log('Event listeners added for end date calculation');
    } else {
        console.error('Could not find startDate or installments fields');
    }

    // เพิ่ม listener สำหรับ billing cycle และ payment due day (ถ้ามี)
    if (billingCycleDayField) {
        billingCycleDayField.addEventListener('change', calculateEndDate);
        billingCycleDayField.addEventListener('input', calculateEndDate);
        console.log('Billing cycle day listener added');
    }
    if (paymentDueDayField) {
        paymentDueDayField.addEventListener('change', calculateEndDate);
        paymentDueDayField.addEventListener('input', calculateEndDate);
        console.log('Payment due day listener added');
    }

    // Auto-calculate installments_paid when totalPaid or amount changes
    const totalPaidField = document.getElementById('totalPaid');
    const amountField = document.getElementById('amount');
    const installmentsPaidField = document.getElementById('installmentsPaid');

    function updateInstallmentsPaid() {
        if (totalPaidField && amountField && installmentsField && installmentsPaidField) {
            const totalPaid = parseFloat(totalPaidField.value) || 0;
            const amount = parseFloat(amountField.value) || 0;
            const installments = parseInt(installmentsField.value) || 1;

            if (amount > 0 && installments > 0) {
                const monthlyPayment = amount / installments;
                const calculatedInstallmentsPaid = Math.floor(totalPaid / monthlyPayment);
                installmentsPaidField.value = calculatedInstallmentsPaid;
            }
        }
    }

    function updateTotalPaid() {
        if (totalPaidField && amountField && installmentsField && installmentsPaidField) {
            const installmentsPaid = parseInt(installmentsPaidField.value) || 0;
            const amount = parseFloat(amountField.value) || 0;
            const installments = parseInt(installmentsField.value) || 1;

            if (amount > 0 && installments > 0) {
                const monthlyPayment = amount / installments;
                const calculatedTotalPaid = installmentsPaid * monthlyPayment;
                totalPaidField.value = calculatedTotalPaid.toFixed(2);
            }
        }
    }

    if (totalPaidField && amountField && installmentsPaidField) {
        // คำนวณ installmentsPaid เมื่อแก้ไข totalPaid
        totalPaidField.addEventListener('input', updateInstallmentsPaid);
        amountField.addEventListener('input', updateInstallmentsPaid);
        installmentsField.addEventListener('input', updateInstallmentsPaid);

        // คำนวณ totalPaid เมื่อแก้ไข installmentsPaid
        installmentsPaidField.addEventListener('input', updateTotalPaid);

        console.log('Auto-calculation listeners added');
    }

    // Close modals
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    window.addEventListener('click', (e) => {
        if (e.target === paymentModal || e.target === budgetModal) {
            closeModals();
        }
    });
});

// Load all expenses
async function loadExpenses() {
    try {
        const response = await fetch('/api/expenses');
        const data = await response.json();
        expenses = data.expenses;
        renderExpenses();
        updateCharts();
    } catch (error) {
        console.error('Error loading expenses:', error);
        showNotification('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}

// Load summary
async function loadSummary() {
    try {
        const response = await fetch('/api/summary');
        const data = await response.json();

        // อัปเดตยอดรวม
        document.getElementById('totalMonthly').textContent = formatNumber(data.total_monthly_payment);
        document.getElementById('totalRemaining').textContent = formatNumber(data.total_remaining);
        document.getElementById('totalPaid').textContent = formatNumber(data.total_paid);

        // อัปเดตวงเงิน
        document.getElementById('totalBudget').textContent = formatNumber(data.total_budget);
        document.getElementById('usedBudget').textContent = formatNumber(data.used_budget);
        document.getElementById('remainingBudget').textContent = formatNumber(data.remaining_budget);

        // อัปเดตกราฟ
        updateCharts();
    } catch (error) {
        console.error('Error loading summary:', error);
    }
}

// Render expenses table
function renderExpenses() {
    expenseTableBody.innerHTML = '';

    // Filter expenses based on selected filter
    let filteredExpenses = expenses;
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    if (currentFilter === 'pending') {
        // ค้างชำระ (ยังไม่ชำระครบ)
        filteredExpenses = expenses.filter(expense => expense.remaining_balance > 0);
    } else if (currentFilter === 'paid') {
        // ชำระครบแล้ว
        filteredExpenses = expenses.filter(expense => expense.remaining_balance === 0);
    } else if (currentFilter === 'current-month') {
        // ต้องชำระเดือนนี้ (วันที่เริ่มต้นในเดือนนี้และยังค้างชำระ)
        filteredExpenses = expenses.filter(expense => {
            if (!expense.start_date || expense.remaining_balance === 0) return false;
            const startDate = new Date(expense.start_date);
            const paymentDueDay = expense.payment_due_day || 5;

            // Check if payment is due this month
            // Payment due on the 5th of each month after start date
            return expense.remaining_balance > 0;
        });
    }

    if (filteredExpenses.length === 0) {
        expenseTableBody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 30px;">
                    ไม่มีรายการ
                </td>
            </tr>
        `;
        return;
    }

    filteredExpenses.forEach((expense, index) => {
        const row = document.createElement('tr');

        const installmentsPaid = expense.installments_paid || 0;

        // สถานะขึ้นกับทั้ง remaining_balance และ installments_paid
        const statusClass = (expense.remaining_balance === 0 || installmentsPaid >= expense.installments) ? 'status-paid' :
                           (expense.total_paid > 0 || installmentsPaid > 0) ? 'status-partial' : 'status-unpaid';

        const startDate = expense.start_date ? formatDate(expense.start_date) : '-';
        const endDate = expense.end_date ? formatDateWithMonth(expense.end_date) : '-';
        const installmentsRemaining = expense.installments - installmentsPaid;

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${startDate}</td>
            <td><strong style="color: #f5576c;">${endDate}</strong></td>
            <td class="number">${formatNumber(expense.amount)}</td>
            <td class="number">${expense.installments}</td>
            <td class="number">${formatNumber(expense.monthly_payment)}</td>
            <td class="number">
                <span class="${statusClass}">${installmentsPaid}/${expense.installments}</span>
                ${installmentsRemaining > 0 ? ` <small style="color: #999;">(เหลือ ${installmentsRemaining})</small>` : ' <small style="color: #28a745;">(ครบ)</small>'}
            </td>
            <td class="number ${statusClass}">${formatNumber(expense.total_paid)}</td>
            <td class="number ${statusClass}">${formatNumber(expense.remaining_balance)}</td>
            <td>${expense.description || '-'}</td>
            <td><span style="font-size: 0.9em;">${getCategoryIcon(expense.category)} ${expense.category || 'อื่นๆ'}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-info" onclick="openPaymentModal(${expense.id})">
                        ชำระเงิน
                    </button>
                    <button class="btn btn-success" onclick="editExpense(${expense.id})">
                        แก้ไข
                    </button>
                    <button class="btn btn-danger" onclick="deleteExpense(${expense.id})">
                        ลบ
                    </button>
                </div>
            </td>
        `;

        expenseTableBody.appendChild(row);
    });
}

// Handle form submit
async function handleFormSubmit(e) {
    e.preventDefault();

    const expenseId = document.getElementById('expenseId').value;
    const amount = document.getElementById('amount').value;
    const installments = document.getElementById('installments').value;
    const interestRate = document.getElementById('interestRate').value;
    const description = document.getElementById('description').value;
    const category = document.getElementById('category').value;
    const startDate = document.getElementById('startDate').value;
    const totalPaid = document.getElementById('totalPaid').value;
    const installmentsPaid = document.getElementById('installmentsPaid').value;

    const expenseData = {
        amount: parseFloat(amount),
        installments: parseInt(installments),
        interest_rate: parseFloat(interestRate) || 0,
        description: description,
        category: category || 'อื่นๆ',
        card_name: '',  // ไม่ใช้แล้ว
        start_date: startDate || new Date().toISOString().split('T')[0],
        billing_cycle_day: 16,  // Fix เป็นวันที่ 16
        payment_due_day: 5,     // Fix เป็นวันที่ 5
        total_paid: parseFloat(totalPaid) || 0,
        installments_paid: parseInt(installmentsPaid) || 0
    };

    try {
        let response;
        if (editMode && expenseId) {
            // Update existing expense
            response = await fetch(`/api/expenses/${expenseId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(expenseData)
            });
        } else {
            // Create new expense
            response = await fetch('/api/expenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(expenseData)
            });
        }

        if (response.ok) {
            showNotification(editMode ? 'แก้ไขรายการสำเร็จ' : 'เพิ่มรายการสำเร็จ', 'success');
            resetForm();
            loadExpenses();
            loadSummary();
        } else {
            showNotification('เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        console.error('Error saving expense:', error);
        showNotification('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
    }
}

// Edit expense
async function editExpense(id) {
    try {
        const response = await fetch(`/api/expenses/${id}`);
        const data = await response.json();
        const expense = data.expense;

        if (expense) {
            document.getElementById('expenseId').value = expense.id;
            document.getElementById('amount').value = expense.amount;
            document.getElementById('installments').value = expense.installments;
            document.getElementById('interestRate').value = expense.interest_rate || 0;
            document.getElementById('description').value = expense.description || '';
            document.getElementById('category').value = expense.category || 'อื่นๆ';
            document.getElementById('startDate').value = expense.start_date || '';
            document.getElementById('totalPaid').value = expense.total_paid;
            // แสดงค่า installmentsPaid ที่ถูกต้องจาก backend
            document.getElementById('installmentsPaid').value = expense.installments_paid || 0;

            // Calculate and show end date
            calculateEndDate();

            editMode = true;
            document.querySelector('.form-header h2').textContent = 'แก้ไขรายการ';
            document.querySelector('button[type="submit"]').textContent = 'อัปเดต';

            // Expand form and scroll to it
            const form = document.getElementById('expenseForm');
            const icon = document.getElementById('formToggleIcon');
            form.classList.remove('collapsed');
            icon.classList.add('expanded');

            // Scroll to form
            document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error loading expense:', error);
        showNotification('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
    }
}

// Delete expense
async function deleteExpense(id) {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบรายการนี้?')) {
        return;
    }

    try {
        const response = await fetch(`/api/expenses/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('ลบรายการสำเร็จ', 'success');
            loadExpenses();
            loadSummary();
        } else {
            showNotification('เกิดข้อผิดพลาดในการลบรายการ', 'error');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        showNotification('เกิดข้อผิดพลาดในการลบรายการ', 'error');
    }
}

// Open payment modal
function openPaymentModal(id) {
    document.getElementById('paymentExpenseId').value = id;
    document.getElementById('paymentAmount').value = '';

    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;

    paymentModal.style.display = 'block';
}

// Handle payment submit
async function handlePaymentSubmit(e) {
    e.preventDefault();

    const expenseId = document.getElementById('paymentExpenseId').value;
    const paymentAmount = document.getElementById('paymentAmount').value;
    const paymentDate = document.getElementById('paymentDate').value;

    try {
        const response = await fetch(`/api/expenses/${expenseId}/payment`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payment_amount: parseFloat(paymentAmount),
                payment_date: paymentDate
            })
        });

        if (response.ok) {
            showNotification('บันทึกการชำระเงินสำเร็จ', 'success');
            paymentModal.style.display = 'none';
            loadExpenses();
            loadSummary();
            loadCalendar(); // Reload calendar if on calendar page
        } else {
            showNotification('เกิดข้อผิดพลาดในการบันทึกการชำระเงิน', 'error');
        }
    } catch (error) {
        console.error('Error recording payment:', error);
        showNotification('เกิดข้อผิดพลาดในการบันทึกการชำระเงิน', 'error');
    }
}

// Reset form
function resetForm() {
    expenseForm.reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('endDate').value = '';
    editMode = false;
    document.querySelector('.form-header h2').textContent = 'เพิ่ม/แก้ไขรายการ';
    document.querySelector('button[type="submit"]').textContent = 'บันทึก';

    // ตั้งค่า default date และ billing cycle ใหม่
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = todayStr;

    const billingCycleDayInput = document.getElementById('billingCycleDay');
    const paymentDueDayInput = document.getElementById('paymentDueDay');
    if (billingCycleDayInput) billingCycleDayInput.value = billingCycleDayInput.value || 16;
    if (paymentDueDayInput) paymentDueDayInput.value = paymentDueDayInput.value || 5;

    // คำนวณ end date ใหม่
    setTimeout(() => calculateEndDate(), 50);

    // Collapse form after reset
    const form = document.getElementById('expenseForm');
    const icon = document.getElementById('formToggleIcon');
    form.classList.add('collapsed');
    icon.classList.remove('expanded');
}

// Format number
function formatNumber(num) {
    return parseFloat(num).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const year = date.getFullYear() + 543; // แปลงเป็น พ.ศ.
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
}

// Format date with month name (for end date display)
function formatDateWithMonth(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const year = date.getFullYear() + 543; // แปลงเป็น พ.ศ.
    const month = months[date.getMonth()];
    return `${month} ${year}`;
}

// Open budget modal
async function openBudgetModal() {
    try {
        const response = await fetch('/api/budget');
        const data = await response.json();

        if (data.budget) {
            document.getElementById('budgetAmount').value = data.budget.total_budget || '';
            document.getElementById('budgetDescription').value = data.budget.description || '';
        }

        budgetModal.style.display = 'block';
    } catch (error) {
        console.error('Error loading budget:', error);
        budgetModal.style.display = 'block';
    }
}

// Handle budget submit
async function handleBudgetSubmit(e) {
    e.preventDefault();

    const budgetAmount = document.getElementById('budgetAmount').value;
    const budgetDescription = document.getElementById('budgetDescription').value;

    try {
        const response = await fetch('/api/budget', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                total_budget: parseFloat(budgetAmount),
                description: budgetDescription
            })
        });

        if (response.ok) {
            showNotification('ตั้งค่าวงเงินสำเร็จ', 'success');
            budgetModal.style.display = 'none';
            loadSummary();
        } else {
            showNotification('เกิดข้อผิดพลาดในการตั้งค่าวงเงิน', 'error');
        }
    } catch (error) {
        console.error('Error updating budget:', error);
        showNotification('เกิดข้อผิดพลาดในการตั้งค่าวงเงิน', 'error');
    }
}

// Close all modals
function closeModals() {
    paymentModal.style.display = 'none';
    budgetModal.style.display = 'none';
    bulkPaymentModal.style.display = 'none';
}

// Show custom notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationContent = notification.querySelector('.notification-content');
    const notificationMessage = notification.querySelector('.notification-message');

    // Set message
    notificationMessage.textContent = message;

    // Remove old type classes
    notificationContent.classList.remove('success', 'error', 'info', 'warning');

    // Add new type class
    notificationContent.classList.add(type);

    // Show notification
    notification.style.display = 'block';
    notification.classList.remove('hide');

    // Auto hide after 3 seconds
    setTimeout(() => {
        notification.classList.add('hide');
        setTimeout(() => {
            notification.style.display = 'none';
        }, 400); // Match animation duration
    }, 3000);
}

// Get category icon
function getCategoryIcon(category) {
    const icons = {
        'อาหาร': '🍽️',
        'ท่องเที่ยว': '✈️',
        'เครื่องใช้ไฟฟ้า': '🔌',
        'เฟอร์นิเจอร์': '🛋️',
        'เสื้อผ้า': '👕',
        'สุขภาพ': '🏥',
        'การศึกษา': '📚',
        'ยานพาหนะ': '🚗',
        'น้ำมัน': '⛽',
        'ค่าเช่า': '🏠',
        'ความบันเทิง': '🎮',
        'อุปกรณ์กีฬา': '⚽',
        'เทคโนโลยี': '💻',
        'อื่นๆ': '📦'
    };
    return icons[category] || '📦';
}

// Calculate end date based on start date and installments using billing cycle logic
function calculateEndDate() {
    const startDateInput = document.getElementById('startDate');
    const installmentsInput = document.getElementById('installments');
    const endDateField = document.getElementById('endDate');
    const billingCycleDayInput = document.getElementById('billingCycleDay');
    const paymentDueDayInput = document.getElementById('paymentDueDay');

    if (!startDateInput || !installmentsInput || !endDateField) {
        console.log('Required fields not found');
        return;
    }

    const startDate = startDateInput.value;
    const installments = installmentsInput.value;
    const billingCycleDay = (billingCycleDayInput && billingCycleDayInput.value) ? parseInt(billingCycleDayInput.value) : 16;
    const paymentDueDay = (paymentDueDayInput && paymentDueDayInput.value) ? parseInt(paymentDueDayInput.value) : 5;

    console.log('Calculating end date:', { startDate, installments, billingCycleDay, paymentDueDay }); // Debug log

    if (startDate && installments && parseInt(installments) > 0) {
        // Parse the date correctly (YYYY-MM-DD format)
        const [year, month, day] = startDate.split('-').map(num => parseInt(num));
        const purchaseDate = new Date(year, month - 1, day); // month is 0-indexed in JS

        const purchaseDay = purchaseDate.getDate();
        const purchaseMonth = purchaseDate.getMonth();
        const purchaseYear = purchaseDate.getFullYear();

        // คำนวณวันครบกำหนดชำระงวดแรกตาม billing cycle logic
        let firstPaymentDate;
        if (purchaseDay >= billingCycleDay) {
            // ซื้อตั้งแต่วันตัดรอบ (16) ขึ้นไป → ยอดเข้าบิลเดือนหน้า → ชำระเดือนที่ 2
            firstPaymentDate = new Date(purchaseYear, purchaseMonth + 2, paymentDueDay);
        } else {
            // ซื้อก่อนวันตัดรอบ (1-15) → ยอดเข้าบิลเดือนนี้ → ชำระเดือนถัดไป
            firstPaymentDate = new Date(purchaseYear, purchaseMonth + 1, paymentDueDay);
        }

        // คำนวณวันผ่อนหมด = วันชำระงวดสุดท้าย
        const end = new Date(firstPaymentDate);
        end.setMonth(end.getMonth() + parseInt(installments) - 1);

        // Format as Thai month and year
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const thaiYear = end.getFullYear() + 543;
        const thaiMonth = months[end.getMonth()];

        endDateField.value = `${thaiMonth} ${thaiYear}`;
        console.log('End date calculated:', endDateField.value); // Debug log
    } else {
        endDateField.value = '';
        console.log('End date cleared'); // Debug log
    }
}

// Initialize charts
function initCharts() {
    // Budget chart (Pie chart)
    const budgetCtx = document.getElementById('budgetChart').getContext('2d');
    budgetChart = new Chart(budgetCtx, {
        type: 'pie',
        data: {
            labels: ['วงเงินที่ใช้ไป', 'วงเงินคงเหลือ'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [
                    'rgba(245, 87, 108, 0.8)',
                    'rgba(56, 239, 125, 0.8)'
                ],
                borderColor: [
                    'rgba(245, 87, 108, 1)',
                    'rgba(56, 239, 125, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += formatNumber(context.parsed) + ' บาท';
                            return label;
                        }
                    }
                }
            }
        }
    });

    // Payment status chart (Doughnut chart)
    const paymentStatusCtx = document.getElementById('paymentStatusChart').getContext('2d');
    paymentStatusChart = new Chart(paymentStatusCtx, {
        type: 'doughnut',
        data: {
            labels: ['ชำระครบแล้ว', 'ชำระบางส่วน', 'ยังไม่ชำระ'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(56, 239, 125, 0.8)',
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(245, 87, 108, 0.8)'
                ],
                borderColor: [
                    'rgba(56, 239, 125, 1)',
                    'rgba(255, 193, 7, 1)',
                    'rgba(245, 87, 108, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // Monthly payment chart (Bar chart)
    const monthlyPaymentCtx = document.getElementById('monthlyPaymentChart').getContext('2d');
    monthlyPaymentChart = new Chart(monthlyPaymentCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'ยอดรวม (บาท)',
                data: [],
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('th-TH') + ' ฿';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatNumber(context.parsed.y) + ' บาท';
                        }
                    }
                }
            }
        }
    });

    // Yearly chart (Bar chart)
    const yearlyCtx = document.getElementById('yearlyChart').getContext('2d');
    yearlyChart = new Chart(yearlyCtx, {
        type: 'bar',
        data: {
            labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
            datasets: [{
                label: 'ยอดรายจ่าย (บาท)',
                data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('th-TH') + ' ฿';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'ยอดรายจ่าย: ' + formatNumber(context.parsed.y) + ' บาท';
                        }
                    }
                }
            }
        }
    });
}

// Toggle form collapse/expand
window.toggleForm = function() {
    const form = document.getElementById('expenseForm');
    const icon = document.getElementById('formToggleIcon');

    form.classList.toggle('collapsed');
    icon.classList.toggle('expanded');
}

// Update charts with current data
async function updateCharts() {
    try {
        // Get summary data
        const summaryResponse = await fetch('/api/summary');
        const summaryData = await summaryResponse.json();

        // Update budget chart
        if (budgetChart) {
            budgetChart.data.datasets[0].data = [
                parseFloat(summaryData.used_budget),
                parseFloat(summaryData.remaining_budget)
            ];
            budgetChart.update();
        }

        // Get expenses data for other charts
        const expensesResponse = await fetch('/api/expenses');
        const expensesData = await expensesResponse.json();
        const expensesList = expensesData.expenses;

        // Update payment status chart
        if (paymentStatusChart) {
            let paidCount = 0;
            let partialCount = 0;
            let unpaidCount = 0;

            expensesList.forEach(expense => {
                if (expense.remaining_balance === 0) {
                    paidCount++;
                } else if (expense.total_paid > 0) {
                    partialCount++;
                } else {
                    unpaidCount++;
                }
            });

            paymentStatusChart.data.datasets[0].data = [paidCount, partialCount, unpaidCount];
            paymentStatusChart.update();
        }

        // Update monthly payment chart - Group by category (total amounts)
        if (monthlyPaymentChart) {
            // Group expenses by category - sum total amounts
            const categoryData = {};
            expensesList.forEach(expense => {
                const category = expense.category || 'อื่นๆ';
                if (!categoryData[category]) {
                    categoryData[category] = 0;
                }
                categoryData[category] += parseFloat(expense.amount);
            });

            // Sort by amount (descending)
            const sortedCategories = Object.entries(categoryData)
                .sort((a, b) => b[1] - a[1]);

            const labels = sortedCategories.map(([category]) => getCategoryIcon(category) + ' ' + category);
            const data = sortedCategories.map(([, amount]) => amount);

            // Generate colors for each category
            const colors = [
                'rgba(102, 126, 234, 0.8)',
                'rgba(245, 87, 108, 0.8)',
                'rgba(56, 239, 125, 0.8)',
                'rgba(255, 193, 7, 0.8)',
                'rgba(156, 39, 176, 0.8)',
                'rgba(0, 188, 212, 0.8)',
                'rgba(255, 152, 0, 0.8)',
                'rgba(76, 175, 80, 0.8)',
                'rgba(33, 150, 243, 0.8)',
                'rgba(233, 30, 99, 0.8)',
                'rgba(63, 81, 181, 0.8)',
                'rgba(255, 87, 34, 0.8)',
                'rgba(139, 195, 74, 0.8)',
                'rgba(121, 85, 72, 0.8)'
            ];

            monthlyPaymentChart.data.labels = labels;
            monthlyPaymentChart.data.datasets[0].data = data;
            monthlyPaymentChart.data.datasets[0].backgroundColor = colors.slice(0, labels.length);
            monthlyPaymentChart.data.datasets[0].borderColor = colors.slice(0, labels.length).map(color => color.replace('0.8', '1'));
            monthlyPaymentChart.update();
        }
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

// Populate year selector
function populateYearSelector() {
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();
    const buddhistYear = currentYear + 543;

    // Generate years from 3 years ago to current year
    for (let i = 3; i >= 0; i--) {
        const year = currentYear - i;
        const buddhistYearDisplay = year + 543;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = buddhistYearDisplay;
        yearSelect.appendChild(option);
    }

    // Set current year as selected
    yearSelect.value = currentYear;

    // Load initial data
    updateYearlyChart(currentYear);
}

// Update yearly chart
async function updateYearlyChart(year) {
    try {
        const response = await fetch('/api/expenses');
        const data = await response.json();
        const expensesList = data.expenses;

        // Initialize monthly data (12 months)
        const monthlyData = new Array(12).fill(0);

        // Calculate expenses for each month
        expensesList.forEach(expense => {
            if (!expense.start_date) return;

            const startDate = new Date(expense.start_date);
            const expenseYear = startDate.getFullYear();

            // Only process expenses from selected year
            if (expenseYear === year) {
                const month = startDate.getMonth(); // 0-11
                monthlyData[month] += parseFloat(expense.amount);
            }
        });

        // Update chart
        if (yearlyChart) {
            yearlyChart.data.datasets[0].data = monthlyData;
            yearlyChart.update();
        }
    } catch (error) {
        console.error('Error updating yearly chart:', error);
    }
}

// Populate calendar year selector
function populateCalendarYearSelector() {
    const yearSelect = document.getElementById('calendarYearSelect');
    const currentYear = new Date().getFullYear();
    const buddhistYear = currentYear + 543;

    // Generate years from 3 years ago to 2 years ahead
    for (let i = -3; i <= 2; i++) {
        const year = currentYear + i;
        const buddhistYearDisplay = year + 543;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = buddhistYearDisplay;
        yearSelect.appendChild(option);
    }

    // Set current year and month as selected
    yearSelect.value = currentCalendarYear;
    document.getElementById('calendarMonthSelect').value = currentCalendarMonth;
}

// Update calendar selectors to match current state
function updateCalendarSelectors() {
    document.getElementById('calendarYearSelect').value = currentCalendarYear;
    document.getElementById('calendarMonthSelect').value = currentCalendarMonth;
}

// Load calendar data
async function loadCalendar() {
    try {
        const response = await fetch(`/api/calendar?year=${currentCalendarYear}&month=${currentCalendarMonth}`);
        const data = await response.json();

        // เก็บข้อมูลรายการชำระไว้ใช้งาน
        currentMonthPayments = data.payments;

        // Update summary cards
        document.getElementById('calendarTotalAmount').textContent = formatNumber(data.summary.total_amount);
        document.getElementById('calendarTotalCount').textContent = `${data.summary.total_payments} รายการ`;

        document.getElementById('calendarPaidAmount').textContent = formatNumber(data.summary.paid_amount);
        document.getElementById('calendarPaidCount').textContent = `${data.summary.paid_count} รายการ`;

        document.getElementById('calendarUnpaidAmount').textContent = formatNumber(data.summary.unpaid_amount);
        document.getElementById('calendarUnpaidCount').textContent = `${data.summary.unpaid_count} รายการ`;

        document.getElementById('calendarOverdueAmount').textContent = formatNumber(data.summary.overdue_amount);
        document.getElementById('calendarOverdueCount').textContent = `${data.summary.overdue_count} รายการ`;

        // Render payments table
        renderCalendarPayments(data.payments);
    } catch (error) {
        console.error('Error loading calendar:', error);
        showNotification('เกิดข้อผิดพลาดในการโหลดปฏิทิน', 'error');
    }
}

// Render calendar payments table
function renderCalendarPayments(payments) {
    const tableBody = document.getElementById('calendarTableBody');
    tableBody.innerHTML = '';

    if (payments.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 30px; color: #999;">
                    ไม่มีรายการที่ต้องชำระในเดือนนี้
                </td>
            </tr>
        `;
        return;
    }

    payments.forEach(payment => {
        const row = document.createElement('tr');

        // Determine status class and text
        let statusClass = '';
        let statusText = '';

        if (payment.is_paid) {
            statusClass = 'status-paid';
            statusText = '✓ ชำระแล้ว';
        } else if (payment.is_overdue) {
            statusClass = 'status-overdue';
            statusText = '⚠ เกินกำหนด';
        } else {
            statusClass = 'status-unpaid';
            statusText = '○ ยังไม่ชำระ';
        }

        // Highlight overdue rows
        if (payment.is_overdue && !payment.is_paid) {
            row.style.backgroundColor = '#fff5f5';
        }

        const dueDate = formatDate(payment.payment_due_date);
        const categoryIcon = getCategoryIcon(payment.category);

        row.innerHTML = `
            <td><strong>${dueDate}</strong></td>
            <td>${payment.description || '-'}</td>
            <td>${categoryIcon} ${payment.category || 'อื่นๆ'}</td>
            <td class="number">${payment.installment_number}/${payment.total_installments}</td>
            <td class="number"><strong>${formatNumber(payment.payment_amount)}</strong> บาท</td>
            <td class="${statusClass}"><strong>${statusText}</strong></td>
        `;

        tableBody.appendChild(row);
    });
}

// ===== EXPORT FUNCTIONS =====

// Export Expenses to Excel
function exportToExcel() {
    try {
        // Prepare data
        const data = expenses.map((expense, index) => ({
            'ลำดับ': index + 1,
            'วันที่เริ่มต้น': expense.start_date ? formatDate(expense.start_date) : '-',
            'ผ่อนหมด': expense.end_date ? formatDateWithMonth(expense.end_date) : '-',
            'จำนวนเงิน': parseFloat(expense.amount).toFixed(2),
            'จำนวนงวด': expense.installments,
            'ยอดผ่อน/เดือน': parseFloat(expense.monthly_payment).toFixed(2),
            'ผ่อนไปแล้ว': `${expense.installments_paid || 0}/${expense.installments}`,
            'ยอดชำระแล้ว': parseFloat(expense.total_paid).toFixed(2),
            'ยอดคงเหลือ': parseFloat(expense.remaining_balance).toFixed(2),
            'รายละเอียด': expense.description || '-',
            'หมวดหมู่': expense.category || 'อื่นๆ'
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'รายการทั้งหมด');

        // Generate filename with date
        const date = new Date().toISOString().split('T')[0];
        const filename = `รายการผ่อนชำระ_${date}.xlsx`;

        // Save file
        XLSX.writeFile(wb, filename);

        showNotification('Export ไฟล์ Excel สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export Excel', 'error');
    }
}

// Export Expenses to PDF
function exportToPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Add Thai font support (using default for now)
        doc.setFont('helvetica');

        // Title
        doc.setFontSize(16);
        doc.text('รายการผ่อนชำระทั้งหมด', 14, 15);

        // Date
        doc.setFontSize(10);
        doc.text(`วันที่: ${new Date().toLocaleDateString('th-TH')}`, 14, 22);

        // Prepare table data
        const tableData = expenses.map((expense, index) => [
            index + 1,
            expense.start_date ? formatDate(expense.start_date) : '-',
            formatNumber(expense.amount),
            expense.installments,
            formatNumber(expense.monthly_payment),
            `${expense.installments_paid || 0}/${expense.installments}`,
            formatNumber(expense.total_paid),
            formatNumber(expense.remaining_balance),
            expense.description || '-'
        ]);

        // Add table
        doc.autoTable({
            head: [['#', 'วันเริ่ม', 'จำนวน', 'งวด', 'ผ่อน/ด.', 'ชำระ', 'ชำระแล้ว', 'คงเหลือ', 'รายละเอียด']],
            body: tableData,
            startY: 28,
            styles: { font: 'helvetica', fontSize: 8 },
            headStyles: { fillColor: [102, 126, 234] }
        });

        // Save PDF
        const date = new Date().toISOString().split('T')[0];
        doc.save(`รายการผ่อนชำระ_${date}.pdf`);

        showNotification('Export ไฟล์ PDF สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export PDF', 'error');
    }
}

// Export Expenses to CSV
function exportToCSV() {
    try {
        // Prepare CSV header
        const headers = ['ลำดับ', 'วันที่เริ่มต้น', 'ผ่อนหมด', 'จำนวนเงิน', 'จำนวนงวด', 'ยอดผ่อน/เดือน',
                        'ผ่อนไปแล้ว', 'ยอดชำระแล้ว', 'ยอดคงเหลือ', 'รายละเอียด', 'หมวดหมู่'];

        // Prepare CSV rows
        const rows = expenses.map((expense, index) => [
            index + 1,
            expense.start_date ? formatDate(expense.start_date) : '-',
            expense.end_date ? formatDateWithMonth(expense.end_date) : '-',
            parseFloat(expense.amount).toFixed(2),
            expense.installments,
            parseFloat(expense.monthly_payment).toFixed(2),
            `${expense.installments_paid || 0}/${expense.installments}`,
            parseFloat(expense.total_paid).toFixed(2),
            parseFloat(expense.remaining_balance).toFixed(2),
            expense.description || '-',
            expense.category || 'อื่นๆ'
        ]);

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Add BOM for UTF-8
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // Download file
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `รายการผ่อนชำระ_${date}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('Export ไฟล์ CSV สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export CSV', 'error');
    }
}

// Export Calendar to Excel
async function exportCalendarToExcel() {
    try {
        const response = await fetch(`/api/calendar?year=${currentCalendarYear}&month=${currentCalendarMonth}`);
        const data = await response.json();
        const payments = data.payments;

        if (payments.length === 0) {
            showNotification('ไม่มีข้อมูลในเดือนนี้', 'warning');
            return;
        }

        // Prepare data
        const exportData = payments.map((payment, index) => ({
            'ลำดับ': index + 1,
            'วันครบกำหนด': formatDate(payment.payment_due_date),
            'รายละเอียด': payment.description || '-',
            'หมวดหมู่': payment.category || 'อื่นๆ',
            'งวดที่': `${payment.installment_number}/${payment.total_installments}`,
            'ยอดเงิน': parseFloat(payment.payment_amount).toFixed(2),
            'สถานะ': payment.is_paid ? 'ชำระแล้ว' : payment.is_overdue ? 'เกินกำหนด' : 'ยังไม่ชำระ'
        }));

        // Create workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Add worksheet
        const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                           'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        const sheetName = `${monthNames[currentCalendarMonth - 1]} ${currentCalendarYear + 543}`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Save file
        const filename = `ปฏิทินการชำระ_${monthNames[currentCalendarMonth - 1]}_${currentCalendarYear + 543}.xlsx`;
        XLSX.writeFile(wb, filename);

        showNotification('Export ปฏิทิน Excel สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting calendar to Excel:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export', 'error');
    }
}

// Export Calendar to PDF
async function exportCalendarToPDF() {
    try {
        const response = await fetch(`/api/calendar?year=${currentCalendarYear}&month=${currentCalendarMonth}`);
        const data = await response.json();
        const payments = data.payments;

        if (payments.length === 0) {
            showNotification('ไม่มีข้อมูลในเดือนนี้', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Title
        const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                           'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        doc.setFontSize(16);
        doc.text(`ปฏิทินการชำระ - ${monthNames[currentCalendarMonth - 1]} ${currentCalendarYear + 543}`, 14, 15);

        // Summary
        doc.setFontSize(10);
        doc.text(`ยอดรวม: ${formatNumber(data.summary.total_amount)} บาท`, 14, 25);
        doc.text(`ชำระแล้ว: ${formatNumber(data.summary.paid_amount)} บาท`, 14, 30);
        doc.text(`ยังไม่ชำระ: ${formatNumber(data.summary.unpaid_amount)} บาท`, 14, 35);

        // Table data
        const tableData = payments.map((payment, index) => [
            index + 1,
            formatDate(payment.payment_due_date),
            payment.description || '-',
            `${payment.installment_number}/${payment.total_installments}`,
            formatNumber(payment.payment_amount),
            payment.is_paid ? 'ชำระแล้ว' : payment.is_overdue ? 'เกินกำหนด' : 'ยังไม่ชำระ'
        ]);

        // Add table
        doc.autoTable({
            head: [['#', 'วันครบกำหนด', 'รายละเอียด', 'งวด', 'ยอดเงิน', 'สถานะ']],
            body: tableData,
            startY: 42,
            styles: { font: 'helvetica', fontSize: 9 },
            headStyles: { fillColor: [102, 126, 234] }
        });

        // Save
        const filename = `ปฏิทินการชำระ_${monthNames[currentCalendarMonth - 1]}_${currentCalendarYear + 543}.pdf`;
        doc.save(filename);

        showNotification('Export ปฏิทิน PDF สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting calendar to PDF:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export', 'error');
    }
}

// Export Calendar to CSV
async function exportCalendarToCSV() {
    try {
        const response = await fetch(`/api/calendar?year=${currentCalendarYear}&month=${currentCalendarMonth}`);
        const data = await response.json();
        const payments = data.payments;

        if (payments.length === 0) {
            showNotification('ไม่มีข้อมูลในเดือนนี้', 'warning');
            return;
        }

        // CSV header
        const headers = ['ลำดับ', 'วันครบกำหนด', 'รายละเอียด', 'หมวดหมู่', 'งวดที่', 'ยอดเงิน', 'สถานะ'];

        // CSV rows
        const rows = payments.map((payment, index) => [
            index + 1,
            formatDate(payment.payment_due_date),
            payment.description || '-',
            payment.category || 'อื่นๆ',
            `${payment.installment_number}/${payment.total_installments}`,
            parseFloat(payment.payment_amount).toFixed(2),
            payment.is_paid ? 'ชำระแล้ว' : payment.is_overdue ? 'เกินกำหนด' : 'ยังไม่ชำระ'
        ]);

        // Combine
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                           'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        const filename = `ปฏิทินการชำระ_${monthNames[currentCalendarMonth - 1]}_${currentCalendarYear + 543}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification('Export ปฏิทิน CSV สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting calendar to CSV:', error);
        showNotification('เกิดข้อผิดพลาดในการ Export', 'error');
    }
}


// Load current user information
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/current-user');
        if (response.ok) {
            const data = await response.json();
            document.getElementById('currentUsername').textContent = 'ผู้ใช้: ' + data.user.username;
        } else {
            // Not logged in, redirect to login
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Error loading user:', error);
        window.location.href = '/login.html';
    }
}

// Handle logout
async function handleLogout() {
    if (!confirm('คุณต้องการออกจากระบบหรือไม่?')) {
        return;
    }

    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });

        if (response.ok) {
            window.location.href = '/login.html';
        } else {
            showNotification('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showNotification('เกิดข้อผิดพลาดในการออกจากระบบ', 'error');
    }
}
