# SEMIX Technician Mobile App

React Native mobile application for SEMIX CORP technicians built with Expo.

## 📱 Development Status: **PHASE 1 - BASIC SETUP COMPLETE**

### ✅ Completed (Feb 10, 2026)

- **Project Setup**
  - ✅ Expo SDK 54 configuration
  - ✅ React Native 0.81.5
  - ✅ React Navigation 7 setup
  - ✅ Project structure created

- **Authentication**
  - ✅ Login screen with SEMIX branding
  - ✅ JWT token management
  - ✅ AsyncStorage integration
  - ✅ Auto-login on app restart
  - ✅ Fixed API endpoint (`/api/login`)

- **UI Screens Created**
  - ✅ LoginScreen - functional
  - ✅ HomeScreen - functional
  - ✅ EstimatesScreen - UI ready
  - ✅ EstimateDetailScreen - UI ready
  - ✅ SalaryScreen - UI ready
  - ✅ ReceiptsScreen - UI ready

### ⚠️ Known Issues

1. **API Endpoints Not Ready**
   - Estimates: Using `/api/estimates` (returns ALL estimates, not filtered by technician)
   - Salary: Returns mock data (backend endpoint doesn't exist)
   - Payments: Returns empty array (backend endpoint doesn't exist)
   - Receipts: Mock success response (backend endpoint doesn't exist)

2. **Navigation Warning** (Development only, won't affect production)
   - Console shows RESET action warning
   - Does not impact functionality

### 🚧 Next Phase: Backend API Implementation

**Required Backend Endpoints:**
```
GET  /api/my-estimates             - Get current technician's estimates only
GET  /api/my-salary                - Calculate salary (params: start_date, end_date)
GET  /api/my-payments              - Get payment history
POST /api/my-receipt               - Upload receipt (multipart/form-data)
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

1. Install **Expo Go** app from App Store (iOS) or Google Play (Android)
2. Scan the QR code from the terminal or Expo Developer Tools
3. The app will load on your device

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
├── App.js                 # Main app entry with navigation
├── app.json               # Expo configuration
├── package.json           # Dependencies
├── src/
│   ├── screens/           # All screen components
│   │   ├── LoginScreen.js
│   │   ├── HomeScreen.js
│   │   ├── EstimatesScreen.js
│   │   ├── EstimateDetailScreen.js
│   │   ├── SalaryScreen.js
│   │   └── ReceiptsScreen.js
│   ├── services/
│   │   └── api.js         # API service with Railway backend
│   └── components/        # Reusable components (future)
└── assets/                # App icons and splash screens
```

## API Configuration

The app connects to the Railway backend:

```javascript
const API_URL = 'https://admin-system-backend-production.up.railway.app';
```

To change the API URL, edit `src/services/api.js`.

## Authentication

- Technicians log in with their existing credentials
- JWT tokens are stored in AsyncStorage
- Automatic token refresh on API requests
- Only users with `role: 'technician'` can access the app

## Building for Production

### iOS

1. Configure app.json with your bundle identifier
2. Build the app:

```bash
expo build:ios
```

### Android

1. Configure app.json with your package name
2. Build the APK:

```bash
expo build:android
```

For detailed build instructions, see [Expo Build Documentation](https://docs.expo.dev/build/introduction/).

## Environment

- **Development**: Uses Expo Go
- **Production**: Standalone app builds for App Store / Google Play

## Troubleshooting

### Cannot connect to backend

- Check internet connection
- Verify API_URL in `src/services/api.js`
- Ensure Railway backend is running

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
