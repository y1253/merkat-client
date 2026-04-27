import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  login(username: string, password: string): { access_token: string } {
    const validUser = this.config.get('AUTH_USERNAME');
    const validPass = this.config.get('AUTH_PASSWORD');
    if (username !== validUser || password !== validPass) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwtService.sign({ sub: username });
    return { access_token: token };
  }
}
