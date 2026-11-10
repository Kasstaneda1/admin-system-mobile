# SEMIX Technician Mobile App

React Native mobile application for SEMIX CORP technicians built with Expo.

## 📱 Development Status: **PHASE 3 - SALARY RECORDS FEATURE COMPLETE**

### ✅ Completed (Feb 11, 2026)

- **Salary Records Feature (COMPLETE)** 🎉
  - ✅ Records button in Salary screen monthly view
  - ✅ Records List Modal showing all work records for selected month
  - ✅ Work Details Modal with comprehensive job information
  - ✅ Two-level modal navigation with Back buttons (Records List ↔ Work Details)
  - ✅ Fixed modal stacking and visibility issues
  - ✅ Work Details displays 10 fields matching admin panel:
    - Date, Status, Payment Method, Payment Status
    - Amount, Tax, Installation, Parts, 2nd Tech, Tips
  - ✅ Your Earnings section: Salary + Cash Received
  - ✅ Backend endpoint: `GET /api/technicians/salary` with `records` array
  - ✅ Color-coded payment status (Green: Paid, Red: Not Paid)

### ✅ Completed (Feb 10, 2026)

- **Project Setup**
  - ✅ Expo SDK 54 configuration
  - ✅ React Native 0.81.5
  - ✅ React Navigation 7 setup
  - ✅ Project structure created

- **Authentication**
  - ✅ Login screen with SEMIX branding
  - ✅ JWT token management with `fullName` field
  - ✅ AsyncStorage integration
  - ✅ Auto-login on app restart
  - ✅ Fixed API endpoint (`/api/login`)

- **Parts Feature (COMPLETE)** 🎉
  - ✅ PartsScreen with three status tabs:
    - 🚚 In Transit
    - 📍 Arrived
    - 📋 On Board
  - ✅ Display CLIENT and NAME PARTS for each estimate
  - ✅ Part number and date display
  - ✅ Comments modal on part tap
  - ✅ Pull-to-refresh functionality
  - ✅ Filter by current technician only
  - ✅ Backend endpoint: `GET /api/my-parts?status=X`
  - ✅ Comments endpoint: `GET /api/estimates/:id/comments`

- **UI Screens**
  - ✅ LoginScreen - fully functional
  - ✅ HomeScreen - fully functional with 6 menu sections
  - ✅ PartsScreen - **fully functional** ⭐
  - ✅ SalaryScreen - **fully functional with Records feature** ⭐
  - ✅ CommunicationScreen - placeholder
  - ✅ PaymentsScreen - placeholder
  - ✅ ReceiptsScreen - placeholder
  - ✅ UnpaidScreen - placeholder

### 🔧 Technical Fixes Applied

1. **Status Format**: Fixed status values from "In Transit" to `in_transit` (database format)
2. **Technician Matching**: Added support for matching by `technician_id`, `technician2_id`, or `fullName`
3. **JWT Token**: Added `fullName` field to JWT payload for proper technician identification
4. **Comment Fields**: Fixed comment display to use correct database fields (`user_name`, `comment_text`)
5. **Modal Navigation**: Fixed modal stacking issues - implemented proper show/hide logic for layered modals
6. **Work Details Fields**: Aligned mobile app fields with admin panel Technician Salary table structure

### ⚠️ Known Issues

