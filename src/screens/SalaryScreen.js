import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { salaryAPI } from '../services/api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORTS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function SalaryScreen() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Generate array of years (current year ± 2 years)
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const handleMonthPress = async (monthIndex) => {
    setSelectedMonth(monthIndex);
    setLoading(true);
    setShowModal(true);

    try {
      // Calculate date range for selected month
      const startDate = new Date(selectedYear, monthIndex, 1);
      const endDate = new Date(selectedYear, monthIndex + 1, 0);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const data = await salaryAPI.getSalaryData(startDateStr, endDateStr);
      setMonthData(data);
    } catch (error) {
      console.error('Failed to load month data:', error);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedMonth(null);
    setMonthData(null);
  };

  return (
    <View style={styles.container}>
      {/* Year Selector */}
      <View style={styles.yearSelector}>
        {years.map((year) => (
          <TouchableOpacity
            key={year}
            style={[
              styles.yearButton,
              selectedYear === year && styles.yearButtonActive,
            ]}
            onPress={() => setSelectedYear(year)}
          >
            <Text
              style={[
                styles.yearText,
                selectedYear === year && styles.yearTextActive,
              ]}
            >
              {year}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month Calendar Grid */}
      <ScrollView style={styles.scrollView}>
        <View style={styles.calendarGrid}>
          {MONTHS.map((month, index) => (
            <TouchableOpacity
              key={index}
              style={styles.monthCard}
              onPress={() => handleMonthPress(index)}
            >
              <Text style={styles.monthName}>{MONTH_SHORTS[index]}</Text>
              <Text style={styles.monthFullName}>{month}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Month Details Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMonth !== null ? MONTHS[selectedMonth] : ''} {selectedYear}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#14B8A6" />
              </View>
            ) : monthData ? (
              <ScrollView style={styles.modalBody}>
                {/* To Pay - Main highlight */}
                <View style={styles.toPayCard}>
                  <Text style={styles.toPayLabel}>To Pay</Text>
                  <Text style={styles.toPayAmount}>
                    ${parseFloat(monthData.totalSalary || 0).toFixed(2)}
                  </Text>
                </View>

                {/* Statistics Grid */}
                <View style={styles.statsGrid}>
                  <StatCard
                    label="Total Earned"
                    value={`$${parseFloat(monthData.totalEarned || 0).toFixed(2)}`}
                    color="#10b981"
                  />
                  <StatCard
                    label="Cash"
                    value={`$${parseFloat(monthData.cash || 0).toFixed(2)}`}
                    color="#14B8A6"
                  />
                  <StatCard
                    label="Checks"
                    value={`$${parseFloat(monthData.checks || 0).toFixed(2)}`}
                    color="#f59e0b"
                  />
                  <StatCard
                    label="Debt"
                    value={`$${parseFloat(monthData.totalDebt || 0).toFixed(2)}`}
                    color="#ef4444"
                  />
                </View>

                {/* Additional Info */}
                <View style={styles.infoCard}>
                  <InfoRow label="Records" value={monthData.recordsCount || 0} />
                  <InfoRow
                    label="Already Paid"
                    value={`$${parseFloat(monthData.totalPaid || 0).toFixed(2)}`}
                  />
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Stat Card Component
function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

// Info Row Component
function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  yearSelector: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  yearButton: {
    flex: 1,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  yearButtonActive: {
    backgroundColor: '#14B8A6',
  },
  yearText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  yearTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
  },
  monthCard: {
    width: '31%',
    margin: '1%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  monthName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#14B8A6',
    marginBottom: 5,
  },
  monthFullName: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  modalBody: {
    padding: 20,
  },
  toPayCard: {
    backgroundColor: '#14B8A6',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  toPayLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  toPayAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
