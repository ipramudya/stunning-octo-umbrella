export type AttendanceCursor = {
  workDate: string;
  submittedAt: Date;
  id: string;
};

export type AttendanceFilters = {
  dateFrom: string;
  dateTo: string;
  employeeId?: string;
  source?: 'REGULAR' | 'MANUAL';
  status?: 'PENDING_REVIEW' | 'RECORDED' | 'REJECTED';
  clockType?: 'CLOCK_IN' | 'CLOCK_OUT';
  order: 'ASC' | 'DESC';
  cursor?: AttendanceCursor;
  limit: number;
};
