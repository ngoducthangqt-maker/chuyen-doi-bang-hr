import * as XLSX from 'xlsx';
import {
  DetailedAttendanceRecord,
  EmployeeReconciliationSummary,
  GeneratorConfig,
  ParsedEmployeeRow,
  ParsedWorkbookData,
  SheetType,
  SummaryEmployeeMeta,
} from '../types/attendance';
import { buildDiscoveredDepartments, removeVietnameseTones } from './departmentHelper';

interface CellInfo {
  raw: unknown;
  formatted: string;
  hasFormula: boolean;
}

function normHeader(val: unknown): string {
  if (val === null || val === undefined) return '';
  return removeVietnameseTones(String(val))
    .toLowerCase()
    .replace(/[_/\\\-.,:;()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericValue(cell: CellInfo | undefined): number {
  if (!cell) return 0;
  const { raw, formatted } = cell;

  if (typeof raw === 'number' && !isNaN(raw)) {
    return Math.round(raw * 10000) / 10000;
  }

  const candidate = String(raw ?? formatted ?? '').trim();
  if (!candidate || candidate === '-' || candidate === '—') return 0;

  const cleaned = candidate.replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 10000) / 10000;
}

function parseLateEarlyHoursCell(
  cell: CellInfo | undefined,
  unitIsMinutes = false
): { value: number; hasExplicitValue: boolean } {
  if (!cell) return { value: 0, hasExplicitValue: false };
  const { raw, formatted } = cell;

  const fmtTrim = (formatted || '').trim();
  const rawStr = raw !== null && raw !== undefined ? String(raw).trim() : '';

  if (!rawStr && !fmtTrim) {
    return { value: 0, hasExplicitValue: false };
  }
  if (rawStr === '-' || fmtTrim === '-') {
    return { value: 0, hasExplicitValue: true };
  }

  // Handle Excel time format "HH:mm" or "[h]:mm:ss" (where Excel stores fraction of 24h day in raw)
  const timeFmtMatch = fmtTrim.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (timeFmtMatch) {
    const h = parseInt(timeFmtMatch[1], 10) || 0;
    const m = parseInt(timeFmtMatch[2], 10) || 0;
    const s = parseInt(timeFmtMatch[3] || '0', 10) || 0;
    const hours = h + m / 60 + s / 3600;
    return {
      value: Math.round(hours * 10000) / 10000,
      hasExplicitValue: true,
    };
  }

  // Handle text like "1h30", "1g30p", "45p"
  const hmTextMatch = (rawStr || fmtTrim)
    .toLowerCase()
    .match(/^(\d+(?:[.,]\d+)?)\s*[hg]\s*(\d{1,2})?/);
  if (hmTextMatch) {
    const h = parseFloat(hmTextMatch[1].replace(',', '.')) || 0;
    const m = hmTextMatch[2] ? parseInt(hmTextMatch[2], 10) : 0;
    const hours = h + m / 60;
    return {
      value: Math.round(hours * 10000) / 10000,
      hasExplicitValue: true,
    };
  }

  if (typeof raw === 'number' && !isNaN(raw)) {
    const absVal = Math.abs(raw);
    const hours = unitIsMinutes ? absVal / 60 : absVal;
    return {
      value: Math.round(hours * 10000) / 10000,
      hasExplicitValue: true,
    };
  }

  const textSource = rawStr || fmtTrim;
  const cleaned = textSource.replace(/\s+/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  if (!isNaN(parsed)) {
    const absVal = Math.abs(parsed);
    const hours = unitIsMinutes ? absVal / 60 : absVal;
    return {
      value: Math.round(hours * 10000) / 10000,
      hasExplicitValue: true,
    };
  }

  return { value: 0, hasExplicitValue: false };
}

function extractSheetMatrix(sheet: XLSX.WorkSheet): CellInfo[][] {
  const ref = sheet['!ref'];
  if (!ref) return [];

  const range = XLSX.utils.decode_range(ref);
  const totalRows = range.e.r + 1;
  const totalCols = range.e.c + 1;

  const matrix: CellInfo[][] = Array.from({ length: totalRows }, () =>
    Array.from({ length: totalCols }, () => ({
      raw: '',
      formatted: '',
      hasFormula: false,
    }))
  );

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell: XLSX.CellObject | undefined = sheet[addr];
      if (!cell) continue;

      const rawVal = cell.v !== undefined ? cell.v : cell.w !== undefined ? cell.w : '';
      const formattedVal =
        cell.w !== undefined
          ? String(cell.w).trim()
          : cell.v !== undefined && cell.v !== null
          ? String(cell.v).trim()
          : '';

      matrix[r][c] = {
        raw: rawVal,
        formatted: formattedVal,
        hasFormula: Boolean(cell.f),
      };
    }
  }

  // Propagate merged header cells (top 25 rows) so multi-row / grouped headers never leave blank subcells
  const merges = sheet['!merges'] || [];
  for (const m of merges) {
    if (m.s.r > 25) continue;
    const anchor = matrix[m.s.r]?.[m.s.c];
    if (!anchor || (anchor.raw === '' && anchor.formatted === '')) continue;

    const maxR = Math.min(m.e.r, totalRows - 1, 25);
    const maxC = Math.min(m.e.c, totalCols - 1);
    for (let r = m.s.r; r <= maxR; r++) {
      for (let c = m.s.c; c <= maxC; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        const target = matrix[r][c];
        if (target.raw === '' && target.formatted === '') {
          matrix[r][c] = { ...anchor };
        }
      }
    }
  }

  return matrix;
}

function getCellText(cell: CellInfo | undefined): string {
  if (!cell) return '';
  if (cell.raw !== null && cell.raw !== undefined && String(cell.raw).trim() !== '') {
    // Prefer formatted string only if raw is not informative, otherwise for daily attendance codes keep clean text
    if (typeof cell.raw === 'number') {
      // Round clean integers or decimals
      return Number.isInteger(cell.raw)
        ? String(cell.raw)
        : String(Math.round(cell.raw * 100) / 100);
    }
    return String(cell.raw).trim();
  }
  return cell.formatted.trim();
}

export function extractMonthYearFromString(input: string): { month?: number; year?: number } {
  if (!input) return {};
  const ascii = removeVietnameseTones(input).toLowerCase();

  // Pattern 1: "thang 1/2026", "thang 01 nam 2026", "thang 1.2026", "th_ng_1.2026"
  const m1 = ascii.match(/(?:thang|th_ng)\s*[_\-.\s]*0?(\d{1,2})\s*[/\-._\s]*(?:nam\s*)?(20\d{2})/i);
  if (m1) {
    const month = parseInt(m1[1], 10);
    const year = parseInt(m1[2], 10);
    if (month >= 1 && month <= 12) return { month, year };
  }

  // Pattern 2: "t01/2026", "t1-2026", "t1.2026"
  const m2 = ascii.match(/(?:^|[^a-z0-9])t[_\-\s]*0?(\d{1,2})[/\-._\s]+(20\d{2})/i);
  if (m2) {
    const month = parseInt(m2[1], 10);
    const year = parseInt(m2[2], 10);
    if (month >= 1 && month <= 12) return { month, year };
  }

  // Pattern 3: standalone "01/2026" or "1.2026"
  const m3 = ascii.match(/(?:^|[^0-9])0?(\d{1,2})[/\-.](20\d{2})(?:$|[^0-9])/);
  if (m3) {
    const month = parseInt(m3[1], 10);
    const year = parseInt(m3[2], 10);
    if (month >= 1 && month <= 12) return { month, year };
  }

  return {};
}

function detectMonthYearFromMatrix(matrix: CellInfo[][]): {
  month?: number;
  year?: number;
  companyName?: string;
} {
  let month: number | undefined;
  let year: number | undefined;
  let companyName: string | undefined;

  for (let r = 0; r < Math.min(matrix.length, 12); r++) {
    const row = matrix[r] || [];
    for (const cell of row) {
      const text = (cell.formatted || String(cell.raw ?? '')).trim();
      if (!text) continue;
      const ascii = removeVietnameseTones(text).toLowerCase();

      if (!companyName && (ascii.includes('cong ty') || ascii.includes('nha may'))) {
        companyName = text;
      }

      if (!month || !year) {
        const detected = extractMonthYearFromString(text);
        if (detected.month && detected.year) {
          month = detected.month;
          year = detected.year;
        }
      }
    }
  }
  return { month, year, companyName };
}

function extractDayNumber(cell: CellInfo | undefined): number | null {
  if (!cell) return null;
  const { raw, formatted } = cell;

  if (typeof raw === 'number' && !isNaN(raw)) {
    if (Number.isInteger(raw) && raw >= 1 && raw <= 31) {
      return raw;
    }
    if (raw > 40000 && raw < 60000) {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed && parsed.d >= 1 && parsed.d <= 31) {
        return parsed.d;
      }
    }
  }

  const candidates = [String(raw ?? '').trim(), formatted.trim()].filter(Boolean);
  for (const s of candidates) {
    if (/^0?[1-9]$|^[12]\d$|^3[01]$/.test(s)) {
      return parseInt(s, 10);
    }
    const dateHeaderMatch = s.match(/^0?(\d{1,2})[/-]\d{1,2}(?:[/-]\d{2,4})?$/);
    if (dateHeaderMatch) {
      const d = parseInt(dateHeaderMatch[1], 10);
      if (d >= 1 && d <= 31) return d;
    }
  }
  return null;
}

