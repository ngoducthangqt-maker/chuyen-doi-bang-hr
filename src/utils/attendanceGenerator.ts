import {
  DetailedAttendanceRecord,
  EmployeeReconciliationSummary,
  GeneratorConfig,
  LateEarlyDistributionMode,
  NoteDisplayStyle,
  ParsedEmployeeRow,
  ShiftKey,
} from '../types/attendance';
import { resolveEmployeeDepartment } from './departmentHelper';

export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  month: 1,
  year: 2026,
  earlyBufferMin: 1,
  earlyBufferMax: 15,
  lateOutBufferMin: 1,
  lateOutBufferMax: 15,
  timeFormat: 'HH:mm',
  dateFormat: 'D/M/YYYY',
  sortOrder: 'by-date',
  includeRestDays: true,
  applyDailyHoursToCheckout: true,
  enableStep2LateEarly: true,
  lateEarlyDistributionMode: 'natural',
  maxDaysWhenOverOneHour: 4, // < 5 ngày (tối đa 4 ngày)
  noteStyle: 'label-only',
  exportOnlySingleStandardSheet: false,
  seed: 202601,
  shifts: {
    HC: {
      key: 'HC',
      label: 'Giờ Hành chính (08:00 - 17:00)',
      startTime: '08:00',
      endTime: '17:00',
      lunchMinutes: 60,
    },
    C1: {
      key: 'C1',
      label: 'Ca 1 Sáng (06:00 - 14:00)',
      startTime: '06:00',
      endTime: '14:00',
      lunchMinutes: 0,
    },
    C2: {
      key: 'C2',
      label: 'Ca 2 Chiều (14:00 - 22:00)',
      startTime: '14:00',
      endTime: '22:00',
      lunchMinutes: 0,
    },
    C3: {
      key: 'C3',
      label: 'Ca 3 Đêm (22:00 - 06:00)',
      startTime: '22:00',
      endTime: '06:00',
      lunchMinutes: 0,
    },
  },
  leaveLabels: {
    N: 'Nghỉ',
    L: 'Nghỉ lễ',
    P: 'Nghỉ phép',
    Ô: 'Nghỉ ốm',
    O: 'Nghỉ ốm',
    OM: 'Nghỉ ốm',
    VR: 'Nghỉ việc riêng',
    TS: 'Nghỉ thai sản',
    NB: 'Nghỉ bù',
    KL: 'Nghỉ không lương',
  },
};

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseTimeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr || '0', 10);
  const m = parseInt(mStr || '0', 10);
  return h * 60 + m;
}

