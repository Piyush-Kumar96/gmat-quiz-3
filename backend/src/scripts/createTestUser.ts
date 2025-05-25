import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';

dotenv.config();

const createTestUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gmat-quiz');
    console.log('Connected to MongoDB');

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    if (existingUser) {
      console.log('Test user already exists');
      process.exit(0);
    }

    // Create test user
    const testUser = new User({
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Test User',
      targetScore: 700,
      phoneNumber: '+1234567890',
    });

    await testUser.save();
    console.log('Test user created successfully');
    console.log('Email: test@example.com');
    console.log('Password: password123');
    console.log('Phone: +1234567890');

    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
};

createTestUser(); 