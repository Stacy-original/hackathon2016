import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  
  constructor(private readonly usersService: UsersService) {}
  
  @Post('sync')
  async syncUser(@Body() body: any, @Req() req: any) {
    this.logger.log('Sync user request received:', JSON.stringify(body));
    
    // Extract userData from the nested structure expected by frontend
    const userData = body.userData || body;
    
    this.logger.log(`Looking for user with email: ${userData.email}`);
    
    // Try to find existing user by email OR userId
    let existingUser = await this.usersService.findByEmail(userData.email);
    if (!existingUser && userData.id) {
      existingUser = await this.usersService.findById(userData.id);
    }
    
    if (existingUser) {
      this.logger.log(`Found existing user: ${existingUser.userId}`);
      
      // Update user info if changed (name or photo)
      const updateData: any = {};
      if (userData.name && userData.name !== existingUser.name) {
        updateData.name = userData.name;
      }
      if (userData.photo && userData.photo !== existingUser.photo) {
        updateData.photo = userData.photo;
      }
      
      if (Object.keys(updateData).length > 0) {
        this.logger.log(`Updating user with data:`, updateData);
        await this.usersService.update(existingUser.userId, updateData);
      }
      
      await this.usersService.updateLogin(existingUser.userId);
      
      // Return updated user
      const updatedUser = await this.usersService.findById(existingUser.userId);
      return {
        success: true,
        message: 'User synced successfully',
        user: updatedUser,
      };
    }
    
    // Create new user
    this.logger.log(`Creating new user with email: ${userData.email}`);
    const newUser = await this.usersService.create({
      userId: userData.id || userData.email,
      name: userData.name,
      email: userData.email,
      photo: userData.photo,
      phone: userData.phone,
      role: userData.role !== undefined ? userData.role : UserRole.USER,
    });
    
    this.logger.log(`User created successfully: ${newUser.userId}`);
    
    return {
      success: true,
      message: 'User created successfully',
      user: newUser,
    };
  }
  
  @Put(':userId/profile')
  async updateUserProfile(
    @Param('userId') userId: string, 
    @Body() profileData: { name?: string; photo?: string }
  ) {
    this.logger.log(`Updating profile for user ${userId}:`, profileData);
    
    const user = await this.usersService.findById(userId);
    if (!user) {
      this.logger.warn(`User ${userId} not found for profile update`);
      return { success: false, error: 'User not found' };
    }
    
    const updateData: any = {};
    if (profileData.name) updateData.name = profileData.name;
    if (profileData.photo) updateData.photo = profileData.photo;
    
    const updatedUser = await this.usersService.update(userId, updateData);
    
    this.logger.log(`Profile updated successfully for user ${userId}`);
    
    return {
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }
  
  @Post('verify-role')
  async verifyUserRole(@Body() body: { userData: any }) {
    const userData = body.userData;
    this.logger.log(`Verifying role for user: ${userData?.id}`);
    
    const user = await this.usersService.findById(userData?.id);
    
    if (!user) {
      this.logger.warn(`User ${userData?.id} not found for role verification`);
      return { success: false, error: 'User not found' };
    }
    
    this.logger.log(`User ${user.userId} has role: ${user.role}`);
    
    return {
      success: true,
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        picture: user.photo,  // Map photo to picture for frontend
        photo: user.photo,
        role: user.role,
      },
    };
  }
  
  @Get('test')
  async testConnection() {
    this.logger.log('Test connection endpoint called');
    return {
      success: true,
      message: 'Backend connection successful',
      timestamp: new Date().toISOString(),
    };
  }
  
  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(
    @Query('role') role?: UserRole,
    @Query('companyId') companyId?: string,
  ) {
    return this.usersService.findAll(role, companyId);
  }
  
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async getStats() {
    return this.usersService.getStats();
  }
  
  @Get('search')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async searchUsers(@Query('q') query: string) {
    return this.usersService.search(query);
  }
  
  @Get(':userId')
  async getUserById(@Param('userId') userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, user };
  }
  
  @Get('email/:email')
  async getUserByEmail(@Param('email') email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, user };
  }
  
  @Put(':userId')
  async updateUser(@Param('userId') userId: string, @Body() updateData: any) {
    this.logger.log(`Updating user ${userId}:`, updateData);
    return this.usersService.update(userId, updateData);
  }
  
  @Put(':userId/company')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async assignCompany(@Param('userId') userId: string, @Body('companyId') companyId: string) {
    return this.usersService.assignToCompany(userId, companyId);
  }
  
  @Put(':userId/activity')
  async updateActivity(@Param('userId') userId: string) {
    await this.usersService.updateActivity(userId);
    return { success: true, message: 'Activity updated' };
  }
  
  @Delete(':userId')
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('userId') userId: string) {
    await this.usersService.delete(userId);
    return { success: true, message: 'User deleted successfully' };
  }
}