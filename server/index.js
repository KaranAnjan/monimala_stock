import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import initSqlJs from "sql.js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "stock.sqlite");
const adminPath = path.join(rootDir, "config", "admin.json");

fs.mkdirSync(dataDir, { recursive: true });

const SQL = await initSqlJs({
  locateFile: (file) => path.join(rootDir, "node_modules", "sql.js", "dist", file)
});

const db = fs.existsSync(dbPath)
  ? new SQL.Database(fs.readFileSync(dbPath))
  : new SQL.Database();

const saveDb = () => {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
};

const run = (sql, params = []) => {
  db.run(sql, params);
};

const all = (sql, params = []) => {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
};

const get = (sql, params = []) => all(sql, params)[0] || null;

run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    product_name TEXT NOT NULL,
    selling_price REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    mrp REAL NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 5,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    batch_date TEXT DEFAULT '',
    expiry_date TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

run(`
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST')),
    quantity INTEGER NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

run(`
  CREATE TABLE IF NOT EXISTS product_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    batch_no TEXT DEFAULT '',
    expiry_date TEXT DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    mrp REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )
`);

try { run("ALTER TABLE products ADD COLUMN batch_date TEXT DEFAULT ''"); } catch {}
try { run("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT ''"); } catch {}

const existingBatchesCount = get("SELECT COUNT(*) AS count FROM product_batches")?.count || 0;
if (existingBatchesCount === 0) {
  const productsWithStock = all("SELECT * FROM products WHERE stock_qty > 0");
  if (productsWithStock.length > 0) {
    run("BEGIN TRANSACTION");
    productsWithStock.forEach((p) => {
      run(
        "INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity, selling_price, cost_price, mrp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [p.id, p.batch_date || "", p.expiry_date || "", p.stock_qty, p.selling_price, p.cost_price, p.mrp, p.created_at]
      );
    });
    run("COMMIT");
    saveDb();
  }
}

const countProducts = get("SELECT COUNT(*) AS count FROM products")?.count || 0;
if (countProducts === 0) {
  const sampleProducts = [
    ["GFT-1001", "Gift", "Showpiece", "Crystal lotus showpiece", 349, 180, 499, 6, 18],
    ["JWL-2104", "Jewellery", "Earrings", "Oxidised jhumka earrings", 199, 80, 299, 10, 42],
    ["COS-3302", "Cosmetics", "Nail Polish", "Gloss nail color", 89, 42, 120, 12, 9],
    ["JWL-1188", "Jewellery", "Bangles", "Stone work bangle set", 299, 145, 399, 8, 5],
    ["GFT-4510", "Gift", "Keychain", "Couple metal keychain", 99, 35, 149, 15, 60]
  ];

  run("BEGIN TRANSACTION");
  sampleProducts.forEach((row) => {
    run(
      `
        INSERT INTO products (
          product_code, category, subcategory, product_name,
          selling_price, cost_price, mrp, reorder_level, stock_qty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      row
    );
  });
  run("COMMIT");
  saveDb();
}

const getProductWithBatches = (productCode) => {
  const product = get(`SELECT ${productSelect} FROM products WHERE product_code = ?`, [productCode]);
  if (!product) return null;
  product.batches = all(
    `SELECT id, batch_no AS batchNo, expiry_date AS expiryDate, quantity, selling_price AS sellingPrice, cost_price AS costPrice, mrp FROM product_batches WHERE product_id = ? ORDER BY created_at ASC`,
    [product.id]
  );
  return product;
};

const app = express();
app.use(express.json());

let adminToken = null;

const productSelect = `
  id,
  product_code AS productCode,
  category,
  subcategory,
  product_name AS productName,
  selling_price AS sellingPrice,
  cost_price AS costPrice,
  mrp,
  reorder_level AS reorderLevel,
  stock_qty AS stockQty,
  batch_date AS batchDate,
  expiry_date AS expiryDate,
  created_at AS createdAt,
  updated_at AS updatedAt
`;


const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toMoney = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const requireAdmin = (req, res, next) => {
  const token = req.header("x-admin-token");
  if (!token || token !== adminToken) {
    return res.status(401).json({ message: "Admin login required" });
  }
  next();
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  const admin = JSON.parse(fs.readFileSync(adminPath, "utf8"));
  if (req.body?.username === admin.username && req.body?.password === admin.password) {
    adminToken = Buffer.from(`${admin.username}:${Date.now()}`).toString("base64url");
    return res.json({ token: adminToken, username: admin.username });
  }
  res.status(401).json({ message: "Invalid username or password" });
});

