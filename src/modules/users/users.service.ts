import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UserRole } from '../../common/interfaces/user.interface';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}
  
  async syncOrCreateUser(userData: {
    id: string;
    name: string;
    email: string;
    photo?: string;
    phone?: string;
    role?: UserRole;
  }): Promise<User> {
    this.logger.log(`Syncing user: ${userData.email} with id: ${userData.id}`);
    
    // Fix Cyrillic encoding if needed
    const name = this.fixCyrillicEncoding(userData.name);
    
    // Check if user exists by id OR email
    let user = await this.userModel.findOne({
      $or: [
        { id: userData.id },
        { email: userData.email }
      ]
    }).exec();
    
    if (user) {
      this.logger.log(`Found existing user: ${user.id}`);
      
      // Update existing user
      const updateData: any = {
        lastLogin: new Date(),
        lastActivity: new Date(),
      };
      
      if (name && name !== user.name) updateData.name = name;
      if (userData.photo && userData.photo !== user.photo) updateData.photo = userData.photo;
      if (userData.phone && userData.phone !== user.phone) updateData.phone = userData.phone;
      if (userData.role !== undefined && userData.role !== user.role) updateData.role = userData.role;
      
      if (Object.keys(updateData).length > 2) { // More than just activity fields
        const updatedUser = await this.userModel.findOneAndUpdate(
          { id: userData.id },
          { $set: updateData },
          { new: true }
        ).exec();
        if (updatedUser) {
          user = updatedUser;
        }
        this.logger.log(`User updated with new data`);
      } else {
        // Just update activity timestamps
        await this.userModel.updateOne(
          { id: userData.id },
          { $set: { lastLogin: new Date(), lastActivity: new Date() } }
        ).exec();
        const refreshedUser = await this.userModel.findOne({ id: userData.id }).exec();
        if (refreshedUser) {
          user = refreshedUser;
        }
      }
    } else {
      // Create new user
      this.logger.log(`Creating new user with id: ${userData.id}`);
      
      const newUser = new this.userModel({
        id: userData.id,
        name: name,
        email: userData.email,
        photo: userData.photo || '',
        phone: userData.phone || '',
        role: userData.role !== undefined ? userData.role : UserRole.USER,
        isActive: true,
        lastLogin: new Date(),
        lastActivity: new Date(),
      });
      
      user = await newUser.save();
      this.logger.log(`User created successfully: ${user.email} with id: ${user.id}`);
    }
    
    // Ensure we never return null
    if (!user) {
      throw new Error(`Failed to create or find user with id: ${userData.id}`);
    }
    
    return user;
  }
  
  async verifyUserRole(userId: string): Promise<User> {
    this.logger.debug(`Verifying role for user: ${userId}`);
    
    const user = await this.userModel.findOne({ id: userId }).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    await this.userModel.updateOne(
      { id: userId },
      { $set: { lastActivity: new Date() } }
    ).exec();
    
    this.logger.log(`Role verified for user ${userId}: ${user.role}`);
    return user;
  }
  
  async findByEmail(email: string): Promise<User | null> {
    this.logger.debug(`Finding user by email: ${email}`);
    return this.userModel.findOne({ email }).exec();
  }
  
  async findById(userId: string): Promise<User | null> {
    this.logger.debug(`Finding user by ID: ${userId}`);
    return this.userModel.findOne({ id: userId }).exec();
  }
  
  async findAll(role?: UserRole, companyId?: string): Promise<User[]> {
    const query: any = {};
    if (role !== undefined) query.role = role;
    if (companyId) query.companyId = companyId;
    
    const users = await this.userModel.find(query).sort({ createdAt: -1 }).exec();
    this.logger.log(`Found ${users.length} users`);
    return users;
  }
  
  async update(userId: string, updateData: Partial<User>): Promise<User> {
    this.logger.log(`Updating user ${userId}`);
    
    if (updateData.name) {
      updateData.name = this.fixCyrillicEncoding(updateData.name);
    }
    
    const user = await this.userModel.findOneAndUpdate(
      { id: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    this.logger.log(`User updated: ${user.email}`);
    return user;
  }
  
  async updateProfile(userId: string, name?: string, photo?: string): Promise<User> {
    this.logger.log(`Updating profile for user ${userId}`);
    
    const updateData: any = {};
    if (name) updateData.name = this.fixCyrillicEncoding(name);
    if (photo !== undefined) updateData.photo = photo;
    
    if (Object.keys(updateData).length === 0) {
      const user = await this.findById(userId);
      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      return user;
    }
    
    const user = await this.userModel.findOneAndUpdate(
      { id: userId },
      { $set: updateData },
      { new: true }
    ).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    return user;
  }
  
  async updateActivity(userId: string, activityType: 'login' | 'activity' = 'activity'): Promise<void> {
    const updateData: any = { lastActivity: new Date() };
    
    if (activityType === 'login') {
      updateData.lastLogin = new Date();
    }
    
    await this.userModel.updateOne({ id: userId }, { $set: updateData }).exec();
  }
  
  async getStats(): Promise<any> {
    const total = await this.userModel.countDocuments();
    const active = await this.userModel.countDocuments({ isActive: true });
    const byRole = {
      admin: await this.userModel.countDocuments({ role: UserRole.ADMIN }),
      government: await this.userModel.countDocuments({ role: UserRole.GOVERNMENT }),
      user: await this.userModel.countDocuments({ role: UserRole.USER }),
    };
    
    const recentUsers = await this.userModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name email role createdAt')
      .exec();
    
    return { total, active, byRole, recentUsers };
  }
  
  async delete(userId: string): Promise<void> {
    const result = await this.userModel.deleteOne({ id: userId });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    this.logger.log(`User deleted: ${userId}`);
  }
  
  async updateUserRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.userModel.findOneAndUpdate(
      { id: userId },
      { $set: { role } },
      { new: true }
    ).exec();
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    return user;
  }
  
  private fixCyrillicEncoding(text: string): string {
    if (!text || typeof text !== 'string') return text;
    
    const cyrillicMojibakePattern = /Ð|Ñ|Ò|Ó|Ô|Õ|Ö|×|Ø|Ù/;
    if (cyrillicMojibakePattern.test(text)) {
      try {
        return Buffer.from(text, 'binary').toString('utf-8');
      } catch (e) {
        this.logger.warn(`Failed to fix encoding for: ${text}`);
        return text;
      }
    }
    return text;
  }
}