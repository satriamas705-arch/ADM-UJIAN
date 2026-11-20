export interface Student {
  id: string;
  nis: string;
  nisn?: string;
  name: string;
  className: string;
  gender: 'L' | 'P';
  // Allocation results
  roomId?: string;
  roomName?: string;
  seatNumber?: number;
  participantNo?: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  capacity: number;
  columns: number;
  building: string;
  invigilator1: string;
  invigilator2?: string;
}

export interface ExamScheduleItem {
  id: string;
  day: string;
  date: string;
  time: string;
  subject: string;
  grade: string;
  roomNotes?: string;
}

export type SortMethod = 'class-order' | 'nis-cross-class' | 'nis-asc' | 'nis-desc' | 'nis-odd-even';

export interface ExamSettings {
  // Kop Surat Identitas
  governmentName: string;
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolWebsite: string;
  postalCode: string;
  logoLeftPemda: string;
  logoRightSchool: string;

  // Ujian Info
  examTitle: string;
  activityName: string;
  academicYear: string;
  examDate: string;
  examSession: string;
  participantPrefix: string;
  sortMethod: SortMethod;

  // Pejabat Penandatangan
  headmaster: string;
  headmasterNip: string;
  committeeHead: string;
  committeeNip: string;

  // Aturan Kursi Ruang & Banyaknya Ruang
  defaultRoomCapacity: number;
  defaultRoomColumns: number;
  maxSeatRule: number;
  uniformCapacityMode: boolean;
  targetRoomCount?: number;
  maxRoomsAllowed?: number;
  roomDistributionMode?: 'fill-first' | 'even-distribution';
  invigilatorsPerRoom?: number;

  // Konfigurasi Pembagian Berdasarkan Urutan Kelas
  customClassOrder?: string[];
  classSortInside?: 'nis-asc' | 'name-asc';
  classFillPolicy?: 'continuous' | 'separate-room';
}

export interface AllocationSummary {
  totalStudents: number;
  allocatedStudents: number;
  unallocatedStudents: number;
  totalRooms: number;
  totalCapacity: number;
  remainingCapacity: number;
  roomBreakdowns: {
    room: Room;
    allocatedCount: number;
    occupancyRate: number;
    nisMin?: string;
    nisMax?: string;
    classCounts?: { className: string; count: number }[];
  }[];
}