function isSummaryColumnKeyword(normText: string): boolean {
  if (!normText) return false;
  return (
    normText === 'c1' ||
    normText === 'c2' ||
    normText === 'c3' ||
    normText === 'le' ||
    normText === 'nghi le' ||
    normText === 'phep' ||
    normText === 'nghi phep' ||
    normText.includes('om ') ||
    normText === 'om' ||
    normText.includes('vr') ||
    normText.includes('thai san') ||
    normText.includes('cong thuc te') ||
    normText === 'tong cong' ||
    normText.includes('phu cap') ||
    normText.includes('tang ca') ||
    normText.includes('di muon') ||
    normText.includes('ve som') ||
    normText.includes('di tre') ||
    normText.includes('muon som') ||
    normText.includes('ghi chu')
  );
}

function scoreLateEarlyHeader(normText: string): { score: number; isMinutes: boolean } {
  if (!normText) return { score: 0, isMinutes: false };
  const words = normText.split(' ');

  // Exclude monetary penalty/deduction or occurrence-count columns
  if (
    normText.includes('thanh tien') ||
    normText.includes('so tien') ||
    normText.includes('tien phat') ||
    normText.includes('tru luong') ||
    normText.includes('so lan') ||
    words.includes('lan') ||
    normText.includes('ghi chu')
  ) {
    return { score: 0, isMinutes: false };
  }

  const hasLate =
    normText.includes('di muon') ||
    normText.includes('di tre') ||
    words.includes('muon') ||
    words.includes('tre');
  const hasEarly = normText.includes('ve som') || words.includes('som');
  if (!hasLate && !hasEarly) {
    return { score: 0, isMinutes: false };
  }

  const hasHourUnit = words.includes('gio') || words.includes('h');
  const hasMinuteUnit = words.includes('phut') && !hasHourUnit;

  let score = 30;
  if (hasLate && hasEarly) score += 50; // e.g., "di muon ve som"
  if (hasHourUnit) score += 25;         // e.g., "di muon ve som gio" -> 105 (highest priority)
  if (normText.includes('tong')) score += 10;

  return { score, isMinutes: hasMinuteUnit };
}

function isTitleBannerRow(row: CellInfo[]): boolean {
  const nonEmpty = row
    .map((c) => normHeader(c.raw || c.formatted))
    .filter(Boolean);
  const unique = new Set(nonEmpty);
  if (unique.size <= 2) {
    for (const text of unique) {
      if (
        text.includes('bang cham cong') ||
        text.includes('bang cong thang') ||
        text.includes('cong ty')
      ) {
        return true;
      }
    }
  }
  return false;
}

