# SEMIX Technician Mobile App

React Native mobile application for SEMIX CORP technicians built with Expo.

## 📱 Development Status: **PHASE 4 - WAREHOUSE & SCREENS IMPLEMENTATION**

### ✅ Completed (Feb 12, 2026)

- **Warehouse Screen (COMPLETE)** 🎉
  - ✅ Replaced placeholder Communication screen with full Warehouse
  - ✅ Auto-detects technician's van warehouse (`type='tech_van'`, `technician_id`)
  - ✅ Search bar with multi-term AND filtering (name, SKU, brand, description)
  - ✅ Horizontal category filter chips with real-time counts
  - ✅ Category section dividers in "All" view (SectionList with icons + badges)
  - ✅ Part cards: photo/placeholder, name, SKU, brand, stock status, quantity badge
  - ✅ Stock indicators: In Stock (green), Low Stock (amber), Out of Stock (red)
  - ✅ Part detail modal: category, description block, brands, part numbers, inventory locations
  - ✅ Price and suppliers hidden from technician view (admin-only info)
  - ✅ Styled description block with teal accent border and icon
  - ✅ Pull-to-refresh via RefreshControl
  - ✅ Empty states: "No Van Assigned" / "No parts match"

- **Part Deduction Feature (COMPLETE)** 🎉
  - ✅ "Use Part" button in part detail modal
  - ✅ Quantity selector with +/- buttons and manual input
  - ✅ Confirmation dialog before deducting
  - ✅ Backend endpoint: `POST /api/warehouse/parts/:id/deduct`
  - ✅ Validates warehouse ownership (technician can only deduct from own van)
  - ✅ Validates available stock (cannot deduct more than available)
  - ✅ Auto-refreshes parts list after successful deduction
  - ✅ Disabled "Out of Stock" state for parts with 0 quantity

- **Payments Screen (COMPLETE)** 🎉
  - ✅ Year filter with horizontal scroll
  - ✅ Payment cards with date, amount, payment method
  - ✅ Year total calculation
  - ✅ Backend endpoint: `GET /api/technicians/payments/:technicianName`

- **Unpaid Screen (COMPLETE)** 🎉
  - ✅ Pending and Declined sections
  - ✅ Record cards with date, amount, status details
  - ✅ Backend endpoint: `GET /api/technician-unpaid/unpaid/:technicianName`

- **Receipts Screen (COMPLETE)** 🎉
  - ✅ Full implementation with receipt cards
  - ✅ Backend endpoint: `GET /api/my-receipts`

### ✅ Completed (Feb 11, 2026)

- **Salary Records Feature (COMPLETE)** 🎉
  - ✅ Records button in Salary screen monthly view
  - ✅ Records List Modal showing all work records for selected month
  - ✅ Work Details Modal with comprehensive job information
  - ✅ Two-level modal navigation with Back buttons (Records List ↔ Work Details)
  - ✅ Work Details displays 10 fields matching admin panel
  - ✅ Your Earnings section: Salary + Cash Received
  - ✅ Color-coded payment status (Green: Paid, Red: Not Paid)

### ✅ Completed (Feb 10, 2026)

- **Project Setup**
  - ✅ Expo SDK 54 configuration
  - ✅ React Native 0.81.5
  - ✅ React Navigation 7 setup

- **Authentication**
  - ✅ Login screen with SEMIX branding
  - ✅ JWT token management with `fullName` field
  - ✅ AsyncStorage integration
  - ✅ Auto-login on app restart

- **Parts Feature (COMPLETE)** 🎉
  - ✅ PartsScreen with three status tabs (In Transit, Arrived, On Board)
  - ✅ Comments modal on part tap
  - ✅ Pull-to-refresh, technician filtering

## 🔧 Technical Fixes Applied

1. **Backend Warehouse Access**: Removed `requireAdmin` from warehouse routes - technicians can now access their van inventory
2. **Category Counts**: Fixed to compute from actual warehouse parts data instead of catalog-wide stats API
3. **Status Format**: Fixed status values from "In Transit" to `in_transit` (database format)
4. **Technician Matching**: Support for `technician_id`, `technician2_id`, or `fullName`
5. **JWT Token**: Added `fullName` field to JWT payload
6. **Modal Navigation**: Fixed modal stacking issues with proper show/hide logic

## Project Structure

```
admin-system-mobile/
├── App.js                       # Main app entry with navigation
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js       # Authentication
│   │   ├── HomeScreen.js        # Main menu (6 sections)
│   │   ├── SalaryScreen.js      # ⭐ Salary calculations + records
│   │   ├── PartsScreen.js       # ⭐ Parts tracking with tabs & comments
│   │   ├── WarehouseScreen.js   # ⭐ Van inventory + part deduction
│   │   ├── PaymentsScreen.js    # ⭐ Payment history by year
│   │   ├── ReceiptsScreen.js    # ⭐ Receipt management
│   │   └── UnpaidScreen.js      # ⭐ Unpaid records (pending/declined)
│   ├── services/
│   │   └── api.js               # API service with Railway backend
│   └── components/              # Reusable components (future)
└── assets/                      # App icons and splash screens
```

## API Endpoints Used

```
✅ POST /api/login                              - Authentication
✅ GET  /api/technicians/salary                  - Salary calculation with records
✅ GET  /api/technicians/payments/:name          - Payment history
✅ GET  /api/technician-unpaid/unpaid/:name      - Unpaid records
✅ GET  /api/my-parts?status=X                   - Parts tracking
✅ GET  /api/estimates/:id/comments              - Estimate comments
✅ GET  /api/my-receipts                         - Receipts
✅ GET  /api/warehouse/warehouses?with_stats=true - Warehouse list
✅ GET  /api/warehouse/parts?warehouse_id=X      - Parts in warehouse
✅ GET  /api/warehouse/parts/:id                 - Part details
✅ POST /api/warehouse/parts/:id/deduct          - Deduct part from van
```

## API Configuration

```javascript
const API_URL = 'https://admin-system-backend-production.up.railway.app';
```

To change the API URL, edit `src/services/api.js`.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI

## Installation & Running

```bash
npm install
npm start
```

### On Physical Device
1. Install **Expo Go** from App Store / Google Play
2. Scan the QR code from terminal

### On Simulator
```bash
npm run ios      # Mac only
npm run android  # Requires Android Studio
```

## Tech Stack

- **Framework**: React Native + Expo SDK 54
- **Navigation**: React Navigation 7
- **State Management**: React Hooks + AsyncStorage
- **API Client**: Axios
- **Backend**: Node.js/Express on Railway
- **Database**: PostgreSQL on Railway

## Future Enhancements

- [ ] Push notifications for new estimates
- [ ] Offline mode with local caching
- [ ] Photo attachment for estimates
- [ ] Dark mode support

## License

Proprietary - SEMIX CORP
