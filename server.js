const express = require("express");
const path = require("path");
const {
  initializeDatabase,
  normalizeMoney,
  getShopkeeper,
  getCustomerByPhone,
  createCustomer,
  addItemToCustomer,
  recordPaymentForCustomer,
  addReminderForCustomer,
  sendDueReminders,
  updateCustomerPassword,
  updateShopkeeperNotes,
  getDashboardData,
  deleteCustomerByPhone
} = require("./database");

const app = express();
const PORT = 3000;
const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;

initializeDatabase();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/login", (req, res) => {
  const { role, username, password } = req.body;
  const shopkeeper = getShopkeeper();

  if (role === "shopkeeper") {
    const isValid = shopkeeper && username === shopkeeper.username && password === shopkeeper.password;

    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid shopkeeper credentials" });
    }

    return res.json({
      success: true,
      role,
      user: {
        name: shopkeeper.name,
        username: shopkeeper.username
      }
    });
  }

  if (role === "user") {
    const customer = getCustomerByPhone(username);

    if (!customer || customer.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid phone number or password" });
    }

    return res.json({
      success: true,
      role,
      requiresPasswordChange: customer.isTempPassword,
      user: {
        phone: customer.phone,
        name: customer.name
      }
    });
  }

  return res.status(400).json({ success: false, message: "Invalid role" });
});

app.get("/dashboard", (req, res) => {
  res.json(getDashboardData());
});

app.post("/customers", (req, res) => {
  const { name, phone, temporaryPassword, purchaseDate, items = [], paidAmount = 0 } = req.body;

  if (!name || !phone || !temporaryPassword || !purchaseDate || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: "Please provide complete customer details" });
  }

  if (getCustomerByPhone(phone)) {
    return res.status(409).json({ success: false, message: "Customer phone number already exists" });
  }

  const customerItems = items
    .map((item) => ({
      name: item.name,
      cost: normalizeMoney(item.cost),
      addedOn: item.addedOn || purchaseDate
    }))
    .filter((item) => item.name && item.cost > 0);

  if (!customerItems.length) {
    return res.status(400).json({ success: false, message: "Add at least one valid item" });
  }

  const customer = createCustomer({
    name,
    phone,
    temporaryPassword,
    purchaseDate,
    items: customerItems,
    paidAmount: normalizeMoney(paidAmount)
  });

  return res.status(201).json({ success: true, customer });
});

app.get("/customers", (req, res) => {
  res.json(getDashboardData().customers);
});

app.get("/customers/:phone", (req, res) => {
  const customer = getCustomerByPhone(req.params.phone);
  const shopkeeper = getShopkeeper();
  if (!customer) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  return res.json({ success: true, customer, qrCodeData: shopkeeper.qrCodeData });
});

app.post("/customers/:phone/items", (req, res) => {
  const { name, cost } = req.body;

  if (!getCustomerByPhone(req.params.phone)) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  const itemCost = normalizeMoney(cost);
  if (!name || !itemCost) {
    return res.status(400).json({ success: false, message: "Enter valid item name and cost" });
  }

  const customer = addItemToCustomer(req.params.phone, { name, cost: itemCost });

  return res.json({ success: true, customer });
});

app.post("/customers/:phone/payments", (req, res) => {
  const customer = getCustomerByPhone(req.params.phone);
  const { amount, method, note } = req.body;

  if (!customer) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  const normalizedAmount = normalizeMoney(amount);
  if (!normalizedAmount) {
    return res.status(400).json({ success: false, message: "Enter a valid payment amount" });
  }

  if (normalizedAmount > customer.overdue) {
    return res.status(400).json({ success: false, message: "Payment cannot be more than overdue amount" });
  }

  const result = recordPaymentForCustomer(req.params.phone, {
    amount: normalizedAmount,
    method: method || "cash",
    note
  });

  return res.json({
    success: true,
    payment: result.payment,
    customer: result.customer
  });
});

app.post("/customers/:phone/mark-paid", (req, res) => {
  const customer = getCustomerByPhone(req.params.phone);

  if (!customer) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  if (customer.overdue <= 0) {
    return res.json({ success: true, customer });
  }

  const result = recordPaymentForCustomer(req.params.phone, {
    amount: customer.overdue,
    method: "cash",
    note: "Marked as paid manually by shopkeeper"
  });
  return res.json({ success: true, customer: result.customer });
});

app.post("/customers/:phone/reminder", (req, res) => {
  if (!getCustomerByPhone(req.params.phone)) {
    return res.status(404).json({ success: false, message: "Customer not found" });
  }

  const reminder = addReminderForCustomer(
    req.params.phone,
    req.body.reason || "Manual reminder sent by shopkeeper"
  );
  if (!reminder) {
    return res.status(400).json({ success: false, message: "Customer is already marked as paid" });
  }

  return res.json({ success: true, reminder, customer: getCustomerByPhone(req.params.phone) });
});

app.delete("/customers/:phone", (req, res) => {
  const result = deleteCustomerByPhone(req.params.phone);
  if (!result.ok) {
    const status = result.message === "Customer not found" ? 404 : 400;
    return res.status(status).json({ success: false, message: result.message });
  }

  return res.json({ success: true });
});

app.post("/reminders/run", (req, res) => {
  const sent = sendDueReminders(REMINDER_INTERVAL_MS);
  res.json({ success: true, sent, count: sent.length });
});

app.post("/notes", (req, res) => {
  const shopkeeper = updateShopkeeperNotes(req.body.notes || "");
  res.json({ success: true, notes: shopkeeper.notes });
});

app.post("/change-password", (req, res) => {
  const { phone, oldPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ success: false, message: "New password must be at least 4 characters" });
  }

  const result = updateCustomerPassword(phone, oldPassword, newPassword);
  if (!result.ok) {
    const status = result.message === "Customer not found" ? 404 : 400;
    return res.status(status).json({ success: false, message: result.message });
  }

  return res.json({ success: true });
});

setInterval(() => {
  sendDueReminders(REMINDER_INTERVAL_MS);
}, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`SMART KHATA server running on http://localhost:${PORT}`);
});