function findHeaderAnchorRow(matrix: CellInfo[][]): {
  headerRowIdx: number;
  empCodeCol: number;
  nameCol: number;
} {
  for (let r = 0; r < Math.min(matrix.length, 22); r++) {
    const row = matrix[r] || [];
    let foundCode = -1;
    let foundName = -1;
    for (let c = 0; c < row.length; c++) {
      const h = normHeader(row[c]?.raw || row[c]?.formatted);
      if (!h) continue;
      if (
        foundCode === -1 &&
        (h === 'ma nv' ||
          h === 'ma nhan vien' ||
          h === 'msnv' ||
          h === 'ma so nv' ||
          h.startsWith('ma nv '))
      ) {
        foundCode = c;
      } else if (
        foundName === -1 &&
        (h.includes('ho va ten') ||
          h === 'ho ten' ||
          h === 'ten nhan vien' ||
          h === 'ten nv')
      ) {
        foundName = c;
      }
    }
    if (foundCode !== -1 && foundName !== -1) {
      return { headerRowIdx: r, empCodeCol: foundCode, nameCol: foundName };
    }
  }
  return { headerRowIdx: -1, empCodeCol: -1, nameCol: -1 };
}

function findDataStartRow(
  matrix: CellInfo[][],
  headerRowIdx: number,
  empCodeCol: number,
  nameCol: number
): number {
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const codeText = getCellText(row[empCodeCol]);
    const nameText = getCellText(row[nameCol]);
    const codeNorm = normHeader(codeText);
    const nameNorm = normHeader(nameText);

    if (!codeText && !nameText) continue;

    // Skip repeated header text from vertical merges or sub-header rows
    if (
      codeNorm === 'ma nv' ||
      codeNorm === 'ma nhan vien' ||
      codeNorm === 'msnv' ||
      codeNorm === 'stt' ||
      nameNorm === 'ho va ten' ||
      nameNorm === 'ho ten' ||
      nameNorm === 'ten nhan vien'
    ) {
      continue;
    }

    if (codeText && nameText) {
      return r;
    }
  }
  return headerRowIdx + 1;
}

function buildColumnHeaderTokens(
  matrix: CellInfo[][],
  headerRowIdx: number,
  dataStartRow: number,
  colIdx: number
): string[] {
  const startR = Math.max(0, headerRowIdx - 1);
  const endR = Math.max(headerRowIdx, dataStartRow - 1);
  const tokens: string[] = [];

  for (let r = startR; r <= endR; r++) {
    const row = matrix[r] || [];
    if (r < headerRowIdx && isTitleBannerRow(row)) continue;
    const norm = normHeader(row[colIdx]?.raw || row[colIdx]?.formatted);
    if (norm && !tokens.includes(norm)) {
      tokens.push(norm);
    }
  }
  return tokens;
}

function parseSummarySheet(matrix: CellInfo[][]): {
  deptByEmpCode: Record<string, string>;
  metaByEmpCode: Record<string, SummaryEmployeeMeta>;
  month?: number;
  year?: number;
  companyName?: string;
} {
  const { month, year, companyName } = detectMonthYearFromMatrix(matrix);
  const deptByEmpCode: Record<string, string> = {};
  const metaByEmpCode: Record<string, SummaryEmployeeMeta> = {};

  const { headerRowIdx, empCodeCol, nameCol } = findHeaderAnchorRow(matrix);
  if (headerRowIdx === -1 || empCodeCol === -1) {
    return { deptByEmpCode, metaByEmpCode, month, year, companyName };
  }

  const dataStartRow = findDataStartRow(matrix, headerRowIdx, empCodeCol, nameCol);
  const maxCols = Math.max(
    ...matrix.slice(headerRowIdx, dataStartRow + 1).map((r) => r?.length || 0),
    0
  );

  let deptCol = -1;
  let holidaysCol = -1;
  let paidLeaveCol = -1;
  let sickLeaveCol = -1;
  let actualWorkCol = -1;
  let totalWorkCol = -1;
  let lateEarlyCol = -1;
  let lateEarlyBestScore = 0;
  let lateEarlyIsMinutes = false;
  const overtimeCols: number[] = [];

  for (let c = 0; c < maxCols; c++) {
    const tokens = buildColumnHeaderTokens(matrix, headerRowIdx, dataStartRow, c);
    if (tokens.length === 0) continue;
    const combined = tokens.join(' ');

    if (deptCol === -1 && (combined.includes('bo phan') || combined.includes('phong ban'))) {
      deptCol = c;
      continue;
    }

    const lateCheck = scoreLateEarlyHeader(combined);
    if (lateCheck.score > lateEarlyBestScore) {
      lateEarlyCol = c;
      lateEarlyBestScore = lateCheck.score;
      lateEarlyIsMinutes = lateCheck.isMinutes;
      continue;
    }

    if (holidaysCol === -1 && (tokens.includes('le') || combined.includes('nghi le'))) {
      holidaysCol = c;
    } else if (paidLeaveCol === -1 && (tokens.includes('phep') || combined.includes('nghi phep'))) {
      paidLeaveCol = c;
    } else if (
      sickLeaveCol === -1 &&
      (combined.includes('om') || combined.includes('vr') || combined.includes('ts'))
    ) {
      sickLeaveCol = c;
    } else if (actualWorkCol === -1 && combined.includes('cong thuc te')) {
      actualWorkCol = c;
    } else if (
      totalWorkCol === -1 &&
      (tokens.includes('tong cong') || (combined.includes('tong cong') && !combined.includes('thuc te')))
    ) {
      totalWorkCol = c;
    } else if (combined.includes('tang ca')) {
      overtimeCols.push(c);
    }
  }

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const code = getCellText(row[empCodeCol]);
    const name = nameCol !== -1 ? getCellText(row[nameCol]) : '';
    if (!code || !name) continue;

    const codeNorm = normHeader(code);
    if (
      codeNorm === 'tong' ||
      codeNorm === 'cong' ||
      codeNorm.startsWith('tong ') ||
      codeNorm === 'ma nv'
    ) {
      continue;
    }

    const key = code.toUpperCase();
    const dept = deptCol !== -1 ? getCellText(row[deptCol]) : '';
    if (dept) {
      deptByEmpCode[key] = dept;
    }

    const lateParsed =
      lateEarlyCol !== -1
        ? parseLateEarlyHoursCell(row[lateEarlyCol], lateEarlyIsMinutes)
        : { value: 0, hasExplicitValue: false };

    let otHours = 0;
    if (overtimeCols.length > 0) {
      const firstOt = parseNumericValue(row[overtimeCols[0]]);
      const restOt = overtimeCols
        .slice(1)
        .reduce((acc, idx) => acc + parseNumericValue(row[idx]), 0);
      otHours = firstOt > 0 ? firstOt : restOt;
    }

    metaByEmpCode[key] = {
      dept: dept || undefined,
      lateEarlyHours: lateParsed.hasExplicitValue ? lateParsed.value : undefined,
      overtimeHours: overtimeCols.length > 0 ? otHours : undefined,
      holidays: holidaysCol !== -1 ? parseNumericValue(row[holidaysCol]) : undefined,
      paidLeave: paidLeaveCol !== -1 ? parseNumericValue(row[paidLeaveCol]) : undefined,
      sickOrUnpaidLeave: sickLeaveCol !== -1 ? parseNumericValue(row[sickLeaveCol]) : undefined,
      actualWorkDays: actualWorkCol !== -1 ? parseNumericValue(row[actualWorkCol]) : undefined,
      totalWorkDays: totalWorkCol !== -1 ? parseNumericValue(row[totalWorkCol]) : undefined,
    };
  }

  return { deptByEmpCode, metaByEmpCode, month, year, companyName };
}

