import mongoose from 'mongoose';
import { log } from './logger.js';
import { enableMongoDebugging } from './mongoDebug.js';

// Track connection status
let isConnected = false;

// Connect to MongoDB database
export const connectToDatabase = async () => {
  console.log('Inside connectToDatabase function');
  
  try {
    if (isConnected) {
      log('Using existing database connection', 'info');
      return;
    }

    const mongoUrl = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/vetg?authSource=admin';

    console.log('About to connect to MongoDB...');
    
    // Connection options with timeout settings
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // 5-second timeout for server selection
      connectTimeoutMS: 10000,        // 10-second timeout for initial connection
      socketTimeoutMS: 45000,         // 45-second timeout for socket operations
    };

    // Log connection attempt
    log(`Connecting to MongoDB at ${mongoUrl}...`, 'info');
    
    // Disable MongoDB debugging to reduce console spam
    mongoose.set('debug', false);
    
    // Connect to database with clear error handling
    await mongoose.connect(mongoUrl, options);
    console.log('Mongoose connected successfully');
    
    isConnected = true;
    log('MongoDB connection successful', 'info');

    // Test the connection with a simple query
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`✅ MongoDB connection verified. Available collections: ${collections.map(c => c.name).join(', ')}`);
    
  } catch (error) {
    isConnected = false;
    // Make the error very visible
    log('=============================================', 'error');
    log(`CRITICAL ERROR - Database connection failed: ${error.message}`, 'error');
    log('Check if MongoDB is running and connection parameters are correct', 'error');
    log('=============================================', 'error');
    console.error(error); // Print full error stack
    
    // Re-throw the error for proper handling in the calling code
    throw new Error(`MongoDB connection failed: ${error.message}`);
  }
};

// Check if connected to database
export const isDatabaseConnected = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

// Close database connection
export const closeDatabaseConnection = async () => {
  console.log('Closing database connection');
  try {
    if (isConnected) {
      await mongoose.connection.close();
      isConnected = false;
      console.log('Database connection closed successfully');
      log('Database connection closed', 'info');
      return true;
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
    log(`Error closing database connection: ${error.message}`, 'error');
    return false;
  }
};

export default {
  connectToDatabase,
  closeDatabaseConnection
};
