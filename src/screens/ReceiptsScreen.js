import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { receiptsAPI } from '../services/api';
import { colors } from '../constants/colors';
import LoadingScreen from '../components/LoadingScreen';
import ErrorMessage from '../components/ErrorMessage';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';

export default function ReceiptsScreen() {
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await receiptsAPI.getMyReceipts();
      setReceipts(data || []);
    } catch (err) {
      console.error('Error loading receipts:', err);
      const message = err.response?.data?.error || 'Failed to load receipts. Please check your connection.';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const renderReceipt = (receipt) => {
    const date = new Date(receipt.date).toLocaleDateString();
    const amount = parseFloat(receipt.check_amount || 0).toFixed(2);

    return (
      <View key={receipt.id} style={styles.receiptCard}>
        <View style={styles.receiptMainRow}>
          <Text style={styles.receiptDate}>{date}</Text>
          <Text style={styles.receiptAmount}>${amount}</Text>
        </View>
        <Text style={styles.receiptClient}>{receipt.client_name}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={styles.statusValue}>{receipt.work_status}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <LoadingScreen message="Loading receipts..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={loadReceipts} />;
  }

  const totalAmount = receipts.reduce((sum, r) => sum + parseFloat(r.check_amount || 0), 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📋</Text>
          <Text style={styles.infoTitle}>Unsubmitted Checks</Text>
          <Text style={styles.infoText}>
            These are checks that have not been submitted yet. Please submit physical receipts to process payments.
          </Text>
        </View>

        {receipts.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Outstanding</Text>
            <Text style={styles.summaryAmount}>${totalAmount.toFixed(2)}</Text>
            <Text style={styles.summaryCount}>
              {receipts.length} {receipts.length === 1 ? 'check' : 'checks'}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🧾</Text>
            <Text style={styles.sectionTitle}>Pending Checks</Text>
            <StatusBadge count={receipts.length} variant="warning" />
          </View>

          {receipts.length > 0 ? (
            receipts.map(receipt => renderReceipt(receipt))
          ) : (
            <EmptyState message="No unsubmitted checks" />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textDark,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textMedium,
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: colors.warning,
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
  receiptCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  receiptMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  receiptDate: {
    fontSize: 14,
    color: colors.textMedium,
  },
  receiptAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.warning,
  },
  receiptClient: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textDark,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: colors.textMedium,
    marginRight: 6,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});
