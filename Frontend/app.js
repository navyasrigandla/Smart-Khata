let newCustomerItems = [];
let dashboardCache = null;

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(amount || 0));
}

function formatDate(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined
  });
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

async function login(role) {
  const usernameInput = role === "shopkeeper" ? "username" : "phone";
  const username = document.getElementById(usernameInput).value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Please enter login details.");
    return;
  }

  try {
    const data = await api("/login", {
      method: "POST",
      body: JSON.stringify({ role, username, password })
    });

    localStorage.setItem("role", role);

    if (role === "shopkeeper") {
      localStorage.setItem("shopkeeperName", data.user.name);
      window.location.href = "shopkeeper.html";
      return;
    }

    localStorage.setItem("userPhone", data.user.phone);
    localStorage.setItem("userName", data.user.name);
    if (data.requiresPasswordChange) {
      window.location.href = "change-password.html";
      return;
    }
    window.location.href = "user.html";
  } catch (error) {
    alert(error.message);
  }
}

function userLogin() {
  return login("user");
}

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

function showSection(sectionId) {
  document.querySelectorAll(".section-view").forEach((section) => {
    section.style.display = section.id === sectionId ? "block" : "none";
  });

  document.querySelectorAll("[data-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionId);
  });
}

function openModal() {
  const modal = document.getElementById("addCustomerModal");
  if (!modal) return;

  newCustomerItems = [];
  document.getElementById("customerForm").reset();
  document.getElementById("initialPaidAmount").value = "0";
  document.getElementById("purchaseDate").value = new Date().toISOString().slice(0, 10);
  renderNewCustomerItems();
  modal.style.display = "flex";
}

function closeModal() {
  const modal = document.getElementById("addCustomerModal");
  if (modal) {
    modal.style.display = "none";
  }
}

function addItem() {
  const name = document.getElementById("itemName").value.trim();
  const cost = Number(document.getElementById("itemCost").value);

  if (!name || !cost) {
    alert("Enter both item name and cost.");
    return;
  }

  newCustomerItems.push({ name, cost });
  document.getElementById("itemName").value = "";
  document.getElementById("itemCost").value = "";
  renderNewCustomerItems();
}

function removeNewItem(index) {
  newCustomerItems.splice(index, 1);
  renderNewCustomerItems();
}

function renderNewCustomerItems() {
  const list = document.getElementById("itemsList");
  const total = document.getElementById("newCustomerTotal");
  if (!list || !total) return;

  list.innerHTML = newCustomerItems.length
    ? newCustomerItems
        .map(
          (item, index) => `
            <li class="mini-list-item">
              <span>${escapeHtml(item.name)} - ${formatCurrency(item.cost)}</span>
              <button type="button" class="ghost-btn" onclick="removeNewItem(${index})">Remove</button>
            </li>
          `
        )
        .join("")
    : '<li class="empty-state compact">No items added yet.</li>';

  const totalAmount = newCustomerItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  total.textContent = formatCurrency(totalAmount);
}

async function addCustomer() {
  const form = document.getElementById("customerForm");
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const temporaryPassword = document.getElementById("temporaryPassword").value.trim();
  const purchaseDate = document.getElementById("purchaseDate").value;
  const paidAmount = Number(document.getElementById("initialPaidAmount").value || 0);

  if (!form.reportValidity()) return;
  if (!newCustomerItems.length) {
    alert("Add at least one purchased item.");
    return;
  }

  try {
    await api("/customers", {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        temporaryPassword,
        purchaseDate,
        paidAmount,
        items: newCustomerItems
      })
    });

    closeModal();
    await loadShopkeeperDashboard();
    alert("Customer saved successfully.");
  } catch (error) {
    alert(error.message);
  }
}

