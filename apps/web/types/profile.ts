/**
 * Test profile domain types for the SemkiEst platform.
 */

export interface TestProfile {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  categories?: string[];
  settings?: Record<string, unknown>;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileInput {
  name: string;
  description?: string;
  categories?: string[];
  settings?: Record<string, unknown>;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateProfileInput {
  name?: string;
  description?: string;
  categories?: string[];
  settings?: Record<string, unknown>;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}
