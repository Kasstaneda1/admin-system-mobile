// Takes the photo of a check with the camera (pay/checkPhoto.js says why and how): not saved to
// the phone's photos, no location in the file, then at most 2000 px on the long side and JPEG
// 0.7 by expo-image-manipulator (a HEIC becomes JPEG). Returns { uri, bytes } (uri — the made
// file, for the thumbnail), { error } to show, or null when the technician closed the camera.
import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { CHECK_PHOTO_QUALITY, photoBytes, resizeFor } from './checkPhoto';

export async function takeCheckPhoto() {
  const allowed = await ImagePicker.requestCameraPermissionsAsync();
  if (!allowed.granted) {
    Alert.alert('The camera is off for SEMIX', 'Allow the camera in Settings to take the photo of the check.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return null;
  }
  let shot;
  try {
    shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  } catch (error) {
    return { error: 'The camera did not open. Try again.' };
  }
  if (shot.canceled || !Array.isArray(shot.assets) || !shot.assets.length) return null;
  const asset = shot.assets[0];
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const size = resizeFor(asset.width, asset.height);
    if (size) context.resize(size);
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: CHECK_PHOTO_QUALITY, base64: true });
    const made = photoBytes(saved.base64);
    if (made.error) return { error: made.error };
    return { uri: saved.uri, bytes: made.bytes };
  } catch (error) {
    return { error: 'This photo could not be read. Take it again.' };
  }
}
