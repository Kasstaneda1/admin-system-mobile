import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { salaryAPI } from '../services/api';

export default function SalaryScreen() {
  const [salaryData, setSalaryData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    try {
      const { startDate, endDate } = getDateRange(selectedPeriod);

      const [salaryResponse, paymentsResponse] = await Promise.all([
        salaryAPI.getSalaryData(startDate, endDate),
        salaryAPI.getPayments(),
      ]);

      setSalaryData(salaryResponse);
      setPayments(paymentsResponse);
    } catch (error) {
      console.error('Failed to load salary data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getDateRange = (period) => {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'current_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'current_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#14B8A6']}
        />
      }
    >
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'current_month' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('current_month')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'current_month' && styles.periodTextActive]}>
            This Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'last_month' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('last_month')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'last_month' && styles.periodTextActive]}>
            Last Month
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodButton, selectedPeriod === 'current_year' && styles.periodButtonActive]}
          onPress={() => setSelectedPeriod('current_year')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'current_year' && styles.periodTextActive]}>
            This Year
          </Text>
        </TouchableOpacity>
      </View>

      {/* Salary Summary */}
      {salaryData && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Total Salary</Text>
          <Text style={styles.summaryAmount}>
            ${parseFloat(salaryData.totalSalary || 0).toFixed(2)}
          </Text>

          <View style={styles.summaryDetails}>
            <DetailRow label="Earned" value={`$${parseFloat(salaryData.totalEarned || 0).toFixed(2)}`} />
            <DetailRow label="Debt" value={`$${parseFloat(salaryData.totalDebt || 0).toFixed(2)}`} color="#ef4444" />
            <DetailRow label="Paid" value={`$${parseFloat(salaryData.totalPaid || 0).toFixed(2)}`} color="#10b981" />
          </View>
        </View>
      )}

      {/* Recent Payments */}
      {payments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          {payments.slice(0, 10).map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <Text style={styles.paymentAmount}>
                  ${parseFloat(payment.amount).toFixed(2)}
                </Text>
                <Text style={styles.paymentDate}>
                  {new Date(payment.payment_date).toLocaleDateString()}
                </Text>
              </View>
              {payment.payment_method && (
                <Text style={styles.paymentMethod}>{payment.payment_method}</Text>
              )}
              {payment.notes && (
                <Text style={styles.paymentNotes}>{payment.notes}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value, color = '#333' }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={[styles.detailValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
  },
  periodButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  periodButtonActive: {
    backgroundColor: '#14B8A6',
    borderColor: '#14B8A6',
  },
  periodText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  periodTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 15,
    marginTop: 0,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#14B8A6',
    marginBottom: 20,
  },
  summaryDetails: {
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    paddingTop: 15,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    padding: 15,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  paymentCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10b981',
  },
  paymentDate: {
    fontSize: 14,
    color: '#666',
  },
  paymentMethod: {
    fontSize: 14,
    color: '#14B8A6',
    marginBottom: 4,
  },
  paymentNotes: {
    fontSize: 12,
    color: '#999',
  },
});
