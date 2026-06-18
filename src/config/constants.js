export const BACKEND_URL = 'https://ihambackend.onrender.com';
export const STORAGE_KEY = 'userSellerH227';
export const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
export const BACKGROUND_SYNC_TASK = 'SELLER_BACKGROUND_SYNC';
export const MUTATION_QUEUE_KEY = 'sellerMutationQueue';
export const LOCAL_DATA_KEY = 'sellerLocalData';
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [3000, 6000, 12000]; // exponentiel
