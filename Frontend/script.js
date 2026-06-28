// =======================
// GLOBAL ITEMS ARRAY
// =======================
let items = [];

// =======================
// LOGIN FUNCTION
// =======================
async function login(role) {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password, role })
        });

        const data = await res.json();

        if (data.success) {
            alert("Login successful");

            // store session
            localStorage.setItem("role", role);
            localStorage.setItem("userPhone", username);

            if (role === "shopkeeper") {
                window.location.href = "shopkeeper.html";
            } else {
                window.location.href = "user.html";
            }
        } else {
            alert("Invalid Credentials");
        }

    } catch (err) {
        console.error(err);
        alert("Server error");
    }
}

// =======================
// ADD ITEM
// =======================
function addItem() {
    const itemName = document.getElementById("itemName")?.value;
    const itemAmount = document.getElementById("itemAmount")?.value;

    if (!itemName || !itemAmount) {
        return alert("Enter item details");
    }

    items.push({
        name: itemName,
        amount: Number(itemAmount)
    });

    displayItems();

    document.getElementById("itemName").value = "";
    document.getElementById("itemAmount").value = "";
}

// =======================
// DISPLAY ITEMS
// =======================
function displayItems() {
    const list = document.getElementById("itemsList");
    if (!list) return;

    list.innerHTML = "";

    items.forEach(i => {
        const li = document.createElement("li");
        li.textContent = `${i.name} - ₹${i.amount}`;
        list.appendChild(li);
    });
}

// =======================
// ADD CUSTOMER (BACKEND)
// =======================
async function addCustomer() {
    const name = document.getElementById("customerName").value;
    const phone = document.getElementById("phone").value;
    const totalAmount = Number(document.getElementById("totalAmount").value);
    const paidAmount = Number(document.getElementById("paidAmount").value);
    const purchaseDate = document.getElementById("purchaseDate").value;

    const overdue = totalAmount - paidAmount;

    const tempPassword = phone; // simple temp password

    const customer = {
        name,
        phone,
        password: tempPassword,
        isTempPassword: true,
        totalAmount,
        paidAmount,
        overdue,
        purchaseDate,
        items
    };

    try {
        await fetch("/addCustomer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(customer)
        });

        alert("Customer added successfully");

        items = []; // reset items
        loadCustomers();

    } catch (err) {
        console.error(err);
        alert("Error adding customer");
    }
    document.getElementById("itemsList").innerHTML = "";
    closeModal();
}

// =======================
// LOAD CUSTOMERS (SHOPKEEPER)
// =======================
async function loadCustomers() {
    const list = document.getElementById("customerList");
    if (!list) return;

    const res = await fetch("/getCustomers");
    const customers = await res.json();

    list.innerHTML = "";

    customers.forEach(c => {
        const li = document.createElement("li");

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span><b>${c.name}</b></span>
                <span style="font-weight:bold;">₹${c.overdue}</span>
                <button onclick="toggleDetails(this)">Details</button>
            </div>

            <div class="details" style="display:none; margin-top:10px;">
                - Date: ${c.purchaseDate} <br>
                - Total: ₹${c.totalAmount} <br>
                - Paid: ₹${c.paidAmount} <br>
                - Overdue: ₹${c.overdue} <br>
                - Items:<br>
                ${c.items?.map(i => `&nbsp;&nbsp;• ${i.name} - ₹${i.amount}`).join("<br>") || "No items"}
                <br><br>
                <button onclick="deleteCustomer('${c.phone}')">Delete</button>
            </div>
            <hr>
        `;

        list.appendChild(li);
    });
}
//SEARCH CUSTOMER
function searchCustomer() {
    const searchValue = document.getElementById("searchInput").value.toLowerCase();

    // get all customers from localStorage
    let customers = JSON.parse(localStorage.getItem("customers")) || [];

    // filter customers
    const filtered = customers.filter(c =>
        c.name.toLowerCase().includes(searchValue)
    );

    // display filtered customers
    displayCustomers(filtered);
}

//DISPLAY CUSTOMERS
function displayCustomers(list = null) {
    const container = document.getElementById("customerList");
    container.innerHTML = "";

    const customers = list || JSON.parse(localStorage.getItem("customers")) || [];

    customers.forEach((c, index) => {
        const li = document.createElement("li");

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <span><b>${c.name}</b></span>
                <span>₹${c.overdue}</span>
                <button onclick="toggleDetails(${index})">Details</button>
            </div>
            <hr>
        `;

        container.appendChild(li);
    });
}
// =======================
// TOGGLE DETAILS
// =======================
function toggleDetails(btn) {
    const details = btn.parentElement.nextElementSibling;
    details.style.display = details.style.display === "none" ? "block" : "none";
}

// =======================
// DELETE CUSTOMER
// =======================
async function deleteCustomer(phone) {
    if (!confirm("Are you sure you want to delete?")) return;

    await fetch(`/deleteCustomer/${phone}`, {
        method: "DELETE"
    });

    loadCustomers();
}

// =======================
// USER DASHBOARD
// =======================
async function loadUserDashboard() {
    const phone = localStorage.getItem("userPhone");

    const res = await fetch(`/getUser/${phone}`);
    const user = await res.json();

    if (!user || user.error) return;

    document.getElementById("userName").textContent = "Name: " + user.name;
    document.getElementById("purchaseDate").textContent = "Date: " + user.purchaseDate;

    document.getElementById("totalDue").textContent = "₹" + user.overdue;
    document.getElementById("paidAmount").textContent = "Paid: ₹" + user.paidAmount;
    document.getElementById("overdueAmount").textContent = "Overdue: ₹" + user.overdue;

    const list = document.getElementById("itemsListUser");
    list.innerHTML = "";

    if (user.items && user.items.length > 0) {
        user.items.forEach(i => {
            const li = document.createElement("li");
            li.textContent = `${i.name} - ₹${i.amount}`;
            list.appendChild(li);
        });
    } else {
        list.innerHTML = "<li>No items</li>";
    }
}

// =======================
// CHANGE PASSWORD
// =======================
async function changePassword() {
    const phone = localStorage.getItem("userPhone");
    const oldPassword = document.getElementById("oldPassword").value;
    const newPassword = document.getElementById("newPasswordUser").value;

    const res = await fetch("/changePassword", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ phone, oldPassword, newPassword })
    });

    const data = await res.json();

    if (data.success) {
        alert("Password updated successfully");
    } else {
        alert(data.message || "Error");
    }
}

function openModal() {
    document.getElementById("addCustomerModal").style.display = "flex";

    // ✅ CLEAR ALL INPUTS
    document.getElementById("customerName").value = "";
    document.getElementById("phone").value = "";
    document.getElementById("totalAmount").value = "";
    document.getElementById("paidAmount").value = "";
    document.getElementById("purchaseDate").value = "";

    document.getElementById("itemName").value = "";
    document.getElementById("itemAmount").value = "";

    // ✅ RESET ITEMS ARRAY
    items = [];

    // ✅ CLEAR ITEMS LIST UI
    const list = document.getElementById("itemsList");
    if (list) list.innerHTML = "";
}
function closeModal() {
    document.getElementById("addCustomerModal").style.display = "none";

    items = [];
    const list = document.getElementById("itemsList");
    if (list) list.innerHTML = "";
}

// =======================
// LOGOUT
// =======================
function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}

window.onload = function () {
    displayCustomers();
};
