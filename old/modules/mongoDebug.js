import mongoose from 'mongoose';
import { log } from './logger.js';

/**
 * Enable detailed debugging for MongoDB operations
 */
export const enableMongoDebugging = () => {
  // Set debug level on mongoose
  mongoose.set('debug', (collection, method, query, doc) => {
    log(`MongoDB: ${collection}.${method} ${JSON.stringify(query)}`, 'db');
  });
};

/**
 * Disable MongoDB debugging
 */
export const disableMongoDebugging = () => {
  mongoose.set('debug', false);
};

export default {
  enableMongoDebugging,
  disableMongoDebugging
};
