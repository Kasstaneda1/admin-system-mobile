import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { salaryAPI } from '../services/api';
import { colors } from '../constants/colors';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import YearSelector from '../components/YearSelector';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function PaymentsScreen() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [allPayments, setAllPayments] = useState([]);
  const [yearPayments, setYearPayments] = useState([]);
  const [yearTotal, setYearTotal] = useState(0);
  const [error, setError] = useState(null);

  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    if (allPayments.length > 0) {
      const filtered = allPayments.filter(payment => {
        const paymentYear = new Date(payment.payment_date).getFullYear();
        return paymentYear === selectedYear;
      });
      setYearPayments(filtered);
      const total = filtered.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      setYearTotal(total);
    } else {
      setYearPayments([]);
      setYearTotal(0);
    }
  }, [selectedYear, allPayments]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      setError(null);

      const userJson = await AsyncStorage.getItem('user');
      const user = JSON.parse(userJson);
      const technicianName = user?.fullName;

      if (!technicianName) {
        setError('Unable to load technician name');
        setLoading(false);
        return;
      }

      const data = await salaryAPI.getPayments(technicianName);
      setAllPayments(data.payments || []);
    } catch (err) {
      console.error('Error loading payments:', err);
      const message = err.response?.data?.error || 'Failed to load payments. Please check your connection.';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const groupPaymentsByMonth = (payments) => {
    const groups = {};
    payments.forEach(payment => {
      const date = new Date(payment.payment_date);
      const month = date.getMonth();
      if (!groups[month]) {
        groups[month] = [];
      }
      groups[month].push(payment);
    });
    // Sort months descending (most recent first)
    return Object.keys(groups)
      .map(Number)
      .sort((a, b) => b - a)
      .map(month => ({
        month,
        name: monthNames[month],
        payments: groups[month],
        total: groups[month].reduce((sum, p) => sum + parseFloat(p.amount || 0), 0),
      }));
  };

  const renderPayment = (payment) => {
    const date = new Date(payment.payment_date).toLocaleDateString();
    const amount = parseFloat(payment.amount || 0).toFixed(2);

    return (
      <View key={payment.id} style={styles.paymentCard}>
        <View style={styles.paymentMainRow}>
          <Text style={styles.paymentDate}>{date}</Text>
          <Text style={styles.paymentAmount}>${amount}</Text>
        </View>
      </View>
    );
  };

  const renderMonthGroup = (group) => {
    return (
      <View key={group.month} style={styles.monthGroup}>
        <View style={styles.monthHeader}>
          <View style={styles.monthHeaderLine} />
          <View style={styles.monthHeaderContent}>
            <Text style={styles.monthName}>{group.name}</Text>
            <Text style={styles.monthTotal}>${group.total.toFixed(2)}</Text>
          </View>
          <View style={styles.monthHeaderLine} />
        </View>
        <Text style={styles.monthCount}>
          {group.payments.length} {group.payments.length === 1 ? 'payment' : 'payments'}
        </Text>
        {group.payments.map(payment => renderPayment(payment))}
      </View>
    );
  };

  if (loading) {
    return <LoadingScreen message="Loading payments..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadPayments} />;
  }

  return (
    <View style={styles.container}>
      <YearSelector
        years={years}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Payments {selectedYear}</Text>
            <Text style={styles.summaryAmount}>${yearTotal.toFixed(2)}</Text>
            <Text style={styles.summaryCount}>
              {yearPayments.length} {yearPayments.length === 1 ? 'payment' : 'payments'}
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>💰</Text>
              <Text style={styles.sectionTitle}>Payment History</Text>
              <StatusBadge count={yearPayments.length} variant="primary" />
            </View>

            {yearPayments.length > 0 ? (
              groupPaymentsByMonth(yearPayments).map(group => renderMonthGroup(group))
            ) : (
              <EmptyState message={`No payments for ${selectedYear}`} />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.whiteTransparent90,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 14,
    color: colors.whiteTransparent80,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.textDark,
    marginRight: 8,
    flex: 1,
  },
  monthGroup: {
    marginBottom: 8,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 4,
  },
  monthHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  monthHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  monthName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  monthCount: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 10,
  },
  paymentCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentDate: {
    fontSize: 14,
    color: colors.textMedium,
  },
  paymentAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.success,
  },
});
