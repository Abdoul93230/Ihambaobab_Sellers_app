import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, StyleSheet, StatusBar, Text } from 'react-native';

export default function AppSplash() {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <Animated.View style={[styles.content, { transform: [{ scale }], opacity }]}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>ESPACE VENDEUR</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', gap: 12 },
  logo: { width: 130, height: 130, marginBottom: 4 },
  badge: { backgroundColor: '#30A08B', paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 },
});
