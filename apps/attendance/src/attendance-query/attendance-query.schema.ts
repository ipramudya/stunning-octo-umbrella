import { z } from 'zod';

import { datePattern } from './attendance-query.constant.js';

export const attendanceCursorSchema = z.object({
  workDate: z.string().regex(datePattern),
  submittedAt: z.iso.datetime(),
  id: z.string().min(1),
});
