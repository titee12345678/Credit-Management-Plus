// ฟังก์ชันสำหรับการชำระยอดเต็มเดือน

// เปิด Modal ชำระยอดเต็มเดือน
function openBulkPaymentModal() {
    const unpaidPayments = currentMonthPayments.filter(p => !p.is_paid);

    if (unpaidPayments.length === 0) {
        showNotification('ไม่มีรายการที่ต้องชำระในเดือนนี้', 'info');
        return;
    }

    // แสดงชื่อเดือน
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const monthName = months[currentCalendarMonth - 1];
    const thaiYear = currentCalendarYear + 543;
    document.getElementById('bulkPaymentMonth').textContent = `${monthName} ${thaiYear}`;

    // สร้างรายการ
    renderBulkPaymentItems(unpaidPayments);

    // แสดง modal
    bulkPaymentModal.style.display = 'block';
}

// แสดงรายการในตาราง
function renderBulkPaymentItems(payments) {
    const tbody = document.getElementById('bulkPaymentItems');
    tbody.innerHTML = '';

    let total = 0;
    const today = new Date().toISOString().split('T')[0];

    payments.forEach((payment, index) => {
        total += parseFloat(payment.payment_amount);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox"
                       class="payment-checkbox"
                       data-index="${index}"
                       data-expense-id="${payment.expense_id}"
                       data-installment="${payment.installment_number}"
                       data-amount="${payment.payment_amount}"
                       checked>
            </td>
            <td>
                <strong>${payment.description}</strong><br>
                <small style="color: #6c757d;">${payment.category}</small>
            </td>
            <td style="text-align: center;">
                ${payment.installment_number}/${payment.total_installments}
            </td>
            <td>
                <input type="number"
                       class="payment-amount-input"
                       data-index="${index}"
                       value="${payment.payment_amount}"
                       step="0.01"
                       min="0"
                       style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px;">
            </td>
            <td>
                <input type="date"
                       class="payment-date-input"
                       data-index="${index}"
                       value="${today}"
                       style="width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px;">
            </td>
        `;
        tbody.appendChild(row);
    });

    // อัพเดทยอดรวม
    updateBulkPaymentTotal();

    // Event listeners
    document.getElementById('selectAllPayments').addEventListener('change', function() {
        document.querySelectorAll('.payment-checkbox').forEach(cb => {
            cb.checked = this.checked;
        });
        updateBulkPaymentTotal();
    });

    document.querySelectorAll('.payment-checkbox').forEach(cb => {
        cb.addEventListener('change', updateBulkPaymentTotal);
    });

    document.querySelectorAll('.payment-amount-input').forEach(input => {
        input.addEventListener('input', updateBulkPaymentTotal);
    });
}

// คำนวณยอดรวม
function updateBulkPaymentTotal() {
    let total = 0;
    document.querySelectorAll('.payment-checkbox:checked').forEach(cb => {
        const index = cb.dataset.index;
        const amountInput = document.querySelector(`.payment-amount-input[data-index="${index}"]`);
        total += parseFloat(amountInput.value) || 0;
    });

    document.getElementById('bulkPaymentTotal').textContent = formatNumber(total) + ' บาท';
}

// ยืนยันการชำระ
async function handleBulkPaymentSubmit(e) {
    e.preventDefault();

    const selectedPayments = [];
    document.querySelectorAll('.payment-checkbox:checked').forEach(cb => {
        const index = cb.dataset.index;
        const amountInput = document.querySelector(`.payment-amount-input[data-index="${index}"]`);
        const dateInput = document.querySelector(`.payment-date-input[data-index="${index}"]`);

        selectedPayments.push({
            expense_id: parseInt(cb.dataset.expenseId),
            installment_number: parseInt(cb.dataset.installment),
            payment_amount: parseFloat(amountInput.value),
            payment_date: dateInput.value
        });
    });

    if (selectedPayments.length === 0) {
        showNotification('กรุณาเลือกรายการที่ต้องการชำระ', 'warning');
        return;
    }

    try {
        // ส่งคำขอไปยัง API
        const response = await fetch('/api/bulk-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ payments: selectedPayments })
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(`ชำระเรียบร้อย ${result.success_count} รายการ`, 'success');
            bulkPaymentModal.style.display = 'none';
            loadCalendar();
            loadExpenses();
            loadSummary();
        } else {
            throw new Error('เกิดข้อผิดพลาด');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการชำระ', 'error');
    }
}