function parseAttendanceSheet(
  matrix: CellInfo[][],
  sheetType: SheetType,
  summaryDeptByEmpCode: Record<string, string>,
  summaryMetaByEmpCode: Record<string, SummaryEmployeeMeta>
): {
  employees: ParsedEmployeeRow[];
  warnings: string[];
  month?: number;
  year?: number;
  companyName?: string;
} {
  const warnings: string[] = [];
  const { month, year, companyName } = detectMonthYearFromMatrix(matrix);

  const { headerRowIdx, empCodeCol, nameCol } = findHeaderAnchorRow(matrix);
  if (headerRowIdx === -1) {
    warnings.push(`Không tìm thấy dòng tiêu đề (Mã NV, Họ và tên) trong sheet ${sheetType}.`);
    return { employees: [], warnings, month, year, companyName };
  }

  const dataStartRow = findDataStartRow(matrix, headerRowIdx, empCodeCol, nameCol);
  const maxCols = Math.max(
    ...matrix.slice(0, Math.min(matrix.length, dataStartRow + 5)).map((r) => r?.length || 0),
    0
  );

  let deptOrMachineCol = -1;
  const dayColMap: Record<number, number> = {};
  let holidaysCol = -1;
  let paidLeaveCol = -1;
  let sickLeaveCol = -1;
  let actualWorkCol = -1;
  let totalWorkCol = -1;
  let nightAllowanceCol = -1;
  let lateEarlyCol = -1;
  let lateEarlyBestScore = 0;
  let lateEarlyIsMinutes = false;
  let notesCol = -1;
  const overtimeCols: number[] = [];

  let summarySectionStarted = false;

  for (let c = 0; c < maxCols; c++) {
    if (c <= nameCol) continue;

    const tokens = buildColumnHeaderTokens(matrix, headerRowIdx, dataStartRow, c);
    const combined = tokens.join(' ');

    // 1. Department / Machine column immediately after Name
    if (
      deptOrMachineCol === -1 &&
      Object.keys(dayColMap).length === 0 &&
      (combined.includes('bo phan') ||
        combined.includes('phong ban') ||
        tokens.includes('may') ||
        combined.startsWith('may ') ||
        tokens.includes('chuyen') ||
        tokens.includes('to'))
    ) {
      deptOrMachineCol = c;
      continue;
    }

    // 2. Check if summary columns have begun so day scanner NEVER hijacks right-hand summary columns
    if (tokens.some((t) => isSummaryColumnKeyword(t)) || isSummaryColumnKeyword(combined)) {
      if (Object.keys(dayColMap).length >= 20) {
        summarySectionStarted = true;
      }
    }

    // 3. Day columns 01..31 (checks all header rows and picks the unassigned day number)
    if (!summarySectionStarted) {
      let detectedDay: number | null = null;
      const startHeaderScan = Math.max(0, headerRowIdx - 1);
      for (let r = startHeaderScan; r < dataStartRow; r++) {
        if (r < headerRowIdx && isTitleBannerRow(matrix[r] || [])) continue;
        const cell = matrix[r]?.[c];
        const cellNorm = normHeader(cell?.raw || cell?.formatted);
        if (isSummaryColumnKeyword(cellNorm)) continue;
        const d = extractDayNumber(cell);
        if (d !== null && dayColMap[d] === undefined) {
          detectedDay = d;
          break;
        }
      }

      if (detectedDay !== null && dayColMap[detectedDay] === undefined) {
        dayColMap[detectedDay] = c;
        if (detectedDay === 31) {
          summarySectionStarted = true;
        }
        continue;
      }
    }

    if (tokens.length === 0) continue;

    // 4. Summary & Late/Early columns (scored by specificity so "Đi muộn về sớm (giờ)" always wins)
    const lateCheck = scoreLateEarlyHeader(combined);
    if (lateCheck.score > 0) {
      if (lateCheck.score > lateEarlyBestScore) {
        lateEarlyCol = c;
        lateEarlyBestScore = lateCheck.score;
        lateEarlyIsMinutes = lateCheck.isMinutes;
      }
      continue;
    }

    if (holidaysCol === -1 && (tokens.includes('le') || combined.includes('nghi le'))) {
      holidaysCol = c;
    } else if (paidLeaveCol === -1 && (tokens.includes('phep') || combined.includes('nghi phep'))) {
      paidLeaveCol = c;
    } else if (
      sickLeaveCol === -1 &&
      (combined.includes('om') || combined.includes('vr') || combined.includes('ts'))
    ) {
      sickLeaveCol = c;
    } else if (actualWorkCol === -1 && combined.includes('cong thuc te')) {
      actualWorkCol = c;
    } else if (
      totalWorkCol === -1 &&
      (tokens.includes('tong cong') || (combined.includes('tong cong') && !combined.includes('thuc te')))
    ) {
      totalWorkCol = c;
    } else if (nightAllowanceCol === -1 && combined.includes('phu cap') && combined.includes('dem')) {
      nightAllowanceCol = c;
    } else if (combined.includes('tang ca')) {
      overtimeCols.push(c);
    } else if (notesCol === -1 && combined.includes('ghi chu')) {
      notesCol = c;
    }
  }

  if (deptOrMachineCol === -1 && dayColMap[1] !== undefined && dayColMap[1] > nameCol + 1) {
    deptOrMachineCol = nameCol + 1;
  }

  if (Object.keys(dayColMap).length === 0) {
    warnings.push(`Sheet ${sheetType} chưa tìm thấy các cột ngày 01 -> 31.`);
  }

  const employees: ParsedEmployeeRow[] = [];
  let restoredLateEarlyFromSummaryCount = 0;

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const empCode = getCellText(row[empCodeCol]);
    const fullName = getCellText(row[nameCol]);

    if (!empCode || !fullName) continue;
    const codeNorm = normHeader(empCode);
    if (
      codeNorm === 'tong' ||
      codeNorm === 'cong' ||
      codeNorm.startsWith('tong ') ||
      codeNorm === 'stt' ||
      codeNorm === 'ma nv' ||
      codeNorm === 'ma nhan vien'
    ) {
      continue;
    }

    const empKey = empCode.toUpperCase();
    const summaryMeta = summaryMetaByEmpCode[empKey];

    const rawDeptOrMachine =
      deptOrMachineCol !== -1 ? getCellText(row[deptOrMachineCol]) : '';

    const dailyCells: Record<number, string> = {};
    for (let d = 1; d <= 31; d++) {
      const colIdx = dayColMap[d];
      if (colIdx !== undefined) {
        const val = getCellText(row[colIdx]);
        if (val !== '') {
          dailyCells[d] = val;
        }
      }
    }

    let overtimeHours = 0;
    if (sheetType === 'HC') {
      if (overtimeCols.length > 0) {
        const firstOt = parseNumericValue(row[overtimeCols[0]]);
        const subOtSum = overtimeCols
          .slice(1)
          .reduce((acc, cIdx) => acc + parseNumericValue(row[cIdx]), 0);
        overtimeHours = firstOt > 0 ? firstOt : subOtSum;
      } else if (summaryMeta?.overtimeHours !== undefined) {
        overtimeHours = summaryMeta.overtimeHours;
      }
    }

    // Read Đi muộn về sớm (giờ) with full protection + cross-sheet synchronization with Tổng hợp
    let lateEarlyHours = 0;
    if (lateEarlyCol !== -1) {
      const cell = row[lateEarlyCol];
      const parsedLate = parseLateEarlyHoursCell(cell, lateEarlyIsMinutes);
      lateEarlyHours = parsedLate.value;

      if (
        lateEarlyHours === 0 &&
        summaryMeta?.lateEarlyHours !== undefined &&
        summaryMeta.lateEarlyHours > 0
      ) {
        lateEarlyHours = summaryMeta.lateEarlyHours;
        restoredLateEarlyFromSummaryCount++;
      }
    } else if (summaryMeta?.lateEarlyHours !== undefined) {
      lateEarlyHours = summaryMeta.lateEarlyHours;
      if (lateEarlyHours > 0) restoredLateEarlyFromSummaryCount++;
    }

    const holidays =
      holidaysCol !== -1
        ? parseNumericValue(row[holidaysCol])
        : summaryMeta?.holidays ?? 0;
    const paidLeave =
      paidLeaveCol !== -1
        ? parseNumericValue(row[paidLeaveCol])
        : summaryMeta?.paidLeave ?? 0;
    const sickOrUnpaidLeave =
      sickLeaveCol !== -1
        ? parseNumericValue(row[sickLeaveCol])
        : summaryMeta?.sickOrUnpaidLeave ?? 0;
    const actualWorkDays =
      actualWorkCol !== -1
        ? parseNumericValue(row[actualWorkCol])
        : summaryMeta?.actualWorkDays ?? 0;
    const totalWorkDays =
      totalWorkCol !== -1
        ? parseNumericValue(row[totalWorkCol])
        : summaryMeta?.totalWorkDays ?? 0;

    employees.push({
      id: `${sheetType}-${empCode}-${r}`,
      orderIndex: employees.length,
      employeeCode: empCode,
      fullName,
      sheetType,
      rawDeptOrMachine,
      summaryDeptName: summaryDeptByEmpCode[empKey] || summaryMeta?.dept,
      dailyCells,
      holidays,
      paidLeave,
      sickOrUnpaidLeave,
      actualWorkDays,
      totalWorkDays,
      overtimeHours,
      lateEarlyHours,
      nightAllowanceHours:
        nightAllowanceCol !== -1 ? parseNumericValue(row[nightAllowanceCol]) : 0,
      notes: notesCol !== -1 ? getCellText(row[notesCol]) || undefined : undefined,
    });
  }

  if (lateEarlyCol === -1 && restoredLateEarlyFromSummaryCount > 0) {
    warnings.push(
      `Sheet ${sheetType}: Đã tự động đồng bộ cột "Đi muộn về sớm (giờ)" từ sheet Tổng hợp cho ${restoredLateEarlyFromSummaryCount} nhân viên.`
    );
  }

  return { employees, warnings, month, year, companyName };
}

