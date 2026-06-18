import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config/constants';

let socket = null;
let currentSellerId = null;

export const socketService = {
  connect: (sellerId, token) => {
    if (socket?.connected && currentSellerId === sellerId) return;

    socketService.disconnect();
    currentSellerId = sellerId;

    socket = io(BACKEND_URL, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    socket.on('connect', () => {
      if (__DEV__) console.log('[socket] connecté');
      socket.emit('seller:join', { sellerId });
    });

    socket.on('disconnect', (reason) => {
      if (__DEV__) console.log('[socket] déconnecté:', reason);
    });

    socket.on('connect_error', (err) => {
      if (__DEV__) console.warn('[socket] erreur connexion:', err.message);
    });

    socket.on('reconnect', () => {
      if (__DEV__) console.log('[socket] reconnecté');
      socket.emit('seller:join', { sellerId });
    });
  },

  disconnect: () => {
    if (socket) {
      if (currentSellerId) {
        socket.emit('seller:leave', { sellerId: currentSellerId });
      }
      socket.disconnect();
      socket = null;
      currentSellerId = null;
    }
  },

  // Écoute un event, retourne une fonction de nettoyage
  on: (event, handler) => {
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => socket?.off(event, handler);
  },

  off: (event, handler) => {
    socket?.off(event, handler);
  },

  isConnected: () => socket?.connected ?? false,
};
