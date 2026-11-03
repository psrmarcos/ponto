import { randomUUID } from 'node:crypto';

export const novoId = (): string => randomUUID();