function isAlreadyExportedDetailedWorkbook(workbook: XLSX.WorkBook): boolean {
  const normNames = workbook.SheetNames.map((n) => normHeader(n));
  if (
    normNames.some((n) => n.startsWith('chi tiet t')) ||
    normNames.includes('doi chieu buoc 2') ||
    normNames.includes('chi tiet kem doi chieu')
  ) {
    return true;
  }

  // Also inspect first sheet header row for the 7-8 detailed output columns
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return false;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
  const topHeaders = (rows[0] || []).map((c) => normHeader(c));
  return (
    topHeaders.includes('ma nhan vien') &&
    topHeaders.includes('gio vao') &&
    topHeaders.includes('gio ra')
  );
}

interface SheetInspection {
  name: string;
  matrix: CellInfo[][];
  hasDayCols: boolean;
  hasShiftSignals: boolean;
  hasSummarySignals: boolean;
}

function inspectSheetStructure(name: string, matrix: CellInfo[][]): SheetInspection {
  const { headerRowIdx, empCodeCol, nameCol } = findHeaderAnchorRow(matrix);
  if (headerRowIdx === -1) {
    return {
      name,
      matrix,
      hasDayCols: false,
      hasShiftSignals: false,
      hasSummarySignals: false,
    };
  }

  const dataStartRow = findDataStartRow(matrix, headerRowIdx, empCodeCol, nameCol);
  const maxCols = Math.max(
    ...matrix.slice(headerRowIdx, dataStartRow + 1).map((r) => r?.length || 0),
    0
  );

  let dayCount = 0;
  let hasShiftCols = false;
  for (let c = nameCol + 1; c < maxCols; c++) {
    const tokens = buildColumnHeaderTokens(matrix, headerRowIdx, dataStartRow, c);
    if (tokens.includes('c1') || tokens.includes('c2') || tokens.includes('c3') || tokens.includes('may')) {
      hasShiftCols = true;
    }
    const d = extractDayNumber(matrix[headerRowIdx]?.[c]) ?? extractDayNumber(matrix[headerRowIdx + 1]?.[c]);
    if (d !== null && d >= 1 && d <= 28) {
      dayCount++;
    }
  }

  // Also sample first 10 data rows for C1/C2/C3 cell values
  let shiftCellHits = 0;
  for (let r = dataStartRow; r < Math.min(matrix.length, dataStartRow + 10); r++) {
    for (let c = nameCol + 1; c < Math.min(maxCols, nameCol + 35); c++) {
      const v = getCellText(matrix[r]?.[c]).toUpperCase();
      if (v === 'C1' || v === 'C2' || v === 'C3') {
        shiftCellHits++;
      }
    }
  }

  return {
    name,
    matrix,
    hasDayCols: dayCount >= 15,
    hasShiftSignals: hasShiftCols || shiftCellHits >= 3,
    hasSummarySignals: dayCount < 5,
  };
}

