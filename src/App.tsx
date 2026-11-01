import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
  Sliders,
  Table2,
  Upload,
} from 'lucide-react';
import {
  DetailedAttendanceRecord,
  GeneratorConfig,
  ParsedWorkbookData,
} from './types/attendance';
import {
  DEFAULT_GENERATOR_CONFIG,
  generateDetailedAttendanceWithReconciliation,
  getDaysInMonth,
} from './utils/attendanceGenerator';
import {
  exportDetailedAttendanceToExcel,
  exportSampleThreeSheetWorkbook,
  parseUploadedExcelFile,
} from './utils/excelParser';
import { loadInitialFactorySampleData } from './utils/sampleData';
import { DetailedTablePanel } from './components/DetailedTablePanel';
import { SourceSheetsPanel } from './components/SourceSheetsPanel';
import { ConfigRulesPanel } from './components/ConfigRulesPanel';
import { ReconciliationPanel } from './components/ReconciliationPanel';

type ActiveSection = 'detailed' | 'reconcile' | 'source' | 'config' | 'guide';

export default function App() {
  const [workbookData, setWorkbookData] = useState<ParsedWorkbookData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('detailed');
  const [config, setConfig] = useState<GeneratorConfig>(DEFAULT_GENERATOR_CONFIG);
  const [deptOverrides, setDeptOverrides] = useState<
    Record<string, { code: string; name: string }>
  >({});
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadSessionKey, setUploadSessionKey] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    loadInitialFactorySampleData()
      .then((sample) => {
        if (!mounted) return;
        setWorkbookData(sample);
        setConfig({
          ...DEFAULT_GENERATOR_CONFIG,
          month: sample.detectedMonth,
          year: sample.detectedYear,
          seed: sample.contentSignatureSeed,
        });
      })
      .catch(() => {
        if (mounted) {
          setErrorMsg('Không thể tải dữ liệu khởi tạo. Vui lòng tải file Excel của bạn lên.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateConfig = (patch: Partial<GeneratorConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const parsed = await parseUploadedExcelFile(file);
      if (parsed.hcEmployees.length === 0 && parsed.sxEmployees.length === 0) {
        setErrorMsg(
          'File tải lên chưa có dữ liệu ở sheet "HC" hoặc "SX". Hãy kiểm tra file Excel có đủ 3 sheet (Tổng hợp, HC, SX).'
        );
      } else {
        setWorkbookData(parsed);
        setDeptOverrides({});
        // Full deterministic reset from DEFAULT_GENERATOR_CONFIG so uploading the same file ALWAYS yields 100% identical results
        setConfig({
          ...DEFAULT_GENERATOR_CONFIG,
          month: parsed.detectedMonth,
          year: parsed.detectedYear,
          seed: parsed.contentSignatureSeed,
        });
        setUploadSessionKey((k) => k + 1);
        setActiveSection('detailed');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Định dạng file không hợp lệ. Vui lòng chọn file .xlsx hoặc .xls.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const { records: detailedRecords, reconciliations } = useMemo(() => {
    if (!workbookData) {
      return { records: [], reconciliations: [] };
    }
    return generateDetailedAttendanceWithReconciliation(
      workbookData.hcEmployees,
      workbookData.sxEmployees,
      config,
      deptOverrides
    );
  }, [workbookData, config, deptOverrides]);

  const matchedEmpCount = useMemo(
    () => reconciliations.filter((r) => r.isLateEarlyMatched).length,
    [reconciliations]
  );

  const handleExport = (
    recordsToExport: DetailedAttendanceRecord[] = detailedRecords,
    onlyFiltered = false
  ) => {
    if (recordsToExport.length === 0) return;
    exportDetailedAttendanceToExcel(
      recordsToExport,
      reconciliations,
      config,
      !onlyFiltered
    );
  };

  const allEmployees = useMemo(
    () =>
      workbookData
        ? [...workbookData.hcEmployees, ...workbookData.sxEmployees]
        : [],
    [workbookData]
  );

  const totalSourceLateEarlyHours = useMemo(
    () => allEmployees.reduce((sum, emp) => sum + (emp.lateEarlyHours || 0), 0),
    [allEmployees]
  );

  const daysInMonth = getDaysInMonth(config.month, config.year);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Sidebar Navigation (264px desktop workspace) */}
      <aside className="w-full lg:w-[264px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              HR TimeSync
            </span>
          </div>

          <nav className="p-3 space-y-1">
            {(
              [
                {
                  id: 'detailed',
                  label: 'Bảng chi tiết Giờ vào - ra',
                  icon: Table2,
                },
                {
                  id: 'reconcile',
                  label: 'Đối chiếu Khớp số liệu',
                  icon: ClipboardCheck,
                },
                {
                  id: 'source',
                  label: 'Dữ liệu gốc (HC & SX)',
                  icon: Layers,
                },
                {
                  id: 'config',
                  label: 'Cấu hình Ca & Bộ phận',
                  icon: Sliders,
                },
                {
                  id: 'guide',
                  label: 'Quy tắc nghiệp vụ',
                  icon: Info,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Dropzone Upload Box in Sidebar */}
          <div className="px-4 pt-3 pb-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-lg border border-dashed cursor-pointer transition-colors text-center ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'
              }`}
            >
              <Upload className="w-5 h-5 text-slate-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Tải file Excel chấm công
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Kéo thả hoặc chọn file <span className="font-mono">.xlsx</span> gồm 3 sheet Tổng hợp, HC, SX
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            {workbookData && (
              <button
                type="button"
                onClick={() => exportSampleThreeSheetWorkbook(workbookData)}
                className="mt-2.5 w-full py-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                {workbookData.isSampleData
                  ? 'Tải file mẫu 3 Sheet (.xlsx)'
                  : 'Tải bản sao nguyên gốc (.xlsx)'}
              </button>
            )}
          </div>
        </div>

        <div className="hidden lg:block p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-800">
            Hoàn chỉnh Bước 1 & Bước 2
          </p>
          <p className="leading-relaxed">
            Khớp chính xác 100% số phút Đi muộn/Về sớm và giờ Tăng ca HC từ bảng tổng hợp.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* SaaS Top Bar Contract */}
        <header className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="truncate max-w-[260px] hidden sm:inline">
              Hành chính Nhân sự
            </span>
            <span className="hidden sm:inline" aria-hidden="true">/</span>
            <span className="font-semibold text-slate-900 truncate">
              Bảng công Tháng {config.month}/{config.year}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Chọn file Excel (.xlsx)
            </button>

            <button
              type="button"
              disabled={detailedRecords.length === 0}
              onClick={() => handleExport(detailedRecords, false)}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Xuất Excel Chi tiết (.xlsx)
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-6">
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3 text-sm text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {workbookData && workbookData.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-1 text-xs text-amber-900">
              {workbookData.warnings.map((w, idx) => (
                <p key={idx}>Lưu ý: {w}</p>
              ))}
            </div>
          )}

          {/* Top Summary Metrics Strip */}
          {workbookData && !loading && (
            <div className="bg-white border border-slate-200 rounded-lg px-6 py-4 flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-1 min-w-0">
                <p className="text-xs text-slate-500 truncate">
                  {workbookData.companyName}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-900">
                    {workbookData.fileName}
                  </span>
                  {workbookData.isSampleData && (
                    <>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="text-xs text-blue-700">
                        Đang hiển thị dữ liệu mẫu từ 96 NV đính kèm — hãy tải file .xlsx 3 sheet thực tế lên để xuất bảng công
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-right font-mono tabular-nums">
                <div>
                  <p className="text-xs font-sans text-slate-500">Tổng nhân sự</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {allEmployees.length}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({workbookData.hcEmployees.length} HC · {workbookData.sxEmployees.length} SX)
                    </span>
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <p className="text-xs font-sans text-slate-500">Tổng giờ Đi muộn/Về sớm gốc</p>
                  <p className="text-lg font-semibold text-rose-700">
                    {totalSourceLateEarlyHours.toFixed(2)}h
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <p className="text-xs font-sans text-slate-500">Đối chiếu Đi muộn/Về sớm</p>
                  <p className="text-lg font-semibold text-emerald-700">
                    {matchedEmpCount}/{allEmployees.length} khớp
                  </p>
                </div>
                <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                <div>
                  <p className="text-xs font-sans text-slate-500">Tổng dòng chi tiết</p>
                  <p className="text-lg font-semibold text-blue-700">
                    {detailedRecords.length.toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="h-5 w-56 bg-slate-100 rounded animate-pulse" />
              <div className="space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            </div>
          ) : workbookData ? (
            <>
              {activeSection === 'detailed' && (
                <DetailedTablePanel
                  key={`detailed-${uploadSessionKey}`}
                  records={detailedRecords}
                  config={config}
                  onUpdateConfig={handleUpdateConfig}
                  onExportExcel={handleExport}
                />
              )}

              {activeSection === 'reconcile' && (
                <ReconciliationPanel
                  key={`reconcile-${uploadSessionKey}`}
                  reconciliations={reconciliations}
                  records={detailedRecords}
                />
              )}

              {activeSection === 'source' && (
                <SourceSheetsPanel
                  key={`source-${uploadSessionKey}`}
                  hcEmployees={workbookData.hcEmployees}
                  sxEmployees={workbookData.sxEmployees}
                  daysInMonth={daysInMonth}
                />
              )}

              {activeSection === 'config' && (
                <ConfigRulesPanel
                  key={`config-${uploadSessionKey}`}
                  config={config}
                  onUpdateConfig={handleUpdateConfig}
                  allEmployees={allEmployees}
                  deptOverrides={deptOverrides}
                  onUpdateDeptOverrides={setDeptOverrides}
                />
              )}

              {activeSection === 'guide' && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
                  <div className="border-b border-slate-200 pb-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Tổng hợp Quy tắc Nghiệp vụ Chấm công (Bước 1 & Bước 2)
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Ứng dụng chạy hoàn toàn trên trình duyệt (Client-side Web SPA), triển khai trực tiếp lên Vercel không cần cấu hình máy chủ.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-700">
                    <div className="space-y-3">
                      <h3 className="font-semibold text-slate-900">
                        01. Khung giờ ca làm việc & Ký hiệu nghỉ
                      </h3>
                      <ul className="space-y-2 text-slate-600 leading-relaxed list-disc pl-5">
                        <li>
                          <strong className="text-slate-900">Bảng HC (08:00 – 17:00)</strong>: Ngày đi làm bình thường (ô ghi <span className="font-mono">8</span> hoặc <span className="font-mono">X</span>) sinh giờ vào <span className="font-mono">07:45 – 07:59</span> và giờ ra <span className="font-mono">17:01 – 17:15</span>. Nếu có tăng ca ghi sẵn trong ngày (ví dụ ô ghi <span className="font-mono">10</span> = 8h chính + 2h tăng ca) thì giờ ra kết thúc sau <span className="font-mono">19:00</span> (<span className="font-mono">19:01 – 19:15</span>).
                        </li>
                        <li>
                          <strong className="text-slate-900">Bảng SX & Bảo vệ (Ca 8 tiếng, không tăng ca)</strong>: <span className="font-mono">C1</span> (<span className="font-mono">06:00 – 14:00</span>), <span className="font-mono">C2</span> (<span className="font-mono">14:00 – 22:00</span>), <span className="font-mono">C3</span> (<span className="font-mono">22:00 – 06:00</span>).
                        </li>
                        <li>
                          <strong className="text-slate-900">Ngày nghỉ & Chế độ</strong>: Giữ nguyên dòng <span className="font-mono">N</span> → <span className="font-medium text-slate-800">Nghỉ</span>, <span className="font-mono">L</span> → <span className="font-medium text-slate-800">Nghỉ lễ</span>, <span className="font-mono">P</span> → <span className="font-medium text-slate-800">Nghỉ phép</span>, <span className="font-mono">Ô</span> → <span className="font-medium text-slate-800">Nghỉ ốm</span>, <span className="font-mono">VR</span> → <span className="font-medium text-slate-800">Nghỉ việc riêng</span>, <span className="font-mono">TS</span> → <span className="font-medium text-slate-800">Nghỉ thai sản</span>, <span className="font-mono">NB</span> → <span className="font-medium text-slate-800">Nghỉ bù</span> tại cột Giờ vào.
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold text-slate-900">
                        02. Phân bổ Đi muộn về sớm & Cột Ghi chú (Bước 2)
                      </h3>
                      <ul className="space-y-2 text-slate-600 leading-relaxed list-disc pl-5">
                        <li>
                          <strong className="text-slate-900">Nếu tổng Đi muộn về sớm &le; 1 giờ</strong>: Đưa toàn bộ số phút vào <strong className="text-slate-900">duy nhất 1 ngày</strong> đi làm bất kỳ trong tháng.
                        </li>
                        <li>
                          <strong className="text-slate-900">Nếu tổng Đi muộn về sớm &gt; 1 giờ</strong>: Chia ngẫu nhiên tổng số phút vào <strong className="text-slate-900">&lt; 5 ngày</strong> (từ 2 đến 4 ngày đi làm bất kỳ trong tháng), đảm bảo cộng tổng khớp 100% với bảng tổng hợp.
                        </li>
                        <li>
                          <strong className="text-slate-900">Cột thứ 8 — Ghi chú</strong>: Bảng chi tiết trên màn hình và file Excel xuất ra có đầy đủ 8 cột (<span className="font-mono text-xs">Mã NV | Tên NV | Mã BP | Tên BP | Ngày | Giờ vào | Giờ ra | Ghi chú</span>), ghi rõ <strong className="text-slate-900">Đi muộn</strong> hoặc <strong className="text-slate-900">Về sớm</strong> tại đúng ngày phát sinh.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
