const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "SMART-KHATA"
);
const dbPath = path.join(dataDir, "smart-khata.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : 0;
}

function sortByDateDesc(list, key = "date") {
  return [...list].sort((a, b) => new Date(b[key]).getTime() - new Date(a[key]).getTime());
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopkeeper (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      qr_code_data TEXT NOT NULL,
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_temp_password INTEGER NOT NULL DEFAULT 1,
      purchase_date TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      overdue REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      last_reminder_sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cost REAL NOT NULL,
      added_on TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      note TEXT DEFAULT '',
      date TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      overdue REAL NOT NULL,
      sent_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
  `);
}

function seedDatabase() {
  const shopkeeperCount = db.prepare("SELECT COUNT(*) AS count FROM shopkeeper").get().count;
  if (!shopkeeperCount) {
    db.prepare(`
      INSERT INTO shopkeeper (id, name, username, password, qr_code_data, notes)
      VALUES (@id, @name, @username, @password, @qrCodeData, @notes)
    `).run({
      id: "shop-1",
      name: "SMART KHATA Store",
      username: "shop1",
      password: "1234",
      qrCodeData: "upi://pay?pa=smartkhata@upi&pn=SMART%20KHATA%20Store&cu=INR",
      notes: "Call customers politely before marking them as paid."
    });
  }

  const customerCount = db.prepare("SELECT COUNT(*) AS count FROM customers").get().count;
  if (!customerCount) {
    const insertCustomer = db.prepare(`
      INSERT INTO customers (
        id, name, phone, password, is_temp_password, purchase_date,
        total_amount, paid_amount, overdue, status, last_reminder_sent_at
      ) VALUES (
        @id, @name, @phone, @password, @isTempPassword, @purchaseDate,
        @totalAmount, @paidAmount, @overdue, @status, @lastReminderSentAt
      )
    `);
    const insertItem = db.prepare(`
      INSERT INTO items (id, customer_id, name, cost, added_on)
      VALUES (@id, @customerId, @name, @cost, @addedOn)
    `);
    const insertPayment = db.prepare(`
      INSERT INTO payments (id, customer_id, amount, method, note, date)
      VALUES (@id, @customerId, @amount, @method, @note, @date)
    `);

    const customerId = "cust-1";
    insertCustomer.run({
      id: customerId,
      name: "Ravi Kumar",
      phone: "9876543210",
      password: "temp123",
      isTempPassword: 1,
      purchaseDate: "2026-03-12",
      totalAmount: 1800,
      paidAmount: 300,
      overdue: 1500,
      status: "pending",
      lastReminderSentAt: null
    });

    [
      { id: "item-1", customerId, name: "Rice Bag", cost: 1200, addedOn: "2026-03-12" },
      { id: "item-2", customerId, name: "Oil Tin", cost: 600, addedOn: "2026-03-12" }
    ].forEach((item) => insertItem.run(item));

    insertPayment.run({
      id: "pay-1",
      customerId,
      amount: 300,
      method: "cash",
      note: "Initial advance payment",
      date: "2026-03-15"
    });
  }
}

function initializeDatabase() {
  runMigrations();
  seedDatabase();
}

function getShopkeeper() {
  const row = db.prepare(`
    SELECT id, name, username, password, qr_code_data AS qrCodeData, notes
    FROM shopkeeper
    LIMIT 1
  `).get();
  return row || null;
}

function getCustomerRowByPhone(phone) {
  return db.prepare(`
    SELECT
      id, name, phone, password,
      is_temp_password AS isTempPassword,
      purchase_date AS purchaseDate,
      total_amount AS totalAmount,
      paid_amount AS paidAmount,
      overdue,
      status,
      last_reminder_sent_at AS lastReminderSentAt
    FROM customers
    WHERE phone = ?
  `).get(phone);
}

function getCustomerRowById(id) {
  return db.prepare(`
    SELECT
      id, name, phone, password,
      is_temp_password AS isTempPassword,
      purchase_date AS purchaseDate,
      total_amount AS totalAmount,
      paid_amount AS paidAmount,
      overdue,
      status,
      last_reminder_sent_at AS lastReminderSentAt
    FROM customers
    WHERE id = ?
  `).get(id);
}

function getCustomerItems(customerId) {
  return db.prepare(`
    SELECT id, name, cost, added_on AS addedOn
    FROM items
    WHERE customer_id = ?
    ORDER BY datetime(added_on) DESC, rowid DESC
  `).all(customerId);
}

function getLatestItemAddedOn(customerId) {
  const row = db.prepare(`
    SELECT MAX(added_on) AS latestAddedOn
    FROM items
    WHERE customer_id = ?
  `).get(customerId);

  return row?.latestAddedOn || null;
}

function getCustomerPayments(customerId) {
  return db.prepare(`
    SELECT p.id, c.phone AS customerPhone, c.name AS customerName, p.amount, p.method, p.note, p.date
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    WHERE p.customer_id = ?
    ORDER BY datetime(p.date) DESC, p.rowid DESC
  `).all(customerId);
}

function getCustomerReminders(customerId) {
  return db.prepare(`
    SELECT r.id, c.phone AS customerPhone, c.name AS customerName, r.overdue, r.sent_at AS sentAt, r.reason
    FROM reminders r
    JOIN customers c ON c.id = r.customer_id
    WHERE r.customer_id = ?
    ORDER BY datetime(r.sent_at) DESC, r.rowid DESC
  `).all(customerId);
}

function hydrateCustomer(row) {
  if (!row) return null;
  return {
    ...row,
    isTempPassword: Boolean(row.isTempPassword),
    items: getCustomerItems(row.id),
    paymentHistory: getCustomerPayments(row.id),
    reminderHistory: getCustomerReminders(row.id)
  };
}

function recalculateCustomer(customerId) {
  const totals = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(cost) FROM items WHERE customer_id = ?), 0) AS totalAmount,
      COALESCE((SELECT SUM(amount) FROM payments WHERE customer_id = ?), 0) AS paidAmount
  `).get(customerId, customerId);

  const totalAmount = normalizeMoney(totals.totalAmount);
  const paidAmount = normalizeMoney(totals.paidAmount);
  const overdue = Number(Math.max(totalAmount - paidAmount, 0).toFixed(2));
  const status = overdue <= 0 ? "paid" : "pending";

  db.prepare(`
    UPDATE customers
    SET total_amount = ?, paid_amount = ?, overdue = ?, status = ?
    WHERE id = ?
  `).run(totalAmount, paidAmount, overdue, status, customerId);

  return getCustomerRowById(customerId);
}

