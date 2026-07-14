const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "yurisdoggrooming@gmail.com",
    pass: "bswaanrfdskjskgz"
  }
});

const express = require("express");
const bodyParser = require("body-parser");
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");

const app = express();
const dbFile = path.join(__dirname, "database.sqlite");
let db;

function persistDb() {
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
}

function runSql(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  persistDb();
}

function fetchAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function initializeDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "node_modules", "sql.js", "dist", file)
  });

  const fileBuffer = fs.existsSync(dbFile) ? fs.readFileSync(dbFile) : null;
  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      number TEXT,
      email TEXT,
      dogBreed TEXT,
      dogName TEXT,
      date TEXT,
      time TEXT
    )
  `);

  persistDb();
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-very-secure-random-key-change-this-in-production",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 3600000 }
  })
);

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

function getGalleryFiles() {
  const uploadsDir = path.join(__dirname, "public", "uploads");
  if (!fs.existsSync(uploadsDir)) return [];

  return fs
    .readdirSync(uploadsDir)
    .filter(file => fs.statSync(path.join(uploadsDir, file)).isFile())
    .sort();
}

// Protect admin pages
function requireLogin(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect("/admin-login.html");
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect("/admin-login.html");
}

// ROUTES
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

// ⭐ BOOKING SUBMISSION (with email)
app.post("/submit-booking", (req, res) => {
  const { name, number, email, dogBreed, dogName, date, time } = req.body;

  if (!name || !number || !email || !dogBreed || !dogName || !date || !time) {
    return res.status(400).send("All fields are required");
  }

  try {
    runSql(
      `INSERT INTO bookings (name, number, email, dogBreed, dogName, date, time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, number, email, dogBreed, dogName, date, time]
    );
  } catch (err) {
    console.error("Error inserting booking:", err);
    return res.status(500).send("Error submitting booking");
  }

  const mailOptions = {
    from: "yurisdoggrooming@gmail.com",
    to: "yurisdoggrooming@gmail.com",
    subject: "New Grooming Appointment Request",
    html: `
      <h2>New Booking Request</h2>

      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Phone:</strong> ${number}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Dog Breed:</strong> ${dogBreed}</p>
      <p><strong>Dog Name:</strong> ${dogName}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>

      <br>

      <a href="http://localhost:3000/admin-dashboard"
        style="padding:12px 18px; background:#ff7fb8; color:white; text-decoration:none; border-radius:10px; font-weight:bold;">
        ✔ Confirm Appointment
      </a>

      <br><br>

      <a href="mailto:${email}?subject=Appointment Change Needed&body=Hi ${name}, I need to adjust your appointment time."
        style="padding:12px 18px; background:#ff9acb; color:white; text-decoration:none; border-radius:10px; font-weight:bold;">
        ✏ Request Change
      </a>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.log("Email error:", error);
    else console.log("Email sent:", info.response);
  });

  res.redirect("/success.html");
});

// Success page
app.get("/success.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/success.html"));
});

// Admin login page
app.get("/admin-login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/admin-login.html"));
});

// ⭐ ADMIN LOGIN
app.post("/admin-login", (req, res) => {
  const { username, password } = req.body;

  if (username === "Maryuri" && password === "2330") {
    req.session.loggedIn = true;
    req.session.isAdmin = true;
    return res.redirect("/admin-dashboard");
  }

  res.send("<h2>Incorrect login</h2><a href='/admin-login.html'>Try Again</a>");
});

// Admin dashboard
app.get("/admin-dashboard", requireAdmin, (req, res) => {
  let rows = [];

  try {
    rows = fetchAll("SELECT * FROM bookings");
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).send("Database error");
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  let tableRows = rows
    .map(
      b => `
      <tr data-booking='${JSON.stringify(b)}'>
        <td>${escapeHtml(b.id.toString())}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.number)}</td>
        <td>${escapeHtml(b.email)}</td>
        <td>${escapeHtml(b.dogBreed)}</td>
        <td>${escapeHtml(b.dogName)}</td>
        <td>${escapeHtml(b.date)}</td>
        <td>${escapeHtml(b.time)}</td>
        <td><button onclick="openEditFromRow(this)">Edit</button></td>
        <td><button onclick="deleteBooking(${b.id})">Delete</button></td>
      </tr>`
    )
    .join("");

  const galleryFiles = getGalleryFiles();

  const galleryImagesHTML = galleryFiles
    .map(file => {
      const safeName = file.replace(/"/g, '&quot;');
      return `
        <div class="gallery-card-admin">
          <img src="/uploads/${encodeURIComponent(file)}" alt="Gallery Image" class="gallery-image" data-filename="${safeName}">
          <button type="button" class="delete-image-btn" data-filename="${safeName}">Remove</button>
        </div>`;
    })
    .join("");

  let page = fs.readFileSync("./views/admin-dashboard.html", "utf8");
  page = page.replace("{{rows}}", tableRows);
  page = page.replace("{{galleryImages}}", galleryImagesHTML);

  res.send(page);
});

// Edit booking
app.post("/edit-booking", (req, res) => {
  const { id, name, number, email, dogBreed, dogName, date, time } = req.body;

  try {
    runSql(
      `UPDATE bookings
       SET name=?, number=?, email=?, dogBreed=?, dogName=?, date=?, time=?
       WHERE id=?`,
      [name, number, email, dogBreed, dogName, date, time, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating booking:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// Delete booking
app.post("/delete-booking", (req, res) => {
  try {
    runSql(`DELETE FROM bookings WHERE id=?`, [req.body.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// Gallery page
app.get("/gallery", (req, res) => {
  const files = getGalleryFiles();

  const imagesHTML = files
    .map(file => {
      const safeName = file.replace(/"/g, '&quot;');
      return `
        <div class="gallery-card">
          <img src="/uploads/${encodeURIComponent(file)}" alt="Grooming Image" class="gallery-image" data-filename="${safeName}">
        </div>`;
    })
    .join("");

  let page = fs.readFileSync("./views/gallery.html", "utf8");
  page = page.replace("{{images}}", imagesHTML);

  if (req.session && req.session.isAdmin) {
    page = page.replace("{{uploadForm}}", `
      <form action="/upload-image" method="POST" enctype="multipart/form-data" class="upload-form">
        <input type="file" name="image" required>
        <button class="upload-btn">Upload Image</button>
      </form>
    `);
  } else {
    page = page.replace("{{uploadForm}}", "");
  }

  res.send(page);
});

app.get(["/about", "/about.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "views/about.html"));
});

app.get(["/pricing", "/pricing.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "views/pricing.html"));
});

app.get(["/contact", "/contact.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "views/contact.html"));
});

// Upload image (ADMIN ONLY)
app.post("/upload-image", requireAdmin, upload.single("image"), (req, res) => {
  res.redirect("/gallery");
});

// Remove image (ADMIN ONLY)
app.post("/delete-image", requireAdmin, (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({ success: false, error: "Image filename is required" });
  }

  const safeName = path.basename(filename);
  const filePath = path.join(__dirname, "public", "uploads", safeName);

  if (!safeName || safeName !== filename) {
    return res.status(400).json({ success: false, error: "Invalid image filename" });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "Image not found" });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting image:", err);
    res.status(500).json({ success: false, error: "Could not delete image" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin-login.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).send("<h1>404 - Page Not Found</h1><a href='/'>Go Home</a>");
});

// Start server after SQL.js initialization
const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
