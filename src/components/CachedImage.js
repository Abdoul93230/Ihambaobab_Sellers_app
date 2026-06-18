import React from 'react';
import { View, Image as RNImage, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

// URI distante → expo-image avec cache disque permanent
// URI locale (file://, data:) → Image RN standard (pas besoin de cache)
const isRemoteUri = (uri) =>
  uri?.startsWith('http://') || uri?.startsWith('https://');

export default function CachedImage({
  uri,
  style,
  contentFit = 'cover',
  resizeMode = 'cover',
  placeholderIcon = 'cube-outline',
  placeholderIconSize = 24,
  placeholderColor = '#9CA3AF',
  placeholderBg = '#F3F4F6',
  transition = 200,
}) {
  if (!uri) {
    return (
      <View style={[style, styles.placeholder, { backgroundColor: placeholderBg }]}>
        <Ionicons name={placeholderIcon} size={placeholderIconSize} color={placeholderColor} />
      </View>
    );
  }

  // URI locale (caméra, galerie, base64) → RN Image, pas de cache nécessaire
  if (!isRemoteUri(uri)) {
    return <RNImage source={{ uri }} style={style} resizeMode={resizeMode} />;
  }

  // URI distante → expo-image avec cache disque permanent
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={transition}
      placeholder={{ color: placeholderBg }}
      onError={() => {}}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
