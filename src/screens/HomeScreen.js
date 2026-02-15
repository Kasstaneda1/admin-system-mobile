import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { colors } from '../constants/colors';

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await authAPI.logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      title: 'Salary',
      description: 'View your salary calculations',
      icon: '💰',
      screen: 'Salary',
    },
    {
      title: 'Parts',
      description: 'Parts and inventory',
      icon: '🔧',
      screen: 'Parts',
    },
    {
      title: 'Warehouse',
      description: 'Parts in your van',
      icon: '🏗️',
      screen: 'Warehouse',
    },
    {
      title: 'Payments',
      description: 'Payment history',
      icon: '💵',
      screen: 'Payments',
    },
    {
      title: 'Receipts',
      description: 'Upload and manage receipts',
      icon: '🧾',
      screen: 'Receipts',
    },
    {
      title: 'Unpaid',
      description: 'Unpaid records and debts',
      icon: '📊',
      screen: 'Unpaid',
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.welcome}>Welcome,</Text>
          <Text style={styles.name}>{user?.full_name || 'Technician'}</Text>
        </View>

        <View style={styles.menu}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => navigation.navigate(item.screen)}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <View style={styles.menuText}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuDescription}>{item.description}</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    backgroundColor: colors.primary,
    padding: 20,
    paddingTop: 30,
    paddingBottom: 30,
  },
  welcome: {
    fontSize: 16,
    color: colors.white,
    opacity: 0.9,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
    marginTop: 4,
  },
  menu: {
    padding: 15,
  },
  menuItem: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuIcon: {
    fontSize: 32,
    marginRight: 15,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: colors.textMedium,
  },
  menuArrow: {
    fontSize: 30,
    color: colors.primary,
    marginLeft: 10,
  },
  logoutButton: {
    backgroundColor: colors.white,
    margin: 15,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
});