function getCustomerByPhone(phone) {
  const row = getCustomerRowByPhone(phone);
  if (!row) return null;
  recalculateCustomer(row.id);
  return hydrateCustomer(getCustomerRowByPhone(phone));
}

function getAllCustomers() {
  const rows = db.prepare(`
    SELECT
      id, name, phone, password,
      is_temp_password AS isTempPassword,
      purchase_date AS purchaseDate,
      total_amount AS totalAmount,
      paid_amount AS paidAmount,
      overdue,
      status,
      last_reminder_sent_at AS lastReminderSentAt
    FROM customers
    ORDER BY name COLLATE NOCASE
  `).all();

  return rows.map((row) => {
    recalculateCustomer(row.id);
    return hydrateCustomer(getCustomerRowById(row.id));
  });
}

function createCustomer({ name, phone, temporaryPassword, purchaseDate, items, paidAmount = 0 }) {
  const customerId = createId("cust");
  const insertCustomer = db.prepare(`
    INSERT INTO customers (
      id, name, phone, password, is_temp_password, purchase_date,
      total_amount, paid_amount, overdue, status, last_reminder_sent_at
    ) VALUES (?, ?, ?, ?, 1, ?, 0, 0, 0, 'pending', NULL)
  `);
  const insertItem = db.prepare(`
    INSERT INTO items (id, customer_id, name, cost, added_on)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, customer_id, amount, method, note, date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertCustomer.run(customerId, name, phone, temporaryPassword, purchaseDate);

    items.forEach((item) => {
      insertItem.run(
        createId("item"),
        customerId,
        item.name,
        normalizeMoney(item.cost),
        item.addedOn || purchaseDate
      );
    });

    const initialPaid = normalizeMoney(paidAmount);
    if (initialPaid > 0) {
      insertPayment.run(
        createId("pay"),
        customerId,
        initialPaid,
        "cash",
        "Paid during customer creation",
        new Date().toISOString()
      );
    }

    recalculateCustomer(customerId);
  });

  transaction();
  return getCustomerByPhone(phone);
}

function addItemToCustomer(phone, { name, cost }) {
  const customer = getCustomerRowByPhone(phone);
  if (!customer) return null;

  db.prepare(`
    INSERT INTO items (id, customer_id, name, cost, added_on)
    VALUES (?, ?, ?, ?, ?)
  `).run(createId("item"), customer.id, name, normalizeMoney(cost), new Date().toISOString().slice(0, 10));

  recalculateCustomer(customer.id);
  return getCustomerByPhone(phone);
}

function recordPaymentForCustomer(phone, { amount, method, note = "" }) {
  const customer = getCustomerRowByPhone(phone);
  if (!customer) return null;

  const normalizedAmount = normalizeMoney(amount);
  const payment = {
    id: createId("pay"),
    customerId: customer.id,
    amount: normalizedAmount,
    method,
    note,
    date: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO payments (id, customer_id, amount, method, note, date)
    VALUES (@id, @customerId, @amount, @method, @note, @date)
  `).run(payment);

  recalculateCustomer(customer.id);

  return {
    payment: {
      id: payment.id,
      customerPhone: customer.phone,
      customerName: customer.name,
      amount: normalizedAmount,
      method,
      note,
      date: payment.date
    },
    customer: getCustomerByPhone(phone)
  };
}

