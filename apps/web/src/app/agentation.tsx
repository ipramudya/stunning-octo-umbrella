'use client';

import { Agentation } from 'agentation';

export function AgentationDevTools() {
  return process.env.NODE_ENV === 'development' ? (
    <Agentation endpoint="http://localhost:4747" />
  ) : null;
}
