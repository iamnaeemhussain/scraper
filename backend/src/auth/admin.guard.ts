import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthedUser } from './jwt.strategy';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthedUser | undefined;
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin privileges required');
    }
    return true;
  }
}
