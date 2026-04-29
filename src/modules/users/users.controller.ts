import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('users')  // Remove 'api/' from here since global prefix adds it
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  
  constructor(private readonly usersService: UsersService) {}
  
  @Get('test')
  async test() {
    return { message: 'Users controller is working', timestamp: new Date().toISOString() };
  }
  
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncUser(@Body() body: any, @Req() req: any) {
    this.logger.log('Sync user request received');
    
    const userData = body.userData || body;
    
    if (!userData || !userData.id || !userData.email) {
      return {
        success: false,
        error: 'Invalid user data',
        message: 'User ID and email are required'
      };
    }
    
    try {
      const user = await this.usersService.syncOrCreateUser({
        id: userData.id,
        name: userData.name || 'Unknown',
        email: userData.email,
        photo: userData.photo || userData.picture,
        phone: userData.phone,
        role: userData.role !== undefined ? userData.role : UserRole.USER
      });
      
      return {
        success: true,
        message: 'User synced successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          photo: user.photo,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          lastLogin: user.lastLogin,
          lastActivity: user.lastActivity
        }
      };
    } catch (error) {
      this.logger.error(`Error syncing user: ${error.message}`);
      return {
        success: false,
        error: 'Failed to sync user',
        message: error.message
      };
    }
  }
  
  @Post('verify-role')
  @HttpCode(HttpStatus.OK)
  async verifyUserRole(@Body() body: any, @Req() req: any) {
    const userData = body.userData || body;
    
    if (!userData?.id) {
      return { 
        success: false,
        error: 'Invalid user data', 
        message: 'User ID required' 
      };
    }
    
    try {
      const user = await this.usersService.verifyUserRole(userData.id);
      
      if (!user) {
        return { 
          success: false,
          error: 'User not found', 
          message: 'User not found' 
        };
      }
      
      return {
        success: true,
        message: 'Role verified',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.photo,
          photo: user.photo,
          role: user.role,
          isActive: user.isActive,
          lastActivity: user.lastActivity
        }
      };
    } catch (error) {
      this.logger.error(`Error verifying role: ${error.message}`);
      return { 
        success: false,
        error: 'Failed to verify role', 
        message: error.message 
      };
    }
  }
  
  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers() {
    return this.usersService.findAll();
  }
  
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async getStats() {
    return this.usersService.getStats();
  }
  
  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    return { success: true, user };
  }
  
  @Put(':id/profile')
  async updateUserProfile(
    @Param('id') id: string,
    @Body() profileData: { name?: string; photo?: string }
  ) {
    try {
      const user = await this.usersService.updateProfile(id, profileData.name, profileData.photo);
      return {
        success: true,
        message: 'Profile updated successfully',
        user
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  @Put(':id/role')
  @Roles(UserRole.ADMIN)
  async updateUserRole(@Param('id') id: string, @Body('role') role: UserRole) {
    const user = await this.usersService.updateUserRole(id, role);
    return {
      success: true,
      message: 'User role updated successfully',
      user
    };
  }
  
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    await this.usersService.delete(id);
    return { success: true, message: 'User deleted successfully' };
  }
}