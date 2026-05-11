import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeIndianRupee,
  Barcode,
  Boxes,
  Gauge,
  Lock,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert
} from "lucide-react";
import "./styles.css";

const apiBase = "/api";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const categories = ["Gift", "Jewellery", "Cosmetics", "Hair Accessories", "Stationery", "Home Decor"];

const emptyProduct = {
  productCode: "",
  category: "Jewellery",
  subcategory: "",
  productName: "",
  sellingPrice: "",
  costPrice: "",
  mrp: "",
  reorderLevel: 5,
  stockQty: 0
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || `Request failed (${response.status})` };
  }
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }
  return data;
}

const asArray = (value) => (Array.isArray(value) ? value : []);

function App() {
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  const [activeTab, setActiveTab] = useState(isAdminRoute ? "dashboard" : "check");
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [codeSearch, setCodeSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [stockForm, setStockForm] = useState({ ...emptyProduct, quantity: 1, note: "" });
  const [admin, setAdmin] = useState({ username: "admin", password: "" });
  const [adminToken, setAdminToken] = useState(localStorage.getItem("adminToken") || "");
  const [adminProducts, setAdminProducts] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    const data = await request("/dashboard");
    setDashboard(data);
  };

  const loadProducts = async (query = "") => {
    const data = await request(query ? `/products?search=${encodeURIComponent(query)}` : "/products");
    setProducts(asArray(data));
  };

  useEffect(() => {
    loadDashboard().catch((err) => setError(err.message));
    loadProducts().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (isAdminRoute && adminToken) {
      request("/admin/products", { headers: { "x-admin-token": adminToken } })
        .then((data) => setAdminProducts(asArray(data)))
        .catch((err) => {
          if (err.message === "Admin login required") {
            localStorage.removeItem("adminToken");
            setAdminToken("");
            setAdminProducts([]);
          }
          setError(err.message);
        });
    }
  }, [isAdminRoute, adminToken]);

  useEffect(() => {
    if (isAdminRoute) {
      loadDashboard().catch((err) => setError(err.message));
    }
  }, [isAdminRoute]);

  const matchedProducts = useMemo(() => {
    if (!nameSearch.trim()) return products.slice(0, 8);
    const text = nameSearch.toLowerCase();
    return products
      .filter((item) =>
        [item.productName, item.productCode, item.category, item.subcategory]
          .join(" ")
          .toLowerCase()
          .includes(text)
      )
      .slice(0, 8);
  }, [nameSearch, products]);

  const lookupProduct = async (code) => {
    clearMessages();
    if (!code.trim()) return;
    try {
      const data = asArray(await request(`/products?code=${encodeURIComponent(code.trim())}`));
      if (data.length > 0) {
        const product = data[0];
        setStockForm((current) => ({
          ...current,
          ...product,
          quantity: current.quantity || 1,
          note: current.note || ""
        }));
        setNotice(`"${product.productName}" exists \u2014 current stock: ${product.stockQty}. Adjust quantity or price below.`);
        setSelectedProduct(product);
      } else {
        setStockForm((current) => ({ ...current, productCode: code.trim() }));
        setSelectedProduct(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const clearMessages = () => {
    setNotice("");
    setError("");
  };

  const handleCodeSearch = async (event) => {
    event.preventDefault();
    clearMessages();
    const code = codeSearch.trim();
    setCodeSearch("");
    if (!code) return;
    const data = asArray(await request(`/products?code=${encodeURIComponent(code)}`));
    if (data.length === 0) {
      setSelectedProduct(null);
      setError("No product found for this code. You can add it from Inventory In.");
      setStockForm((current) => ({ ...current, productCode: code }));
      if (!isAdminRoute) {
        setActiveTab("in");
      }
      return;
    }
    setSelectedProduct(data[0]);
    setNameSearch(data[0].productName);
    if (!isAdminRoute) {
      setActiveTab("check");
    }
  };

  const addStock = async (event) => {
    event.preventDefault();
    clearMessages();
    try {
      const updated = await request("/stock/in", {
        method: "POST",
        body: JSON.stringify(stockForm)
      });
      setNotice(`Stock updated for ${updated.productName}. Available quantity is ${updated.stockQty}.`);
      setSelectedProduct(updated);
      setStockForm({ ...emptyProduct, quantity: 1, note: "" });
      await Promise.all([loadDashboard(), loadProducts()]);
    } catch (err) {
      setError(err.message);
    }
  };

  const fillFromProduct = (product) => {
    setSelectedProduct(product);
    setNameSearch(product.productName);
    setCodeSearch(product.productCode);
    setStockForm((current) => ({
      ...current,
      ...product,
      quantity: current.quantity || 1,
      note: current.note || ""
    }));
  };

  const loginAdmin = async (event) => {
    event.preventDefault();
    clearMessages();
    const data = await request("/admin/login", {
      method: "POST",
      body: JSON.stringify(admin)
    });
    localStorage.setItem("adminToken", data.token);
    setAdminToken(data.token);
    const rows = await request("/admin/products", { headers: { "x-admin-token": data.token } });
    setAdminProducts(asArray(rows));
    setNotice("Admin login successful.");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={21} />
          </div>
          <div>
            <strong>Monimala Stock</strong>
            <span>Fashion jewellery & gifts</span>
          </div>
        </div>

        <nav>
          {isAdminRoute ? (
            <>
              <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>
                <Gauge size={18} /> Dashboard
              </button>
              <button className={activeTab === "stock" ? "active" : ""} onClick={() => setActiveTab("stock")}>
                <ShieldCheck size={18} /> All Stock Details
              </button>
            </>
          ) : (
            <>
              <button className={activeTab === "check" ? "active" : ""} onClick={() => setActiveTab("check")}>
                <Search size={18} /> Inventory Checking
              </button>
              <button className={activeTab === "in" ? "active" : ""} onClick={() => setActiveTab("in")}>
                <PackageCheck size={18} /> Inventory In
              </button>
            </>
          )}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Store control</p>
            <h1>{tabTitle(activeTab)}</h1>
          </div>
          {!isAdminRoute && (
            <form className="scan-search" onSubmit={handleCodeSearch}>
              <Barcode size={18} />
              <input
                value={codeSearch}
                onChange={(event) => setCodeSearch(event.target.value)}
                placeholder="Scan or enter product code"
                autoComplete="off"
              />
              <button type="submit">Find</button>
            </form>
          )}
        </header>

        {(notice || error) && (
          <div className={`message ${error ? "error" : ""}`}>
            {error ? <TriangleAlert size={18} /> : <PackageCheck size={18} />}
            <span>{error || notice}</span>
          </div>
        )}

        {isAdminRoute ? (
          <AdminArea
            activeTab={activeTab}
            dashboard={dashboard}
            admin={admin}
            setAdmin={setAdmin}
            loginAdmin={loginAdmin}
            adminToken={adminToken}
            setAdminToken={setAdminToken}
            adminProducts={adminProducts}
          />
        ) : (
          <>
            {activeTab === "check" && (
              <InventoryCheck
                selectedProduct={selectedProduct}
                nameSearch={nameSearch}
                setNameSearch={setNameSearch}
                matchedProducts={matchedProducts}
                fillFromProduct={fillFromProduct}
              />
            )}
            {activeTab === "in" && (
              <InventoryIn
                stockForm={stockForm}
                setStockForm={setStockForm}
                addStock={addStock}
                products={products}
                fillFromProduct={fillFromProduct}
                lookupProduct={lookupProduct}
                selectedProduct={selectedProduct}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function tabTitle(activeTab) {
  return {
    dashboard: "Dashboard",
    in: "Inventory In",
    check: "Inventory Checking",
    stock: "All Stock Details"
  }[activeTab];
}

function Dashboard({ dashboard }) {
  if (!dashboard) {
    return <div className="loading">Loading stock dashboard...</div>;
  }

  const totals = dashboard.totals;
  return (
    <section className="page-grid">
      <div className="metric">
        <Boxes size={23} />
        <span>Total stock</span>
        <strong>{totals.totalStock}</strong>
      </div>
      <div className="metric">
        <PackageCheck size={23} />
        <span>Total products</span>
        <strong>{totals.productCount}</strong>
      </div>
      <div className="metric">
        <BadgeIndianRupee size={23} />
        <span>Selling value</span>
        <strong>{currency.format(totals.stockSellingValue)}</strong>
      </div>

      <section className="panel wide">
        <div className="panel-header">
          <h2>Stock by group</h2>
          <span>{dashboard.categoryStock.length} groups</span>
        </div>
        <div className="category-bars">
          {dashboard.categoryStock.map((row) => (
            <div className="category-row" key={row.category}>
              <div>
                <strong>{row.category}</strong>
                <span>{row.itemCount} product types</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.max(8, Math.min(100, (row.totalStock / Math.max(1, dashboard.totals.totalStock)) * 100))}%`
                  }}
                />
              </div>
              <b>{row.totalStock}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Shortest stock</h2>
          <span>Need attention</span>
        </div>
        <div className="low-stock-list">
          {dashboard.lowStock.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.productName}</strong>
                <span>{item.productCode} · {item.category}</span>
              </div>
              <b>{item.stockQty}</b>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function InventoryIn({ stockForm, setStockForm, addStock, products, fillFromProduct, lookupProduct, selectedProduct }) {
  return (
    <section className="two-column">
      <form className="panel form-panel" onSubmit={addStock}>
        <div className="panel-header">
          <h2>Add incoming stock</h2>
          <span>Scan or type manually</span>
        </div>

        {selectedProduct && (
          <div className="existing-product-banner">
            <strong>{selectedProduct.productName}</strong>
            <span>Code: {selectedProduct.productCode} &middot; Current stock: {selectedProduct.stockQty}</span>
          </div>
        )}

        <div className="field-row">
          <label>
            Product code
            <input
              value={stockForm.productCode}
              onChange={(event) => setStockForm({ ...stockForm, productCode: event.target.value })}
              onBlur={() => lookupProduct(stockForm.productCode)}
              placeholder="JWL-2104"
              required
            />
          </label>
          <label>
            Quantity in
            <input
              type="number"
              min="1"
              value={stockForm.quantity}
              onChange={(event) => setStockForm({ ...stockForm, quantity: Number(event.target.value) })}
              required
            />
          </label>
        </div>

        <div className="field-row">
          <label>
            Category
            <select
              value={stockForm.category}
              onChange={(event) => setStockForm({ ...stockForm, category: event.target.value })}
              disabled={!!selectedProduct}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Subcategory
            <input
              value={stockForm.subcategory}
              onChange={(event) => setStockForm({ ...stockForm, subcategory: event.target.value })}
              placeholder="Earrings, Showpiece..."
              disabled={!!selectedProduct}
            />
          </label>
        </div>

        <label>
          Product name
          <input
            value={stockForm.productName}
            onChange={(event) => setStockForm({ ...stockForm, productName: event.target.value })}
            placeholder="Stone work bangle set"
            required
            disabled={!!selectedProduct}
          />
        </label>

        <div className="field-row three">
          <label>
            Selling price
            <input
              type="number"
              min="0"
              value={stockForm.sellingPrice}
              onChange={(event) => setStockForm({ ...stockForm, sellingPrice: event.target.value })}
            />
          </label>
          <label>
            Cost
            <input
              type="number"
              min="0"
              value={stockForm.costPrice}
              onChange={(event) => setStockForm({ ...stockForm, costPrice: event.target.value })}
            />
          </label>
          <label>
            MRP
            <input
              type="number"
              min="0"
              value={stockForm.mrp}
              onChange={(event) => setStockForm({ ...stockForm, mrp: event.target.value })}
            />
          </label>
        </div>

        <label>
          Note
          <input
            value={stockForm.note}
            onChange={(event) => setStockForm({ ...stockForm, note: event.target.value })}
            placeholder="Supplier bill, counter entry, correction..."
          />
        </label>

        <button className="primary-action" type="submit">
          <Plus size={18} /> Add stock
        </button>
      </form>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent products</h2>
          <span>Click to refill form</span>
        </div>
        <div className="quick-list">
          {products.slice(0, 10).map((product) => (
            <button key={product.id} onClick={() => fillFromProduct(product)}>
              <strong>{product.productName}</strong>
              <span>{product.productCode} · Qty {product.stockQty}</span>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function InventoryCheck({ selectedProduct, nameSearch, setNameSearch, matchedProducts, fillFromProduct }) {
  return (
    <section className="two-column">
      <section className="panel">
        <div className="panel-header">
          <h2>Search product</h2>
          <span>Name or code</span>
        </div>
        <div className="name-search">
          <Search size={18} />
          <input
            value={nameSearch}
            onChange={(event) => setNameSearch(event.target.value)}
            placeholder="Search product list"
          />
        </div>
        <div className="quick-list selectable">
          {matchedProducts.map((product) => (
            <button key={product.id} onClick={() => fillFromProduct(product)}>
              <strong>{product.productName}</strong>
              <span>{product.productCode} · {product.category} · Qty {product.stockQty}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel product-result">
        <div className="panel-header">
          <h2>Product details</h2>
          <span>Counter view</span>
        </div>
        {selectedProduct ? (
          <div className="product-card">
            <p className="pill">{selectedProduct.category} / {selectedProduct.subcategory || "General"}</p>
            <h3>{selectedProduct.productName}</h3>
            <div className="code-chip"><Barcode size={16} /> {selectedProduct.productCode}</div>
            <div className="price-grid">
              <div><span>Selling price</span><strong>{currency.format(selectedProduct.sellingPrice)}</strong></div>
              <div><span>MRP</span><strong>{currency.format(selectedProduct.mrp)}</strong></div>
              <div><span>Qty available</span><strong>{selectedProduct.stockQty}</strong></div>
            </div>
          </div>
        ) : (
          <div className="empty-state">Scan code or choose product name to see price, MRP, and available quantity.</div>
        )}
      </section>
    </section>
  );
}

function AdminArea({ activeTab, dashboard, admin, setAdmin, loginAdmin, adminToken, setAdminToken, adminProducts }) {
  if (!adminToken) {
    return (
      <AdminLogin admin={admin} setAdmin={setAdmin} loginAdmin={loginAdmin} />
    );
  }

  return activeTab === "dashboard" ? (
    <Dashboard dashboard={dashboard} />
  ) : (
    <Admin adminToken={adminToken} setAdminToken={setAdminToken} adminProducts={adminProducts} />
  );
}

function AdminLogin({ admin, setAdmin, loginAdmin }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Admin login</h2>
        <span>Owner area</span>
      </div>
      <form className="admin-login" onSubmit={loginAdmin}>
        <label>
          Username
          <input value={admin.username} onChange={(event) => setAdmin({ ...admin, username: event.target.value })} />
        </label>
        <label>
          Password
          <input
            type="password"
            value={admin.password}
            onChange={(event) => setAdmin({ ...admin, password: event.target.value })}
          />
        </label>
        <button className="primary-action" type="submit">
          <Lock size={18} /> Login
        </button>
      </form>
    </section>
  );
}

function Admin({ adminToken, setAdminToken, adminProducts }) {
  const [adminSearch, setAdminSearch] = useState("");

  const logout = () => {
    localStorage.removeItem("adminToken");
    setAdminToken("");
  };

  const filteredProducts = useMemo(() => {
    const text = adminSearch.trim().toLowerCase();
    if (!text) return adminProducts;
    return adminProducts.filter((product) =>
      [
        product.productCode,
        product.productName,
        product.category,
        product.subcategory,
        product.stockQty,
        product.sellingPrice,
        product.mrp
      ]
        .join(" ")
        .toLowerCase()
        .includes(text)
    );
  }, [adminProducts, adminSearch]);

  const exportProducts = (rows, scope) => {
    const headers = [
      "Product Code",
      "Category",
      "Subcategory",
      "Product Name",
      "Selling Price",
      "Cost Price",
      "MRP",
      "Stock Qty",
      "Reorder Level"
    ];
    const keys = [
      "productCode",
      "category",
      "subcategory",
      "productName",
      "sellingPrice",
      "costPrice",
      "mrp",
      "stockQty",
      "reorderLevel"
    ];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((product) => keys.map((key) => escapeCsv(product[key])).join(","))
    ].join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `monimala-products-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>All stock details</h2>
        <button className="text-action" onClick={logout}>Logout</button>
      </div>

      <>
        <div className="admin-tools">
          <div className="name-search">
            <Search size={18} />
            <input
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="Search code, product, category, price..."
            />
          </div>
          <button className="secondary-action" type="button" onClick={() => exportProducts(adminProducts, "all")}>
            Export all
          </button>
          <button className="primary-action" type="button" onClick={() => exportProducts(filteredProducts, "filtered")}>
            Export filtered
          </button>
        </div>

        <div className="table-summary">
          Showing {filteredProducts.length} of {adminProducts.length} products
        </div>

        <div className="table-wrap admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Product</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Qty</th>
                <th>Selling</th>
                <th>Cost</th>
                <th>MRP</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>{product.productCode}</td>
                  <td>{product.productName}</td>
                  <td>{product.category}</td>
                  <td>{product.subcategory || "-"}</td>
                  <td>{product.stockQty}</td>
                  <td>{currency.format(product.sellingPrice)}</td>
                  <td>{currency.format(product.costPrice)}</td>
                  <td>{currency.format(product.mrp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    </section>
  );
}

const rootElement = document.getElementById("root");
window.__monimalaRoot = window.__monimalaRoot || createRoot(rootElement);
window.__monimalaRoot.render(<App />);
