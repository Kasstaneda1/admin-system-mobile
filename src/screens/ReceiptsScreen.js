import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { receiptsAPI } from '../services/api';

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

      console.log('📋 Loading unsubmitted checks...');

      // Fetch unsubmitted checks
      const data = await receiptsAPI.getMyReceipts();

      console.log('📋 Unsubmitted checks loaded:', {
        count: data?.length || 0
      });

      setReceipts(data || []);
    } catch (err) {
      console.error('Error loading receipts:', err);
      setError('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  const renderReceipt = (receipt) => {
    const date = new Date(receipt.date).toLocaleDateString();
    const amount = parseFloat(receipt.check_amount || 0).toFixed(2);

    return (
      <View
        key={receipt.id}
        style={styles.receiptCard}
      >
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
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading receipts...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const totalAmount = receipts.reduce((sum, r) => sum + parseFloat(r.check_amount || 0), 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📋</Text>
          <Text style={styles.infoTitle}>Unsubmitted Checks</Text>
          <Text style={styles.infoText}>
            These are checks that have not been submitted yet. Please submit physical receipts to process payments.
          </Text>
        </View>

        {/* Summary */}
        {receipts.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Outstanding</Text>
            <Text style={styles.summaryAmount}>${totalAmount.toFixed(2)}</Text>
            <Text style={styles.summaryCount}>
              {receipts.length} {receipts.length === 1 ? 'check' : 'checks'}
            </Text>
          </View>
        )}

        {/* Receipts List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🧾</Text>
            <Text style={styles.sectionTitle}>Pending Checks</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{receipts.length}</Text>
            </View>
          </View>

          {receipts.length > 0 ? (
            receipts.map(receipt => renderReceipt(receipt))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No unsubmitted checks</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    padding: 20,
  },

  // Info card
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
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
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#f59e0b',
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
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Section styles
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
    color: '#333',
    marginRight: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f59e0b',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Receipt card styles
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
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
    color: '#666',
  },
  receiptAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f59e0b',
  },
  receiptClient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 6,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#14B8A6',
  },

  // Empty state
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