1. **API Endpoints Not Ready**
   - Payments: Returns empty array (backend endpoint doesn't exist)
   - Receipts: Mock success response (backend endpoint doesn't exist)
   - Communication: No backend implementation yet
   - Unpaid: No backend implementation yet

2. **Navigation Warning** (Development only, won't affect production)
   - Console shows RESET action warning
   - Does not impact functionality

### 🚧 Next Phase: Payments & Additional Features

**Required Backend Endpoints:**
```
GET  /api/technicians/payments     - Get payment history for current technician
                                     Returns: list of payments with dates and amounts

POST /api/technicians/receipts     - Upload receipt with photo
                                     Body: multipart/form-data with image file

GET  /api/technicians/unpaid       - Get unpaid records for current technician
                                     Returns: list of unpaid primary_data records

(Communication feature TBD)
```

**Completed Endpoints:**
```
✅ GET  /api/technicians/salary    - Salary calculation with records array
✅ GET  /api/my-parts               - Parts tracking with status filtering
✅ GET  /api/estimates/:id/comments - Comments for estimates
```

## Features (Planned)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- iOS Simulator (Mac only) or Android Studio for testing

## Installation

### 1. Install Node.js dependencies

```bash
npm install
```

### 2. Install Expo CLI globally (if not already installed)

```bash
npm install -g expo-cli
```

### 3. Start the development server

```bash
npm start
```

This will open the Expo Developer Tools in your browser.

## Running the App

### On Physical Device

Expo Go does not open this app any more: install a build of it (see **Builds**).

### On iOS Simulator (Mac only)

```bash
npm run ios
```

### On Android Emulator

```bash
npm run android
```

Make sure you have Android Studio installed and an emulator running.

## Project Structure

```
admin-system-mobile/
├── App.js                       # Main app entry with navigation
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── src/
│   ├── screens/                 # All screen components
│   │   ├── LoginScreen.js       # Authentication
│   │   ├── HomeScreen.js        # Main menu (6 sections)
│   │   ├── PartsScreen.js       # ⭐ Parts tracking with tabs & comments
│   │   ├── SalaryScreen.js      # Salary calculations (UI ready)
│   │   ├── CommunicationScreen.js  # Messages (placeholder)
│   │   ├── PaymentsScreen.js    # Payment history (placeholder)
│   │   ├── ReceiptsScreen.js    # Receipt upload (placeholder)
│   │   └── UnpaidScreen.js      # Unpaid records (placeholder)
│   ├── services/
│   │   └── api.js               # API service (server from EXPO_PUBLIC_API_URL)
│   └── components/              # Reusable components (future)
└── assets/                      # App icons and splash screens
```

## API Configuration

The server comes from the build, not from the code: `EXPO_PUBLIC_API_URL`.
`app.config.js` checks it (without it no Expo command runs; plain `http` only for a local
stand), Metro writes it into the JS, `src/services/api.js` reads it.

```bash
# a local backend stand on this Mac (the iOS Simulator reaches it as 127.0.0.1)
EXPO_PUBLIC_API_URL=http://127.0.0.1:8291 npx expo start
```

`eas.json` sets it for each build profile: `development` — a local stand,
`preview` and `production` — the live server.
The Android emulator reaches this Mac as `10.0.2.2`, not `127.0.0.1`.

## Authentication

- Technicians log in with their existing credentials
- JWT tokens are stored in AsyncStorage
- Automatic token refresh on API requests
- Only users with `role: 'technician'` can access the app

## Builds

Expo Go no longer opens this app (the App Store Expo Go runs only the newest SDK), so the
app runs as its own build. `ios/` and `android/` are not in git: `npx expo prebuild` makes
them from `app.json`, `app.config.js` and `plugins/`. Use Node 22 (`eas.json` asks EAS for
22.14.0 too).

| `eas.json` profile | What | Server |
|---|---|---|
| `development` | Debug build, the JS comes from Metro; iOS Simulator `.app`, Android APK | local stand |
| `preview` | Release build for testers' phones (internal; iOS needs the paid Apple account) | live |
| `production` | store build, the build number goes up by itself | live |

EAS needs an Expo account and `eas init` (it adds the project id); neither is done yet.

**iOS Simulator on this Mac, without EAS:**

```bash
export EXPO_PUBLIC_API_URL=http://127.0.0.1:8291
npx expo prebuild --platform ios       # then: git checkout package.json
cd ios && pod install
xcodebuild -workspace SEMIXTechnician.xcworkspace -scheme SEMIXTechnician \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath <a folder outside the internal disk> build
xcrun simctl install booted <derivedData>/Build/Products/Debug-iphonesimulator/SEMIXTechnician.app
npx expo start                          # Metro; the app loads the JS from it
```

**iOS 27.** An app built with Xcode 27 stops at launch without the UIScene life cycle;
Expo SDK 54 does not have it yet. `plugins/withIos27Scene.js` adds it on every prebuild (a `SceneDelegate` in
`AppDelegate.swift`, the scene manifest in `Info.plist`) and lifts pods to iOS 15.1. Take
it out with the SDK upgrade that brings scenes. Because of it there is no `expo-dev-client`
for now: its SDK 54 launcher needs the window before the scene makes it.

## Troubleshooting

### Cannot connect to backend

- Check internet connection
- Check `EXPO_PUBLIC_API_URL` in the shell that started Metro; after changing it restart Metro with `-c`
- Make sure that server is running

### Camera/Gallery permissions

- The app requests permissions at runtime
- Grant permissions in device settings if denied

### Build fails

```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
expo start -c
```

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: React Navigation 7
- **State Management**: React Hooks + AsyncStorage
- **API Client**: Axios
- **Image Handling**: Expo Image Picker
- **Document Handling**: Expo Document Picker

## Future Enhancements

- [ ] Push notifications for new estimates
- [ ] Offline mode with local caching
- [ ] Photo attachment for estimates
- [ ] Signature capture
- [ ] Dark mode support
- [ ] Multi-language support (English/Spanish)

## Support

For issues or questions, contact the admin team or create an issue in the repository.

## License

Proprietary - SEMIX CORP