export function computeWorkbookSignatureSeed(
  year: number,
  month: number,
  hcEmployees: ParsedEmployeeRow[],
  sxEmployees: ParsedEmployeeRow[]
): number {
  let h = 2166136261 >>> 0;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };

  feed(`${year}-${month}|HC:${hcEmployees.length}|SX:${sxEmployees.length}`);
  for (const emp of [...hcEmployees, ...sxEmployees]) {
    const daysKey = Object.entries(emp.dailyCells)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([d, v]) => `${d}:${v}`)
      .join(',');
    feed(`|${emp.sheetType}:${emp.employeeCode}:${emp.lateEarlyHours.toFixed(4)}:${daysKey}`);
  }

  return (h >>> 0) || (year * 100 + month);
}

export async function parseUploadedExcelFile(file: File): Promise<ParsedWorkbookData> {
  const originalBuffer = await file.arrayBuffer();
  // Pass a copy to XLSX.read so originalBuffer remains 100% untouched byte-for-byte
  const bufferCopy = originalBuffer.slice(0);
  const workbook = XLSX.read(bufferCopy, { type: 'array', cellDates: false });

  if (isAlreadyExportedDetailedWorkbook(workbook)) {
    throw new Error(
      'Bạn đang tải lên file Bảng chấm công Chi tiết (file kết quả đầu ra). Vui lòng chọn file Bảng chấm công Tổng hợp gốc gồm 3 sheet (Tổng hợp, HC, SX).'
    );
  }

  const sheetNames = workbook.SheetNames;
  const warnings: string[] = [];

  const matrixBySheet: Record<string, CellInfo[][]> = {};
  const inspections: SheetInspection[] = sheetNames.map((name) => {
    const mat = extractSheetMatrix(workbook.Sheets[name]);
    matrixBySheet[name] = mat;
    return inspectSheetStructure(name, mat);
  });

  let summarySheetName: string | undefined;
  let hcSheetName: string | undefined;
  let sxSheetName: string | undefined;

  // Step 1: Match by normalized Vietnamese / abbreviated sheet tab names
  for (const name of sheetNames) {
    const n = normHeader(name);
    const words = n.split(' ');
    if (
      !hcSheetName &&
      (n === 'hc' || words.includes('hc') || n.includes('hanh chinh'))
    ) {
      hcSheetName = name;
    } else if (
      !sxSheetName &&
      (n === 'sx' || words.includes('sx') || n.includes('san xuat'))
    ) {
      sxSheetName = name;
    } else if (
      !summarySheetName &&
      (n.includes('tong hop') || n === 'th' || words.includes('th'))
    ) {
      summarySheetName = name;
    }
  }

  // Step 2: Content-aware fallback for any unmatched sheets (never blindly assume [0, 1, 2] if content disagrees!)
  for (const ins of inspections) {
    if (ins.name === hcSheetName || ins.name === sxSheetName || ins.name === summarySheetName) {
      continue;
    }
    if (!summarySheetName && ins.hasSummarySignals && !ins.hasDayCols) {
      summarySheetName = ins.name;
    } else if (!sxSheetName && ins.hasDayCols && ins.hasShiftSignals) {
      sxSheetName = ins.name;
    } else if (!hcSheetName && ins.hasDayCols && !ins.hasShiftSignals) {
      hcSheetName = ins.name;
    }
  }

  let summaryDeptByEmpCode: Record<string, string> = {};
  let summaryMetaByEmpCode: Record<string, SummaryEmployeeMeta> = {};

  const fromFileName = extractMonthYearFromString(file.name);
  let detectedMonth: number | undefined = fromFileName.month;
  let detectedYear: number | undefined = fromFileName.year;
  let companyName = 'CÔNG TY TNHH SẢN XUẤT BAO BÌ, TÚI SIÊU THỊ XUẤT KHẨU QUANG TRUNG';

  if (summarySheetName) {
    const sumRes = parseSummarySheet(matrixBySheet[summarySheetName]);
    summaryDeptByEmpCode = sumRes.deptByEmpCode;
    summaryMetaByEmpCode = sumRes.metaByEmpCode;
    if (sumRes.month) detectedMonth = sumRes.month;
    if (sumRes.year) detectedYear = sumRes.year;
    if (sumRes.companyName) companyName = sumRes.companyName;
  }

  let hcEmployees: ParsedEmployeeRow[] = [];
  let sxEmployees: ParsedEmployeeRow[] = [];

  if (hcSheetName) {
    const hcRes = parseAttendanceSheet(
      matrixBySheet[hcSheetName],
      'HC',
      summaryDeptByEmpCode,
      summaryMetaByEmpCode
    );
    hcEmployees = hcRes.employees;
    warnings.push(...hcRes.warnings);
    if (hcRes.month) detectedMonth = hcRes.month;
    if (hcRes.year) detectedYear = hcRes.year;
    if (hcRes.companyName) companyName = hcRes.companyName;
  } else {
    warnings.push('Không tìm thấy sheet "HC" trong file tải lên.');
  }

  if (sxSheetName) {
    const sxRes = parseAttendanceSheet(
      matrixBySheet[sxSheetName],
      'SX',
      summaryDeptByEmpCode,
      summaryMetaByEmpCode
    );
    sxEmployees = sxRes.employees;
    warnings.push(...sxRes.warnings);
    if (!detectedMonth && sxRes.month) detectedMonth = sxRes.month;
    if (!detectedYear && sxRes.year) detectedYear = sxRes.year;
    if (!hcSheetName && sxRes.companyName) companyName = sxRes.companyName;
  } else {
    warnings.push('Không tìm thấy sheet "SX" trong file tải lên.');
  }

  // Deterministic month/year fallback (never depend on changing system clock!)
  if (!detectedYear) detectedYear = 2026;
  if (!detectedMonth) {
    const hasDay31 = [...hcEmployees, ...sxEmployees].some((e) => Boolean(e.dailyCells[31]));
    detectedMonth = hasDay31 ? 1 : 2;
  }

  const discoveredDepartments = buildDiscoveredDepartments([...hcEmployees, ...sxEmployees]);
  const contentSignatureSeed = computeWorkbookSignatureSeed(
    detectedYear,
    detectedMonth,
    hcEmployees,
    sxEmployees
  );

  return {
    fileName: file.name,
    companyName,
    detectedMonth,
    detectedYear,
    contentSignatureSeed,
    hcEmployees,
    sxEmployees,
    summaryDeptByEmpCode,
    summaryMetaByEmpCode,
    discoveredDepartments,
    sheetNames,
    warnings,
    isSampleData: false,
    originalFileBuffer: originalBuffer,
  };
}

