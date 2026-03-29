const express = require("express");
const path = require("path");   // 👈 add this
const app = express();

app.use(express.json());

// 👇 FIXED STATIC PATH
app.use(express.static(path.join(__dirname, "public")));

// Dummy users
const users = [
  { username: "user1", password: "1234", role: "user" },
  { username: "shop1", password: "1234", role: "shopkeeper" }
];

// Login API
app.post("/login", (req, res) => {
  const { username, password, role } = req.body;

  const user = users.find(
    u => u.username === username &&
         u.password === password &&
         u.role === role
  );

  if (user) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