function renderCustomerCards(customers) {
  const list = document.getElementById("customerList");
  if (!list) return;

  if (!customers.length) {
    list.innerHTML = '<div class="empty-state">No customers found.</div>';
    return;
  }

  list.innerHTML = customers
    .map((customer) => {
      const paymentBadge = customer.status === "paid" ? "badge success" : "badge danger";
      const deleteButton =
        Number(customer.overdue) === 0
          ? `<button type="button" class="ghost-btn" onclick="deleteCustomer('${customer.phone}')">Delete</button>`
          : "";
      return `
        <article class="customer-card">
          <div class="customer-top">
            <div>
              <h3>${escapeHtml(customer.name)}</h3>
              <p>${escapeHtml(customer.phone)}</p>
            </div>
            <div class="${paymentBadge}">${customer.status === "paid" ? "Paid" : "Pending"}</div>
          </div>
          <div class="customer-grid">
            <div>
              <span class="label">Purchase Date</span>
              <strong>${formatDate(customer.purchaseDate)}</strong>
            </div>
            <div>
              <span class="label">Total</span>
              <strong>${formatCurrency(customer.totalAmount)}</strong>
            </div>
            <div>
              <span class="label">Paid</span>
              <strong>${formatCurrency(customer.paidAmount)}</strong>
            </div>
            <div>
              <span class="label">Overdue</span>
              <strong>${formatCurrency(customer.overdue)}</strong>
            </div>
          </div>
          <div class="detail-block">
            <span class="label">Items Bought</span>
            <ul class="details-list">
              ${
                customer.items.length
                  ? customer.items
                      .map(
                        (item) =>
                          `<li>${escapeHtml(item.name)} <strong>${formatCurrency(item.cost)}</strong></li>`
                      )
                      .join("")
                  : "<li>No items</li>"
              }
            </ul>
          </div>
          <div class="inline-form">
            <input id="new-item-${customer.phone}" type="text" placeholder="New item name">
            <input id="new-cost-${customer.phone}" type="number" min="1" placeholder="Cost">
            <button type="button" onclick="addItemToCustomer('${customer.phone}')">Update Items</button>
          </div>
          <div class="inline-form">
            <input id="cash-amount-${customer.phone}" type="number" min="1" max="${customer.overdue}" placeholder="Cash amount">
            <button type="button" onclick="recordCashPayment('${customer.phone}')">Record Cash Payment</button>
            <button type="button" class="secondary-btn" onclick="markCustomerPaid('${customer.phone}')">Mark Fully Paid</button>
            <button type="button" class="ghost-btn" onclick="sendReminder('${customer.phone}')">Send Reminder</button>
            ${deleteButton}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderReminderList(reminders) {
  const list = document.getElementById("remindersList");
  if (!list) return;

  list.innerHTML = reminders.length
    ? reminders
        .map(
          (reminder) => `
            <li class="timeline-card">
              <strong>${escapeHtml(reminder.customerName)}</strong>
              <span>${formatCurrency(reminder.overdue)} overdue</span>
              <small>${formatDate(reminder.sentAt)}</small>
            </li>
          `
        )
        .join("")
    : '<li class="empty-state compact">No reminders sent yet.</li>';
}

function renderPaymentsList(payments) {
  const list = document.getElementById("paymentsList");
  if (!list) return;

  list.innerHTML = payments.length
    ? payments
        .map(
          (payment) => `
            <li class="timeline-card">
              <strong>${escapeHtml(payment.customerName)}</strong>
              <span>${formatCurrency(payment.amount)} via ${escapeHtml(payment.method)}</span>
              <small>${formatDate(payment.date)}</small>
            </li>
          `
        )
        .join("")
    : '<li class="empty-state compact">No payments recorded yet.</li>';
}

function renderSummaryCards(customers, reminders, payments) {
  const totalCustomers = customers.length;
  const pendingCustomers = customers.filter((customer) => customer.status !== "paid").length;
  const overdueTotal = customers.reduce((sum, customer) => sum + Number(customer.overdue || 0), 0);

  document.getElementById("summaryCards").innerHTML = `
    <div class="summary-card">
      <span>Total Customers</span>
      <strong>${totalCustomers}</strong>
    </div>
    <div class="summary-card">
      <span>Pending Accounts</span>
      <strong>${pendingCustomers}</strong>
    </div>
    <div class="summary-card">
      <span>Total Overdue</span>
      <strong>${formatCurrency(overdueTotal)}</strong>
    </div>
    <div class="summary-card">
      <span>Recent Activity</span>
      <strong>${payments.length + reminders.length}</strong>
    </div>
  `;
}

async function loadShopkeeperDashboard(runReminders = true) {
  if (localStorage.getItem("role") !== "shopkeeper") {
    window.location.href = "login-shopkeeper.html";
    return;
  }

  try {
    if (runReminders) {
      await api("/reminders/run", { method: "POST", body: JSON.stringify({}) });
    }

    const dashboard = await api("/dashboard");
    dashboardCache = dashboard;

    document.getElementById("shopkeeperName").textContent = dashboard.shopkeeper.name;
    document.getElementById("notesBox").value = dashboard.shopkeeper.notes || "";

    renderSummaryCards(dashboard.customers, dashboard.reminders, dashboard.payments);
    renderCustomerCards(dashboard.customers);
    renderReminderList(dashboard.reminders);
    renderPaymentsList(dashboard.payments);
  } catch (error) {
    alert(error.message);
  }
}

function searchCustomer() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  if (!dashboardCache) return;

  const filtered = dashboardCache.customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(term) || customer.phone.toLowerCase().includes(term)
  );

  renderCustomerCards(filtered);
}

async function saveNotes() {
  try {
    const notes = document.getElementById("notesBox").value;
    await api("/notes", {
      method: "POST",
      body: JSON.stringify({ notes })
    });
    alert("Notes saved.");
  } catch (error) {
    alert(error.message);
  }
}

async function addItemToCustomer(phone) {
  const name = document.getElementById(`new-item-${phone}`).value.trim();
  const cost = Number(document.getElementById(`new-cost-${phone}`).value);

  if (!name || !cost) {
    alert("Enter the new item details.");
    return;
  }

  try {
    await api(`/customers/${phone}/items`, {
      method: "POST",
      body: JSON.stringify({ name, cost })
    });
    await loadShopkeeperDashboard(false);
  } catch (error) {
    alert(error.message);
  }
}

async function recordCashPayment(phone) {
  const amount = Number(document.getElementById(`cash-amount-${phone}`).value);
  if (!amount) {
    alert("Enter cash amount.");
    return;
  }

  try {
    await api(`/customers/${phone}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount,
        method: "cash",
        note: "Recorded manually by shopkeeper"
      })
    });
    await loadShopkeeperDashboard(false);
  } catch (error) {
    alert(error.message);
  }
}

