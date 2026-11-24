import { BadRequestException } from '@nestjs/common';

const allowedRoles = ['viewer', 'editor', 'publisher', 'admin'];
export function roles(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((role: unknown) => typeof role !== 'string' || !allowedRoles.includes(role)) ||
    new Set(value).size !== value.length
  )
    throw new BadRequestException('Select distinct built-in roles');
  return [...value].sort() as string[];
}
