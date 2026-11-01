import * as XLSX from 'xlsx';
import { ParsedEmployeeRow, ParsedWorkbookData } from '../types/attendance';
import { buildDiscoveredDepartments } from './departmentHelper';
import { computeWorkbookSignatureSeed } from './excelParser';

/**
 * Loads the attached Quang Trung Packaging Factory summary dataset (/assets/aistudio/BCC_Th_ng_1_fb28e9b4.2026)
 * and constructs matching HC + SX sheets for immediate demonstration before the user uploads their full 3-sheet .xlsx file.
 */
export async function loadInitialFactorySampleData(): Promise<ParsedWorkbookData> {
  let rows: string[][] = [];
  try {
    const res = await fetch('/assets/aistudio/BCC_Th_ng_1_fb28e9b4.2026');
    if (res.ok) {
      const csvText = await res.text();
      const wb = XLSX.read(csvText, { type: 'string' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: '' });
    }
  } catch {
    // Fallback handled below
  }

  const companyName =
    rows[0]?.[1]?.trim() ||
    'CÔNG TY TNHH SẢN XUẤT BAO BÌ, TÚI SIÊU THỊ XUẤT KHẨU QUANG TRUNG';
  const detectedMonth = 1;
  const detectedYear = 2026;

  const hcEmployees: ParsedEmployeeRow[] = [];
  const sxEmployees: ParsedEmployeeRow[] = [];
  const summaryDeptByEmpCode: Record<string, string> = {};

  // Sundays in Jan 2026: 4, 11, 18, 25 (31 days total; 1/1 is New Year Holiday "L"; 26 working days Mon-Sat)
  const sundaysJan2026 = new Set([4, 11, 18, 25]);

  const dataRows = rows.slice(3).filter((r) => r[1] && String(r[1]).trim().startsWith('NM'));

  dataRows.forEach((r, idx) => {
    const empCode = String(r[1] ?? '').trim();
    const fullName = String(r[2] ?? '').trim();
    const dept = String(r[3] ?? '').trim();
    const holidays = parseFloat(String(r[4] ?? '0')) || 0;
    const paidLeave = parseFloat(String(r[5] ?? '0')) || 0;
    const sickLeave = parseFloat(String(r[6] ?? '0')) || 0;
    const actualWork = parseFloat(String(r[8] ?? '0').trim()) || 0;
    const totalWork = parseFloat(String(r[9] ?? '0').trim()) || 0;
    const nightHours = parseFloat(String(r[10] ?? '0').trim()) || 0;
    const ot150 = parseFloat(String(r[12] ?? '0').trim()) || 0;
    const lateEarly = parseFloat(String(r[17] ?? '0').replace('-', '').trim()) || 0;
    const notes = String(r[18] ?? '').trim();

    summaryDeptByEmpCode[empCode.toUpperCase()] = dept;

    const isSX =
      nightHours > 0 ||
      /thổi vải|thoi vai|bảo vệ|bao ve/i.test(dept);

    const dailyCells: Record<number, string> = {};

    if (!isSX) {
      let remHoliday = Math.round(holidays);
      let remPaid = Math.round(paidLeave);
      let remSick = Math.round(sickLeave);

      // First pass: assign L, N, TS/Ô, P, and base 8h workdays
      const workDays: number[] = [];
      for (let d = 1; d <= 31; d++) {
        if (remSick >= 31) {
          dailyCells[d] = 'TS';
          continue;
        }
        if (d === 1 && remHoliday > 0) {
          dailyCells[d] = 'L';
          remHoliday--;
          continue;
        }
        if (sundaysJan2026.has(d)) {
          dailyCells[d] = 'N';
          continue;
        }
        if (remSick > 0 && d >= 31 - remSick - Math.floor(remSick / 6)) {
          dailyCells[d] = notes.toLowerCase().includes('ts') ? 'TS' : 'Ô';
          remSick--;
          continue;
        }
        if (remPaid > 0 && (d === (idx % 18) + 6 || d >= 28)) {
          dailyCells[d] = 'P';
          remPaid--;
          continue;
        }
        dailyCells[d] = '8';
        workDays.push(d);
      }

      // Second pass: embed exact HC overtime hours into daily numeric cells (e.g. 8 -> 10 for +2h OT)
      let remOtHours = Math.round(ot150);
      let wIdx = 0;
      while (remOtHours > 0 && workDays.length > 0 && wIdx < workDays.length * 2) {
        const targetDay = workDays[(wIdx * 2) % workDays.length];
        const currentHours = parseInt(dailyCells[targetDay], 10) || 8;
        const add = Math.min(2, remOtHours);
        if (currentHours + add <= 12) {
          dailyCells[targetDay] = String(currentHours + add);
          remOtHours -= add;
        }
        wIdx++;
      }

      hcEmployees.push({
        id: `HC-${empCode}-${idx}`,
        orderIndex: hcEmployees.length,
        employeeCode: empCode,
        fullName,
        sheetType: 'HC',
        rawDeptOrMachine: dept,
        summaryDeptName: dept,
        dailyCells,
        holidays,
        paidLeave,
        sickOrUnpaidLeave: sickLeave,
        actualWorkDays: actualWork,
        totalWorkDays: totalWork,
        overtimeHours: ot150,
        lateEarlyHours: lateEarly,
        nightAllowanceHours: 0,
        notes,
      });
    } else {
      // SX shift workers (including Bảo vệ): C1, C2, C3 (8h shifts, no overtime) + N rest days
      const isSecurity = /bảo vệ|bao ve/i.test(dept);
      const machineIndex = (sxEmployees.length % 6) + 1;
      const machineCode =
        empCode === 'NM088' ? 'M3' : isSecurity ? 'BV' : `M${machineIndex}`;

      let remHoliday = Math.round(holidays);
      let remPaid = Math.round(paidLeave);
      let remNightShifts = Math.round(nightHours / 8);
      let remWorkDays = Math.round(actualWork);

      for (let d = 1; d <= 31; d++) {
        if (d === 1 && remHoliday > 0) {
          dailyCells[d] = 'L';
          remHoliday--;
          continue;
        }
        if (sundaysJan2026.has(d)) {
          dailyCells[d] = 'N';
          continue;
        }
        if (remPaid > 0 && d === ((sxEmployees.length * 3) % 22) + 6) {
          dailyCells[d] = 'P';
          remPaid--;
          continue;
        }
        if (remWorkDays <= 0) {
          dailyCells[d] = 'N';
          continue;
        }

        const weekNum = Math.floor((d - 1) / 7);
        if (remNightShifts > 0 && (weekNum === 2 || weekNum === 3)) {
          dailyCells[d] = 'C3';
          remNightShifts--;
        } else if ((weekNum + sxEmployees.length) % 2 === 0) {
          dailyCells[d] = 'C1';
        } else {
          dailyCells[d] = 'C2';
        }
        remWorkDays--;
      }

      sxEmployees.push({
        id: `SX-${empCode}-${idx}`,
        orderIndex: sxEmployees.length,
        employeeCode: empCode,
        fullName,
        sheetType: 'SX',
        rawDeptOrMachine: machineCode,
        summaryDeptName: dept,
        dailyCells,
        holidays,
        paidLeave,
        sickOrUnpaidLeave: sickLeave,
        actualWorkDays: actualWork,
        totalWorkDays: totalWork,
        overtimeHours: 0,
        lateEarlyHours: lateEarly,
        nightAllowanceHours: nightHours,
        notes,
      });
    }
  });

  const discoveredDepartments = buildDiscoveredDepartments([...hcEmployees, ...sxEmployees]);
  const contentSignatureSeed = computeWorkbookSignatureSeed(
    detectedYear,
    detectedMonth,
    hcEmployees,
    sxEmployees
  );

  return {
    fileName: 'BCC_Tháng_1.2026 (Dữ liệu mẫu 96 NV Quang Trung)',
    companyName,
    detectedMonth,
    detectedYear,
    contentSignatureSeed,
    hcEmployees,
    sxEmployees,
    summaryDeptByEmpCode,
    discoveredDepartments,
    sheetNames: ['Tổng hợp', 'HC', 'SX'],
    warnings: [],
    isSampleData: true,
  };
}