async function markCustomerPaid(phone) {
  try {
    await api(`/customers/${phone}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadShopkeeperDashboard(false);
  } catch (error) {
    alert(error.message);
  }
}

async function sendReminder(phone) {
  try {
    await api(`/customers/${phone}/reminder`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadShopkeeperDashboard(false);
  } catch (error) {
    alert(error.message);
  }
}

async function deleteCustomer(phone) {
  const shouldDelete = confirm("Do You delete the customer details?");
  if (!shouldDelete) {
    return;
  }

  try {
    await api(`/customers/${phone}`, {
      method: "DELETE"
    });
    await loadShopkeeperDashboard(false);
  } catch (error) {
    alert(error.message);
  }
}

async function sendWeeklyRemindersNow() {
  try {
    const data = await api("/reminders/run", {
      method: "POST",
      body: JSON.stringify({})
    });
    await loadShopkeeperDashboard(false);
    alert(data.count ? `${data.count} reminder(s) sent.` : "No customers were due for a reminder.");
  } catch (error) {
    alert(error.message);
  }
}

async function loadUserDashboard() {
  const phone = localStorage.getItem("userPhone");
  if (!phone) {
    window.location.href = "login-user.html";
    return;
  }

  try {
    const data = await api(`/customers/${phone}`);
    const customer = data.customer;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      data.qrCodeData
    )}`;

    document.getElementById("userWelcome").textContent = customer.name;
    document.getElementById("userPhoneValue").textContent = customer.phone;
    document.getElementById("purchaseDateValue").textContent = formatDate(customer.purchaseDate);
    document.getElementById("overdueValue").textContent = formatCurrency(customer.overdue);
    document.getElementById("paidValue").textContent = formatCurrency(customer.paidAmount);
    document.getElementById("totalValue").textContent = formatCurrency(customer.totalAmount);
    document.getElementById("paymentStatus").textContent =
      customer.status === "paid" ? "Payment is done" : "Payment pending";
    document.getElementById("paymentStatus").className =
      customer.status === "paid" ? "badge success" : "badge danger";
    document.getElementById("paymentAmount").value = customer.overdue || "";
    document.getElementById("paymentAmount").max = customer.overdue;
    document.getElementById("qrCodeImage").src = qrUrl;
    document.getElementById("upiText").textContent = data.qrCodeData;

    document.getElementById("itemsListUser").innerHTML = customer.items.length
      ? customer.items
          .map(
            (item) => `
              <li>
                <span>${escapeHtml(item.name)}</span>
                <strong>${formatCurrency(item.cost)}</strong>
              </li>
            `
          )
          .join("")
      : '<li class="empty-state compact">No items added.</li>';

    document.getElementById("userPaymentsList").innerHTML = customer.paymentHistory.length
      ? customer.paymentHistory
          .map(
            (payment) => `
              <li class="timeline-card">
                <strong>${formatCurrency(payment.amount)}</strong>
                <span>${escapeHtml(payment.method)}</span>
                <small>${formatDate(payment.date)}</small>
              </li>
            `
          )
          .join("")
      : '<li class="empty-state compact">No payments made yet.</li>';

    document.getElementById("userRemindersList").innerHTML = customer.reminderHistory.length
      ? customer.reminderHistory
          .map(
            (reminder) => `
              <li class="timeline-card">
                <strong>${formatCurrency(reminder.overdue)} due</strong>
                <span>${escapeHtml(reminder.reason)}</span>
                <small>${formatDate(reminder.sentAt)}</small>
              </li>
            `
          )
          .join("")
      : '<li class="empty-state compact">No reminders yet.</li>';
  } catch (error) {
    alert(error.message);
  }
}

async function payOnline() {
  const phone = localStorage.getItem("userPhone");
  const amount = Number(document.getElementById("paymentAmount").value);

  if (!amount) {
    alert("Enter the payment amount.");
    return;
  }

  try {
    await api(`/customers/${phone}/payments`, {
      method: "POST",
      body: JSON.stringify({
        amount,
        method: "online",
        note: "Customer marked payment after QR transfer"
      })
    });
    await loadUserDashboard();
    alert("Payment recorded successfully.");
  } catch (error) {
    alert(error.message);
  }
}

async function changePassword() {
  const phone = localStorage.getItem("userPhone");
  const oldPassword = document.getElementById("oldPassword").value.trim();
  const newPassword = document.getElementById("newPasswordUser").value.trim();

  try {
    await api("/change-password", {
      method: "POST",
      body: JSON.stringify({ phone, oldPassword, newPassword })
    });
    alert("Password updated successfully.");
    window.location.href = "user.html";
  } catch (error) {
    alert(error.message);
  }
}

async function setNewPassword() {
  const phone = localStorage.getItem("userPhone");
  if (!phone) {
    window.location.href = "login-user.html";
    return;
  }

  const oldPassword = document.getElementById("tempPassword").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();

  try {
    await api("/change-password", {
      method: "POST",
      body: JSON.stringify({ phone, oldPassword, newPassword })
    });
    alert("Password saved. Please continue.");
    window.location.href = "user.html";
  } catch (error) {
    alert(error.message);
  }
}

window.onclick = function (event) {
  const modal = document.getElementById("addCustomerModal");
  if (modal && event.target === modal) {
    closeModal();
  }
};
