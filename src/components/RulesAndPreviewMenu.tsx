import React, { useState, useRef, useEffect } from 'react';
import {
  Sliders,
  Building,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Eye,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  DoorOpen,
  LayoutGrid,
  FileText,
  Armchair,
  Save,
  Building2,
  Users,
  Info,
  CreditCard,
  Calendar,
  Plus,
  Trash2,
  Calculator,
  ShieldAlert,
  Layers,
  ArrowRight,
  GraduationCap,
  Shuffle,
  ListOrdered,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Student, Room, ExamSettings, ExamScheduleItem } from '../types';
import { DEFAULT_PEMDA_LOGO, DEFAULT_SCHOOL_LOGO } from '../utils/defaultLogos';
import {
  exportAttendancePdfForRoom,
  exportDoorPosterPdf,
  exportExamCardsPdf,
  exportSingleStudentCardPdf,
} from '../utils/exportPdf';
import { exportAllocationToExcel } from '../utils/exportExcel';

interface RulesAndPreviewMenuProps {
  settings: ExamSettings;
  rooms: Room[];
  students: Student[];
  schedules?: ExamScheduleItem[];
  onUpdateSettings: (newSettings: ExamSettings) => void;
  onUpdateRooms: (newRooms: Room[]) => void;
}

export const RulesAndPreviewMenu: React.FC<RulesAndPreviewMenuProps> = ({
  settings,
  rooms,
  students,
  schedules = [],
  onUpdateSettings,
  onUpdateRooms,
}) => {
  // Sub-tabs in Menu Aturan
  const [subTab, setSubTab] = useState<'rules-chairs' | 'rules-kop' | 'preview'>('preview');

  // Preview sub-options
  const [previewDocType, setPreviewDocType] = useState<'door' | 'seating' | 'attendance' | 'card'>('door');
  const [selectedPreviewRoomId, setSelectedPreviewRoomId] = useState<string>(rooms[0]?.id || '');
  const [selectedPreviewStudentId, setSelectedPreviewStudentId] = useState<string>(students[0]?.id || '');
  const [previewZoom, setPreviewZoom] = useState<'fit' | '100%'>('fit');

  // Form states for Kop & Rules
  const [formData, setFormData] = useState<ExamSettings>({ ...settings });
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  // File upload refs
  const fileInputPemdaRef = useRef<HTMLInputElement>(null);
  const fileInputSchoolRef = useRef<HTMLInputElement>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedPreviewRoomId) || rooms[0];
  const roomStudents = selectedRoom
    ? students
        .filter((s) => s.roomId === selectedRoom.id)
        .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0))
    : [];

  const selectedStudent =
    students.find((s) => s.id === selectedPreviewStudentId) ||
    roomStudents[0] ||
    students[0];

  const showFeedback = (msg: string) => {
    setSavedFeedback(msg);
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  // Target room count input state
  const [targetRoomsInput, setTargetRoomsInput] = useState<number>(rooms.length || 4);

  useEffect(() => {
    setTargetRoomsInput(rooms.length);
  }, [rooms.length]);

  useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  // Calculations for room count rules & POS recommendations
  const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
  const idealCapacity = formData.defaultRoomCapacity || 24;
  const recommendedRoomsCount = Math.max(1, Math.ceil((students.length || 1) / idealCapacity));
  const capacityDiff = totalCapacity - students.length;
  const isDeficit = capacityDiff < 0;
  const maxRooms = formData.maxRoomsAllowed || 12;
  const invigilatorsPerRoom = formData.invigilatorsPerRoom || 2;
  const totalInvigilatorsNeeded = rooms.length * invigilatorsPerRoom;

  // Class statistics for room distribution by class order
  const classStats = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of students) {
      const cls = s.className?.trim() || 'Tanpa Kelas';
      map[cls] = (map[cls] || 0) + 1;
    }
    return map;
  }, [students]);

  const detectedClasses = React.useMemo(() => {
    return Object.keys(classStats).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [classStats]);

  const currentClassOrder = React.useMemo(() => {
    if (formData.customClassOrder && formData.customClassOrder.length > 0) {
      const set = new Set(formData.customClassOrder);
      const ordered = formData.customClassOrder.filter((c) => classStats[c]);
      for (const c of detectedClasses) {
        if (!set.has(c)) ordered.push(c);
      }
      return ordered;
    }
    return detectedClasses;
  }, [formData.customClassOrder, detectedClasses, classStats]);

  const handleMoveClass = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentClassOrder.length) return;
    const newOrder = [...currentClassOrder];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);
    setFormData((prev) => ({ ...prev, customClassOrder: newOrder }));
  };

  const handleSortClassesAsc = () => {
    const sorted = [...detectedClasses].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    setFormData((prev) => ({ ...prev, customClassOrder: sorted }));
  };

  const handleSortClassesDesc = () => {
    const sorted = [...detectedClasses].sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
    );
    setFormData((prev) => ({ ...prev, customClassOrder: sorted }));
  };

  const handleResetClassOrder = () => {
    setFormData((prev) => ({ ...prev, customClassOrder: undefined }));
  };

  // Handler to adjust the number of rooms to a specific count
  const handleApplyRoomCount = (targetCount: number) => {
    const validCount = Math.min(Math.max(1, targetCount), 30);
    let newRooms: Room[] = [...rooms];

    if (newRooms.length < validCount) {
      const toAdd = validCount - newRooms.length;
      for (let i = 0; i < toAdd; i++) {
        const nextNum = newRooms.length + 1;
        const codeNum = String(nextNum).padStart(2, '0');
        newRooms.push({
          id: `room-gen-${Date.now()}-${nextNum}`,
          name: `Ruang ${codeNum}`,
          code: `R${codeNum}`,
          capacity: formData.defaultRoomCapacity || 24,
          columns: formData.defaultRoomColumns || 4,
          building: rooms[0]?.building || 'Gedung A - Lantai 1',
          invigilator1: `Pengawas Ruang ${codeNum}`,
          invigilator2: invigilatorsPerRoom === 1 ? undefined : `Pengawas Pendamping ${codeNum}`,
        });
      }
    } else if (newRooms.length > validCount) {
      newRooms = newRooms.slice(0, validCount);
    }

    onUpdateRooms(newRooms);
    const updatedSettings: ExamSettings = {
      ...formData,
      targetRoomCount: validCount,
    };
    setFormData(updatedSettings);
    onUpdateSettings(updatedSettings);
    setTargetRoomsInput(validCount);
    showFeedback(`Aturan banyaknya ruang diterapkan! Jumlah ruang ujian kini menjadi ${validCount} ruangan.`);
  };

  const handleApplyRecommendedRooms = () => {
    handleApplyRoomCount(recommendedRoomsCount);
  };

  const handleAddSingleRoomQuick = () => {
    handleApplyRoomCount(rooms.length + 1);
  };

  const handleRemoveLastRoomQuick = () => {
    if (rooms.length <= 1) {
      showFeedback('Minimal harus ada 1 ruangan ujian!');
      return;
    }
    handleApplyRoomCount(rooms.length - 1);
  };

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onUpdateSettings(formData);
    showFeedback('Pengaturan aturan & identitas kop surat berhasil disimpan!');
  };

  // Chair rules: Apply uniform capacity to all rooms
  const handleApplyUniformCapacity = () => {
    const updatedRooms = rooms.map((r) => ({
      ...r,
      capacity: formData.defaultRoomCapacity,
      columns: formData.defaultRoomColumns,
    }));
    onUpdateRooms(updatedRooms);
    onUpdateSettings({
      ...formData,
      uniformCapacityMode: true,
    });
    showFeedback(
      `Aturan berhasil diterapkan! Seluruh ${rooms.length} ruangan kini berkapasitas ${formData.defaultRoomCapacity} kursi (${formData.defaultRoomColumns} kolom).`
    );
  };

  // Image Upload Handlers
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'pemda' | 'school') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showFeedback('Ukuran file logo maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        if (target === 'pemda') {
          setFormData((prev) => ({ ...prev, logoLeftPemda: result }));
          onUpdateSettings({ ...settings, logoLeftPemda: result });
          showFeedback('Logo Kiri (Pemda) berhasil diunggah!');
        } else {
          setFormData((prev) => ({ ...prev, logoRightSchool: result }));
          onUpdateSettings({ ...settings, logoRightSchool: result });
          showFeedback('Logo Kanan (Sekolah) berhasil diunggah!');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Menu Aturan & Pratinjau Dokumen
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Konfigurasi aturan kapasitas kursi, identitas kop surat (dua logo), dan pratinjau langsung dokumen resmi
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setSubTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'preview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Tampilan / Preview Dokumen</span>
          </button>

          <button
            onClick={() => setSubTab('rules-chairs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'rules-chairs'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-slate-700" />
            <span>Aturan Banyaknya Ruang & Kursi</span>
            <span className="ml-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-700 text-2xs font-mono font-bold rounded">
              {rooms.length} Ruang
            </span>
          </button>

          <button
            onClick={() => setSubTab('rules-kop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === 'rules-kop'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Kop & Logo Sekolah</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {savedFeedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}

      {/* ======================================================== */}
      {/* 1. ATURAN BANYAKNYA RUANG & STANDAR KURSI UJIAN          */}
      {/* ======================================================== */}
      {subTab === 'rules-chairs' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-700" />
                  <span>Aturan Banyaknya Ruang & Standar Kursi Ujian</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Konfigurasi jumlah ruang ujian, estimasi matematis POS, batas fisik sekolah, mode distribusi siswa, dan kebutuhan pengawas
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveSettings()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Aturan</span>
                </button>
              </div>
            </div>

            {/* 1. Kalkulator & Analisis Kebutuhan Banyaknya Ruang (Live Estimator) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-slate-600" />
                  Analisis Kebutuhan Banyaknya Ruang (Standar POS)
                </span>
                <span className="text-2xs font-mono text-slate-500">
                  Total Siswa: {students.length} orang | Standar: {formData.defaultRoomCapacity} kursi/ruang
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Metrik 1: Jumlah Ruang Aktif */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Banyaknya Ruang Aktif
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{rooms.length}</span>
                    <span className="text-xs text-slate-600">ruang</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Batas Fisik: maks. {maxRooms} ruang
                  </span>
                </div>

                {/* Metrik 2: Total Kapasitas Kursi */}
                <div className={`border rounded-lg p-3 space-y-1 ${
                  isDeficit ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Daya Tampung Total
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-xl font-bold font-mono ${isDeficit ? 'text-rose-700' : 'text-slate-900'}`}>
                      {totalCapacity}
                    </span>
                    <span className="text-xs text-slate-600">kursi</span>
                  </div>
                  <span className={`text-2xs font-semibold block ${isDeficit ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {isDeficit ? `Defisit ${Math.abs(capacityDiff)} kursi` : `Surplus +${capacityDiff} kursi`}
                  </span>
                </div>

                {/* Metrik 3: Rekomendasi Kebutuhan Ruang POS */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Rekomendasi POS
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{recommendedRoomsCount}</span>
                    <span className="text-xs text-slate-600">ruangan</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Formula: ceil({students.length} / {idealCapacity})
                  </span>
                </div>

                {/* Metrik 4: Kebutuhan Pengawas */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wide block">
                    Kebutuhan Pengawas
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono text-slate-900">{totalInvigilatorsNeeded}</span>
                    <span className="text-xs text-slate-600">orang</span>
                  </div>
                  <span className="text-2xs text-slate-500 block truncate">
                    Rasio: {invigilatorsPerRoom} pengawas / ruang
                  </span>
                </div>
              </div>

              {/* Status Alert Banner */}
              {isDeficit ? (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-900">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Kapasitas Ruang Kurang!</span>
                      <p className="text-2xs text-rose-700 mt-0.5 leading-relaxed">
                        Kapasitas total ({totalCapacity} kursi) tidak mencukupi untuk <strong>{students.length} siswa</strong> terdaftar. Terjadi defisit <strong>{Math.abs(capacityDiff)} kursi</strong>. Minimal dibutuhkan <strong>{recommendedRoomsCount} ruangan</strong> ujian.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyRecommendedRooms}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md whitespace-nowrap shadow-xs transition-colors shrink-0"
                  >
                    Sesuaikan ke {recommendedRoomsCount} Ruang
                  </button>
                </div>
              ) : rooms.length > maxRooms ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Peringatan Ketersediaan Ruangan:</span>
                    <p className="text-2xs text-amber-800 mt-0.5 leading-relaxed">
                      Jumlah ruangan aktif ({rooms.length} ruang) melebihi batas ketersediaan ruang fisik sekolah ({maxRooms} ruang). Pastikan ruang kelas fisik dan pengawas tersedia.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 flex items-center justify-between gap-2 text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>Status Kapasitas Ideal:</strong> Seluruh {students.length} siswa tertampung sempurna di {rooms.length} ruangan dengan cadangan {capacityDiff} kursi kosong.
                    </span>
                  </div>
                  <span className="text-2xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                    Mencukupi 100%
                  </span>
                </div>
              )}
            </div>

            {/* 2. Formulir Kontrol Aturan Banyaknya Ruang */}
            <div className="space-y-4 pt-2">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Pengaturan Parameter Banyaknya Ruang Ujian
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Box 1: Atur Target Jumlah Ruang Ujian */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Target Banyaknya Ruang Ujian
                    </label>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      Tentukan berapa banyak ruangan ujian yang dibuka dan digunakan secara serentak.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={targetRoomsInput}
                        onChange={(e) => setTargetRoomsInput(parseInt(e.target.value, 10) || 1)}
                        className="w-20 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                      />
                      <span className="text-xs text-slate-600 font-medium">Ruang</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyRoomCount(targetRoomsInput)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                    >
                      Terapkan {targetRoomsInput} Ruang
                    </button>

                    <button
                      type="button"
                      onClick={handleApplyRecommendedRooms}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                      title="Gunakan rekomendasi POS berdasarkan total siswa"
                    >
                      POS: {recommendedRoomsCount} Ruang
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 text-2xs text-slate-600">
                    <span>Aksi Cepat:</span>
                    <button
                      type="button"
                      onClick={handleAddSingleRoomQuick}
                      className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded font-medium text-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-slate-500" />
                      <span>+1 Ruang</span>
                    </button>
                    {rooms.length > 1 && (
                      <button
                        type="button"
                        onClick={handleRemoveLastRoomQuick}
                        className="px-2 py-0.5 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 rounded font-medium text-rose-700 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        <span>-1 Ruang Terakhir</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Box 2: Batas Ruang Fisik Sekolah & Rasio Pengawas */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Batas Ketersediaan Ruang Fisik & Rasio Pengawas
                    </label>
                    <p className="text-2xs text-slate-500 mt-0.5">
                      Batas kapasitas fasilitas gedung sekolah dan aturan alokasi petugas pengawas per ruang.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-2xs font-semibold text-slate-600 mb-1">
                        Batas Maks. Ruang Fisik Sekolah
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.maxRoomsAllowed || 12}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxRoomsAllowed: parseInt(e.target.value, 10) || 12,
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        />
                        <span className="text-2xs text-slate-500 shrink-0">ruang</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-2xs font-semibold text-slate-600 mb-1">
                        Rasio Pengawas per Ruang
                      </label>
                      <select
                        value={formData.invigilatorsPerRoom || 2}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            invigilatorsPerRoom: parseInt(e.target.value, 10) || 2,
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                      >
                        <option value={2}>2 Pengawas (Standar POS)</option>
                        <option value={1}>1 Pengawas (Hemat)</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Dengan {rooms.length} ruang aktif dan rasio {formData.invigilatorsPerRoom || 2} pengawas, sekolah membutuhkan <strong>{rooms.length * (formData.invigilatorsPerRoom || 2)} pengawas ujian</strong>.
                  </p>
                </div>
              </div>

              {/* Box 3: Aturan Metode Pembagian Siswa & Urutan Kelas */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-bold text-slate-800">
                      Aturan & Metode Pembagian Ruang Ujian
                    </label>
                    <span className="text-2xs font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      Konfigurasi Alokasi
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500 mt-0.5">
                    Pilih metode alokasi peserta: Berdasarkan Urutan Kelas, Silang Antar Kelas, atau Pengurutan NIS
                  </p>
                </div>

                {/* 5 Methods Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      (formData.sortMethod || 'class-order') === 'class-order'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-700" />
                        Urutan Kelas
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={(formData.sortMethod || 'class-order') === 'class-order'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'class-order' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-bold text-indigo-700 mt-1">STANDAR SEKOLAH</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Mengisi ruang berurutan per rombongan belajar kelas (7A, 7B, dst).
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-cross-class'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Shuffle className="w-3.5 h-3.5 text-slate-700" />
                        Silang Rombel
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-cross-class'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-cross-class' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-bold text-emerald-700 mt-1">ANTI MENCONTEK</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Menyilang siswa antar rombel bergantian di tiap ruang ujian.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-asc'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-slate-700" />
                        NIS Terkecil
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-asc'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-asc' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">ASCENDING</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Siswa dialokasikan urut NIS nomor terkecil ke terbesar.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-odd-even'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-700" />
                        Ganjil-Genap
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-odd-even'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-odd-even' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">SELINGAN NIS</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Membagi siswa selang-seling digit akhir NIS ganjil dan genap.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex flex-col justify-between ${
                      formData.sortMethod === 'nis-desc'
                        ? 'bg-white border-slate-900 shadow-2xs ring-1 ring-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-slate-700" />
                        NIS Terbesar
                      </span>
                      <input
                        type="radio"
                        name="menuSortMethod"
                        checked={formData.sortMethod === 'nis-desc'}
                        onChange={() => setFormData({ ...formData, sortMethod: 'nis-desc' })}
                        className="text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <span className="text-2xs font-semibold text-slate-600 mt-1">DESCENDING</span>
                    <p className="text-2xs text-slate-500 mt-1">
                      Siswa dialokasikan urut NIS terbesar (siswa angkatan terbaru).
                    </p>
                  </label>
                </div>

                {/* Sub-panel when class-order is selected */}
                {(formData.sortMethod || 'class-order') === 'class-order' && (
                  <div className="bg-white border border-indigo-200 rounded-lg p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Urutan Prioritas Kelas (Masuk ke Ruang 01, 02, dst)
                        </span>
                        <span className="text-2xs text-slate-500">
                          {currentClassOrder.length} rombongan belajar terdeteksi dari data siswa
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSortClassesAsc}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Urut A &rarr; Z
                        </button>
                        <button
                          type="button"
                          onClick={handleSortClassesDesc}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Urut Z &rarr; A
                        </button>
                        <button
                          type="button"
                          onClick={handleResetClassOrder}
                          className="px-2 py-0.5 text-2xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-700"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Class order items */}
                    <div className="flex flex-wrap items-center gap-2">
                      {currentClassOrder.map((clsName, idx) => (
                        <div
                          key={clsName}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-xs"
                        >
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white font-mono font-bold text-2xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">{clsName}</span>
                          <span className="text-2xs text-slate-500 font-mono">
                            ({classStats[clsName] || 0} siswa)
                          </span>
                          <div className="flex items-center gap-0.5 ml-1 border-l border-slate-200 pl-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveClass(idx, 'up')}
                              className={`p-0.5 rounded ${
                                idx === 0 ? 'text-slate-300' : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title="Pindahkan lebih awal"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === currentClassOrder.length - 1}
                              onClick={() => handleMoveClass(idx, 'down')}
                              className={`p-0.5 rounded ${
                                idx === currentClassOrder.length - 1
                                  ? 'text-slate-300'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title="Pindahkan lebih akhir"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Secondary rules: sort inside & policy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <label className="block text-2xs font-bold text-slate-700 mb-1">
                          Urutan Siswa Dalam Kelas
                        </label>
                        <select
                          value={formData.classSortInside || 'nis-asc'}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              classSortInside: e.target.value as 'nis-asc' | 'name-asc',
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        >
                          <option value="nis-asc">Nomor Induk Siswa (NIS Naik)</option>
                          <option value="name-asc">Nama Lengkap Siswa (A - Z Sesuai Absen)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-2xs font-bold text-slate-700 mb-1">
                          Kebijakan Pengisian Kursi Ruang
                        </label>
                        <select
                          value={formData.classFillPolicy || 'continuous'}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              classFillPolicy: e.target.value as 'continuous' | 'separate-room',
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                        >
                          <option value="continuous">Berkelanjutan / Isi Penuh Kursi (Continuous)</option>
                          <option value="separate-room">Buka Ruang Baru Tiap Kelas (Separate Room)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Strategi Distribusi: Fill-First vs Even Distribution */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Strategi Pembebanan Ruangan
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        (formData.roomDistributionMode || 'fill-first') === 'fill-first'
                          ? 'bg-white border-slate-900 shadow-2xs'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roomDistributionMode"
                        checked={(formData.roomDistributionMode || 'fill-first') === 'fill-first'}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            roomDistributionMode: 'fill-first',
                          })
                        }
                        className="mt-0.5 text-slate-900 focus:ring-slate-900"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Isi Penuh Berurutan (Sequential / Fill-First)
                        </span>
                        <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                          Ruang 01 diisi hingga kapasitas maksimum ({formData.defaultRoomCapacity} kursi), lalu sisa siswa dialokasikan ke Ruang 02, dst. Hemat penggunaan ruang dan pengawas jika peserta sedikit.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.roomDistributionMode === 'even-distribution'
                          ? 'bg-white border-slate-900 shadow-2xs'
                          : 'bg-white/60 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roomDistributionMode"
                        checked={formData.roomDistributionMode === 'even-distribution'}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            roomDistributionMode: 'even-distribution',
                          })
                        }
                        className="mt-0.5 text-slate-900 focus:ring-slate-900"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Pemerataan Seimbang (Balanced / Even Distribution)
                        </span>
                        <p className="text-2xs text-slate-500 mt-0.5 leading-relaxed">
                          Beban siswa dibagi rata ke seluruh {rooms.length} ruang aktif (rata-rata ~{Math.round(students.length / Math.max(1, rooms.length))} siswa/ruang). Kepadatan kelas seragam dan jarak antar siswa lebih lega.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Aturan Standar Kursi Tiap Ruangan */}
            <div className="space-y-4 pt-2 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                Aturan & Standar Jumlah Kursi Tiap Ruangan
              </span>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Kapasitas Standar per Ruang
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={formData.defaultRoomCapacity}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          defaultRoomCapacity: parseInt(e.target.value, 10) || 20,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">kursi / ruang</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Standar POS Ujian umumnya menetapkan 20 s/d 24 kursi per ruang agar jarak antar siswa terjaga.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Jumlah Kolom Tata Letak Meja
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="2"
                      max="6"
                      value={formData.defaultRoomColumns}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          defaultRoomColumns: parseInt(e.target.value, 10) || 4,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">kolom meja</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Format 4 kolom (4 x 6 baris) atau 5 kolom memudahkan pengawas memantau seluruh baris.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Batas Maksimal Kursi per Ruang
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="80"
                      value={formData.maxSeatRule}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxSeatRule: parseInt(e.target.value, 10) || 30,
                        })
                      }
                      className="w-24 px-3 py-1.5 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                    />
                    <span className="text-xs text-slate-600">maksimal kursi</span>
                  </div>
                  <p className="text-2xs text-slate-500 leading-relaxed">
                    Peringatan otomatis jika panitia memasukkan kapasitas melebihi ambang batas ini.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2 text-amber-900">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Terapkan Serentak ke Semua Ruangan</span>
                    <p className="text-2xs text-amber-800 mt-0.5">
                      Klik tombol di samping untuk menyamakan kapasitas seluruh {rooms.length} ruang menjadi {formData.defaultRoomCapacity} kursi & {formData.defaultRoomColumns} kolom.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyUniformCapacity}
                  className="px-4 py-2 font-bold text-xs bg-slate-900 text-white hover:bg-slate-800 rounded-md whitespace-nowrap shadow-xs transition-colors shrink-0"
                >
                  Terapkan ke Semua Ruang
                </button>
              </div>
            </div>

            {/* 4. Tabel Monitoring Banyaknya Ruang Saat Ini */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Daftar & Konfigurasi {rooms.length} Ruang Ujian Aktif
                </h3>
                <span className="text-2xs text-slate-500">
                  Total Kapasitas: {totalCapacity} kursi | Distribusi: {(formData.roomDistributionMode || 'fill-first') === 'fill-first' ? 'Isi Penuh' : 'Pemerataan'}
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Kode</th>
                      <th className="py-2.5 px-3">Nama Ruang</th>
                      <th className="py-2.5 px-3">Lokasi / Gedung</th>
                      <th className="py-2.5 px-3 text-center">Kapasitas Kursi</th>
                      <th className="py-2.5 px-3 text-center">Jumlah Kolom</th>
                      <th className="py-2.5 px-3 text-center">Tata Letak (Baris x Kolom)</th>
                      <th className="py-2.5 px-3">Pengawas Ruang</th>
                      <th className="py-2.5 px-3 text-center">Status Aturan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rooms.map((room) => {
                      const rows = Math.ceil(room.capacity / room.columns);
                      const isOverMax = room.capacity > formData.maxSeatRule;

                      return (
                        <tr key={room.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            {room.code}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{room.name}</td>
                          <td className="py-2.5 px-3 text-slate-600">{room.building}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                            {room.capacity}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                            {room.columns} Kolom
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                            {rows} baris &times; {room.columns} kolom
                          </td>
                          <td className="py-2.5 px-3 text-2xs text-slate-700 truncate max-w-[150px]" title={`${room.invigilator1}${room.invigilator2 ? ` & ${room.invigilator2}` : ''}`}>
                            <span className="font-semibold block">{room.invigilator1}</span>
                            {room.invigilator2 && <span className="text-slate-500">{room.invigilator2}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isOverMax ? (
                              <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                Melebihi Batas POS
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Sesuai Standar
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-2xs text-slate-500">
                Aturan yang disimpan akan diterapkan ke seluruh modul alokasi, denah, kartu peserta, dan cetak dokumen.
              </span>
              <button
                type="button"
                onClick={() => handleSaveSettings()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Seluruh Aturan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. ATURAN IDENTITAS SEKOLAH UNTUK KOP (DUAL LOGO)        */}
      {/* ======================================================== */}
      {subTab === 'rules-kop' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Aturan Identitas Sekolah & Desain Kop Surat Resmi
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Konfigurasi kop surat resmi berlogo ganda: <strong>Logo Kiri (Pemda/Dinas)</strong> dan{' '}
                <strong>Logo Kanan (Sekolah)</strong>
              </p>
            </div>

            {/* Hidden File Inputs */}
            <input
              type="file"
              ref={fileInputPemdaRef}
              onChange={(e) => handleLogoUpload(e, 'pemda')}
              accept="image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={fileInputSchoolRef}
              onChange={(e) => handleLogoUpload(e, 'school')}
              accept="image/*"
              className="hidden"
            />

            {/* Dual Logo Upload Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Left Logo: PEMDA */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">
                      1. LOGO KIRI (PEMERINTAH DAERAH / DINAS)
                    </span>
                    <span className="text-2xs font-mono text-slate-500">Posisi: Kiri Kop</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border border-slate-300 bg-white p-2 flex items-center justify-center shrink-0 shadow-2xs">
                      <img
                        src={formData.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                        alt="Logo Pemda"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">Logo Pemda / Yayasan</p>
                      <p className="text-2xs text-slate-500">
                        Lambang Pemerintah Provinsi / Kabupaten / Dinas Pendidikan / Kemenag.
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputPemdaRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Ganti Logo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, logoLeftPemda: DEFAULT_PEMDA_LOGO }));
                            showFeedback('Logo Kiri dikembalikan ke default Pemda.');
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-transparent rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Logo: SEKOLAH */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-900">
                      2. LOGO KANAN (LOGO SATUAN PENDIDIKAN / SEKOLAH)
                    </span>
                    <span className="text-2xs font-mono text-slate-500">Posisi: Kanan Kop</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-lg border border-slate-300 bg-white p-2 flex items-center justify-center shrink-0 shadow-2xs">
                      <img
                        src={formData.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                        alt="Logo Sekolah"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">Logo Resmi Sekolah</p>
                      <p className="text-2xs text-slate-500">
                        Lambang Tut Wuri Handayani atau Logo resmi SMA/SMK/SMP bersangkutan.
                      </p>
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputSchoolRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-800 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Ganti Logo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, logoRightSchool: DEFAULT_SCHOOL_LOGO }));
                            showFeedback('Logo Kanan dikembalikan ke default Sekolah.');
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-transparent rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* School Text Details */}
            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs pt-3 border-t border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Pemerintah Daerah / Yayasan (Baris 1 Kop)
                </label>
                <input
                  type="text"
                  required
                  value={formData.governmentName}
                  onChange={(e) => setFormData({ ...formData, governmentName: e.target.value.toUpperCase() })}
                  placeholder="Contoh: PEMERINTAH PROVINSI DAERAH KHUSUS IBUKOTA JAKARTA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none uppercase font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Kegiatan Ujian / Asesmen *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.activityName || formData.examTitle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        activityName: e.target.value,
                        examTitle: e.target.value,
                      })
                    }
                    placeholder="Contoh: Penilaian Akhir Semester (PAS) Ganjil"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tahun Pelajaran (TP) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                    placeholder="Contoh: 2026/2027"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Satuan Pendidikan / Sekolah (Baris 2 Utama Tebal)
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolName}
                  onChange={(e) => setFormData({ ...formData, schoolName: e.target.value.toUpperCase() })}
                  placeholder="Contoh: SMA NEGERI 1 TELADAN NUSANTARA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-bold uppercase text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alamat Lengkap Sekolah (Baris 3 Kop)
                </label>
                <input
                  type="text"
                  required
                  value={formData.schoolAddress}
                  onChange={(e) => setFormData({ ...formData, schoolAddress: e.target.value })}
                  placeholder="Contoh: Jl. Pemuda Pendidikan No. 45, Gambir, Jakarta Pusat"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">No. Telepon</label>
                  <input
                    type="text"
                    value={formData.schoolPhone}
                    onChange={(e) => setFormData({ ...formData, schoolPhone: e.target.value })}
                    placeholder="(021) 3840192"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Resmi</label>
                  <input
                    type="email"
                    value={formData.schoolEmail}
                    onChange={(e) => setFormData({ ...formData, schoolEmail: e.target.value })}
                    placeholder="info@sman1teladan.sch.id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Website</label>
                  <input
                    type="text"
                    value={formData.schoolWebsite}
                    onChange={(e) => setFormData({ ...formData, schoolWebsite: e.target.value })}
                    placeholder="www.sman1teladan.sch.id"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Pos</label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="10110"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* LIVE PREVIEW OF KOP SURAT */}
              <div className="pt-4">
                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Pratinjau Hasil Desain Kop Surat Resmi (Garis Ganda & Dua Logo)
                </span>

                <div className="bg-white border border-slate-300 p-6 rounded-lg shadow-xs">
                  <div className="flex items-center justify-between gap-4 pb-3">
                    {/* Left: Pemda Logo */}
                    <div className="w-16 h-16 flex items-center justify-center shrink-0">
                      <img
                        src={formData.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                        alt="Logo Pemda"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    {/* Center: Kop Typography */}
                    <div className="flex-1 text-center space-y-0.5">
                      <p className="text-xs font-semibold text-slate-900 tracking-wider">
                        {formData.governmentName || 'PEMERINTAH DAERAH'}
                      </p>
                      <h3 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight font-serif uppercase">
                        {formData.schoolName || 'NAMA SATUAN PENDIDIKAN'}
                      </h3>
                      <p className="text-2xs text-slate-600">
                        {formData.schoolAddress}
                        {formData.schoolPhone ? ` | Telp: ${formData.schoolPhone}` : ''}
                        {formData.postalCode ? ` Kode Pos ${formData.postalCode}` : ''}
                      </p>
                      <p className="text-2xs text-slate-500 font-mono">
                        {formData.schoolEmail ? `Email: ${formData.schoolEmail}` : ''}
                        {formData.schoolWebsite ? ` | Website: ${formData.schoolWebsite}` : ''}
                      </p>
                    </div>

                    {/* Right: School Logo */}
                    <div className="w-16 h-16 flex items-center justify-center shrink-0">
                      <img
                        src={formData.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                        alt="Logo Sekolah"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Official Double Border Line Divider */}
                  <div className="w-full border-b-[3px] border-b-black border-double pt-1" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Identitas Kop Surat</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TAMPILAN / PREVIEW DOKUMEN RESMI (A4 PAPER VIEW)      */}
      {/* ======================================================== */}
      {subTab === 'preview' && (
        <div className="space-y-4">
          {/* Document Type Switcher Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Pilih Dokumen:</span>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
                <button
                  onClick={() => setPreviewDocType('door')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'door'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <DoorOpen className="w-3.5 h-3.5 text-slate-600" />
                  <span>Tempelan Pintu</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('seating')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'seating'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
                  <span>Denah Tempat Duduk</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('attendance')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'attendance'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Daftar Hadir Ujian</span>
                </button>

                <button
                  onClick={() => setPreviewDocType('card')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    previewDocType === 'card'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-600" />
                  <span>Kartu Peserta Ujian</span>
                </button>
              </div>
            </div>

            {/* Dynamic Selector: Student if 'card', Room if others */}
            <div className="flex flex-wrap items-center gap-2">
              {previewDocType === 'card' ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Pilih Siswa:</span>
                  <select
                    value={selectedPreviewStudentId}
                    onChange={(e) => setSelectedPreviewStudentId(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none max-w-[210px] truncate"
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} - {s.name} ({s.className})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Pilih Ruangan:</span>
                  <select
                    value={selectedPreviewRoomId}
                    onChange={(e) => setSelectedPreviewRoomId(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-md focus:border-slate-900 focus:outline-none"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code}) - {r.capacity} Kursi
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action buttons */}
              <button
                onClick={() => {
                  if (previewDocType === 'door' && selectedRoom) exportDoorPosterPdf(selectedRoom, students, settings);
                  if (previewDocType === 'attendance' && selectedRoom) exportAttendancePdfForRoom(selectedRoom, students, settings);
                  if (previewDocType === 'seating') window.print();
                  if (previewDocType === 'card') {
                    if (selectedStudent) {
                      exportSingleStudentCardPdf(selectedStudent, settings, schedules);
                    } else {
                      exportExamCardsPdf(students, settings, schedules);
                    }
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-2xs"
                title="Unduh PDF Resmi Dokumen Ini"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{previewDocType === 'card' ? 'Unduh Kartu PDF' : 'Unduh PDF'}</span>
              </button>

              {previewDocType === 'card' && (
                <button
                  onClick={() => exportExamCardsPdf(students, settings, schedules)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  title="Unduh Seluruh Kartu Siswa"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Semua Siswa</span>
                </button>
              )}

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                title="Cetak via Browser"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Cetak</span>
              </button>
            </div>
          </div>

          {/* REALISTIC A4 SHEET VIEWPORT */}
          <div className="bg-slate-200/70 p-4 sm:p-8 rounded-xl overflow-x-auto flex justify-center">
            <div className="bg-white shadow-xl border border-slate-300 max-w-[850px] w-full min-h-[1100px] p-8 sm:p-12 text-slate-900 font-sans">
              {/* --- KOP SURAT RESMI BERSAMA DUA LOGO (Untuk Dokumen Pintu, Denah, dan Absensi) --- */}
              {previewDocType !== 'card' && (
                <>
                  <div className="flex items-center justify-between gap-4 pb-3">
                    {/* Logo Kiri: Pemda */}
                    <div className="w-16 h-16 flex items-center justify-center shrink-0">
                      <img
                        src={settings.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                        alt="Logo Pemda"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>

                    {/* Kop Text */}
                    <div className="flex-1 text-center space-y-0.5">
                      <p className="text-xs font-bold text-slate-800 tracking-widest uppercase">
                        {settings.governmentName}
                      </p>
                      <h2 className="text-lg sm:text-xl font-bold text-slate-950 font-serif tracking-tight uppercase">
                        {settings.schoolName}
                      </h2>
                      <p className="text-2xs text-slate-600">
                        {settings.schoolAddress}
                        {settings.schoolPhone ? ` | Telp: ${settings.schoolPhone}` : ''}
                        {settings.postalCode ? ` Kode Pos ${settings.postalCode}` : ''}
                      </p>
                      <p className="text-2xs text-slate-500 font-mono">
                        {settings.schoolEmail ? `Email: ${settings.schoolEmail}` : ''}
                        {settings.schoolWebsite ? ` | Website: ${settings.schoolWebsite}` : ''}
                      </p>
                    </div>

                    {/* Logo Kanan: Sekolah */}
                    <div className="w-16 h-16 flex items-center justify-center shrink-0">
                      <img
                        src={settings.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                        alt="Logo Sekolah"
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Double Line Border */}
                  <div className="w-full border-b-[3px] border-b-black border-double mb-5" />
                </>
              )}

              {/* ======================================================== */}
              {/* DOC 1 PREVIEW: TEMPELAN PINTU RUANG UJIAN                */}
              {/* ======================================================== */}
              {previewDocType === 'door' && (
                <div className="space-y-4">
                  {/* Big Room Header Title */}
                  <div className="bg-slate-900 text-white p-4 rounded-md text-center space-y-1">
                    <span className="text-2xs uppercase tracking-widest text-slate-300 font-mono">
                      DAFTAR TEMPELAN PINTU RUANG UJIAN
                    </span>
                    <h1 className="text-2xl font-bold tracking-tight">
                      {selectedRoom?.name.toUpperCase()} ({selectedRoom?.code})
                    </h1>
                    <p className="text-xs text-slate-300">
                      {settings.examTitle} &middot; Tahun Ajaran {settings.academicYear}
                    </p>
                  </div>

                  {/* Room Info Ribbon */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-100 p-3 rounded-md border border-slate-200">
                    <div>
                      <span className="text-2xs text-slate-500 block">LOKASI / GEDUNG</span>
                      <strong className="text-slate-900">{selectedRoom?.building}</strong>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">ATURAN KAPASITAS</span>
                      <strong className="text-slate-900 font-mono">
                        {roomStudents.length} / {selectedRoom?.capacity} Kursi Terisi
                      </strong>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">RENTANG NIS</span>
                      <strong className="text-slate-900 font-mono">
                        {roomStudents.length > 0
                          ? `${roomStudents[0].nis} - ${roomStudents[roomStudents.length - 1].nis}`
                          : '-'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-2xs text-slate-500 block">SESI UJIAN</span>
                      <strong className="text-slate-900">{settings.examSession}</strong>
                    </div>
                  </div>

                  {/* Notice Box for Students */}
                  <div className="bg-amber-50 border border-amber-200 rounded p-2.5 text-2xs text-amber-900">
                    <strong>Pemberitahuan Peserta:</strong> Denah di bawah mengikuti aturan kapasitas {selectedRoom?.capacity} meja ({selectedRoom?.columns} kolom). Pastikan Anda duduk di nomor meja yang sesuai dengan NIS dan Nomor Peserta. Harap siapkan Kartu Tanda Peserta sebelum memasuki ruangan.
                  </div>

                  {/* Table of Students conforming to Chair Rules */}
                  <div className="border border-slate-300 rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-white font-semibold">
                        <tr>
                          <th className="py-2 px-3 text-center w-20">No Meja</th>
                          <th className="py-2 px-3">No. Peserta</th>
                          <th className="py-2 px-3">NIS</th>
                          <th className="py-2 px-3">Nama Lengkap Siswa</th>
                          <th className="py-2 px-3">Kelas</th>
                          <th className="py-2 px-3 text-center w-12">L/P</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {Array.from({ length: selectedRoom?.capacity || 24 }).map((_, idx) => {
                          const seatNo = idx + 1;
                          const st = roomStudents.find((s) => s.seatNumber === seatNo);

                          if (st) {
                            return (
                              <tr key={seatNo} className="hover:bg-slate-50">
                                <td className="py-1.5 px-3 text-center font-mono font-bold text-slate-900 bg-slate-100">
                                  Meja {String(seatNo).padStart(2, '0')}
                                </td>
                                <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                                  {st.participantNo}
                                </td>
                                <td className="py-1.5 px-3 font-mono text-slate-700">
                                  {st.nis}
                                </td>
                                <td className="py-1.5 px-3 font-semibold text-slate-900">
                                  {st.name}
                                </td>
                                <td className="py-1.5 px-3 text-slate-700">
                                  {st.className}
                                </td>
                                <td className="py-1.5 px-3 text-center font-mono font-semibold">
                                  {st.gender}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={seatNo} className="bg-slate-50/50 text-slate-400">
                              <td className="py-1.5 px-3 text-center font-mono text-slate-400">
                                Meja {String(seatNo).padStart(2, '0')}
                              </td>
                              <td className="py-1.5 px-3 font-mono">-</td>
                              <td className="py-1.5 px-3 font-mono">-</td>
                              <td className="py-1.5 px-3 italic text-slate-500 font-medium">
                                [ KURSI KOSONG / TERSEDIA ]
                              </td>
                              <td className="py-1.5 px-3">-</td>
                              <td className="py-1.5 px-3 text-center">-</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer note */}
                  <div className="pt-4 flex justify-between items-end text-xs text-slate-600 border-t border-slate-200">
                    <div>
                      <span>Dicetak dari Sistem Administrasi Ujian Resmi</span>
                      <p className="text-2xs text-slate-400">Harap ditempel di daun pintu masuk ruang ujian.</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{settings.schoolName}</p>
                      <p className="text-2xs">Panitia Penyelenggara Ujian</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* DOC 2 PREVIEW: DENAH TEMPAT DUDUK (PHYSICAL SEAT GRID)   */}
              {/* ======================================================== */}
              {previewDocType === 'seating' && (
                <div className="space-y-4">
                  <div className="text-center pb-2">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight uppercase">
                      DENAH TATA LETAK TEMPAT DUDUK PESERTA
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      {selectedRoom?.name.toUpperCase()} &middot; {selectedRoom?.building} &middot; Kapasitas {selectedRoom?.capacity} Meja
                    </p>
                  </div>

                  {/* Blackboard & Invigilator Desk */}
                  <div className="space-y-2">
                    <div className="w-full bg-slate-800 text-white text-center py-2 rounded font-mono text-xs font-bold uppercase tracking-wider">
                      [ PAPAN TULIS DEPAN KELAS ]
                    </div>

                    <div className="w-64 mx-auto bg-amber-50 border border-amber-300 rounded p-2 text-center text-xs text-amber-900">
                      <strong>MEJA PENGAWAS RUANG</strong>
                      <p className="text-2xs truncate">
                        {selectedRoom?.invigilator1} {selectedRoom?.invigilator2 ? `& ${selectedRoom.invigilator2}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Desk Grid */}
                  <div
                    className="grid gap-2.5 py-4"
                    style={{
                      gridTemplateColumns: `repeat(${selectedRoom?.columns || 4}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: selectedRoom?.capacity || 24 }).map((_, idx) => {
                      const seatNo = idx + 1;
                      const student = roomStudents.find((s) => s.seatNumber === seatNo);

                      if (student) {
                        return (
                          <div
                            key={seatNo}
                            className="border border-slate-300 rounded p-2 text-left bg-slate-50/80 shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                              <span className="font-mono text-2xs font-bold text-slate-900">
                                Meja {String(seatNo).padStart(2, '0')}
                              </span>
                              <span className="font-mono text-2xs font-bold text-slate-700">
                                ({student.gender})
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-950 truncate leading-tight" title={student.name}>
                              {student.name}
                            </p>
                            <div className="flex items-center justify-between text-2xs text-slate-600 font-mono">
                              <span>{student.nis}</span>
                              <span className="font-sans font-medium">{student.className}</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={seatNo}
                          className="border border-dashed border-slate-300 rounded p-2 text-left bg-white text-slate-300 flex flex-col justify-between"
                        >
                          <span className="font-mono text-2xs">Meja {String(seatNo).padStart(2, '0')}</span>
                          <span className="text-2xs text-center italic py-2">(Kosong)</span>
                          <span className="text-2xs text-slate-300 font-mono">Tersedia</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-center font-mono text-2xs text-slate-400 uppercase tracking-widest pt-2">
                    [ PINTU MASUK / BELAKANG KELAS ]
                  </div>

                  {/* Supervisor Signature Block */}
                  <div className="pt-6 grid grid-cols-2 text-center text-xs text-slate-800">
                    <div>
                      <p>Mengetahui,</p>
                      <p className="font-bold">Pengawas Ruang 1</p>
                      <div className="h-14" />
                      <p className="font-bold underline">({selectedRoom?.invigilator1})</p>
                    </div>
                    <div>
                      <p>Petugas Ruang,</p>
                      <p className="font-bold">Pengawas Ruang 2</p>
                      <div className="h-14" />
                      <p className="font-bold underline">({selectedRoom?.invigilator2 || '.....................................'})</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* DOC 3 PREVIEW: DAFTAR HADIR & BERITA ACARA UJIAN         */}
              {/* ======================================================== */}
              {previewDocType === 'attendance' && (
                <div className="space-y-4">
                  <div className="text-center pb-1">
                    <h2 className="text-base font-bold text-slate-900 tracking-tight uppercase">
                      DAFTAR HADIR PESERTA & BERITA ACARA UJIAN
                    </h2>
                    <p className="text-xs font-semibold text-slate-700">
                      {settings.examTitle} &middot; TAHUN AJARAN {settings.academicYear}
                    </p>
                  </div>

                  {/* Official Metadata */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs py-2 border-y border-slate-300">
                    <div className="flex">
                      <span className="w-28 text-slate-600">Mata Pelajaran</span>
                      <span>: .................................................</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Ruang Ujian</span>
                      <span className="font-bold">: {selectedRoom?.name} ({selectedRoom?.code})</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Hari / Tanggal</span>
                      <span>: {settings.examDate}</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Gedung / Lokasi</span>
                      <span>: {selectedRoom?.building}</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Waktu / Sesi</span>
                      <span>: {settings.examSession}</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Aturan Kursi</span>
                      <span className="font-semibold">: Kapasitas {selectedRoom?.capacity} Meja (Terisi: {roomStudents.length}, Kosong: {Math.max(0, (selectedRoom?.capacity || 0) - roomStudents.length)})</span>
                    </div>
                    <div className="flex">
                      <span className="w-28 text-slate-600">Pengawas Ruang</span>
                      <span className="truncate">: {selectedRoom?.invigilator1}</span>
                    </div>
                  </div>

                  {/* Attendance Table with Staggered Signature lines conforming to Chair Rules */}
                  <div className="border border-slate-400 rounded overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-400">
                        <tr>
                          <th className="py-2 px-2 text-center w-10 border-r border-slate-300">No</th>
                          <th className="py-2 px-2 text-center w-12 border-r border-slate-300">Kursi</th>
                          <th className="py-2 px-2 border-r border-slate-300">No. Peserta</th>
                          <th className="py-2 px-2 border-r border-slate-300">NIS</th>
                          <th className="py-2 px-2 border-r border-slate-300">Nama Lengkap Siswa</th>
                          <th className="py-2 px-2 text-center w-10 border-r border-slate-300">L/P</th>
                          <th className="py-2 px-2 border-r border-slate-300">Kelas</th>
                          <th className="py-2 px-2 text-center w-40" colSpan={2}>
                            Tanda Tangan Peserta
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {Array.from({ length: selectedRoom?.capacity || 24 }).map((_, idx) => {
                          const seatNo = idx + 1;
                          const st = roomStudents.find((s) => s.seatNumber === seatNo);
                          const isOdd = seatNo % 2 !== 0;

                          if (st) {
                            return (
                              <tr key={seatNo} className="hover:bg-slate-50">
                                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-300">
                                  {seatNo}
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono font-bold border-r border-slate-300">
                                  {String(seatNo).padStart(2, '0')}
                                </td>
                                <td className="py-1.5 px-2 font-mono font-semibold border-r border-slate-300">
                                  {st.participantNo}
                                </td>
                                <td className="py-1.5 px-2 font-mono border-r border-slate-300">
                                  {st.nis}
                                </td>
                                <td className="py-1.5 px-2 font-medium text-slate-900 border-r border-slate-300">
                                  {st.name}
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono border-r border-slate-300">
                                  {st.gender}
                                </td>
                                <td className="py-1.5 px-2 border-r border-slate-300">
                                  {st.className}
                                </td>
                                <td className="py-1.5 px-2 w-20 text-slate-500 border-r border-slate-200">
                                  {isOdd ? `${seatNo}. ....................` : ''}
                                </td>
                                <td className="py-1.5 px-2 w-20 text-slate-500">
                                  {!isOdd ? `${seatNo}. ....................` : ''}
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={seatNo} className="bg-slate-50/50 text-slate-400">
                              <td className="py-1.5 px-2 text-center font-mono border-r border-slate-300">
                                {seatNo}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono border-r border-slate-300">
                                {String(seatNo).padStart(2, '0')}
                              </td>
                              <td className="py-1.5 px-2 font-mono border-r border-slate-300">-</td>
                              <td className="py-1.5 px-2 font-mono border-r border-slate-300">-</td>
                              <td className="py-1.5 px-2 italic text-slate-500 font-medium border-r border-slate-300">
                                [ KURSI KOSONG / TERSEDIA ]
                              </td>
                              <td className="py-1.5 px-2 text-center border-r border-slate-300">-</td>
                              <td className="py-1.5 px-2 border-r border-slate-300">-</td>
                              <td className="py-1.5 px-2 text-center text-slate-300 border-r border-slate-200">
                                ----------
                              </td>
                              <td className="py-1.5 px-2 text-center text-slate-300">
                                ----------
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Attendance Count Summary */}
                  <div className="grid grid-cols-2 gap-4 text-xs pt-2">
                    <div className="space-y-1 text-slate-700">
                      <p>Aturan Kapasitas Ruang : <strong>{selectedRoom?.capacity} Meja ({selectedRoom?.columns} Kolom)</strong></p>
                      <p>Jumlah Peserta Terisi / Terdaftar : <strong>{roomStudents.length} Orang</strong></p>
                      <p>Jumlah Kursi Kosong / Tersedia : <strong>{Math.max(0, (selectedRoom?.capacity || 0) - roomStudents.length)} Meja</strong></p>
                    </div>
                    <div className="space-y-1 text-slate-700 text-right">
                      <p>Jumlah Peserta Hadir : <strong>......... Orang</strong></p>
                      <p>Jumlah Peserta Tidak Hadir : <strong>......... Orang</strong></p>
                    </div>
                  </div>

                  {/* Dual Signatures */}
                  <div className="pt-6 grid grid-cols-2 text-center text-xs text-slate-800">
                    <div>
                      <p>Mengetahui,</p>
                      <p className="font-bold">Pengawas Ruang 1</p>
                      <div className="h-16" />
                      <p className="font-bold underline">({selectedRoom?.invigilator1})</p>
                      <p className="text-2xs text-slate-500">NIP. .................................................</p>
                    </div>

                    <div>
                      <p>Petugas Ujian,</p>
                      <p className="font-bold">Pengawas Ruang 2</p>
                      <div className="h-16" />
                      <p className="font-bold underline">({selectedRoom?.invigilator2 || '...............................................'})</p>
                      <p className="text-2xs text-slate-500">NIP. .................................................</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* DOC 4 PREVIEW: KARTU PESERTA UJIAN (A4 SHEET)            */}
              {/* ======================================================== */}
              {previewDocType === 'card' && (
                <div className="space-y-6">
                  {/* Top info badge */}
                  <div className="bg-slate-100 border border-slate-300 rounded p-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-700" />
                      <span>
                        Format Cetak Standar: <strong>2 Kartu per Lembar Kertas A4</strong> (Siap Potong & Dilaminasi)
                      </span>
                    </div>
                    <span className="font-mono text-2xs text-slate-500">
                      Siswa Terpilih: <strong>{selectedStudent?.name}</strong> (NIS: {selectedStudent?.nis})
                    </span>
                  </div>

                  {/* Render 2 stacked cards as they would physically appear on the A4 page */}
                  {[
                    selectedStudent,
                    students.find((s) => s.id !== selectedStudent?.id) || selectedStudent,
                  ].map((cardStudent, cardIdx) => {
                    if (!cardStudent) return null;
                    return (
                      <React.Fragment key={cardIdx}>
                        {/* The Exam Card Container */}
                        <div className="border-2 border-slate-800 rounded-lg p-5 bg-white shadow-2xs space-y-4">
                          {/* Card Kop Surat with Dual Logos */}
                          <div className="flex items-center justify-between gap-3 border-b-2 border-slate-800 pb-2.5">
                            {/* Logo Kiri Pemda */}
                            <div className="w-12 h-12 flex items-center justify-center shrink-0">
                              <img
                                src={settings.logoLeftPemda || DEFAULT_PEMDA_LOGO}
                                alt="Logo Pemda"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>

                            {/* Center Kop Typography */}
                            <div className="flex-1 text-center space-y-0.5">
                              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                                {settings.schoolName}
                              </h3>
                              <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider font-serif">
                                KARTU PESERTA UJIAN
                              </h2>
                              <p className="text-2xs font-semibold text-slate-700 uppercase">
                                {settings.activityName || settings.examTitle} - TAHUN PELAJARAN {settings.academicYear}
                              </p>
                            </div>

                            {/* Logo Kanan Sekolah */}
                            <div className="w-12 h-12 flex items-center justify-center shrink-0">
                              <img
                                src={settings.logoRightSchool || DEFAULT_SCHOOL_LOGO}
                                alt="Logo Sekolah"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          </div>

                          {/* Student Identity Grid & Photo */}
                          <div className="flex gap-4 items-start">
                            {/* 2x3 Photo Box */}
                            <div className="w-20 h-26 rounded border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center p-1 shrink-0">
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 mb-1">
                                <Users className="w-4 h-4" />
                              </div>
                              <span className="text-3xs font-bold text-slate-400 uppercase">Pas Foto</span>
                              <span className="text-3xs text-slate-400">2 x 3 cm</span>
                            </div>

                            {/* Identity Fields */}
                            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">No. Peserta</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="font-mono font-bold text-slate-950 text-2xs">
                                  {cardStudent.participantNo || 'UJN-001'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">Ruang / Meja</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="font-mono font-bold text-slate-950 text-2xs">
                                  {cardStudent.roomName || 'Ruang 01'} (Meja {String(cardStudent.seatNumber || 1).padStart(2, '0')})
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">NIS / NISN</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="font-mono font-semibold text-slate-900 text-2xs">
                                  {cardStudent.nis} / {cardStudent.nisn || '-'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">Kelas / Rombel</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="font-semibold text-slate-900 text-2xs">
                                  {cardStudent.className}
                                </span>
                              </div>

                              <div className="flex items-baseline col-span-2">
                                <span className="w-24 text-slate-500 text-2xs">Nama Peserta</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="font-bold text-slate-950 uppercase text-xs">
                                  {cardStudent.name}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">Jenis Kelamin</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="text-slate-800 text-2xs">
                                  {cardStudent.gender === 'L' ? 'Laki-Laki (L)' : 'Perempuan (P)'}
                                </span>
                              </div>

                              <div className="flex items-baseline">
                                <span className="w-24 text-slate-500 text-2xs">Sesi Ujian</span>
                                <span className="text-slate-400 mr-2 text-2xs">:</span>
                                <span className="text-slate-800 text-2xs">
                                  {settings.examSession}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Timetable AutoTable with TTD/Paraf Pengawas Ruang */}
                          <div className="border border-slate-300 rounded overflow-hidden">
                            <table className="w-full text-left text-2xs">
                              <thead className="bg-slate-900 text-white font-semibold">
                                <tr>
                                  <th className="py-1 px-2 w-7 text-center">No</th>
                                  <th className="py-1 px-2 w-32">Hari / Tanggal</th>
                                  <th className="py-1 px-2 w-28 text-center">Waktu</th>
                                  <th className="py-1 px-2">Mata Pelajaran Ujian</th>
                                  <th className="py-1 px-2 w-28 text-center bg-slate-800">
                                    Paraf Pengawas
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {(schedules.length > 0
                                  ? schedules.slice(0, 6)
                                  : [
                                      { id: '1', day: 'Senin', date: '20 Oktober 2026', time: '07.30 - 09.30', subject: 'Bahasa Indonesia' },
                                      { id: '2', day: 'Senin', date: '20 Oktober 2026', time: '10.00 - 11.30', subject: 'Pendidikan Agama' },
                                      { id: '3', day: 'Selasa', date: '21 Oktober 2026', time: '07.30 - 09.30', subject: 'Matematika Wajib' },
                                      { id: '4', day: 'Selasa', date: '21 Oktober 2026', time: '10.00 - 11.30', subject: 'Pendidikan Pancasila' },
                                      { id: '5', day: 'Rabu', date: '22 Oktober 2026', time: '07.30 - 09.30', subject: 'Bahasa Inggris' },
                                      { id: '6', day: 'Rabu', date: '22 Oktober 2026', time: '10.00 - 11.30', subject: 'Sejarah Indonesia' },
                                    ]
                                ).map((sch, schIdx) => (
                                  <tr key={sch.id} className="hover:bg-slate-50">
                                    <td className="py-1 px-2 text-center font-mono text-slate-500 border-r border-slate-200">
                                      {schIdx + 1}
                                    </td>
                                    <td className="py-1 px-2 font-medium text-slate-800 border-r border-slate-200">
                                      {sch.day}, {sch.date}
                                    </td>
                                    <td className="py-1 px-2 text-center font-mono text-slate-600 border-r border-slate-200">
                                      {sch.time}
                                    </td>
                                    <td className="py-1 px-2 font-semibold text-slate-900 border-r border-slate-200">
                                      {sch.subject}
                                    </td>
                                    <td className="py-1 px-2 text-center bg-slate-50/70">
                                      <div className="w-14 h-5 mx-auto border border-dashed border-slate-300 rounded flex items-center justify-center text-3xs text-slate-400 font-mono">
                                        paraf
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Bottom Official Signatures */}
                          <div className="grid grid-cols-2 gap-6 text-xs text-center pt-1">
                            <div>
                              <p className="text-slate-600 text-2xs">Peserta Ujian,</p>
                              <div className="h-11" />
                              <p className="font-bold underline text-2xs uppercase">
                                ({cardStudent.name})
                              </p>
                              <p className="text-3xs text-slate-400 font-mono">NIS: {cardStudent.nis}</p>
                            </div>

                            <div>
                              <p className="text-slate-600 text-2xs">
                                Jakarta, {settings.examDate.split('-')[0].trim() || '20 Oktober 2026'}
                              </p>
                              <p className="font-bold text-slate-800 text-2xs">Ketua Panitia Ujian,</p>
                              <div className="h-9" />
                              <p className="font-bold underline text-2xs">
                                {settings.committeeHead}
                              </p>
                              <p className="text-3xs text-slate-500 font-mono">NIP. {settings.committeeNip}</p>
                            </div>
                          </div>
                        </div>

                        {/* Scissor Cutting Guideline Line between Card 1 and Card 2 */}
                        {cardIdx === 0 && (
                          <div className="py-2 flex items-center justify-center gap-2 text-2xs font-mono text-slate-400">
                            <span className="flex-1 border-b border-dashed border-slate-300" />
                            <span>✂ - - - - - - Gunting Di Sini - - - - - - ✂</span>
                            <span className="flex-1 border-b border-dashed border-slate-300" />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
