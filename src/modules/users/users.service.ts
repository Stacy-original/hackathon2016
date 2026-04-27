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
  
  async create(userData: Partial<User>): Promise<User> {
    const existingUser = await this.userModel.findOne({
      $or: [{ email: userData.email }, { userId: userData.userId }],
    });
    
    if (existingUser) {
      throw new ConflictException('User already exists');
    }
    
    const user = new this.userModel({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: new Date(),
      preferences: {
        notifications: true,
        language: 'ru',
        theme: 'light',
        ...userData.preferences,
      },
    });
    
    const savedUser = await user.save();
    this.logger.log(`User created: ${savedUser.email} (${savedUser.userId})`);
    
    return savedUser;
  }
  
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }
  
  async findById(userId: string): Promise<User | null> {
    return this.userModel.findOne({ userId }).exec();
  }
  
  async findAll(role?: UserRole, companyId?: string): Promise<User[]> {
    const query: any = {};
    if (role !== undefined) query.role = role;
    if (companyId) query.companyId = companyId;
    
    return this.userModel.find(query).sort({ createdAt: -1 }).exec();
  }
  
  async update(userId: string, updateData: Partial<User>): Promise<User> {
    const user = await this.userModel.findOneAndUpdate(
      { userId },
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    
    this.logger.log(`User updated: ${user.email}`);
    return user;
  }
  
  async updateActivity(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { userId },
      { lastActivity: new Date() }
    );
  }
  
  async updateLogin(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { userId },
      { lastLogin: new Date(), lastActivity: new Date() }
    );
  }
  
  async assignToCompany(userId: string, companyId: string): Promise<User> {
    return this.update(userId, { companyId });
  }
  
  async getUsersByCompany(companyId: string): Promise<User[]> {
    return this.userModel.find({ companyId }).exec();
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
    const result = await this.userModel.deleteOne({ userId });
    if (result.deletedCount === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    this.logger.log(`User deleted: ${userId}`);
  }
  
  async search(query: string): Promise<User[]> {
    return this.userModel.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    }).limit(20).exec();
  }
}