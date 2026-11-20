import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthedUser } from './jwt.strategy';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthedUser => {
  return ctx.switchToHttp().getRequest().user;
});
