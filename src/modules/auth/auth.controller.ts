import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(private configService: ConfigService) {}
  
  @Post('verify')
  async verifyApiKey(@Headers('x-api-key') apiKey: string) {
    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }
    
    const userKey = this.configService.get('USER_API_KEY');
    const adminKey = this.configService.get('ADMIN_API_KEY');
    const govKey = this.configService.get('GOVERNMENT_API_KEY');
    
    if (apiKey === adminKey) {
      return { role: 'admin', roleLevel: 2 };
    }
    
    if (apiKey === govKey) {
      return { role: 'government', roleLevel: 1 };
    }
    
    if (apiKey === userKey) {
      return { role: 'user', roleLevel: 0 };
    }
    
    throw new UnauthorizedException('Invalid API key');
  }
}