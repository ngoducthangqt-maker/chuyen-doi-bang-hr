import { DepartmentMapping, ParsedEmployeeRow, SheetType } from '../types/attendance';

const KNOWN_DEPT_NAMES: Record<string, { code: string; name: string }> = {
  QLSX: { code: 'QLSX', name: 'Quản lý sản xuất' },
  'KE HOACH SX': { code: 'KHSX', name: 'Kế hoạch sản xuất' },
  KHSX: { code: 'KHSX', name: 'Kế hoạch sản xuất' },
  HSE: { code: 'HSE', name: 'An toàn - Môi trường (HSE)' },
  'TRUONG KHO': { code: 'KHO', name: 'Trưởng kho' },
  'DIEU VAN': { code: 'ĐV', name: 'Điều vận' },
  'KHO VAN': { code: 'KV', name: 'Kho vận' },
  'KE TOAN': { code: 'KT', name: 'Kế toán' },
  HCNS: { code: 'HCNS', name: 'Hành chính nhân sự' },
  KCS: { code: 'KCS', name: 'Kiểm soát chất lượng (KCS)' },
  'CAT DAN': { code: 'CD', name: 'Tổ Cắt dán' },
  'IN VAI': { code: 'IV', name: 'Tổ In vải' },
  'TO MAY': { code: 'TM', name: 'Tổ May' },
  'CO DIEN': { code: 'CĐ', name: 'Tổ Cơ điện' },
  'HANH CHINH': { code: 'HC', name: 'Hành chính' },
  'TRO LY SX': { code: 'TLSX', name: 'Trợ lý sản xuất' },
  'THIET KE': { code: 'TK', name: 'Thiết kế' },
  'PHO GDNM': { code: 'BGĐ', name: 'Phó Giám đốc Nhà máy' },
  'PHO GĐNM': { code: 'BGĐ', name: 'Phó Giám đốc Nhà máy' },
  'THOI VAI': { code: 'TV', name: 'Tổ Thổi vải' },
  'BAO VE': { code: 'BV', name: 'Tổ Bảo vệ' },
  BV: { code: 'BV', name: 'Tổ Bảo vệ' },
};

export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
}

export function inferDefaultDepartment(
  rawDeptOrMachine: string,
  summaryDeptName: string | undefined,
  sheetType: SheetType
): { code: string; name: string } {
  const raw = (rawDeptOrMachine || '').trim();
  const sumDept = (summaryDeptName || '').trim();

  if (!raw && !sumDept) {
    return sheetType === 'HC'
      ? { code: 'HC', name: 'Khối Hành chính' }
      : { code: 'SX', name: 'Khối Sản xuất' };
  }

  // Machine code in SX sheet like M1, M2, M3, Máy 1, Máy 03...
  const machineMatch = raw.match(/^(?:M|MÁY|MAY)\s*0*(\d+[A-Z]?)$/i);
  if (machineMatch) {
    const machineNum = machineMatch[1].toUpperCase();
    const code = `M${machineNum}`;
    if (sumDept) {
      return { code, name: `${sumDept} - Máy ${machineNum}` };
    }
    return { code, name: `Sản xuất - Máy ${machineNum}` };
  }

  const normalizedKey = removeVietnameseTones(raw).toUpperCase().replace(/\s+/g, ' ');
  const known = KNOWN_DEPT_NAMES[normalizedKey];

  // Keep user's exact short code if raw already looks like an uppercase code (e.g. QLSX, HCNS, KCS, HSE, M3)
  const isShortCode = /^[A-ZĐ0-9_-]{2,8}$/.test(raw);

  if (known) {
    return {
      code: isShortCode ? raw : known.code,
      name: sumDept && sumDept.toLowerCase() !== raw.toLowerCase() ? sumDept : known.name,
    };
  }

  if (isShortCode) {
    return {
      code: raw,
      name: sumDept || raw,
    };
  }

  // Generate clean acronym code from multi-word Vietnamese department name (e.g. "Kế hoạch sx" -> "KHSX")
  const words = removeVietnameseTones(raw)
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
  const acronym =
    words.length > 1
      ? words.map((w) => (w === 'SX' ? 'SX' : w[0])).join('')
      : raw.toUpperCase().slice(0, 6);

  // Title-case first letter nicely
  const formattedName = raw.charAt(0).toUpperCase() + raw.slice(1);
  return {
    code: acronym || raw,
    name: sumDept || formattedName,
  };
}

export function buildDiscoveredDepartments(
  employees: ParsedEmployeeRow[]
): DepartmentMapping[] {
  const map = new Map<string, DepartmentMapping>();

  for (const emp of employees) {
    const { code, name } = inferDefaultDepartment(
      emp.rawDeptOrMachine,
      emp.summaryDeptName,
      emp.sheetType
    );
    const key = `${emp.sheetType}::${(emp.rawDeptOrMachine || '').trim().toUpperCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        code,
        name,
        sourceSheet: emp.sheetType,
      });
    }
  }

  return Array.from(map.values());
}

export function resolveEmployeeDepartment(
  emp: ParsedEmployeeRow,
  customOverrides: Record<string, { code: string; name: string }> = {}
): { departmentCode: string; departmentName: string } {
  const rawKey = `${emp.sheetType}::${(emp.rawDeptOrMachine || '').trim().toUpperCase()}`;
  if (customOverrides && customOverrides[rawKey]) {
    return {
      departmentCode: customOverrides[rawKey].code,
      departmentName: customOverrides[rawKey].name,
    };
  }
  const inferred = inferDefaultDepartment(
    emp.rawDeptOrMachine,
    emp.summaryDeptName,
    emp.sheetType
  );
  return {
    departmentCode: inferred.code,
    departmentName: inferred.name,
  };
}

export function getDepartmentOverrideKey(sheetType: SheetType, rawDeptOrMachine: string): string {
  return `${sheetType}::${(rawDeptOrMachine || '').trim().toUpperCase()}`;
}