app.get("/api/products", (req, res) => {
  const search = String(req.query.search || "").trim();
  const code = String(req.query.code || "").trim();

  if (code) {
    const product = getProductWithBatches(code);
    return res.json(product ? [product] : []);
  }

  if (search) {
    const like = `%${search}%`;
    const rows = all(
      `
        SELECT ${productSelect}
        FROM products
        WHERE product_name LIKE ? OR product_code LIKE ? OR category LIKE ? OR subcategory LIKE ?
        ORDER BY product_name
        LIMIT 30
      `,
      [like, like, like, like]
    );
    return res.json(rows);
  }

  res.json(all(`SELECT ${productSelect} FROM products ORDER BY product_name LIMIT 200`));
});

app.post("/api/products", (req, res) => {
  const body = req.body || {};
  if (!body.productCode || !body.productName || !body.category) {
    return res.status(400).json({ message: "Product code, category, and product name are required" });
  }

  try {
    run(
      `
        INSERT INTO products (
          product_code, category, subcategory, product_name,
          selling_price, cost_price, mrp, reorder_level, stock_qty, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [
        String(body.productCode).trim(),
        String(body.category).trim(),
        String(body.subcategory || "").trim(),
        String(body.productName).trim(),
        toMoney(body.sellingPrice),
        toMoney(body.costPrice),
        toMoney(body.mrp),
        toInt(body.reorderLevel, 5),
        toInt(body.stockQty, 0)
      ]
    );
    saveDb();
    const product = get(`SELECT ${productSelect} FROM products WHERE product_code = ?`, [body.productCode]);
    res.status(201).json(product);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ message: "Product code already exists" });
    }
    res.status(500).json({ message: "Could not create product" });
  }
});

app.post("/api/stock/in", (req, res) => {
  const body = req.body || {};
  const productCode = String(body.productCode || "").trim();
  const quantity = toInt(body.quantity, 1);

  if (!productCode || quantity <= 0) {
    return res.status(400).json({ message: "Product code and positive quantity are required" });
  }

  try {
    run("BEGIN TRANSACTION");
    let product = get("SELECT * FROM products WHERE product_code = ?", [productCode]);

    if (!product) {
      if (!body.productName || !body.category) {
        throw new Error("MISSING_PRODUCT_DETAILS");
      }
      run(
        `
          INSERT INTO products (
            product_code, category, subcategory, product_name,
            selling_price, cost_price, mrp, reorder_level, stock_qty,
            batch_date, expiry_date, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          productCode,
          String(body.category).trim(),
          String(body.subcategory || "").trim(),
          String(body.productName).trim(),
          toMoney(body.sellingPrice),
          toMoney(body.costPrice),
          toMoney(body.mrp),
          toInt(body.reorderLevel, 5),
          String(body.batchDate || "").trim(),
          String(body.expiryDate || "").trim()
        ]
      );
      product = get("SELECT * FROM products WHERE product_code = ?", [productCode]);
    }

    run(
      `
        UPDATE products
        SET selling_price = ?,
            cost_price = ?,
            mrp = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [toMoney(body.sellingPrice), toMoney(body.costPrice), toMoney(body.mrp), product.id]
    );

    const batchNo = String(body.batchDate || "").trim();
    const expiryDate = String(body.expiryDate || "").trim();

    const existingBatch = get("SELECT * FROM product_batches WHERE product_id = ? AND batch_no = ?", [product.id, batchNo]);

    if (existingBatch) {
      run(
        "UPDATE product_batches SET quantity = quantity + ?, selling_price = ?, cost_price = ?, mrp = ?, expiry_date = ? WHERE id = ?",
        [quantity, toMoney(body.sellingPrice), toMoney(body.costPrice), toMoney(body.mrp), expiryDate, existingBatch.id]
      );
    } else {
      run(
        "INSERT INTO product_batches (product_id, batch_no, expiry_date, quantity, selling_price, cost_price, mrp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [product.id, batchNo, expiryDate, quantity, toMoney(body.sellingPrice), toMoney(body.costPrice), toMoney(body.mrp)]
      );
    }

    const totalQty = get("SELECT COALESCE(SUM(quantity), 0) AS total FROM product_batches WHERE product_id = ?", [product.id]);
    run("UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [totalQty.total, product.id]);

    run(
      "INSERT INTO stock_movements (product_id, movement_type, quantity, note) VALUES (?, 'IN', ?, ?)",
      [product.id, quantity, String(body.note || "")]
    );
    run("COMMIT");
    saveDb();

    const updated = getProductWithBatches(productCode);
    res.json(updated);
  } catch (error) {
    run("ROLLBACK");
    console.error("Stock IN error:", error.message);
    if (error.message === "MISSING_PRODUCT_DETAILS") {
      return res.status(400).json({ message: "New products need category and product name" });
    }
    res.status(500).json({ message: "Could not update stock" });
  }
});

app.post("/api/stock/out", (req, res) => {
  const body = req.body || {};
  const productCode = String(body.productCode || "").trim();
  const quantity = toInt(body.quantity, 1);

  if (!productCode || quantity <= 0) {
    return res.status(400).json({ message: "Product code and positive quantity are required" });
  }

  try {
    run("BEGIN TRANSACTION");
    const product = get("SELECT * FROM products WHERE product_code = ?", [productCode]);

    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    if (product.stock_qty < quantity) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const batchId = body.batchId;

    if (batchId) {
      const batch = get("SELECT * FROM product_batches WHERE id = ? AND product_id = ?", [batchId, product.id]);
      if (!batch) {
        throw new Error("BATCH_NOT_FOUND");
      }
      if (batch.quantity < quantity) {
        throw new Error("INSUFFICIENT_BATCH_STOCK");
      }
      run("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?", [quantity, batchId]);
    } else {
      let remaining = quantity;
      const batches = all("SELECT * FROM product_batches WHERE product_id = ? AND quantity > 0 ORDER BY created_at ASC", [product.id]);
      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.quantity);
        run("UPDATE product_batches SET quantity = quantity - ? WHERE id = ?", [deduct, batch.id]);
        remaining -= deduct;
      }
    }

    const totalQty = get("SELECT COALESCE(SUM(quantity), 0) AS total FROM product_batches WHERE product_id = ?", [product.id]);
    run("UPDATE products SET stock_qty = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [totalQty.total, product.id]);

    run(
      "INSERT INTO stock_movements (product_id, movement_type, quantity, note) VALUES (?, 'OUT', ?, ?)",
      [product.id, quantity, String(body.note || "")]
    );
    run("COMMIT");
    saveDb();

    const updated = getProductWithBatches(productCode);
    res.json(updated);
  } catch (error) {
    run("ROLLBACK");
    console.error("Stock OUT error:", error.message);
    if (error.message === "PRODUCT_NOT_FOUND") {
      return res.status(404).json({ message: "Product not found" });
    }
    if (error.message === "INSUFFICIENT_STOCK") {
      return res.status(400).json({ message: "Insufficient stock" });
    }
    if (error.message === "BATCH_NOT_FOUND") {
      return res.status(400).json({ message: "Batch not found" });
    }
    if (error.message === "INSUFFICIENT_BATCH_STOCK") {
      return res.status(400).json({ message: "Insufficient stock in selected batch" });
    }
    res.status(500).json({ message: "Could not update stock" });
  }
});

app.get("/api/dashboard", (_req, res) => {
  const categoryStock = all(`
    SELECT category, SUM(stock_qty) AS totalStock, COUNT(*) AS itemCount
    FROM products
    GROUP BY category
    ORDER BY totalStock DESC
  `);

  const lowStock = all(`
    SELECT ${productSelect}
    FROM products
    WHERE stock_qty <= reorder_level
    ORDER BY stock_qty ASC, product_name ASC
    LIMIT 12
  `);

  const totals = get(`
    SELECT
      COUNT(*) AS productCount,
      SUM(stock_qty) AS totalStock,
      SUM(stock_qty * selling_price) AS stockSellingValue,
      SUM(stock_qty * cost_price) AS stockCostValue
    FROM products
  `);

  res.json({
    totals: {
      productCount: totals?.productCount || 0,
      totalStock: totals?.totalStock || 0,
      stockSellingValue: totals?.stockSellingValue || 0,
      stockCostValue: totals?.stockCostValue || 0
    },
    categoryStock,
    lowStock
  });
});

app.get("/api/admin/products", requireAdmin, (_req, res) => {
  res.json(all(`SELECT ${productSelect} FROM products ORDER BY category, product_name`));
});

const port = Number(process.env.PORT || 5050);
const host = process.env.API_HOST || "0.0.0.0";
const server = http.createServer(app);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the old Monimala Stock server or run with PORT=5051.`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Stock API running at http://127.0.0.1:${port}`);
});
