import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { estimatesAPI } from '../services/api';

export default function PartsScreen() {
  const [activeTab, setActiveTab] = useState('in_transit');
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    loadParts();
  }, [activeTab]);

  const loadParts = async () => {
    try {
      setLoading(true);
      // Convert tab name to status name for API
      const statusMap = {
        'in_transit': 'In Transit',
        'arrived': 'Arrived',
        'on_board': 'On Board',
      };
      const status = statusMap[activeTab];

      const data = await estimatesAPI.getPartsByStatus(status);
      setParts(data);
    } catch (error) {
      console.error('Failed to load parts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadParts();
  };

  const handlePartPress = async (part) => {
    setSelectedPart(part);
    // Load comments if not already loaded
    if (!part.comments) {
      try {
        const comments = await estimatesAPI.getEstimateComments(part.id);
        setSelectedPart({ ...part, comments });
      } catch (error) {
        console.error('Failed to load comments:', error);
        setSelectedPart({ ...part, comments: [] });
      }
    }
    setShowComments(true);
  };

  const renderPartCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handlePartPress(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.clientName}>{item.client || 'No Client'}</Text>
        <Text style={styles.date}>
          {item.date ? new Date(item.date).toLocaleDateString() : ''}
        </Text>
      </View>

      <View style={styles.partsInfo}>
        <Text style={styles.partsLabel}>Parts:</Text>
        <Text style={styles.partsName}>{item.name_parts || 'No parts specified'}</Text>
      </View>

      {item.part_number && (
        <Text style={styles.partNumber}>Part #: {item.part_number}</Text>
      )}
    </TouchableOpacity>
  );

  const renderCommentsModal = () => (
    <Modal
      visible={showComments}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowComments(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.commentsContainer}>
            {selectedPart?.comments && selectedPart.comments.length > 0 ? (
              selectedPart.comments.map((comment, index) => (
                <View key={index} style={styles.commentCard}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{comment.author || 'Unknown'}</Text>
                    <Text style={styles.commentDate}>
                      {comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{comment.text || comment.comment}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noComments}>No comments yet</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'in_transit' && styles.activeTab]}
          onPress={() => setActiveTab('in_transit')}
        >
          <Text style={[styles.tabText, activeTab === 'in_transit' && styles.activeTabText]}>
            🚚 In Transit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'arrived' && styles.activeTab]}
          onPress={() => setActiveTab('arrived')}
        >
          <Text style={[styles.tabText, activeTab === 'arrived' && styles.activeTabText]}>
            📍 Arrived
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'on_board' && styles.activeTab]}
          onPress={() => setActiveTab('on_board')}
        >
          <Text style={[styles.tabText, activeTab === 'on_board' && styles.activeTabText]}>
            📋 On Board
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#14B8A6" />
        </View>
      ) : (
        <FlatList
          data={parts}
          renderItem={renderPartCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#14B8A6']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No parts in this status</Text>
            </View>
          }
        />
      )}

      {renderCommentsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  tab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#14B8A6',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#14B8A6',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
  partsInfo: {
    marginBottom: 8,
  },
  partsLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  partsName: {
    fontSize: 16,
    color: '#14B8A6',
    fontWeight: '500',
  },
  partNumber: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
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
    fontSize: 24,
    color: '#666',
    paddingHorizontal: 10,
  },
  commentsContainer: {
    padding: 20,
  },
  commentCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#14B8A6',
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  commentDate: {
    fontSize: 12,
    color: '#999',
  },
  commentText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  noComments: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
});
