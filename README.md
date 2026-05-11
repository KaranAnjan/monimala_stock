# Monimala Stock

Inventory management web app for a fashion jewellery, gift, and cosmetics shop.

## Features

- React dashboard for total stock, category-wise stock, and shortest stock.
- Inventory In tab for barcode scanner input or manual product entry.
- Inventory Checking tab for product code and product-name search.
- SQLite database for products and stock movements.
- Admin login from `config/admin.json` to view, search, and export full stock data.

## Run locally

```bash
npm install
npm run dev
```

Counter app: `http://127.0.0.1:5173`

Admin area: `http://127.0.0.1:5173/admin`

API: `http://127.0.0.1:5050`

Default admin:

- Username: `admin`
- Password: `admin123`

The SQLite database is created at `data/stock.sqlite`. For direct database inspection, open that file in DB Browser for SQLite.
