import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2,
  Users,
  GraduationCap,
  Armchair,
  FileText,
  FileSpreadsheet,
  Repeat,
  Grid,
  Layers,
  AlertTriangle,
  Play,
  ArrowRight,
  X,
  CheckCircle2,
  Calendar,
  Eye,
  Pencil,
  Check,
  Copy,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Student, Room, ExamSettings, ExamScheduleItem } from '../types';
import {
  buildRoomClassMatrix,
  buildCirculationSchedule,
  CirculationPattern,
  getExamDaysList,
  MatrixQuotaMap,
  MatrixSeatStyle,
  buildQuotaMapFromMatrix,
  generateEvenQuotaMap,
  generateSequentialQuotaMap,
  applySingleRoomPatternToAllRooms,
  applyQuotaMatrixToAllRooms,
  moveStudentToRoom,
  applyCustomDayMappingToStudents,
} from '../utils/circulation';
import { exportCirculationPdf } from '../utils/exportPdf';
import { exportCirculationToExcel } from '../utils/exportExcel';

interface ParticipantCirculationProps {
  students: Student[];
  rooms: Room[];
  settings: ExamSettings;
  schedules: ExamScheduleItem[];
  onRunAllocation: () => void;
  onSelectRoomForSeating: (roomId: string) => void;
  onApplyCirculationDay: (pattern: CirculationPattern, dayIndex: number, dayLabel: string) => void;
  onUpdateStudents: (updatedStudents: Student[], message: string) => void;
  onViewStudentCard: (student: Student) => void;
}

type CirculationViewTab = 'matrix' | 'by-class' | 'rotation';

interface CustomDayOverride {
  targetToSource: Record<string, string>; // targetRoomId -> sourceRoomId
  seatShift: number;
}