function addReminderForCustomer(phone, reason) {
  const customer = getCustomerByPhone(phone);
  if (!customer || customer.status === "paid") return null;

  const sentAt = new Date().toISOString();
  const reminderId = createId("rem");

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO reminders (id, customer_id, overdue, sent_at, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(reminderId, customer.id, customer.overdue, sentAt, reason);

    db.prepare(`
      UPDATE customers
      SET last_reminder_sent_at = ?
      WHERE id = ?
    `).run(sentAt, customer.id);
  });

  transaction();

  return {
    id: reminderId,
    customerPhone: customer.phone,
    customerName: customer.name,
    overdue: customer.overdue,
    sentAt,
    reason
  };
}

function sendDueReminders(reminderIntervalMs) {
  const customers = getAllCustomers();
  const now = Date.now();
  const sent = [];

  customers.forEach((customer) => {
    if (customer.status === "paid") return;

    const latestItemAddedOn = getLatestItemAddedOn(customer.id);
    const baseDate = customer.lastReminderSentAt || latestItemAddedOn || customer.purchaseDate;
    const lastSent = new Date(baseDate).getTime();

    if (Number.isNaN(lastSent) || now - lastSent >= reminderIntervalMs) {
      const reminder = addReminderForCustomer(customer.phone, "Automatic overdue reminder sent");
      if (reminder) {
        sent.push(reminder);
      }
    }
  });

  return sent;
}

function updateCustomerPassword(phone, oldPassword, newPassword) {
  const customer = getCustomerRowByPhone(phone);
  if (!customer) return { ok: false, message: "Customer not found" };
  if (customer.password !== oldPassword) return { ok: false, message: "Current password is incorrect" };

  db.prepare(`
    UPDATE customers
    SET password = ?, is_temp_password = 0
    WHERE id = ?
  `).run(newPassword, customer.id);

  return { ok: true };
}

function updateShopkeeperNotes(notes) {
  db.prepare("UPDATE shopkeeper SET notes = ? WHERE id = (SELECT id FROM shopkeeper LIMIT 1)").run(notes || "");
  return getShopkeeper();
}

function deleteCustomerByPhone(phone) {
  const customer = getCustomerRowByPhone(phone);
  if (!customer) return { ok: false, message: "Customer not found" };

  recalculateCustomer(customer.id);
  const currentCustomer = getCustomerRowByPhone(phone);
  if (Number(currentCustomer.overdue) > 0) {
    return { ok: false, message: "Only fully paid customers can be deleted" };
  }

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM reminders WHERE customer_id = ?").run(currentCustomer.id);
    db.prepare("DELETE FROM payments WHERE customer_id = ?").run(currentCustomer.id);
    db.prepare("DELETE FROM items WHERE customer_id = ?").run(currentCustomer.id);
    db.prepare("DELETE FROM customers WHERE id = ?").run(currentCustomer.id);
  });

  transaction();
  return { ok: true };
}

function getRecentPayments(limit = 20) {
  return db.prepare(`
    SELECT p.id, c.phone AS customerPhone, c.name AS customerName, p.amount, p.method, p.note, p.date
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    ORDER BY datetime(p.date) DESC, p.rowid DESC
    LIMIT ?
  `).all(limit);
}

function getRecentReminders(limit = 20) {
  return db.prepare(`
    SELECT r.id, c.phone AS customerPhone, c.name AS customerName, r.overdue, r.sent_at AS sentAt, r.reason
    FROM reminders r
    JOIN customers c ON c.id = r.customer_id
    ORDER BY datetime(r.sent_at) DESC, r.rowid DESC
    LIMIT ?
  `).all(limit);
}

function getDashboardData() {
  const shopkeeper = getShopkeeper();
  return {
    shopkeeper: {
      name: shopkeeper.name,
      username: shopkeeper.username,
      qrCodeData: shopkeeper.qrCodeData,
      notes: shopkeeper.notes
    },
    customers: getAllCustomers(),
    reminders: sortByDateDesc(getRecentReminders()),
    payments: sortByDateDesc(getRecentPayments())
  };
}

module.exports = {
  dbPath,
  initializeDatabase,
  normalizeMoney,
  getShopkeeper,
  getCustomerByPhone,
  getAllCustomers,
  createCustomer,
  addItemToCustomer,
  recordPaymentForCustomer,
  addReminderForCustomer,
  sendDueReminders,
  updateCustomerPassword,
  updateShopkeeperNotes,
  getDashboardData,
  deleteCustomerByPhone
};
