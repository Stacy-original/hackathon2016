import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserRole } from '../../../common/interfaces/user.interface';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  userId: string;  // Changed from 'id' to 'userId' to avoid conflict with _id
  
  @Prop({ required: true })
  name: string;
  
  @Prop({ required: true, unique: true })
  email: string;
  
  @Prop()
  phone: string;
  
  @Prop()
  photo: string;
  
  @Prop({ required: true, type: Number, enum: UserRole, default: UserRole.USER })
  role: UserRole;
  
  @Prop({ type: Boolean, default: true })
  isActive: boolean;
  
  @Prop({ type: String, ref: 'Company', required: false })
  companyId: string;
  
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
  
  @Prop({ type: Date })
  lastLogin: Date;
  
  @Prop({ type: Date })
  lastActivity: Date;
  
  @Prop({ type: Object, default: {} })
  preferences: {
    notifications: boolean;
    language: string;
    theme: string;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ userId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ companyId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });