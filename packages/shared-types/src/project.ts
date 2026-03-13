import { Environment } from './enums.js';

/** Represents a project within the SemkiEst platform */
export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  environments: ProjectEnvironment[];
  createdAt: Date;
  updatedAt: Date;
}

/** Environment configuration for a project */
export interface ProjectEnvironment {
  id: string;
  projectId: string;
  name: string;
  type: Environment;
  baseUrl: string;
  variables: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/** Payload for creating a new project */
export type CreateProjectInput = Pick<Project, 'name' | 'description'> & {
  ownerId: string;
};

/** Payload for updating a project */
export type UpdateProjectInput = Partial<Pick<Project, 'name' | 'description'>>;
