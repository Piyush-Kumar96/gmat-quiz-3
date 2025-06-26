import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'guest' | 'registered' | 'monthly_pack' | 'quarterly_pack' | 'annual_pack' | 'admin';
export type SubscriptionPlan = 'free_mock' | 'monthly_pack' | 'quarterly_pack' | 'annual_pack';

export interface ResetInfo {
  hasUsedReset: boolean;
  resetDate?: Date;
  resetCount: number;
}

export interface PlanInfo {
  plan: SubscriptionPlan;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
}

export interface IUser extends mongoose.Document {
  email: string;
  password: string;
  fullName: string;
  targetScore?: number;
  phoneNumber?: string;
  role: UserRole;
  subscriptionPlan: SubscriptionPlan;
  planInfo: PlanInfo;
  mockTestsUsed: number;
  mockTestLimit: number;
  resetInfo: ResetInfo;
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  targetScore: {
    type: Number,
    min: 200,
    max: 800,
    default: 700,
  },
  phoneNumber: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['guest', 'registered', 'monthly_pack', 'quarterly_pack', 'annual_pack', 'admin'],
    default: 'registered',
  },
  subscriptionPlan: {
    type: String,
    enum: ['free_mock', 'monthly_pack', 'quarterly_pack', 'annual_pack'],
    default: 'free_mock',
  },
  planInfo: {
    plan: {
      type: String,
      enum: ['free_mock', 'monthly_pack', 'quarterly_pack', 'annual_pack'],
      default: 'free_mock',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  mockTestsUsed: {
    type: Number,
    default: 0,
  },
  mockTestLimit: {
    type: Number,
    default: 2, // Default limit for registered users
  },
  resetInfo: {
    hasUsedReset: {
      type: Boolean,
      default: false,
    },
    resetDate: {
      type: Date,
    },
    resetCount: {
      type: Number,
      default: 0,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it's modified (or new)
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Custom hook to hash password on findOneAndUpdate
userSchema.pre('findOneAndUpdate', async function(next) {
  const update: any = this.getUpdate();
  
  // Only proceed if password field is being updated
  if (update && update.$set && update.$set.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      update.$set.password = await bcrypt.hash(update.$set.password, salt);
      next();
    } catch (error: any) {
      next(error);
    }
  } else {
    next();
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

export const User = mongoose.model<IUser>('User', userSchema); 