'use client';

import { Agentation } from 'agentation';

export const AgentationDevTools = () =>
  process.env.NODE_ENV === 'development' ? (
    <Agentation endpoint="http://localhost:4747" />
  ) : null;
