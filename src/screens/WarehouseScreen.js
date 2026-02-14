import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
  Modal,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warehouseAPI } from '../services/api';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'washer', label: 'Washer' },
  { key: 'dryer', label: 'Dryer' },
  { key: 'refrigerator', label: 'Fridge' },
  { key: 'oven', label: 'Oven' },
  { key: 'dishwasher', label: 'Dishwasher' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'commercial', label: 'Commercial' },
];

const CATEGORY_ICONS = {
  washer: '🫧',
  dryer: '🌀',
  refrigerator: '❄️',
  oven: '🔥',
  dishwasher: '🍽️',
  hvac: '💨',
  commercial: '🏭',
};

export default function WarehouseScreen() {
  const [warehouse, setWarehouse] = useState(null);
  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [categoryCounts, setCategoryCounts] = useState({});
  const [noWarehouse, setNoWarehouse] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [partDetail, setPartDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadWarehouse();
  }, []);

  useEffect(() => {
    filterParts();
  }, [parts, searchQuery, activeCategory]);

  const loadWarehouse = async () => {
    try {
      setLoading(true);
      setNoWarehouse(false);

      // Get user ID from AsyncStorage
      const userData = await AsyncStorage.getItem('user');
      if (!userData) return;
      const user = JSON.parse(userData);
      const userId = user.id;

      // Get all warehouses and find technician's van
      const warehouses = await warehouseAPI.getWarehouses();
      const techVan = warehouses.find(
        (w) => w.type === 'tech_van' && w.technician_id === userId
      );

      if (!techVan) {
        setNoWarehouse(true);
        setLoading(false);
        return;
      }

      setWarehouse(techVan);
      await loadParts(techVan.id);
    } catch (error) {
      console.error('Failed to load warehouse:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadParts = async (warehouseId) => {
    try {
      const [partsData, statsData] = await Promise.all([
        warehouseAPI.getParts(warehouseId),
        warehouseAPI.getStats(warehouseId),
      ]);

      setParts(partsData);

      // Build category counts
      if (statsData?.categories) {
        setCategoryCounts(statsData.categories);
      }
    } catch (error) {
      console.error('Failed to load parts:', error);
    }
  };

  const filterParts = () => {
    let filtered = [...parts];

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === activeCategory);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().trim().split(/\s+/);
      filtered = filtered.filter((part) => {
        const searchFields = [
          part.name,
          part.sku,
          part.brand_name,
          part.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return terms.every((term) => searchFields.includes(term));
      });
    }

    setFilteredParts(filtered);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (warehouse) {
      await loadParts(warehouse.id);
    }
    setRefreshing(false);
  }, [warehouse]);

  const openPartDetail = async (part) => {
    setSelectedPart(part);
    setDetailLoading(true);
    try {
      const detail = await warehouseAPI.getPartById(part.id);
      setPartDetail(detail);
    } catch (error) {
      console.error('Failed to load part detail:', error);
      setPartDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closePartDetail = () => {
    setSelectedPart(null);
    setPartDetail(null);
  };

  const getStockColor = (quantity, minStock) => {
    if (quantity === 0) return '#ef4444';
    if (quantity <= minStock) return '#f59e0b';
    return '#10b981';
  };

  const getStockLabel = (quantity, minStock) => {
    if (quantity === 0) return 'Out of Stock';
    if (quantity <= minStock) return 'Low Stock';
    return 'In Stock';
  };

  const totalParts = parts.length;
  const totalQuantity = parts.reduce((sum, p) => sum + (p.quantity || 0), 0);

  // Loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#14B8A6" />
        <Text style={styles.loadingText}>Loading warehouse...</Text>
      </View>
    );
  }

  // No warehouse assigned
  if (noWarehouse) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>🚐</Text>
        <Text style={styles.emptyTitle}>No Van Assigned</Text>
        <Text style={styles.emptyDescription}>
          Your warehouse has not been set up yet.{'\n'}
          Please contact your administrator.
        </Text>
      </View>
    );
  }

  const renderPartCard = ({ item }) => {
    const stockColor = getStockColor(item.quantity, item.min_stock);
    const stockLabel = getStockLabel(item.quantity, item.min_stock);

    return (
      <TouchableOpacity
        style={styles.partCard}
        onPress={() => openPartDetail(item)}
        activeOpacity={0.7}
      >
        <View style={styles.partCardContent}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.partImage} />
          ) : (
            <View style={styles.partImagePlaceholder}>
              <Text style={styles.partImageIcon}>
                {CATEGORY_ICONS[item.category] || '🔧'}
              </Text>
            </View>
          )}

          <View style={styles.partInfo}>
            <Text style={styles.partName} numberOfLines={2}>
              {item.name}
            </Text>

            <View style={styles.partMeta}>
              {item.sku && (
                <Text style={styles.partSku}>SKU: {item.sku}</Text>
              )}
              {item.brand_name && (
                <Text style={styles.partBrand}>{item.brand_name}</Text>
              )}
            </View>

            <View style={styles.partFooter}>
              <View
                style={[
                  styles.stockBadge,
                  { backgroundColor: stockColor + '15' },
                ]}
              >
                <View
                  style={[styles.stockDot, { backgroundColor: stockColor }]}
                />
                <Text style={[styles.stockText, { color: stockColor }]}>
                  {stockLabel}
                </Text>
              </View>
              {item.price > 0 && (
                <Text style={styles.partPrice}>
                  ${parseFloat(item.price).toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.quantityBadge}>
            <Text style={styles.quantityNumber}>{item.quantity || 0}</Text>
            <Text style={styles.quantityLabel}>qty</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Stats Header */}
      <View style={styles.statsHeader}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalParts}</Text>
            <Text style={styles.statLabel}>Parts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{totalQuantity}</Text>
            <Text style={styles.statLabel}>Total Qty</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {warehouse?.stats?.total_value
                ? `$${parseFloat(warehouse.stats.total_value).toFixed(0)}`
                : '$0'}
            </Text>
            <Text style={styles.statLabel}>Value</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search parts..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {CATEGORIES.map((cat) => {
          const count =
            cat.key === 'all'
              ? totalParts
              : categoryCounts[cat.key] || 0;
          const isActive = activeCategory === cat.key;

          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  isActive && styles.categoryChipTextActive,
                ]}
              >
                {cat.label}
              </Text>
              <View
                style={[
                  styles.categoryCount,
                  isActive && styles.categoryCountActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryCountText,
                    isActive && styles.categoryCountTextActive,
                  ]}
                >
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Parts List */}
      <FlatList
        data={filteredParts}
        renderItem={renderPartCard}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#14B8A6"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyListIcon}>📦</Text>
            <Text style={styles.emptyListText}>
              {searchQuery || activeCategory !== 'all'
                ? 'No parts match your filters'
                : 'No parts in your warehouse'}
            </Text>
          </View>
        }
      />

      {/* Part Detail Modal */}
      <Modal
        visible={!!selectedPart}
        animationType="slide"
        transparent={true}
        onRequestClose={closePartDetail}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Part Details</Text>
              <TouchableOpacity onPress={closePartDetail}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#14B8A6" />
              </View>
            ) : partDetail ? (
              <ScrollView style={styles.modalBody}>
                {/* Photo */}
                {partDetail.photo_url && (
                  <Image
                    source={{ uri: partDetail.photo_url }}
                    style={styles.detailImage}
                    resizeMode="contain"
                  />
                )}

                {/* Name & SKU */}
                <Text style={styles.detailName}>{partDetail.name}</Text>
                {partDetail.sku && (
                  <Text style={styles.detailSku}>SKU: {partDetail.sku}</Text>
                )}

                {/* Info Section */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Information</Text>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Category</Text>
                    <Text style={styles.detailValue}>
                      {CATEGORY_ICONS[partDetail.category] || ''}{' '}
                      {partDetail.category?.charAt(0).toUpperCase() +
                        partDetail.category?.slice(1)}
                    </Text>
                  </View>

                  {partDetail.price > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Price</Text>
                      <Text style={[styles.detailValue, styles.detailPrice]}>
                        ${parseFloat(partDetail.price).toFixed(2)}
                      </Text>
                    </View>
                  )}

                  {partDetail.description && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>
                        {partDetail.description}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Brands */}
                {partDetail.brands?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Brands</Text>
                    <View style={styles.tagsRow}>
                      {partDetail.brands.map((brand) => (
                        <View key={brand.id} style={styles.tag}>
                          <Text style={styles.tagText}>{brand.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Part Numbers */}
                {partDetail.part_numbers?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Part Numbers</Text>
                    {partDetail.part_numbers.map((pn) => (
                      <View key={pn.id} style={styles.partNumberRow}>
                        <Text style={styles.partNumberText}>{pn.number}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Suppliers */}
                {partDetail.suppliers?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Suppliers</Text>
                    {partDetail.suppliers.map((s) => (
                      <View key={s.id} style={styles.supplierRow}>
                        <Text style={styles.supplierName}>
                          {s.supplier_name}
                        </Text>
                        {s.supplier_url && (
                          <Text style={styles.supplierUrl} numberOfLines={1}>
                            {s.supplier_url}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Inventory Across Warehouses */}
                {partDetail.inventory?.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>
                      Inventory Locations
                    </Text>
                    {partDetail.inventory.map((inv) => (
                      <View key={inv.warehouse_id} style={styles.inventoryRow}>
                        <Text style={styles.inventoryName}>
                          {inv.warehouse_name}
                        </Text>
                        <Text style={styles.inventoryQty}>
                          {inv.quantity} pcs
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: 30 }} />
              </ScrollView>
            ) : (
              <View style={styles.modalLoading}>
                <Text style={styles.emptyListText}>
                  Failed to load part details
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },

  // Empty state
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Stats Header
  statsHeader: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#14B8A6',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e5e7eb',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: '#333',
  },
  clearSearch: {
    fontSize: 18,
    color: '#999',
    paddingLeft: 8,
  },

  // Categories
  categoriesContainer: {
    maxHeight: 50,
    marginTop: 12,
  },
  categoriesContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#14B8A6',
    borderColor: '#14B8A6',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  categoryCount: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
    minWidth: 22,
    alignItems: 'center',
  },
  categoryCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  categoryCountTextActive: {
    color: '#fff',
  },

  // Parts List
  listContent: {
    padding: 12,
    paddingTop: 12,
  },
  partCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  partCardContent: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  partImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  partImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partImageIcon: {
    fontSize: 24,
  },
  partInfo: {
    flex: 1,
    marginLeft: 12,
  },
  partName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  partMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  partSku: {
    fontSize: 12,
    color: '#999',
  },
  partBrand: {
    fontSize: 12,
    color: '#14B8A6',
    fontWeight: '500',
  },
  partFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  stockText: {
    fontSize: 11,
    fontWeight: '600',
  },
  partPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  quantityBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdfa',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  quantityNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#14B8A6',
  },
  quantityLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },

  // Empty List
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyListIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyListText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 22,
    color: '#999',
    padding: 4,
  },
  modalLoading: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },

  // Detail
  detailImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    marginBottom: 16,
  },
  detailName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  detailSku: {
    fontSize: 14,
    color: '#999',
    marginBottom: 16,
  },
  detailSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14B8A6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1.5,
    textAlign: 'right',
  },
  detailPrice: {
    color: '#14B8A6',
    fontWeight: '700',
    fontSize: 16,
  },

  // Tags (brands)
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#f0fdfa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  tagText: {
    fontSize: 13,
    color: '#0d9488',
    fontWeight: '500',
  },

  // Part Numbers
  partNumberRow: {
    backgroundColor: '#f9fafb',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  partNumberText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },

  // Suppliers
  supplierRow: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  supplierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  supplierUrl: {
    fontSize: 12,
    color: '#14B8A6',
    marginTop: 4,
  },

  // Inventory
  inventoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  inventoryName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  inventoryQty: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14B8A6',
  },
});