function formatMinutesToTime(
  totalMinutes: number,
  seconds: number,
  format: 'HH:mm' | 'HH:mm:ss'
): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (format === 'HH:mm:ss') {
    const ss = String(Math.max(0, Math.min(59, seconds))).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

export function formatAttendanceDate(
  day: number,
  month: number,
  year: number,
  format: 'D/M/YYYY' | 'DD/MM/YYYY'
): string {
  if (format === 'DD/MM/YYYY') {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  return `${day}/${month}/${year}`;
}

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatLateEarlyNote(
  lateMinutes: number,
  earlyMinutes: number,
  style: NoteDisplayStyle
): string {
  if (lateMinutes <= 0 && earlyMinutes <= 0) return '';

  if (style === 'with-minutes') {
    if (lateMinutes > 0 && earlyMinutes > 0) {
      return `Đi muộn ${lateMinutes} phút, về sớm ${earlyMinutes} phút`;
    }
    if (lateMinutes > 0) return `Đi muộn ${lateMinutes} phút`;
    return `Về sớm ${earlyMinutes} phút`;
  }

  if (style === 'with-hours') {
    if (lateMinutes > 0 && earlyMinutes > 0) {
      return `Đi muộn (${(lateMinutes / 60).toFixed(2)}h), về sớm (${(earlyMinutes / 60).toFixed(2)}h)`;
    }
    if (lateMinutes > 0) return `Đi muộn (${(lateMinutes / 60).toFixed(2)}h)`;
    return `Về sớm (${(earlyMinutes / 60).toFixed(2)}h)`;
  }

  // Default 'label-only': Ghi rõ đi muộn hay về sớm
  if (lateMinutes > 0 && earlyMinutes > 0) {
    return 'Đi muộn, về sớm';
  }
  if (lateMinutes > 0) return 'Đi muộn';
  return 'Về sớm';
}

interface ParsedCellAction {
  kind: 'work' | 'leave' | 'rest' | 'skip';
  shiftKey?: ShiftKey;
  totalDailyHours?: number;
  overtimeHoursDaily?: number;
  leaveText?: string;
}

function interpretAttendanceCell(
  rawCell: string | undefined,
  sheetType: 'HC' | 'SX',
  leaveLabels: Record<string, string>
): ParsedCellAction {
  const trimmed = (rawCell ?? '').trim();
  if (!trimmed || trimmed === '-') {
    return { kind: 'skip' };
  }

  const upper = trimmed.toUpperCase().replace(/\s+/g, '');

  if (leaveLabels[upper] !== undefined) {
    const isRest = upper === 'N';
    return {
      kind: isRest ? 'rest' : 'leave',
      leaveText: leaveLabels[upper],
    };
  }

  if (upper === 'P/2' || upper === '0.5P' || upper === '0,5P' || upper === 'X/2') {
    return {
      kind: 'work',
      shiftKey: sheetType === 'HC' ? 'HC' : 'C1',
      totalDailyHours: 4,
      overtimeHoursDaily: 0,
    };
  }

  const shiftMatch = upper.match(/^(C1|C2|C3)(?:[+/](\d+(?:[.,]\d+)?))?$/);
  if (shiftMatch) {
    const shiftKey = shiftMatch[1] as ShiftKey;
    return {
      kind: 'work',
      shiftKey,
      totalDailyHours: 8,
      overtimeHoursDaily: 0,
    };
  }

  const xMatch = upper.match(/^X(\d+(?:[.,]\d+)?)?$/);
  if (xMatch) {
    const extraOt =
      sheetType === 'HC' && xMatch[1] ? parseFloat(xMatch[1].replace(',', '.')) || 0 : 0;
    return {
      kind: 'work',
      shiftKey: sheetType === 'HC' ? 'HC' : 'C1',
      totalDailyHours: 8 + extraOt,
      overtimeHoursDaily: extraOt,
    };
  }

  const numericVal = parseFloat(upper.replace(',', '.'));
  if (!isNaN(numericVal) && numericVal > 0 && numericVal <= 24) {
    if (sheetType === 'SX') {
      return {
        kind: 'work',
        shiftKey: 'C1',
        totalDailyHours: 8,
        overtimeHoursDaily: 0,
      };
    }
    const ot = numericVal > 8 ? numericVal - 8 : 0;
    return {
      kind: 'work',
      shiftKey: 'HC',
      totalDailyHours: numericVal,
      overtimeHoursDaily: ot,
    };
  }

  return {
    kind: 'leave',
    leaveText: trimmed,
  };
}

class StaggeredOffsetDispenser {
  private minOffset: number;
  private maxOffset: number;
  private rng: () => number;
  private pool: number[] = [];
  private lastIssued: number | null = null;
  private usedSeconds = new Set<string>();

  constructor(minOffset: number, maxOffset: number, rng: () => number) {
    this.minOffset = Math.min(minOffset, maxOffset);
    this.maxOffset = Math.max(minOffset, maxOffset);
    this.rng = rng;
  }

  private refillPool() {
    const candidates: number[] = [];
    for (let m = this.minOffset; m <= this.maxOffset; m++) {
      candidates.push(m);
    }
    if (candidates.length === 0) {
      candidates.push(5);
    }
    const shuffled = shuffleArray(candidates, this.rng);
    if (
      shuffled.length > 1 &&
      this.lastIssued !== null &&
      shuffled[0] === this.lastIssued
    ) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    this.pool = shuffled;
  }

  next(): { minuteOffset: number; second: number } {
    if (this.pool.length === 0) {
      this.refillPool();
    }
    const minuteOffset = this.pool.shift()!;
    this.lastIssued = minuteOffset;

    let second = Math.floor(this.rng() * 58) + 1;
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidateSec = ((second + attempt) % 59) + 1;
      const key = `${minuteOffset}:${candidateSec}`;
      if (!this.usedSeconds.has(key)) {
        this.usedSeconds.add(key);
        second = candidateSec;
        break;
      }
    }

    return { minuteOffset, second };
  }
}

interface DayPenaltyAllocation {
  lateMinutes: number;
  earlyMinutes: number;
}

interface WorkingDayCandidate {
  day: number;
  isOvertimeDay: boolean;
  shiftWorkMinutes: number;
}

/**
 * Step 2 Strict Rule Allocator:
 * - If lateEarlyHours <= 1h (1..60 mins): Put into EXACTLY 1 random working day in the month.
 * - If lateEarlyHours > 1h (> 60 mins): Split into < 5 random working days in the month (i.e. 2, 3, or 4 days).
 */
function allocateEmployeeLateEarlyMinutes(
  candidates: WorkingDayCandidate[],
  lateEarlyHoursRaw: number,
  targetTotalMinutes: number,
  mode: LateEarlyDistributionMode,
  maxDaysOverOneHour: 2 | 3 | 4,
  rng: () => number
): Record<number, DayPenaltyAllocation> {
  const result: Record<number, DayPenaltyAllocation> = {};
  if (targetTotalMinutes <= 0 || candidates.length === 0) {
    return result;
  }

  // Prefer regular (non-overtime) days first so overtime days remain untouched unless necessary
  const regularDays = shuffleArray(
    candidates.filter((c) => !c.isOvertimeDay),
    rng
  );
  const overtimeDays = shuffleArray(
    candidates.filter((c) => c.isOvertimeDay),
    rng
  );
  const orderedCandidates = [...regularDays, ...overtimeDays];

  // Determine exact incident day count K according to user's rule:
  // <= 1.00h (<= 60 mins) -> K = 1 day
  // > 1.00h (> 60 mins)   -> K in {2, 3, 4} (< 5 days)
  let K: number;
  const isOverOneHour = lateEarlyHoursRaw > 1 && targetTotalMinutes > 60;

  if (!isOverOneHour) {
    K = 1;
  } else {
    const capDays = Math.min(maxDaysOverOneHour, 4, orderedCandidates.length);
    if (capDays <= 2) {
      K = capDays;
    } else if (targetTotalMinutes > 360) {
      // > 6 hours total: use 4 days (still < 5 days) so per-day penalty stays around 1.5h - 3.2h
      K = capDays;
    } else if (targetTotalMinutes > 180) {
      // 3h - 6h total: 3 or 4 days
      const pick = rng() < 0.45 ? 3 : 4;
      K = Math.min(capDays, pick);
    } else {
      // 1h - 3h total: 2, 3, or 4 days
      const pick = 2 + Math.floor(rng() * 3); // 2, 3, or 4
      K = Math.min(capDays, pick);
    }
  }

  const chosenDays = orderedCandidates.slice(0, K);

  // Allow up to (shiftWorkMinutes - 30) per day (e.g. 450m on 8h shift) so even 12-20h fits in <= 4 days
  const hardCaps = chosenDays.map((c) =>
    Math.max(60, Math.min(450, c.shiftWorkMinutes - 30))
  );
  const maxPossibleCapacity = hardCaps.reduce((a, b) => a + b, 0);
  const effectiveTarget = Math.min(targetTotalMinutes, maxPossibleCapacity);

  const allocations = new Array<number>(K).fill(0);

  if (K === 1) {
    allocations[0] = effectiveTarget;
  } else {
    // Give each chosen day a sensible minimum (e.g. 5-10 mins) so all K days genuinely carry minutes
    const minEach = Math.min(10, Math.max(5, Math.floor(effectiveTarget / (K * 3))));
    let remaining = effectiveTarget;
    for (let i = 0; i < K; i++) {
      const initVal = Math.min(hardCaps[i], minEach, remaining);
      allocations[i] = initVal;
      remaining -= initVal;
    }

    // Balanced random weights (0.65 .. 1.35) so no single day gets an extreme spike
    const weights = chosenDays.map(() => 0.65 + rng() * 0.7);
    const weightSum = weights.reduce((a, b) => a + b, 0);

    if (remaining > 0) {
      for (let i = 0; i < K; i++) {
        const share = Math.floor((remaining * weights[i]) / weightSum);
        const room = hardCaps[i] - allocations[i];
        allocations[i] += Math.min(room, share);
      }
      remaining = effectiveTarget - allocations.reduce((a, b) => a + b, 0);
    }

    let guard = 0;
    while (remaining > 0 && guard < 10000) {
      guard++;
      const idx = Math.floor(rng() * K);
      if (allocations[idx] < hardCaps[idx]) {
        allocations[idx] += 1;
        remaining -= 1;
      } else {
        const openIdx = allocations.findIndex((val, i) => val < hardCaps[i]);
        if (openIdx === -1) break;
        allocations[openIdx] += 1;
        remaining -= 1;
      }
    }
  }

  // Assign each chosen day cleanly as either "Đi muộn" OR "Về sớm"
  // (Only split a single day into both if totalDayMin > 225m so HC check-in/out never lands in 12:00-13:00 lunch)
  chosenDays.forEach((cand, idx) => {
    const totalDayMin = allocations[idx];
    if (totalDayMin <= 0) return;

    if (totalDayMin > 225 && !cand.isOvertimeDay && mode !== 'late-only' && mode !== 'early-only') {
      const latePart = Math.min(210, Math.round(totalDayMin * 0.5));
      const earlyPart = totalDayMin - latePart;
      result[cand.day] = { lateMinutes: latePart, earlyMinutes: earlyPart };
      return;
    }

    if (cand.isOvertimeDay || mode === 'late-only') {
      result[cand.day] = { lateMinutes: totalDayMin, earlyMinutes: 0 };
      return;
    }

    if (mode === 'early-only') {
      result[cand.day] = { lateMinutes: 0, earlyMinutes: totalDayMin };
      return;
    }

    const lateProb = mode === 'balanced' ? 0.5 : 0.65;
    if (rng() < lateProb) {
      result[cand.day] = { lateMinutes: totalDayMin, earlyMinutes: 0 };
    } else {
      result[cand.day] = { lateMinutes: 0, earlyMinutes: totalDayMin };
    }
  });

  return result;
}

export interface GeneratedAttendanceResult {
  records: DetailedAttendanceRecord[];
  reconciliations: EmployeeReconciliationSummary[];
}

export function generateDetailedAttendanceWithReconciliation(
  hcEmployees: ParsedEmployeeRow[],
  sxEmployees: ParsedEmployeeRow[],
  config: GeneratorConfig,
  deptOverrides: Record<string, { code: string; name: string }>
): GeneratedAttendanceResult {
  const allEmployees = [...hcEmployees, ...sxEmployees];
  const daysInMonth = getDaysInMonth(config.month, config.year);

  const empActionsByDay = new Map<string, Record<number, ParsedCellAction>>();
  const empPenaltiesByDay = new Map<string, Record<number, DayPenaltyAllocation>>();
  const reconciliations: EmployeeReconciliationSummary[] = [];

  for (const emp of allEmployees) {
    const actionsForEmp: Record<number, ParsedCellAction> = {};
    const workingCandidates: WorkingDayCandidate[] = [];
    let hcGeneratedOt = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const action = interpretAttendanceCell(
        emp.dailyCells[day],
        emp.sheetType,
        config.leaveLabels
      );
      actionsForEmp[day] = action;

      if (action.kind === 'work') {
        const hrs = action.totalDailyHours ?? 8;
        const ot = action.overtimeHoursDaily ?? 0;
        if (emp.sheetType === 'HC' && config.applyDailyHoursToCheckout) {
          hcGeneratedOt += ot;
        }
        workingCandidates.push({
          day,
          isOvertimeDay: ot > 0 && config.applyDailyHoursToCheckout,
          shiftWorkMinutes: Math.round(hrs * 60),
        });
      }
    }

    empActionsByDay.set(emp.id, actionsForEmp);

    const rawHours = emp.lateEarlyHours || 0;
    const targetMinutes = Math.round(rawHours * 60);
    let dayPenalties: Record<number, DayPenaltyAllocation> = {};

    if (config.enableStep2LateEarly && targetMinutes > 0) {
      const empRng = createSeededRng(
        config.seed ^ hashString(`${emp.sheetType}:${emp.employeeCode}`)
      );
      dayPenalties = allocateEmployeeLateEarlyMinutes(
        workingCandidates,
        rawHours,
        targetMinutes,
        config.lateEarlyDistributionMode,
        config.maxDaysWhenOverOneHour,
        empRng
      );
    }

    empPenaltiesByDay.set(emp.id, dayPenalties);

    let allocLate = 0;
    let allocEarly = 0;
    let incidentDays = 0;
    for (const p of Object.values(dayPenalties)) {
      if (p.lateMinutes > 0 || p.earlyMinutes > 0) {
        incidentDays++;
        allocLate += p.lateMinutes;
        allocEarly += p.earlyMinutes;
      }
    }
    const allocTotal = allocLate + allocEarly;
    const { departmentCode, departmentName } = resolveEmployeeDepartment(emp, deptOverrides);

    const expectedDayRuleText =
      targetMinutes === 0
        ? 'Không phát sinh'
        : rawHours <= 1 && targetMinutes <= 60
        ? '≤ 1h → 1 ngày duy nhất'
        : '> 1h → < 5 ngày (2-4 ngày)';

    const isDayCountValid =
      targetMinutes === 0
        ? incidentDays === 0
        : rawHours <= 1 && targetMinutes <= 60
        ? incidentDays === 1
        : incidentDays >= 1 && incidentDays < 5;

    const isMatched = config.enableStep2LateEarly
      ? allocTotal === targetMinutes && (workingCandidates.length === 0 || isDayCountValid)
      : targetMinutes === 0;

    let note: string | undefined;
    if (config.enableStep2LateEarly && targetMinutes > 0 && workingCandidates.length === 0) {
      note = 'Nhân viên không có ngày đi làm thực tế trong tháng';
    } else if (config.enableStep2LateEarly && allocTotal < targetMinutes) {
      note = 'Tổng giờ muộn vượt quá số giờ làm việc của các ngày được chọn';
    }

    reconciliations.push({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      sheetType: emp.sheetType,
      departmentCode,
      departmentName,
      workingDaysCount: workingCandidates.length,
      targetLateEarlyHours: rawHours,
      targetLateEarlyMinutes: targetMinutes,
      allocatedLateMinutes: allocLate,
      allocatedEarlyMinutes: allocEarly,
      allocatedTotalMinutes: allocTotal,
      allocatedTotalHours: allocTotal / 60,
      incidentDaysCount: incidentDays,
      expectedDayRuleText,
      hcSheetOvertimeHours: emp.sheetType === 'HC' ? emp.overtimeHours || 0 : 0,
      hcGeneratedOvertimeHours: emp.sheetType === 'HC' ? hcGeneratedOt : 0,
      isLateEarlyMatched: isMatched,
      note,
    });
  }

  // Generate day-by-day detailed attendance records
  const recordsByDay: DetailedAttendanceRecord[][] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayRng = createSeededRng(config.seed + day * 7919 + config.month * 101);

    const inDispensers: Record<ShiftKey, StaggeredOffsetDispenser> = {
      HC: new StaggeredOffsetDispenser(config.earlyBufferMin, config.earlyBufferMax, dayRng),
      C1: new StaggeredOffsetDispenser(config.earlyBufferMin, config.earlyBufferMax, dayRng),
      C2: new StaggeredOffsetDispenser(config.earlyBufferMin, config.earlyBufferMax, dayRng),
      C3: new StaggeredOffsetDispenser(config.earlyBufferMin, config.earlyBufferMax, dayRng),
    };

    const outDispensers: Record<ShiftKey, StaggeredOffsetDispenser> = {
      HC: new StaggeredOffsetDispenser(config.lateOutBufferMin, config.lateOutBufferMax, dayRng),
      C1: new StaggeredOffsetDispenser(config.lateOutBufferMin, config.lateOutBufferMax, dayRng),
      C2: new StaggeredOffsetDispenser(config.lateOutBufferMin, config.lateOutBufferMax, dayRng),
      C3: new StaggeredOffsetDispenser(config.lateOutBufferMin, config.lateOutBufferMax, dayRng),
    };

    const dateStr = formatAttendanceDate(day, config.month, config.year, config.dateFormat);
    const dayRecords: DetailedAttendanceRecord[] = [];

    for (const emp of allEmployees) {
      const rawCell = emp.dailyCells[day];
      const action = empActionsByDay.get(emp.id)?.[day];

      if (!action || action.kind === 'skip') {
        continue;
      }
      if (action.kind === 'rest' && !config.includeRestDays) {
        continue;
      }

      const { departmentCode, departmentName } = resolveEmployeeDepartment(emp, deptOverrides);

      if (action.kind === 'leave' || action.kind === 'rest') {
        dayRecords.push({
          rowNumber: 0,
          employeeCode: emp.employeeCode,
          fullName: emp.fullName,
          departmentCode,
          departmentName,
          day,
          dateStr,
          checkIn: action.leaveText || 'Nghỉ',
          checkOut: '',
          note: '',
          rawCode: (rawCell || '').trim(),
          sheetType: emp.sheetType,
          recordKind: action.kind,
          shiftLabel: action.leaveText || 'Nghỉ',
          lateMinutes: 0,
          earlyMinutes: 0,
          overtimeHoursDaily: 0,
        });
        continue;
      }

      // Working day
      const shiftKey = action.shiftKey || (emp.sheetType === 'HC' ? 'HC' : 'C1');
      const shiftCfg = config.shifts[shiftKey];

      const baseStartMin = parseTimeToMinutes(shiftCfg.startTime);
      let baseEndMin = parseTimeToMinutes(shiftCfg.endTime);

      if (baseEndMin <= baseStartMin) {
        baseEndMin += 1440;
      }

      let dailyOtHours = 0;

      if (emp.sheetType === 'HC' && config.applyDailyHoursToCheckout && action.totalDailyHours !== undefined) {
        const hrs = action.totalDailyHours;
        dailyOtHours = action.overtimeHoursDaily ?? 0;
        if (hrs !== 8) {
          if (hrs <= 4.5) {
            baseEndMin = baseStartMin + Math.round(hrs * 60);
          } else {
            baseEndMin = baseStartMin + shiftCfg.lunchMinutes + Math.round(hrs * 60);
          }
        }
      }

      const penalty = empPenaltiesByDay.get(emp.id)?.[day];
      const lateMins = penalty?.lateMinutes ?? 0;
      const earlyMins = penalty?.earlyMinutes ?? 0;

      const inSample = inDispensers[shiftKey].next();
      const outSample = outDispensers[shiftKey].next();

      // Calculate check-in: if HC lateMins > 240 (4h morning), skip 60m lunch break so check-in doesn't land in 12:00-13:00
      let actualInMin: number;
      if (lateMins > 0) {
        const lunchShift = shiftKey === 'HC' && lateMins >= 240 ? shiftCfg.lunchMinutes : 0;
        actualInMin = baseStartMin + lateMins + lunchShift;
      } else {
        actualInMin = baseStartMin - inSample.minuteOffset;
      }

      // Calculate check-out: if HC earlyMins > 240 (4h afternoon), skip 60m lunch break backwards
      let actualOutMin: number;
      if (earlyMins > 0) {
        const lunchShift = shiftKey === 'HC' && earlyMins >= 240 && dailyOtHours === 0 ? shiftCfg.lunchMinutes : 0;
        actualOutMin = baseEndMin - earlyMins - lunchShift;
      } else {
        actualOutMin = baseEndMin + outSample.minuteOffset;
      }

      const rowNote = formatLateEarlyNote(lateMins, earlyMins, config.noteStyle);

      dayRecords.push({
        rowNumber: 0,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        departmentCode,
        departmentName,
        day,
        dateStr,
        checkIn: formatMinutesToTime(actualInMin, inSample.second, config.timeFormat),
        checkOut: formatMinutesToTime(actualOutMin, outSample.second, config.timeFormat),
        note: rowNote,
        rawCode: (rawCell || '').trim(),
        sheetType: emp.sheetType,
        recordKind: 'work',
        shiftLabel: shiftKey,
        lateMinutes: lateMins,
        earlyMinutes: earlyMins,
        overtimeHoursDaily: dailyOtHours,
      });
    }

    recordsByDay.push(dayRecords);
  }

  let flat = recordsByDay.flat();

  if (config.sortOrder === 'by-employee') {
    const empOrder = new Map<string, number>();
    allEmployees.forEach((e, idx) => empOrder.set(`${e.sheetType}:${e.employeeCode}`, idx));
    flat = [...flat].sort((a, b) => {
      const orderA = empOrder.get(`${a.sheetType}:${a.employeeCode}`) ?? 99999;
      const orderB = empOrder.get(`${b.sheetType}:${b.employeeCode}`) ?? 99999;
      if (orderA !== orderB) return orderA - orderB;
      return a.day - b.day;
    });
  }

  const numberedRecords = flat.map((rec, index) => ({
    ...rec,
    rowNumber: index + 1,
  }));

  return {
    records: numberedRecords,
    reconciliations,
  };
}