export const ParticipantCirculation: React.FC<ParticipantCirculationProps> = ({
  students,
  rooms,
  settings,
  schedules,
  onRunAllocation,
  onSelectRoomForSeating,
  onApplyCirculationDay,
  onUpdateStudents,
  onViewStudentCard,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<CirculationViewTab>('matrix');
  const [showGenderDetail, setShowGenderDetail] = useState<boolean>(false);
  const [highlightClass, setHighlightClass] = useState<string>('ALL');
  const [rotationPattern, setRotationPattern] = useState<CirculationPattern>('rotate-room-forward');
  const defaultDayCount = useMemo(() => {
    const detected = getExamDaysList(schedules).length;
    return Math.max(2, Math.min(10, detected));
  }, [schedules]);
  const [customDayCount, setCustomDayCount] = useState<number>(defaultDayCount);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // --- EDIT MODE: MATRIKS RUANG x KELAS ---
  const [isEditingMatrix, setIsEditingMatrix] = useState<boolean>(false);
  const [draftQuotaMap, setDraftQuotaMap] = useState<MatrixQuotaMap>({});
  const [matrixSeatStyle, setMatrixSeatStyle] = useState<MatrixSeatStyle>('interleave-class');

  // --- EDIT MODE: JADWAL ROTASI HARIAN ---
  const [isEditingRotation, setIsEditingRotation] = useState<boolean>(false);
  const [customDayOverrides, setCustomDayOverrides] = useState<Record<number, CustomDayOverride>>({});

  // Drill-down modal state for inspecting exact students in a Room x Class cell
  const [inspectCell, setInspectCell] = useState<{
    roomId: string;
    className: string;
  } | null>(null);

  const matrix = useMemo(
    () => buildRoomClassMatrix(students, rooms, settings.customClassOrder),
    [students, rooms, settings.customClassOrder]
  );

  const circulationSchedule = useMemo(
    () => buildCirculationSchedule(matrix, schedules, rotationPattern, customDayCount),
    [matrix, schedules, rotationPattern, customDayCount]
  );

  // Keep inspected cell live-synced with students/rooms when moving students individually
  const activeInspectData = useMemo(() => {
    if (!inspectCell) return null;
    const row = matrix.rows.find((r) => r.room.id === inspectCell.roomId);
    if (!row) return null;
    const cell = row.byClass[inspectCell.className];
    return {
      room: row.room,
      className: inspectCell.className,
      students: cell?.students || [],
    };
  }, [inspectCell, matrix]);

  // Reset custom day overrides when pattern or room count changes
  useEffect(() => {
    setCustomDayOverrides({});
  }, [rotationPattern, rooms.length]);

  const isAllocated = matrix.grandTotalAllocated > 0;
  const avgOccupancy =
    matrix.grandTotalCapacity > 0
      ? Math.round((matrix.grandTotalAllocated / matrix.grandTotalCapacity) * 100)
      : 0;

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // --- MATRIX EDITING LOGIC ---
  const classTotalStudentsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cls of matrix.classes) {
      map[cls] = matrix.classTotals[cls]?.total || 0;
    }
    return map;
  }, [matrix]);

  const handleStartEditMatrix = () => {
    const initial = buildQuotaMapFromMatrix(matrix);
    setDraftQuotaMap(initial);
    setIsEditingMatrix(true);
  };

  const handleCancelEditMatrix = () => {
    setIsEditingMatrix(false);
    setDraftQuotaMap({});
  };

  const handleQuotaCellChange = (roomId: string, cls: string, rawValue: string) => {
    const parsed = Math.max(0, parseInt(rawValue, 10) || 0);
    setDraftQuotaMap((prev) => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] || {}),
        [cls]: parsed,
      },
    }));
  };

  const handleQuickEvenDistribute = () => {
    setDraftQuotaMap(generateEvenQuotaMap(students, rooms, matrix.classes));
    showFeedback('Pola "Bagi Rata ke Semua Ruang" dimuat ke draf. Klik "Terapkan ke Seluruh Ruang" untuk menyimpan.');
  };

  const handleQuickSequentialDistribute = () => {
    setDraftQuotaMap(generateSequentialQuotaMap(students, rooms, matrix.classes));
    showFeedback('Pola "Urut per Kelas" dimuat ke draf. Klik "Terapkan ke Seluruh Ruang" untuk menyimpan.');
  };

  const handleCopyRoomPatternToAll = (sourceRoomId: string, sourceRoomName: string) => {
    const next = applySingleRoomPatternToAllRooms(
      sourceRoomId,
      rooms,
      matrix.classes,
      draftQuotaMap,
      classTotalStudentsMap
    );
    setDraftQuotaMap(next);
    showFeedback(
      `Pola komposisi kelas dari ${sourceRoomName} berhasil disalin ke seluruh ${rooms.length} ruang!`
    );
  };

  const handleClearDraftMatrix = () => {
    const cleared: MatrixQuotaMap = {};
    for (const r of rooms) {
      cleared[r.id] = {};
      for (const cls of matrix.classes) {
        cleared[r.id][cls] = 0;
      }
    }
    setDraftQuotaMap(cleared);
  };

  // Live validation calculations for draftQuotaMap
  const draftValidation = useMemo(() => {
    const roomTotals: Record<string, number> = {};
    const classPlannedTotals: Record<string, number> = {};
    for (const cls of matrix.classes) {
      classPlannedTotals[cls] = 0;
    }

    let grandPlanned = 0;
    const overCapacityRooms: string[] = [];
    const overStudentClasses: string[] = [];

    for (const r of rooms) {
      let rTotal = 0;
      for (const cls of matrix.classes) {
        const val = Math.max(0, draftQuotaMap[r.id]?.[cls] || 0);
        rTotal += val;
        classPlannedTotals[cls] = (classPlannedTotals[cls] || 0) + val;
      }
      roomTotals[r.id] = rTotal;
      grandPlanned += rTotal;
      if (rTotal > r.capacity) {
        overCapacityRooms.push(`${r.name} (${rTotal}/${r.capacity})`);
      }
    }

    for (const cls of matrix.classes) {
      const totalAvailable = classTotalStudentsMap[cls] || 0;
      if ((classPlannedTotals[cls] || 0) > totalAvailable) {
        overStudentClasses.push(`${cls} (${classPlannedTotals[cls]}/${totalAvailable})`);
      }
    }

    return {
      roomTotals,
      classPlannedTotals,
      grandPlanned,
      overCapacityRooms,
      overStudentClasses,
      isValid: overCapacityRooms.length === 0 && overStudentClasses.length === 0,
    };
  }, [draftQuotaMap, rooms, matrix.classes, classTotalStudentsMap]);

  const handleApplyEditedMatrixToAllRooms = () => {
    if (!draftValidation.isValid) return;

    const updatedStudents = applyQuotaMatrixToAllRooms(
      students,
      rooms,
      matrix.classes,
      draftQuotaMap,
      settings.participantPrefix,
      matrixSeatStyle
    );
    const allocatedNow = updatedStudents.filter((s) => Boolean(s.roomId)).length;
    onUpdateStudents(
      updatedStudents,
      `Matriks sirkulasi berhasil diterapkan ke seluruh ${rooms.length} ruang (${allocatedNow} siswa teralokasi)!`
    );
    setIsEditingMatrix(false);
    showFeedback(
      `Perubahan sirkulasi diterapkan ke seluruh ${rooms.length} ruang (${allocatedNow} peserta). Denah, daftar hadir, dan kartu ujian otomatis diperbarui.`
    );
  };

  // --- INDIVIDUAL STUDENT MOVE ---
  const handleMoveStudent = (studentId: string, targetRoomId: string) => {
    const targetRoom = rooms.find((r) => r.id === targetRoomId);
    const st = students.find((s) => s.id === studentId);
    if (!targetRoom || !st) return;

    const updated = moveStudentToRoom(
      students,
      rooms,
      studentId,
      targetRoomId,
      settings.participantPrefix
    );
    onUpdateStudents(updated, `${st.name} berhasil dipindahkan ke ${targetRoom.name}.`);
  };

  // --- ROTATION EDITING LOGIC ---
  const getEffectiveDayOverride = (dayIndex: number): CustomDayOverride => {
    if (customDayOverrides[dayIndex]) return customDayOverrides[dayIndex];
    const entry = circulationSchedule[dayIndex];
    const targetToSource: Record<string, string> = {};
    if (entry) {
      entry.roomAssignments.forEach((ra) => {
        const srcRoom = rooms.find((r) => r.code === ra.sourceRoomCode) || ra.room;
        targetToSource[ra.room.id] = srcRoom.id;
      });
    } else {
      rooms.forEach((r) => {
        targetToSource[r.id] = r.id;
      });
    }

    const defaultShift =
      rotationPattern === 'rotate-seat-shift' && dayIndex > 0
        ? dayIndex * (rooms[0]?.columns || 4)
        : 0;

    return { targetToSource, seatShift: defaultShift };
  };

  const handleEditDayRoomSource = (dayIndex: number, targetRoomId: string, sourceRoomId: string) => {
    const current = getEffectiveDayOverride(dayIndex);
    setCustomDayOverrides((prev) => ({
      ...prev,
      [dayIndex]: {
        ...current,
        targetToSource: {
          ...current.targetToSource,
          [targetRoomId]: sourceRoomId,
        },
      },
    }));
  };

  const handleEditDaySeatShift = (dayIndex: number, seatShift: number) => {
    const current = getEffectiveDayOverride(dayIndex);
    setCustomDayOverrides((prev) => ({
      ...prev,
      [dayIndex]: {
        ...current,
        seatShift: Math.max(0, seatShift),
      },
    }));
  };

  const handleApplyDayRowToAllRooms = (dayIndex: number, dayLabel: string) => {
    const hasCustom = Boolean(customDayOverrides[dayIndex]);
    if (hasCustom) {
      const ov = getEffectiveDayOverride(dayIndex);
      const updated = applyCustomDayMappingToStudents(
        students,
        rooms,
        ov.targetToSource,
        ov.seatShift,
        settings.participantPrefix
      );
      onUpdateStudents(
        updated,
        `Jadwal sirkulasi hasil edit (${dayLabel}) berhasil diterapkan ke seluruh ${rooms.length} ruang!`
      );
      showFeedback(`Sirkulasi kustom ${dayLabel} telah diterapkan ke seluruh ${rooms.length} ruang.`);
    } else {
      onApplyCirculationDay(rotationPattern, dayIndex, dayLabel);
      showFeedback(`Sirkulasi ${dayLabel} berhasil diterapkan ke seluruh ${rooms.length} ruang.`);
    }
  };

  const handleExportPdf = () => {
    exportCirculationPdf(students, rooms, settings, schedules, {
      pattern: rotationPattern,
      dayCount: customDayCount,
      includeRotation: activeSubTab === 'rotation' || rotationPattern !== 'fixed',
    });
    showFeedback('Dokumen PDF Pembagian Sirkulasi Ruang & Kelas berhasil diunduh!');
  };

  const handleExportExcel = () => {
    exportCirculationToExcel(students, rooms, settings, schedules, {
      pattern: rotationPattern,
      dayCount: customDayCount,
      includeRotation: true,
    });
    showFeedback('File Excel (.xlsx) Pembagian Sirkulasi Ruang & Kelas berhasil diunduh!');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Pembagian Sirkulasi Peserta Tiap Ruang & Kelas
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Atur, edit, dan terapkan sirkulasi peserta antar ruang &amp; rombongan belajar ke seluruh ruangan &middot;{' '}
            <strong className="text-slate-800">{settings.activityName || settings.examTitle}</strong> (TP{' '}
            {settings.academicYear})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Ekspor Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-xs transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Unduh PDF Sirkulasi</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Unallocated Warning Banner */}
      {!isAllocated && !isEditingMatrix && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-amber-900">
              <p className="font-bold">Peserta Belum Dialokasikan ke Ruang Ujian</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Jalankan pembagian otomatis atau klik &ldquo;Edit Matriks Sirkulasi&rdquo; untuk menyusun sendiri jumlah siswa tiap kelas di setiap ruang.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleStartEditMatrix}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Matriks</span>
            </button>
            <button
              type="button"
              onClick={onRunAllocation}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Pembagian Otomatis</span>
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Ruang Ujian</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {rooms.length}
            </span>
            <span className="text-xs text-slate-500">
              ruang ({matrix.grandTotalCapacity} kursi)
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Rombongan Belajar</span>
            <GraduationCap className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {matrix.classes.length}
            </span>
            <span className="text-xs text-slate-500">kelas aktif</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Peserta Teralokasi</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {matrix.grandTotalAllocated}
            </span>
            <span className="text-xs text-slate-500">
              / {matrix.grandTotalStudents} (L: {matrix.grandTotalMale}, P: {matrix.grandTotalFemale})
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Keterisian & Sisa Kursi</span>
            <Armchair className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {avgOccupancy}%
            </span>
            <span className="text-xs text-slate-500">
              ({matrix.grandTotalRemaining} kursi kosong)
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg p-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'matrix'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Matriks Ruang &times; Kelas</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsEditingMatrix(false);
              setActiveSubTab('by-class');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'by-class'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sebaran per Kelas ({matrix.classes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsEditingMatrix(false);
              setActiveSubTab('rotation');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeSubTab === 'rotation'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Sirkulasi & Rotasi Harian</span>
          </button>
        </div>

        {activeSubTab === 'matrix' && !isEditingMatrix && (
          <div className="flex flex-wrap items-center gap-3 px-2 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={showGenderDetail}
                onChange={(e) => setShowGenderDetail(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="font-medium">Tampilkan L/P per sel</span>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Sorot Kelas:</span>
              <select
                value={highlightClass}
                onChange={(e) => setHighlightClass(e.target.value)}
                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:border-slate-900 focus:outline-none"
              >
                <option value="ALL">Semua Kelas</option>
                {matrix.classes.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* VIEW 1: MATRIKS RUANG x KELAS (VIEW & EDITABLE MODE)             */}
      {/* ================================================================ */}
      {activeSubTab === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {/* Matrix Header & Edit Mode Toggle */}
          <div className="px-4 py-3.5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {isEditingMatrix
                    ? 'Mode Edit Matriks Sirkulasi Ruang & Kelas'
                    : 'Matriks Distribusi Sirkulasi Peserta (Ruang × Kelas)'}
                </h2>
                {isEditingMatrix && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white">
                    Sedang Diedit
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEditingMatrix
                  ? 'Ubah angka kuota siswa tiap kelas di setiap ruang, gunakan pola cepat atau salin pola 1 ruang ke semua ruang, lalu klik "Terapkan ke Seluruh Ruang".'
                  : 'Klik angka pada sel matriks untuk melihat/memindahkan siswa, atau klik "Edit Matriks Sirkulasi" untuk mengubah komposisi ke seluruh ruang.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isEditingMatrix ? (
                <button
                  type="button"
                  onClick={handleStartEditMatrix}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-xs transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Matriks Sirkulasi</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCancelEditMatrix}
                    className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={!draftValidation.isValid || draftValidation.grandPlanned === 0}
                    onClick={handleApplyEditedMatrixToAllRooms}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md shadow-xs transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      Terapkan ke Seluruh Ruang ({draftValidation.grandPlanned} Siswa)
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* EDIT TOOLBAR: Quick Patterns & Seat Style */}
          {isEditingMatrix && (
            <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-200/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-2xs font-bold text-slate-700 uppercase tracking-wide mr-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Pola Cepat ke Seluruh Ruang:
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickEvenDistribute}
                    className="px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-indigo-50 text-slate-800 border border-slate-300 rounded-md transition-colors"
                  >
                    Bagi Rata Semua Kelas
                  </button>
                  {rooms[0] && (
                    <button
                      type="button"
                      onClick={() => handleCopyRoomPatternToAll(rooms[0].id, rooms[0].name)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-indigo-50 text-indigo-800 border border-indigo-300 rounded-md transition-colors"
                      title={`Salin komposisi angka dari ${rooms[0].name} ke seluruh ${rooms.length} ruang`}
                    >
                      <Copy className="w-3 h-3" />
                      <span>Salin Pola {rooms[0].name} &rarr; Semua Ruang</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleQuickSequentialDistribute}
                    className="px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md transition-colors"
                  >
                    Urut per Kelas
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftQuotaMap(buildQuotaMapFromMatrix(matrix))}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-md transition-colors"
                    title="Kembalikan angka sesuai alokasi aktif saat ini"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearDraftMatrix}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-2xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-md transition-colors"
                    title="Kosongkan seluruh kuota menjadi 0"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Nolkan</span>
                  </button>
                </div>

                {/* Seat Arrangement Style when applying */}
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-2xs font-bold text-slate-700 whitespace-nowrap">
                    Susunan Meja di Ruang:
                  </label>
                  <select
                    value={matrixSeatStyle}
                    onChange={(e) => setMatrixSeatStyle(e.target.value as MatrixSeatStyle)}
                    className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    <option value="interleave-class">Silang Antar Kelas (Selingan Rombel)</option>
                    <option value="by-class-nis">Urut per Kelas (NIS Terkecil)</option>
                    <option value="by-class-name">Urut per Kelas (Abjad Nama A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Validation Error / Warning Strip */}
              {!draftValidation.isValid ? (
                <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {draftValidation.overCapacityRooms.length > 0 && (
                      <p>
                        <strong>Melebihi kapasitas kursi ruang:</strong>{' '}
                        {draftValidation.overCapacityRooms.join(', ')}. Kurangi angka di ruang tersebut.
                      </p>
                    )}
                    {draftValidation.overStudentClasses.length > 0 && (
                      <p>
                        <strong>Melebihi jumlah siswa kelas:</strong>{' '}
                        {draftValidation.overStudentClasses.join(', ')}. Kurangi kuota kelas tersebut.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-700">
                  <span>
                    Draf valid: <strong>{draftValidation.grandPlanned}</strong> dari{' '}
                    <strong>{students.length}</strong> siswa akan dialokasikan ke seluruh{' '}
                    <strong>{rooms.length} ruang</strong>.
                    {draftValidation.grandPlanned < students.length && (
                      <span className="text-amber-700 font-semibold ml-1.5">
                        ({students.length - draftValidation.grandPlanned} siswa belum tercantum di kuota)
                      </span>
                    )}
                  </span>
                  <span className="text-slate-500">
                    Tips: Klik ikon <Copy className="w-3 h-3 inline mx-0.5" /> di baris ruang mana saja untuk menyalin komposisi ruang tersebut ke seluruh ruangan.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-2.5 font-semibold text-center w-10 border-r border-slate-700">
                    No
                  </th>
                  <th className="px-3 py-2.5 font-semibold min-w-[175px] border-r border-slate-700">
                    Ruang Ujian
                  </th>
                  {matrix.classes.map((cls) => (
                    <th
                      key={cls}
                      className={`px-2.5 py-2.5 font-semibold text-center whitespace-nowrap border-r border-slate-700 ${
                        !isEditingMatrix && highlightClass === cls ? 'bg-indigo-700 text-white' : ''
                      }`}
                    >
                      <span>{cls}</span>
                      {isEditingMatrix && (
                        <span className="block text-[10px] font-normal text-slate-300 font-mono">
                          (Maks {classTotalStudentsMap[cls] || 0})
                        </span>
                      )}
                    </th>
                  ))}
                  {!isEditingMatrix && (
                    <>
                      <th className="px-2.5 py-2.5 font-semibold text-center border-r border-slate-700 bg-slate-800">
                        L
                      </th>
                      <th className="px-2.5 py-2.5 font-semibold text-center border-r border-slate-700 bg-slate-800">
                        P
                      </th>
                    </>
                  )}
                  <th className="px-3 py-2.5 font-semibold text-center border-r border-slate-700 bg-slate-800">
                    {isEditingMatrix ? 'Rencana / Kap' : 'Terisi / Kap'}
                  </th>
                  {!isEditingMatrix && (
                    <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">
                      Rentang No. Peserta
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {matrix.rows.map((row, idx) => {
                  const plannedRowTotal = draftValidation.roomTotals[row.room.id] || 0;
                  const isOverCap = isEditingMatrix && plannedRowTotal > row.room.capacity;
                  const isFull = isEditingMatrix
                    ? plannedRowTotal === row.room.capacity && row.room.capacity > 0
                    : row.total >= row.room.capacity && row.room.capacity > 0;

                  return (
                    <tr
                      key={row.room.id}
                      className={`transition-colors ${
                        isOverCap ? 'bg-rose-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="px-3 py-2.5 text-center font-mono text-slate-500 border-r border-slate-100">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 border-r border-slate-100">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-2xs font-bold px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-800">
                                {row.room.code}
                              </span>
                              <button
                                type="button"
                                onClick={() => onSelectRoomForSeating(row.room.id)}
                                className="font-bold text-slate-900 hover:underline text-left"
                                title="Buka denah kursi ruangan ini"
                              >
                                {row.room.name}
                              </button>
                            </div>
                            <span className="text-2xs text-slate-500 block mt-0.5">
                              {row.room.building}
                            </span>
                          </div>

                          {isEditingMatrix && (
                            <button
                              type="button"
                              onClick={() => handleCopyRoomPatternToAll(row.room.id, row.room.name)}
                              className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded transition-colors shrink-0"
                              title={`Terapkan pola ${row.room.name} ke seluruh ruang`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                      {matrix.classes.map((cls) => {
                        if (isEditingMatrix) {
                          const val = draftQuotaMap[row.room.id]?.[cls] ?? 0;
                          return (
                            <td
                              key={cls}
                              className="px-2 py-2 text-center border-r border-slate-100"
                            >
                              <input
                                type="number"
                                min={0}
                                max={Math.min(row.room.capacity, classTotalStudentsMap[cls] || 999)}
                                value={val}
                                onChange={(e) =>
                                  handleQuotaCellChange(row.room.id, cls, e.target.value)
                                }
                                className={`w-14 px-1.5 py-1 text-center font-mono text-xs font-bold rounded-md border focus:outline-none transition-colors ${
                                  val > 0
                                    ? 'bg-white border-slate-400 text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                                    : 'bg-slate-50 border-slate-200 text-slate-400 focus:bg-white focus:border-indigo-600 focus:text-slate-900'
                                }`}
                              />
                            </td>
                          );
                        }

                        const cell = row.byClass[cls];
                        const count = cell?.count || 0;
                        const isHighlighted = highlightClass === cls;
                        const isDimmed = highlightClass !== 'ALL' && !isHighlighted;

                        return (
                          <td
                            key={cls}
                            className={`px-2 py-2 text-center border-r border-slate-100 transition-colors ${
                              isHighlighted ? 'bg-indigo-50/70' : ''
                            } ${isDimmed ? 'opacity-40' : ''}`}
                          >
                            {count > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setInspectCell({
                                    roomId: row.room.id,
                                    className: cls,
                                  })
                                }
                                className="inline-flex flex-col items-center justify-center min-w-[44px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-900 font-mono transition-colors group"
                                title={`Klik untuk melihat / memindahkan ${count} siswa kelas ${cls} di ${row.room.name}`}
                              >
                                <span className="font-bold text-xs leading-none">{count}</span>
                                {showGenderDetail && (
                                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300 mt-0.5">
                                    {cell.male}L/{cell.female}P
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="text-slate-300 font-mono">-</span>
                            )}
                          </td>
                        );
                      })}

                      {!isEditingMatrix && (
                        <>
                          <td className="px-2.5 py-2.5 text-center font-mono text-slate-700 border-r border-slate-100 bg-slate-50/50">
                            {row.male}
                          </td>
                          <td className="px-2.5 py-2.5 text-center font-mono text-slate-700 border-r border-slate-100 bg-slate-50/50">
                            {row.female}
                          </td>
                        </>
                      )}

                      <td className="px-3 py-2.5 text-center font-mono border-r border-slate-100 bg-slate-50/50">
                        {isEditingMatrix ? (
                          <>
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-bold text-2xs ${
                                isOverCap
                                  ? 'bg-rose-600 text-white'
                                  : isFull
                                  ? 'bg-slate-900 text-white'
                                  : plannedRowTotal > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {plannedRowTotal} / {row.room.capacity}
                            </span>
                            {isOverCap ? (
                              <span className="block text-[10px] font-bold text-rose-600 mt-0.5">
                                Lebih +{plannedRowTotal - row.room.capacity}
                              </span>
                            ) : (
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                Sisa {row.room.capacity - plannedRowTotal}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-bold text-2xs ${
                                isFull
                                  ? 'bg-slate-900 text-white'
                                  : row.total > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {row.total} / {row.room.capacity}
                            </span>
                            {row.remainingSeats > 0 && (
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                Sisa {row.remainingSeats}
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {!isEditingMatrix && (
                        <td className="px-3 py-2.5 text-center font-mono text-2xs text-slate-700 whitespace-nowrap">
                          {row.participantMin && row.participantMax
                            ? `${row.participantMin} – ${row.participantMax}`
                            : '-'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={2} className="px-3 py-2.5 text-right border-r border-slate-200">
                    {isEditingMatrix
                      ? `TOTAL RENCANA (${rooms.length} RUANG)`
                      : `TOTAL TERALOKASI (${rooms.length} RUANG)`}
                  </td>

                  {matrix.classes.map((cls) => {
                    if (isEditingMatrix) {
                      const planned = draftValidation.classPlannedTotals[cls] || 0;
                      const avail = classTotalStudentsMap[cls] || 0;
                      const diff = avail - planned;
                      return (
                        <td
                          key={cls}
                          className={`px-2 py-2 text-center font-mono border-r border-slate-200 ${
                            diff < 0
                              ? 'bg-rose-100 text-rose-900'
                              : diff === 0
                              ? 'bg-emerald-50 text-emerald-900'
                              : 'bg-amber-50/70 text-amber-900'
                          }`}
                        >
                          <span className="block text-xs">
                            {planned}/{avail}
                          </span>
                          <span className="block text-[10px] font-semibold">
                            {diff === 0 ? 'Pas' : diff > 0 ? `Sisa ${diff}` : `Lebih +${Math.abs(diff)}`}
                          </span>
                        </td>
                      );
                    }

                    const stat = matrix.classTotals[cls];
                    return (
                      <td
                        key={cls}
                        className={`px-2 py-2.5 text-center font-mono border-r border-slate-200 ${
                          highlightClass === cls ? 'bg-indigo-100 text-indigo-950' : ''
                        }`}
                      >
                        <span>{stat?.allocated || 0}</span>
                        {stat && stat.allocated < stat.total && (
                          <span className="block text-[10px] font-normal text-rose-600">
                            /{stat.total}
                          </span>
                        )}
                      </td>
                    );
                  })}

                  {!isEditingMatrix && (
                    <>
                      <td className="px-2.5 py-2.5 text-center font-mono border-r border-slate-200">
                        {matrix.grandTotalMale}
                      </td>
                      <td className="px-2.5 py-2.5 text-center font-mono border-r border-slate-200">
                        {matrix.grandTotalFemale}
                      </td>
                    </>
                  )}

                  <td className="px-3 py-2.5 text-center font-mono border-r border-slate-200">
                    {isEditingMatrix
                      ? `${draftValidation.grandPlanned} / ${matrix.grandTotalCapacity}`
                      : `${matrix.grandTotalAllocated} / ${matrix.grandTotalCapacity}`}
                  </td>

                  {!isEditingMatrix && (
                    <td className="px-3 py-2.5 text-center font-mono text-2xs text-slate-600">
                      Sisa {matrix.grandTotalRemaining} kursi
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW 2: SEBARAN SIRKULASI PER KELAS                              */}
      {/* ================================================================ */}
      {activeSubTab === 'by-class' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matrix.classSummaries.map((cs) => {
            const pct =
              cs.totalStudents > 0
                ? Math.round((cs.allocatedStudents / cs.totalStudents) * 100)
                : 0;
            return (
              <div
                key={cs.className}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {cs.className.slice(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{cs.className}</h3>
                        <p className="text-2xs text-slate-500 font-mono">
                          Total {cs.totalStudents} siswa (L: {cs.male}, P: {cs.female})
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block text-2xs font-bold px-2 py-0.5 rounded font-mono ${
                          cs.unallocatedStudents === 0 && cs.totalStudents > 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {cs.allocatedStudents}/{cs.totalStudents} ({pct}%)
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        Tersebar di {cs.roomDistributions.length} ruang
                      </span>
                    </div>
                  </div>

                  {/* Room breakdown rows for this class */}
                  <div className="mt-3 space-y-2">
                    {cs.roomDistributions.length > 0 ? (
                      cs.roomDistributions.map((rd) => (
                        <div
                          key={rd.room.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-md bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-2xs font-bold px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-800">
                                {rd.room.code}
                              </span>
                              <span className="text-xs font-bold text-slate-900">
                                {rd.room.name}
                              </span>
                              <span className="text-2xs text-slate-500 truncate">
                                &middot; {rd.room.building}
                              </span>
                            </div>
                            <div className="text-2xs text-slate-500 font-mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>
                                Meja:{' '}
                                <strong className="text-slate-700">
                                  {rd.seatMin !== undefined && rd.seatMax !== undefined
                                    ? `${String(rd.seatMin).padStart(2, '0')}–${String(rd.seatMax).padStart(2, '0')}`
                                    : '-'}
                                </strong>
                              </span>
                              {rd.participantMin && rd.participantMax && (
                                <span>
                                  No. Peserta:{' '}
                                  <strong className="text-slate-700">
                                    {rd.participantMin} s/d {rd.participantMax}
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right font-mono">
                              <span className="text-xs font-bold text-slate-900 block">
                                {rd.count} siswa
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {rd.male}L / {rd.female}P
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setInspectCell({
                                  roomId: rd.room.id,
                                  className: cs.className,
                                })
                              }
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white border border-transparent hover:border-slate-200 rounded transition-colors"
                              title="Lihat & pindah ruang siswa"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        Belum ada siswa dari kelas {cs.className} yang dialokasikan ke ruangan.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW 3: SIRKULASI & ROTASI HARIAN (EDITABLE & APPLY TO ALL ROOMS)*/}
      {/* ================================================================ */}
      {activeSubTab === 'rotation' && (
        <div className="space-y-4">
          {/* Rotation Configuration Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Konfigurasi Pola Sirkulasi / Perputaran Peserta Harian
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pilih pola otomatis atau aktifkan mode edit untuk menyesuaikan perpindahan kelompok ruang &amp; pergeseran meja, lalu terapkan ke seluruh ruang
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <label className="font-semibold text-slate-700 whitespace-nowrap">
                  Jumlah Hari Ujian:
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={customDayCount}
                  onChange={(e) =>
                    setCustomDayCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-16 px-2.5 py-1 font-mono font-bold text-center border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
                <span className="text-slate-500">hari</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'rotate-room-forward' as CirculationPattern,
                  title: 'Rotasi Ruang Maju (+1)',
                  badge: 'POPULER',
                  desc: 'Kelompok Ruang 01 hari ke-1 pindah ke Ruang 02 di hari ke-2 secara berputar.',
                },
                {
                  id: 'rotate-room-backward' as CirculationPattern,
                  title: 'Rotasi Ruang Mundur (-1)',
                  badge: 'SIKLIS',
                  desc: 'Kelompok ruang berpindah mundur satu nomor ruang pada setiap pergantian hari.',
                },
                {
                  id: 'rotate-seat-shift' as CirculationPattern,
                  title: 'Geser Meja Dalam Ruang',
                  badge: 'ANTI MONOTON',
                  desc: 'Siswa tetap di ruangan yang sama, namun nomor kursi bergeser 1 baris per hari.',
                },
                {
                  id: 'fixed' as CirculationPattern,
                  title: 'Tetap (Tanpa Rotasi)',
                  badge: 'STANDAR',
                  desc: 'Posisi ruang dan nomor meja seluruh peserta tetap sama selama jadwal ujian.',
                },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex flex-col p-3.5 rounded-lg border cursor-pointer transition-all ${
                    rotationPattern === opt.id
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                    <input
                      type="radio"
                      name="circulationPattern"
                      checked={rotationPattern === opt.id}
                      onChange={() => setRotationPattern(opt.id)}
                      className="text-slate-900 focus:ring-slate-900"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-200/70 rounded px-1.5 py-0.5 mt-1.5 w-fit">
                    {opt.badge}
                  </span>
                  <p className="text-2xs text-slate-600 mt-1.5 leading-relaxed">{opt.desc}</p>
                </label>
              ))}
            </div>
          </div>

          {/* Rotation Schedule Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Jadwal Sirkulasi Peserta per Hari &times; Ruang
                  </h3>
                  <p className="text-2xs text-slate-500">
                    {isEditingRotation
                      ? 'Ubah kelompok asal pada tiap ruang atau geser kursi per hari, lalu klik "Terapkan ke Semua Ruang".'
                      : 'Aktifkan "Edit Jadwal Rotasi" untuk menyesuaikan penempatan ruang tiap hari secara manual.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {Object.keys(customDayOverrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomDayOverrides({})}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-2xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Editan</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsEditingRotation((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    isEditingRotation
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isEditingRotation ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Selesai Edit Jadwal</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Jadwal Rotasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-3 py-2.5 font-semibold min-w-[145px] border-r border-slate-700">
                      Hari & Tanggal
                    </th>
                    {rooms.map((room) => (
                      <th
                        key={room.id}
                        className="px-3 py-2.5 font-semibold min-w-[180px] border-r border-slate-700"
                      >
                        <div className="flex items-center justify-between">
                          <span>{room.name}</span>
                          <span className="font-mono text-2xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                            {room.code}
                          </span>
                        </div>
                      </th>
                    ))}
                    {isEditingRotation && (
                      <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap border-r border-slate-700 bg-slate-800">
                        Geser Meja
                      </th>
                    )}
                    <th className="px-3 py-2.5 font-semibold text-center whitespace-nowrap">
                      Aksi Seluruh Ruang
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {circulationSchedule.map((day) => {
                    const effective = getEffectiveDayOverride(day.dayIndex);
                    const hasCustom = Boolean(customDayOverrides[day.dayIndex]);
                    const usedSources = Object.values(effective.targetToSource);
                    const hasDuplicateSource = new Set(usedSources).size < usedSources.length;

                    return (
                      <tr key={day.dayIndex} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-3 align-top border-r border-slate-100 bg-slate-50/40">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">
                              Hari {day.dayIndex + 1} &middot; {day.dayLabel}
                            </span>
                            {hasCustom && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                                DIEDIT
                              </span>
                            )}
                          </div>
                          <span className="text-2xs text-slate-500 font-mono block mt-0.5">
                            {day.dateLabel}
                          </span>
                          <span className="text-[11px] text-slate-600 block mt-1 line-clamp-2">
                            {day.subjects.join(', ')}
                          </span>
                          {hasDuplicateSource && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              Kelompok ganda dipilih
                            </span>
                          )}
                        </td>

                        {day.roomAssignments.map((ra) => {
                          const assignedSourceId = effective.targetToSource[ra.room.id] || ra.room.id;
                          const sourceRow =
                            matrix.rows.find((r) => r.room.id === assignedSourceId) ||
                            matrix.rows[0];
                          const dynamicClassText = sourceRow
                            ? matrix.classes
                                .filter((cls) => (sourceRow.byClass[cls]?.count || 0) > 0)
                                .map((cls) => `${cls} (${sourceRow.byClass[cls].count})`)
                                .join(', ') || 'Kosong'
                            : ra.classBreakdownText;

                          return (
                            <td
                              key={ra.room.id}
                              className="px-3 py-3 align-top border-r border-slate-100"
                            >
                              {isEditingRotation ? (
                                <div className="space-y-1.5">
                                  <select
                                    value={assignedSourceId}
                                    onChange={(e) =>
                                      handleEditDayRoomSource(
                                        day.dayIndex,
                                        ra.room.id,
                                        e.target.value
                                      )
                                    }
                                    className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-indigo-600 focus:outline-none"
                                  >
                                    {rooms.map((srcOpt) => (
                                      <option key={srcOpt.id} value={srcOpt.id}>
                                        Kelompok {srcOpt.name} ({srcOpt.code})
                                      </option>
                                    ))}
                                  </select>
                                  <p className="text-2xs text-slate-600 leading-snug">
                                    {dynamicClassText}
                                  </p>
                                  <span className="inline-block text-[10px] font-mono text-slate-500">
                                    {sourceRow?.total || 0} peserta
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="font-bold text-slate-900 text-xs">
                                      Kelompok {sourceRow?.room.name || ra.room.name}
                                    </span>
                                    <span className="font-mono text-2xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                      {sourceRow?.total ?? ra.studentCount} org
                                    </span>
                                  </div>
                                  <p className="text-2xs text-slate-600 mt-1 leading-snug">
                                    {dynamicClassText}
                                  </p>
                                  <span className="inline-block mt-1.5 text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5">
                                    {hasCustom
                                      ? effective.seatShift > 0
                                        ? `Kustom • Geser +${effective.seatShift} meja`
                                        : 'Penempatan ruang kustom'
                                      : ra.seatShiftNote}
                                  </span>
                                </>
                              )}
                            </td>
                          );
                        })}

                        {isEditingRotation && (
                          <td className="px-3 py-3 align-middle text-center border-r border-slate-100 bg-slate-50/40">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-2xs text-slate-500">+</span>
                              <input
                                type="number"
                                min={0}
                                max={60}
                                value={effective.seatShift}
                                onChange={(e) =>
                                  handleEditDaySeatShift(
                                    day.dayIndex,
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-12 px-1.5 py-1 text-center font-mono text-xs font-bold bg-white border border-slate-300 rounded focus:border-indigo-600 focus:outline-none"
                              />
                            </div>
                            <span className="block text-[10px] text-slate-400 mt-0.5">kursi</span>
                          </td>
                        )}

                        <td className="px-3 py-3 align-middle text-center">
                          {!hasCustom && (day.dayIndex === 0 || rotationPattern === 'fixed') ? (
                            <span className="text-2xs font-mono text-slate-400">Alokasi Dasar</span>
                          ) : (
                            <button
                              type="button"
                              disabled={!isAllocated || hasDuplicateSource}
                              onClick={() =>
                                handleApplyDayRowToAllRooms(
                                  day.dayIndex,
                                  `Hari ${day.dayIndex + 1} (${day.dayLabel})`
                                )
                              }
                              className="px-2.5 py-1.5 text-2xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-md whitespace-nowrap transition-colors"
                            >
                              Terapkan ke Semua Ruang
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL: DETAIL & PINDAH RUANG SISWA PADA SEL RUANG x KELAS        */}
      {/* ================================================================ */}
      {activeInspectData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-900 text-white rounded">
                    {activeInspectData.room.code}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {activeInspectData.room.name} &mdash; Kelas {activeInspectData.className}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeInspectData.students.length} peserta ujian dari kelas {activeInspectData.className}. Anda dapat langsung memindahkan ruang siswa melalui kolom &ldquo;Pindah Ruang&rdquo;.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/70 transition-colors"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {activeInspectData.students.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  Tidak ada lagi siswa kelas {activeInspectData.className} di {activeInspectData.room.name}.
                </div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold text-center w-12">Meja</th>
                      <th className="px-3 py-2.5 font-semibold">No. Peserta</th>
                      <th className="px-3 py-2.5 font-semibold">NIS</th>
                      <th className="px-3 py-2.5 font-semibold">Nama Lengkap Siswa</th>
                      <th className="px-2 py-2.5 font-semibold text-center">L/P</th>
                      <th className="px-3 py-2.5 font-semibold">Pindah Ruang</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Kartu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeInspectData.students.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-center font-mono font-bold text-slate-900">
                          {st.seatNumber ? String(st.seatNumber).padStart(2, '0') : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {st.participantNo || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{st.nis}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{st.name}</td>
                        <td className="px-2 py-2 text-center font-mono text-slate-600">
                          {st.gender}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={st.roomId || ''}
                            onChange={(e) => handleMoveStudent(st.id, e.target.value)}
                            className="px-2 py-1 text-2xs font-semibold bg-white border border-slate-300 rounded focus:border-indigo-600 focus:outline-none"
                          >
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.code})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectCell(null);
                              onViewStudentCard(st);
                            }}
                            className="text-2xs font-semibold text-slate-700 hover:text-slate-900 underline"
                          >
                            Lihat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const rId = activeInspectData.room.id;
                  setInspectCell(null);
                  onSelectRoomForSeating(rId);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-slate-700"
              >
                <span>Buka Denah {activeInspectData.room.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setInspectCell(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
