export type SheetType = 'HC' | 'SX';

export type ShiftKey = 'HC' | 'C1' | 'C2' | 'C3';

export type LateEarlyDistributionMode =
  | 'natural'    // ~70% Đi muộn, ~30% Về sớm
  | 'late-only'  // 100% Đi muộn (vào trễ)
  | 'early-only' // 100% Về sớm (ra sớm)
  | 'balanced';  // 50% Đi muộn, 50% Về sớm

export type NoteDisplayStyle =
  | 'label-only'   // "Đi muộn" / "Về sớm"
  | 'with-minutes' // "Đi muộn 15 phút" / "Về sớm 20 phút"
  | 'with-hours';  // "Đi muộn (0.25h)" / "Về sớm (0.33h)"

export interface ShiftConfig {
  key: ShiftKey;
  label: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  lunchMinutes: number;
}

export interface DepartmentMapping {
  code: string;
  name: string;
  sourceSheet: SheetType | 'BOTH';
}

export interface GeneratorConfig {
  month: number;
  year: number;
  earlyBufferMin: number; // minutes before shift start on normal days (e.g. 1)
  earlyBufferMax: number; // minutes before shift start on normal days (e.g. 15)
  lateOutBufferMin: number; // minutes after shift end on normal days (e.g. 1)
  lateOutBufferMax: number; // minutes after shift end on normal days (e.g. 15)
  timeFormat: 'HH:mm' | 'HH:mm:ss';
  dateFormat: 'D/M/YYYY' | 'DD/MM/YYYY';
  sortOrder: 'by-date' | 'by-employee';
  includeRestDays: boolean; // keep "Nghỉ" rows for "N" (default true)
  applyDailyHoursToCheckout: boolean; // HC daily hours (e.g. 10 = 8h + 2h OT)
  enableStep2LateEarly: boolean; // Step 2: distribute Đi muộn về sớm (giờ)
  lateEarlyDistributionMode: LateEarlyDistributionMode;
  maxDaysWhenOverOneHour: 2 | 3 | 4; // Strictly < 5 days (default 4 -> 2..4 days)
  noteStyle: NoteDisplayStyle; // Format of column "Ghi chú"
  exportOnlySingleStandardSheet: boolean; // export strictly 1 sheet (8 columns)
  seed: number;
  shifts: Record<ShiftKey, ShiftConfig>;
  leaveLabels: Record<string, string>;
}

export interface ParsedEmployeeRow {
  id: string;
  orderIndex: number;
  employeeCode: string;
  fullName: string;
  sheetType: SheetType;
  rawDeptOrMachine: string;
  summaryDeptName?: string;
  dailyCells: Record<number, string>; // 1..31 -> cell text
  holidays: number;
  paidLeave: number;
  sickOrUnpaidLeave: number;
  actualWorkDays: number;
  totalWorkDays: number;
  overtimeHours: number;
  lateEarlyHours: number;
  nightAllowanceHours: number;
  notes?: string;
}

export interface SummaryEmployeeMeta {
  dept?: string;
  lateEarlyHours?: number;
  overtimeHours?: number;
  holidays?: number;
  paidLeave?: number;
  sickOrUnpaidLeave?: number;
  actualWorkDays?: number;
  totalWorkDays?: number;
}

export interface ParsedWorkbookData {
  fileName: string;
  companyName: string;
  detectedMonth: number;
  detectedYear: number;
  contentSignatureSeed: number;
  hcEmployees: ParsedEmployeeRow[];
  sxEmployees: ParsedEmployeeRow[];
  summaryDeptByEmpCode: Record<string, string>;
  summaryMetaByEmpCode?: Record<string, SummaryEmployeeMeta>;
  discoveredDepartments: DepartmentMapping[];
  sheetNames: string[];
  warnings: string[];
  isSampleData?: boolean;
  originalFileBuffer?: ArrayBuffer;
}

export type RecordKind = 'work' | 'leave' | 'rest';

export interface DetailedAttendanceRecord {
  rowNumber: number;
  employeeCode: string;
  fullName: string;
  departmentCode: string;
  departmentName: string;
  day: number;
  dateStr: string;
  checkIn: string;
  checkOut: string;
  note: string; // Column 8: Ghi chú ("Đi muộn" / "Về sớm")
  rawCode: string;
  sheetType: SheetType;
  recordKind: RecordKind;
  shiftLabel: string;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeHoursDaily: number;
}

export interface EmployeeReconciliationSummary {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  sheetType: SheetType;
  departmentCode: string;
  departmentName: string;
  workingDaysCount: number;
  targetLateEarlyHours: number;
  targetLateEarlyMinutes: number;
  allocatedLateMinutes: number;
  allocatedEarlyMinutes: number;
  allocatedTotalMinutes: number;
  allocatedTotalHours: number;
  incidentDaysCount: number;
  expectedDayRuleText: string;
  hcSheetOvertimeHours: number;
  hcGeneratedOvertimeHours: number;
  isLateEarlyMatched: boolean;
  note?: string;
}