export function exportDetailedAttendanceToExcel(
  records: DetailedAttendanceRecord[],
  reconciliations: EmployeeReconciliationSummary[],
  config: GeneratorConfig,
  includeAuditSheets = true
): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Exact 8 required columns including Ghi chú
  const mainHeaders = [
    'Mã nhân viên',
    'Tên nhân viên',
    'Mã bộ phận',
    'Tên bộ phận',
    'Ngày',
    'Giờ vào',
    'Giờ ra',
    'Ghi chú',
  ];

  const mainRows = records.map((r) => [
    r.employeeCode,
    r.fullName,
    r.departmentCode,
    r.departmentName,
    r.dateStr,
    r.checkIn,
    r.checkOut,
    r.note,
  ]);

  const wsMain = XLSX.utils.aoa_to_sheet([mainHeaders, ...mainRows]);
  wsMain['!cols'] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(
    wb,
    wsMain,
    `Chi tiet T${config.month}-${config.year}`
  );

  if (includeAuditSheets && !config.exportOnlySingleStandardSheet) {
    // Sheet 2: Employee-level Step 2 Reconciliation
    const recHeaders = [
      'Khối',
      'Mã nhân viên',
      'Tên nhân viên',
      'Mã bộ phận',
      'Tên bộ phận',
      'Số ngày đi làm',
      'Đi muộn về sớm Bảng gốc (giờ)',
      'Quy tắc phân bổ ngày',
      'Số ngày phát sinh thực tế',
      'Đi muộn về sớm Quy đổi (phút)',
      'Tổng phút Đi muộn đã gán',
      'Tổng phút Về sớm đã gán',
      'Tổng giờ Đi muộn/Về sớm đã sinh',
      'Tăng ca HC đã sinh (giờ)',
      'Trạng thái đối chiếu',
    ];
    const recRows = reconciliations.map((rec) => [
      rec.sheetType,
      rec.employeeCode,
      rec.fullName,
      rec.departmentCode,
      rec.departmentName,
      rec.workingDaysCount,
      Number(rec.targetLateEarlyHours.toFixed(2)),
      rec.expectedDayRuleText,
      rec.incidentDaysCount,
      rec.targetLateEarlyMinutes,
      rec.allocatedLateMinutes,
      rec.allocatedEarlyMinutes,
      Number(rec.allocatedTotalHours.toFixed(2)),
      rec.sheetType === 'HC' ? Number(rec.hcGeneratedOvertimeHours.toFixed(2)) : 0,
      rec.isLateEarlyMatched ? 'Khớp 100%' : rec.note || 'Lệch',
    ]);
    const wsRec = XLSX.utils.aoa_to_sheet([recHeaders, ...recRows]);
    wsRec['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 24 },
      { wch: 14 },
      { wch: 24 },
      { wch: 15 },
      { wch: 24 },
      { wch: 24 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 20 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsRec, 'Doi chieu Buoc 2');

    // Sheet 3: Row-by-row detailed audit
    const auditHeaders = [
      'STT',
      'Khối',
      'Mã nhân viên',
      'Tên nhân viên',
      'Mã bộ phận',
      'Tên bộ phận',
      'Ngày',
      'Ký hiệu gốc',
      'Ca áp dụng',
      'Giờ vào',
      'Giờ ra',
      'Ghi chú',
      'Đi muộn (phút)',
      'Về sớm (phút)',
      'Tăng ca ngày HC (giờ)',
    ];
    const auditRows = records.map((r) => [
      r.rowNumber,
      r.sheetType,
      r.employeeCode,
      r.fullName,
      r.departmentCode,
      r.departmentName,
      r.dateStr,
      r.rawCode,
      r.shiftLabel,
      r.checkIn,
      r.checkOut,
      r.note,
      r.lateMinutes || '',
      r.earlyMinutes || '',
      r.overtimeHoursDaily || '',
    ]);
    const wsAudit = XLSX.utils.aoa_to_sheet([auditHeaders, ...auditRows]);
    wsAudit['!cols'] = [
      { wch: 8 },
      { wch: 8 },
      { wch: 14 },
      { wch: 24 },
      { wch: 14 },
      { wch: 24 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAudit, 'Chi tiet kem doi chieu');
  }

  const filename = `Bang_Cham_Cong_Chi_Tiet_T${String(config.month).padStart(2, '0')}_${config.year}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportSampleThreeSheetWorkbook(data: ParsedWorkbookData): void {
  // CRITICAL DATA INTEGRITY GUARD:
  // If the user uploaded a real Excel file, download their untouched original file bytes
  // instead of reconstructing/overwriting any columns or formulas!
  if (data.originalFileBuffer) {
    const blob = new Blob([data.originalFileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const baseName = data.fileName.replace(/\.[^.]+$/, '');
    link.download = `${baseName}_BanGoc.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const wb = XLSX.utils.book_new();
  const dayHeaders = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

  // 1. Sheet Tổng hợp
  const sumTitle1 = ['', data.companyName];
  const sumTitle2 = ['', `BẢNG CÔNG THÁNG ${data.detectedMonth}/${data.detectedYear}`];
  const sumHeader = [
    'STT',
    'Mã NV',
    'Họ tên',
    'Bộ phận',
    'Lễ',
    'Phép',
    'Ốm, VR, TS',
    'Tổng công thực tế',
    'Tổng công',
    'Phụ cấp làm đêm 30%',
    'Tăng ca',
    'Đi muộn về sớm (giờ)',
    'Ghi chú',
  ];
  const allEmps = [...data.hcEmployees, ...data.sxEmployees];
  const sumRows = allEmps.map((e, i) => [
    i + 1,
    e.employeeCode,
    e.fullName,
    e.summaryDeptName || e.rawDeptOrMachine,
    e.holidays,
    e.paidLeave,
    e.sickOrUnpaidLeave,
    e.actualWorkDays,
    e.totalWorkDays,
    e.nightAllowanceHours || 0,
    e.overtimeHours,
    Number(e.lateEarlyHours.toFixed(2)),
    e.notes || '',
  ]);
  const wsSum = XLSX.utils.aoa_to_sheet([sumTitle1, sumTitle2, sumHeader, ...sumRows]);
  XLSX.utils.book_append_sheet(wb, wsSum, 'Tổng hợp');

  // 2. Sheet HC
  const hcTitle = ['', `BẢNG CHẤM CÔNG HÀNH CHÍNH THÁNG ${data.detectedMonth}/${data.detectedYear}`];
  const hcHeader = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Bộ phận',
    ...dayHeaders,
    'Lễ',
    'Phép',
    'Ốm, VR, TS',
    'Công thực tế',
    'Tổng công',
    'Tăng ca',
    'Đi muộn về sớm (giờ)',
  ];
  const hcRows = data.hcEmployees.map((e, i) => [
    i + 1,
    e.employeeCode,
    e.fullName,
    e.rawDeptOrMachine,
    ...Array.from({ length: 31 }, (_, idx) => e.dailyCells[idx + 1] ?? ''),
    e.holidays,
    e.paidLeave,
    e.sickOrUnpaidLeave,
    e.actualWorkDays,
    e.totalWorkDays,
    e.overtimeHours,
    Number(e.lateEarlyHours.toFixed(2)),
  ]);
  const wsHC = XLSX.utils.aoa_to_sheet([hcTitle, hcHeader, ...hcRows]);
  XLSX.utils.book_append_sheet(wb, wsHC, 'HC');

  // 3. Sheet SX
  const sxTitle = ['', `BẢNG CHẤM CÔNG SẢN XUẤT THÁNG ${data.detectedMonth}/${data.detectedYear}`];
  const sxHeader = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Máy',
    ...dayHeaders,
    'C1',
    'C2',
    'C3',
    'Lễ',
    'Phép',
    'Ốm, VR, TS',
    'Tổng công thực tế',
    'Tổng công',
    'Phụ cấp làm đêm 30%',
    'Tăng ca',
    'Tăng ca 150%',
    'Tăng ca 200%',
    'Tăng ca 270%',
    'Tăng ca 300%',
    'Tăng ca 390%',
    'Đi muộn về sớm (giờ)',
  ];
  const sxRows = data.sxEmployees.map((e, i) => {
    const c1Count = Object.values(e.dailyCells).filter((v) => v.toUpperCase().startsWith('C1')).length;
    const c2Count = Object.values(e.dailyCells).filter((v) => v.toUpperCase().startsWith('C2')).length;
    const c3Count = Object.values(e.dailyCells).filter((v) => v.toUpperCase().startsWith('C3')).length;
    return [
      i + 1,
      e.employeeCode,
      e.fullName,
      e.rawDeptOrMachine,
      ...Array.from({ length: 31 }, (_, idx) => e.dailyCells[idx + 1] ?? ''),
      c1Count,
      c2Count,
      c3Count,
      e.holidays,
      e.paidLeave,
      e.sickOrUnpaidLeave,
      e.actualWorkDays,
      e.totalWorkDays,
      e.nightAllowanceHours,
      0,
      0,
      0,
      0,
      0,
      0,
      Number(e.lateEarlyHours.toFixed(2)),
    ];
  });
  const wsSX = XLSX.utils.aoa_to_sheet([sxTitle, sxHeader, ...sxRows]);
  XLSX.utils.book_append_sheet(wb, wsSX, 'SX');

  XLSX.writeFile(wb, `BCC_Mau_3_Sheet_T${String(data.detectedMonth).padStart(2, '0')}_${data.detectedYear}.xlsx`);
}
