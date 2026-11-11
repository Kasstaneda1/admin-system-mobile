import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from './src/constants/colors';
import { AuthProvider, useAuth } from './src/session/AuthContext';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import PartsScreen from './src/screens/PartsScreen';
import WarehouseScreen from './src/screens/WarehouseScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import UnpaidScreen from './src/screens/UnpaidScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}

// Signed out: only the sign-in screen. Signed in: the technician's screens, Home first, so
// there is no way back to sign in but Logout; the end of a session swaps the set by itself.
function Screens() {
  const { status } = useAuth();

  if (status === 'loading') {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: colors.white,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {status !== 'signedIn' ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'SEMIX Technician' }}
            />
            <Stack.Screen
              name="Salary"
              component={SalaryScreen}
              options={{ title: 'Salary' }}
            />
            <Stack.Screen
              name="Parts"
              component={PartsScreen}
              options={{ title: 'Parts' }}
            />
            <Stack.Screen
              name="Warehouse"
              component={WarehouseScreen}
              options={{ title: 'Warehouse' }}
            />
            <Stack.Screen
              name="Payments"
              component={PaymentsScreen}
              options={{ title: 'Payments' }}
            />
            <Stack.Screen
              name="Receipts"
              component={ReceiptsScreen}
              options={{ title: 'Receipts' }}
            />
            <Stack.Screen
              name="Unpaid"
              component={UnpaidScreen}
              options={{ title: 'Unpaid Records' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
