import { Role } from './enums.js';

/** A platform user */
export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for creating a user */
export type CreateUserInput = Pick<User, 'email' | 'name'> & {
  role?: Role;
  avatarUrl?: string;
};

/** Payload for updating a user */
export type UpdateUserInput = Partial<Pick<User, 'name' | 'avatarUrl' | 'role'>>;
