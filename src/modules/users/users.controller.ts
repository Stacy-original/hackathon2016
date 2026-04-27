import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  
  @Post('sync')
  async syncUser(@Body() userData: any, @Req() req: any) {
    const existingUser = await this.usersService.findByEmail(userData.email);
    
    if (existingUser) {
      await this.usersService.updateLogin(existingUser.userId);
      return {
        success: true,
        message: 'User synced successfully',
        user: existingUser,
      };
    }
    
    const newUser = await this.usersService.create({
      userId: userData.id || userData.email,
      name: userData.name,
      email: userData.email,
      photo: userData.photo,
      phone: userData.phone,
      role: userData.role || UserRole.USER,
    });
    
    return {
      success: true,
      message: 'User created successfully',
      user: newUser,
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