# PizzaHub API

Express 5 + MongoDB backend for the PizzaHub marketplace (customers, vendors, admins).

## Project structure

```
pizzahub-backend/
├── src/
│   ├── config/            # Environment, MongoDB connection + indexes, Stripe client
│   ├── controllers/       # HTTP layer: read request, call a service, send a response
│   ├── middleware/        # Auth, role guard, validation runner, 404 + error handling
│   ├── routes/            # Route definitions, mounted under /api
│   ├── services/          # Business logic + database access
│   ├── utils/             # ApiError, async wrapper, JWT, password hashing, pagination…
│   ├── validators/        # Pure request-body/query validators (no dependencies)
│   └── index.js           # App assembly and server bootstrap
├── node_modules/
├── package.json
└── package-lock.json
```

Request flow:

```
route -> validate() -> requireAuth/authorize() -> controller -> service -> MongoDB
                                                                  |
                                                         utils + config
```

Controllers never talk to MongoDB directly, and services never touch `req`/`res`.

## Setup

```bash
cp .env.example .env       # on Windows: copy .env.example .env
# fill in JWT_SECRET, MONGODB_URI and (optionally) the Stripe keys

npm install
npm run dev     # node --watch src/index.js
npm start       # production-style start
```

The API listens on `http://localhost:5000/api` by default, which matches
`NEXT_PUBLIC_API_URL` in the frontend.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `API_PREFIX` | `/api` | Base path for all routes |
| `CLIENT_URLS` | `http://localhost:10000` | Comma-separated CORS origins |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Mongo connection string |
| `MONGODB_DB` | `pizzahub` | Database name |
| `JWT_SECRET` | dev fallback | Token signing secret (**required in production**) |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `DEFAULT_CURRENCY` | `usd` | Currency for orders/transactions |
| `STRIPE_SECRET_KEY` | – | Enables checkout endpoints |
| `STRIPE_WEBHOOK_SECRET` | – | Verifies webhook signatures |
| `STRIPE_SUBSCRIPTION_PRICE_ID` | – | Vendor subscription price |

Stripe routes return a clear `400` until the corresponding keys are configured.

## Endpoints

Responses use the frontend contract: `{ data, message? }` for single resources
and `{ data, page, pageSize, total }` for collections. Errors return
`{ message, errors? }` with the matching HTTP status.

### Auth & profile

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/auth/signup` | public | Register as `customer` or `vendor`, returns `{ user, token }` |
| POST | `/auth/signin` | public | Sign in, returns `{ user, token }` |
| GET | `/auth/me` | authenticated | Current user |
| GET | `/users/me` | authenticated | Profile |
| PATCH | `/users/me` | authenticated | Update `name`, `phone`, `image` |

### Vendors

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/vendors` | public | Approved vendors (paginated, `search`, `page`, `pageSize`) |
| GET | `/vendors/:id` | public | Vendor details |
| POST | `/vendors` | vendor | Create own vendor profile (`pending` approval) |
| PATCH | `/vendors/:id` | vendor/admin | Update own vendor |
| PATCH | `/vendors/:id/status` | admin | `pending` / `approved` / `suspended` |

### Menu items

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/menu-items` | public | Filter by `vendorId`, `category`, `available`, `search` |
| GET | `/menu-items/:id` | public | Item details |
| POST | `/menu-items` | vendor/admin | Create (vendor must be approved) |
| PATCH | `/menu-items/:id` | vendor/admin | Update own item |
| DELETE | `/menu-items/:id` | vendor/admin | Delete own item |

### Orders

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/orders` | customer | Place an order (server recalculates prices) |
| GET | `/orders` | authenticated | Customer: own; vendor: incoming; admin: all |
| GET | `/orders/:id` | authenticated | Own order / own store's order / any (admin) |
| PATCH | `/orders/:id/status` | vendor/admin | Enforced status transitions |
| POST | `/orders/:id/cancel` | customer | Cancel while `pending` or `confirmed` |

Status flow: `pending -> confirmed -> preparing -> out-for-delivery -> delivered`,
with `cancelled` allowed before dispatch.

### Payments & subscriptions

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| POST | `/payments/checkout` | customer | Stripe Checkout session for a pending order (`{ orderId }`) |
| GET | `/payments/transactions` | customer | Own transactions |
| POST | `/payments/webhook` | Stripe | Raw-body signature verification (mounted before JSON parsing) |
| GET | `/subscriptions/me` | vendor | Current subscription |
| POST | `/subscriptions/checkout` | vendor | Stripe subscription Checkout session |

Webhook handling:
- `checkout.session.completed` → order `pending -> confirmed`, transaction `succeeded`
- `checkout.session.expired` → transaction `failed`
- `customer.subscription.*` → subscription status and period end synced

### Admin

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| GET | `/admin/stats` | admin | Users, vendors, orders, revenue |
| GET | `/admin/users` | admin | Paginated users (`role`, `search`) |
| GET | `/admin/vendors` | admin | Vendors by `status` |
| GET | `/admin/transactions` | admin | All transactions |
| PATCH | `/admin/vendors/:id/status` | admin | Approve/suspend a vendor |

### Health

`GET /api/health` → `{ status: "ok", service, uptime, timestamp }`

## Notes

- Passwords are hashed with Node's built-in `scrypt`; no extra dependency needed.
- JWTs are signed/verified with `jose` (HS256). The token carries `sub`, `email`, `role`.
- MongoDB indexes are created on startup in `src/config/db.js`.
- To create an admin, register a user and promote it once:
  ```js
  // mongosh pizzahub
  db.users.updateOne({ email: "admin@pizzahub.test" }, { $set: { role: "admin" } })
  ```
  Then sign in again to receive a token with the new role.
- Errors: 400 invalid input/identifier, 401 auth, 403 role/ownership,
  404 missing resource, 409 conflicts (duplicate email, invalid status change),
  422 validation failures.
