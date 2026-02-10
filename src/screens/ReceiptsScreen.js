import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { receiptsAPI } from '../services/api';

export default function ReceiptsScreen() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedFile({
        uri: result.assets[0].uri,
        type: 'image',
        name: `receipt_${Date.now()}.jpg`,
      });
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert('Permission Required', 'Permission to access camera is required!');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedFile({
        uri: result.assets[0].uri,
        type: 'image',
        name: `receipt_${Date.now()}.jpg`,
      });
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
    });

    if (!result.canceled) {
      setSelectedFile({
        uri: result.assets[0].uri,
        type: result.assets[0].mimeType.startsWith('image') ? 'image' : 'document',
        name: result.assets[0].name,
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a receipt to upload');
      return;
    }

    Alert.alert(
      'Submit Receipt',
      'Are you sure you want to submit this receipt?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setUploading(true);
            try {
              const formData = new FormData();
              formData.append('receipt', {
                uri: selectedFile.uri,
                type: selectedFile.type === 'image' ? 'image/jpeg' : 'application/pdf',
                name: selectedFile.name,
              });

              await receiptsAPI.submitReceipt(formData);

              Alert.alert('Success', 'Receipt submitted successfully');
              setSelectedFile(null);
            } catch (error) {
              console.error('Upload error:', error);
              Alert.alert(
                'Upload Failed',
                error.response?.data?.error || 'Failed to upload receipt'
              );
            } finally {
              setUploading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Upload Receipt for Check Payment</Text>
        <Text style={styles.description}>
          Submit a photo or PDF of your receipt to process check payments
        </Text>

        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.button} onPress={takePhoto}>
            <Text style={styles.buttonIcon}>📷</Text>
            <Text style={styles.buttonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickImage}>
            <Text style={styles.buttonIcon}>🖼️</Text>
            <Text style={styles.buttonText}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={pickDocument}>
            <Text style={styles.buttonIcon}>📄</Text>
            <Text style={styles.buttonText}>Choose Document</Text>
          </TouchableOpacity>
        </View>

        {selectedFile && (
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Selected File:</Text>

            {selectedFile.type === 'image' ? (
              <Image
                source={{ uri: selectedFile.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.documentPreview}>
                <Text style={styles.documentIcon}>📄</Text>
                <Text style={styles.documentName}>{selectedFile.name}</Text>
              </View>
            )}

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => setSelectedFile(null)}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Receipt</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Important Information</Text>
          <Text style={styles.infoText}>
            • Receipts are required for check payments{'\n'}
            • Make sure the receipt is clear and readable{'\n'}
            • Supported formats: JPG, PNG, PDF{'\n'}
            • Maximum file size: 10MB
          </Text>
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
    padding: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  buttonGroup: {
    gap: 10,
  },
  button: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  buttonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  previewSection: {
    marginTop: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  documentPreview: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  documentIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  documentName: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  removeButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#14B8A6',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    marginTop: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#14B8A6',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});
