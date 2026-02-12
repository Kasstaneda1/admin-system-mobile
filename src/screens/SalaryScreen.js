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
  const [yearData, setYearData] = useState([]); // Array of 12 months with earned amounts
  const [loadingYear, setLoadingYear] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [showWorkDetailsModal, setShowWorkDetailsModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  // Generate array of years (current year ± 2 years)
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  // Load all months data when year changes
  useEffect(() => {
    loadYearData();
  }, [selectedYear]);

  const loadYearData = async () => {
    setLoadingYear(true);
    const monthsData = [];

    try {
      // Load data for all 12 months
      for (let month = 0; month < 12; month++) {
        const startDate = new Date(selectedYear, month, 1);
        const endDate = new Date(selectedYear, month + 1, 0);
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        try {
          const data = await salaryAPI.getSalaryData(startDateStr, endDateStr);
          monthsData[month] = {
            earned: data.monthSummary?.earned || 0,
          };
        } catch (error) {
          monthsData[month] = { earned: 0 };
        }
      }
      setYearData(monthsData);
    } catch (error) {
      console.error('Failed to load year data:', error);
    } finally {
      setLoadingYear(false);
    }
  };

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
          {MONTHS.map((month, index) => {
            const earned = yearData[index]?.earned || 0;
            const hasData = earned > 0;

            return (
              <TouchableOpacity
                key={index}
                style={styles.monthCard}
                onPress={() => handleMonthPress(index)}
              >
                <Text style={styles.monthName}>{MONTH_SHORTS[index]}</Text>
                <Text style={styles.monthFullName}>{month}</Text>
                {hasData && (
                  <Text style={styles.monthEarned}>
                    ${earned.toFixed(2)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {loadingYear && (
          <View style={styles.yearLoadingOverlay}>
            <ActivityIndicator size="large" color="#14B8A6" />
          </View>
        )}
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
                    ${parseFloat(monthData.toPayTotal || 0).toFixed(2)}
                  </Text>
                </View>

                {/* Statistics Grid */}
                <View style={styles.statsGrid}>
                  <StatCard
                    label="Total Earned"
                    value={`$${parseFloat(monthData.monthSummary?.earned || 0).toFixed(2)}`}
                    color="#10b981"
                  />
                  <StatCard
                    label="Cash"
                    value={`$${parseFloat(monthData.monthSummary?.cash || 0).toFixed(2)}`}
                    color="#14B8A6"
                  />
                  <StatCard
                    label="Checks"
                    value={`$${parseFloat(monthData.monthSummary?.checks || 0).toFixed(2)}`}
                    color="#f59e0b"
                  />
                  <StatCard
                    label="Unpaid"
                    value={`$${parseFloat(monthData.unpaid || 0).toFixed(2)}`}
                    color="#ef4444"
                  />
                </View>

                {/* Additional Info */}
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() => {
                    setShowModal(false); // Hide month modal
                    setShowRecordsModal(true); // Show records modal
                  }}
                >
                  <View style={styles.infoRowClickable}>
                    <View>
                      <Text style={styles.infoLabel}>Records</Text>
                      <Text style={styles.infoValue}>{monthData.recordsCount || 0}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No data available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Records List Modal */}
      <Modal
        visible={showRecordsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowRecordsModal(false);
          setShowModal(true);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowRecordsModal(false);
                  setShowModal(true); // Return to month details
                }}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Work Records</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowRecordsModal(false);
                  setSelectedMonth(null);
                  setMonthData(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {monthData?.records && monthData.records.length > 0 ? (
                monthData.records.map((record, index) => {
                  const isPaid = record.payment_status === 'Paid';
                  return (
                    <TouchableOpacity
                      key={record.id || index}
                      style={[
                        styles.recordCard,
                        { borderLeftColor: isPaid ? '#10b981' : '#ef4444' }
                      ]}
                      onPress={() => {
                        setSelectedRecord(record);
                        setShowRecordsModal(false); // Hide records modal
                        setShowWorkDetailsModal(true); // Show work details
                      }}
                    >
                      <View style={styles.recordHeader}>
                        <Text style={styles.recordDate}>
                          {new Date(record.date).toLocaleDateString()}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: isPaid ? '#10b981' : '#ef4444' }
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {isPaid ? 'Paid' : 'Not Paid'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.recordClient}>{record.client_name}</Text>
                      <Text style={styles.recordSalary}>
                        ${parseFloat(record.calculated_salary || 0).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No records found</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Work Details Modal */}
      <Modal
        visible={showWorkDetailsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowWorkDetailsModal(false);
          setShowRecordsModal(true);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowWorkDetailsModal(false);
                  setShowRecordsModal(true); // Return to records list
                }}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Work Details</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowWorkDetailsModal(false);
                  setShowRecordsModal(false);
                  setSelectedMonth(null);
                  setMonthData(null);
                }}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            {selectedRecord && (
              <ScrollView style={styles.modalBody}>
                {/* Customer Section */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Customer</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Client Name:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.client_name}</Text>
                  </View>
                  {selectedRecord.company && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Company:</Text>
                      <Text style={styles.detailValue}>{selectedRecord.company}</Text>
                    </View>
                  )}
                </View>

                {/* Work Details Section */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Work Details</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedRecord.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.work_status || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Method:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.payment_method || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Payment Status:</Text>
                    <Text style={styles.detailValue}>{selectedRecord.payment_status || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.amount || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tax:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.tax || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Installation:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.installation || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Parts:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.parts || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>2nd Tech:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.second_tech || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tips:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.tips || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Your Earnings Section */}
                <View style={[styles.detailSection, styles.earningsSection]}>
                  <Text style={[styles.detailSectionTitle, { color: '#2E7D32' }]}>
                    💰 Your Earnings
                  </Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Salary:</Text>
                    <Text style={[styles.detailValue, styles.salaryHighlight]}>
                      ${parseFloat(selectedRecord.calculated_salary || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cash Received:</Text>
                    <Text style={styles.detailValue}>
                      ${parseFloat(selectedRecord.cash_received || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </ScrollView>
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
  monthEarned: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f59e0b',
    marginTop: 8,
  },
  yearLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
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
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    position: 'absolute',
    left: 20,
    zIndex: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#14B8A6',
    fontWeight: '600',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 20,
    zIndex: 10,
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
  infoRowClickable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 32,
    color: '#14B8A6',
    fontWeight: 'bold',
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
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordDate: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  recordClient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  recordSalary: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14B8A6',
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  earningsSection: {
    backgroundColor: '#E8F5E9',
    borderColor: '#81C784',
    borderWidth: 2,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  salaryHighlight: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E7D32',
  },
});
