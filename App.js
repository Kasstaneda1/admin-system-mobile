import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SalaryScreen from './src/screens/SalaryScreen';
import PartsScreen from './src/screens/PartsScreen';
import CommunicationScreen from './src/screens/CommunicationScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import ReceiptsScreen from './src/screens/ReceiptsScreen';
import UnpaidScreen from './src/screens/UnpaidScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      setIsAuthenticated(!!token);
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return null; // TODO: Add loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#14B8A6',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="Login"
          options={{ headerShown: false }}
        >
          {(props) => <LoginScreen {...props} onLoginSuccess={() => setIsAuthenticated(true)} />}
        </Stack.Screen>
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
          name="Communication"
          component={CommunicationScreen}
          options={{ title: 'Communication' }}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
