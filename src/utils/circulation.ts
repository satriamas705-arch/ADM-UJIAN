import { Student, Room, ExamScheduleItem } from '../types';

export type CirculationPattern =
  | 'fixed'
  | 'rotate-room-forward'
  | 'rotate-room-backward'
  | 'rotate-seat-shift';

export interface CellCirculationData {
  count: number;
  male: number;
  female: number;
  students: Student[];
  seatMin?: number;
  seatMax?: number;
  participantMin?: string;
  participantMax?: string;
}

export interface RoomCirculationRow {
  room: Room;
  total: number;
  male: number;
  female: number;
  remainingSeats: number;
  occupancyRate: number;
  participantMin?: string;
  participantMax?: string;
  byClass: Record<string, CellCirculationData>;
}

export interface ClassCirculationSummary {
  className: string;
  totalStudents: number;
  allocatedStudents: number;
  unallocatedStudents: number;
  male: number;
  female: number;
  roomDistributions: {
    room: Room;
    count: number;
    male: number;
    female: number;
    seatMin?: number;
    seatMax?: number;
    participantMin?: string;
    participantMax?: string;
    students: Student[];
  }[];
}

export interface RoomClassMatrixResult {
  classes: string[];
  rows: RoomCirculationRow[];
  classTotals: Record<string, { total: number; male: number; female: number; allocated: number }>;
  grandTotalAllocated: number;
  grandTotalStudents: number;
  grandTotalUnallocated: number;
  grandTotalMale: number;
  grandTotalFemale: number;
  grandTotalCapacity: number;
  grandTotalRemaining: number;
  classSummaries: ClassCirculationSummary[];
}

export interface CirculationDayEntry {
  dayIndex: number;
  dayLabel: string;
  dateLabel: string;
  subjects: string[];
  roomAssignments: {
    room: Room;
    sourceGroupLabel: string;
    sourceRoomCode: string;
    studentCount: number;
    classBreakdownText: string;
    seatShiftNote: string;
  }[];
}

/**
 * Natural sort for class names (e.g., X MIPA 1, X MIPA 2, XI IPA 1)
 */
export function getOrderedClasses(students: Student[], customClassOrder?: string[]): string[] {
  const classSet = new Set<string>();
  for (const s of students) {
    classSet.add(s.className?.trim() || 'Tanpa Kelas');
  }
  const detected = Array.from(classSet);

  if (customClassOrder && customClassOrder.length > 0) {
    const orderSet = new Set(customClassOrder);
    const ordered = customClassOrder.filter((c) => classSet.has(c));
    const remaining = detected
      .filter((c) => !orderSet.has(c))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return [...ordered, ...remaining];
  }

  return detected.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Builds full cross-tabulation matrix of participant circulation per Room and Class
 */
export function buildRoomClassMatrix(
  students: Student[],
  rooms: Room[],
  customClassOrder?: string[]
): RoomClassMatrixResult {
  const classes = getOrderedClasses(students, customClassOrder);

  const classTotals: Record<string, { total: number; male: number; female: number; allocated: number }> = {};
  for (const cls of classes) {
    classTotals[cls] = { total: 0, male: 0, female: 0, allocated: 0 };
  }

  for (const s of students) {
    const cls = s.className?.trim() || 'Tanpa Kelas';
    if (!classTotals[cls]) {
      classTotals[cls] = { total: 0, male: 0, female: 0, allocated: 0 };
    }
    classTotals[cls].total += 1;
    if (s.gender === 'L') classTotals[cls].male += 1;
    else classTotals[cls].female += 1;
    if (s.roomId) classTotals[cls].allocated += 1;
  }

  const rows: RoomCirculationRow[] = rooms.map((room) => {
    const roomStudents = students
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    const byClass: Record<string, CellCirculationData> = {};
    for (const cls of classes) {
      byClass[cls] = { count: 0, male: 0, female: 0, students: [] };
    }

    let male = 0;
    let female = 0;

    for (const s of roomStudents) {
      const cls = s.className?.trim() || 'Tanpa Kelas';
      if (!byClass[cls]) {
        byClass[cls] = { count: 0, male: 0, female: 0, students: [] };
      }
      byClass[cls].count += 1;
      if (s.gender === 'L') {
        byClass[cls].male += 1;
        male += 1;
      } else {
        byClass[cls].female += 1;
        female += 1;
      }
      byClass[cls].students.push(s);
    }

    // Compute seat and participant number ranges per cell
    for (const cls of classes) {
      const cell = byClass[cls];
      if (cell.students.length > 0) {
        const seats = cell.students
          .map((st) => st.seatNumber)
          .filter((n): n is number => typeof n === 'number')
          .sort((a, b) => a - b);
        if (seats.length > 0) {
          cell.seatMin = seats[0];
          cell.seatMax = seats[seats.length - 1];
        }
        const pNos = cell.students
          .map((st) => st.participantNo)
          .filter((p): p is string => Boolean(p))
          .sort();
        if (pNos.length > 0) {
          cell.participantMin = pNos[0];
          cell.participantMax = pNos[pNos.length - 1];
        }
      }
    }

    const roomPNos = roomStudents
      .map((st) => st.participantNo)
      .filter((p): p is string => Boolean(p))
      .sort();

    return {
      room,
      total: roomStudents.length,
      male,
      female,
      remainingSeats: Math.max(0, room.capacity - roomStudents.length),
      occupancyRate: Math.round((roomStudents.length / Math.max(1, room.capacity)) * 100),
      participantMin: roomPNos[0],
      participantMax: roomPNos[roomPNos.length - 1],
      byClass,
    };
  });

  // Build per-class summary showing how each class is circulated across rooms
  const classSummaries: ClassCirculationSummary[] = classes.map((cls) => {
    const classStudents = students.filter((s) => (s.className?.trim() || 'Tanpa Kelas') === cls);
    const allocated = classStudents.filter((s) => Boolean(s.roomId));
    const male = classStudents.filter((s) => s.gender === 'L').length;
    const female = classStudents.length - male;

    const roomDistributions = rows
      .filter((row) => (row.byClass[cls]?.count || 0) > 0)
      .map((row) => {
        const cell = row.byClass[cls];
        return {
          room: row.room,
          count: cell.count,
          male: cell.male,
          female: cell.female,
          seatMin: cell.seatMin,
          seatMax: cell.seatMax,
          participantMin: cell.participantMin,
          participantMax: cell.participantMax,
          students: cell.students,
        };
      });

    return {
      className: cls,
      totalStudents: classStudents.length,
      allocatedStudents: allocated.length,
      unallocatedStudents: Math.max(0, classStudents.length - allocated.length),
      male,
      female,
      roomDistributions,
    };
  });

  const grandTotalAllocated = rows.reduce((acc, r) => acc + r.total, 0);
  const grandTotalMale = rows.reduce((acc, r) => acc + r.male, 0);
  const grandTotalFemale = rows.reduce((acc, r) => acc + r.female, 0);
  const grandTotalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);

  return {
    classes,
    rows,
    classTotals,
    grandTotalAllocated,
    grandTotalStudents: students.length,
    grandTotalUnallocated: Math.max(0, students.length - grandTotalAllocated),
    grandTotalMale,
    grandTotalFemale,
    grandTotalCapacity,
    grandTotalRemaining: Math.max(0, grandTotalCapacity - grandTotalAllocated),
    classSummaries,
  };
}

/**
 * Extracts unique exam days from schedule or generates default day slots
 */
export function getExamDaysList(
  schedules: ExamScheduleItem[],
  customDayCount?: number
): { dayLabel: string; dateLabel: string; subjects: string[] }[] {
  const dayMap = new Map<string, { dayLabel: string; dateLabel: string; subjects: string[] }>();

  for (const item of schedules) {
    const key = `${item.day}|${item.date}`;
    const existing = dayMap.get(key);
    if (existing) {
      if (!existing.subjects.includes(item.subject)) {
        existing.subjects.push(item.subject);
      }
    } else {
      dayMap.set(key, {
        dayLabel: item.day,
        dateLabel: item.date,
        subjects: [item.subject],
      });
    }
  }

  const fromSchedule = Array.from(dayMap.values());
  const targetCount = customDayCount ?? Math.max(fromSchedule.length, 4);

  const result: { dayLabel: string; dateLabel: string; subjects: string[] }[] = [];
  for (let i = 0; i < targetCount; i++) {
    if (i < fromSchedule.length) {
      result.push(fromSchedule[i]);
    } else {
      result.push({
        dayLabel: `Hari ke-${i + 1}`,
        dateLabel: `Sesi Hari ${i + 1}`,
        subjects: ['Mata Pelajaran Ujian'],
      });
    }
  }
  return result;
}

/**
 * Generates daily room/seat circulation schedule based on chosen pattern
 */
export function buildCirculationSchedule(
  matrix: RoomClassMatrixResult,
  schedules: ExamScheduleItem[],
  pattern: CirculationPattern,
  dayCount?: number
): CirculationDayEntry[] {
  const days = getExamDaysList(schedules, dayCount);
  const roomRows = matrix.rows;
  const numRooms = roomRows.length;

  if (numRooms === 0) return [];

  return days.map((day, dayIdx) => {
    const roomAssignments = roomRows.map((targetRow, targetIdx) => {
      let sourceIdx = targetIdx;
      let seatShiftNote = 'Nomor meja tetap (Standar)';

      if (pattern === 'rotate-room-forward') {
        sourceIdx = (targetIdx - (dayIdx % numRooms) + numRooms) % numRooms;
        seatShiftNote =
          dayIdx === 0
            ? 'Posisi awal (Hari 1)'
            : `Rotasi ruang +${dayIdx % numRooms} (dari ${roomRows[sourceIdx].room.code})`;
      } else if (pattern === 'rotate-room-backward') {
        sourceIdx = (targetIdx + (dayIdx % numRooms)) % numRooms;
        seatShiftNote =
          dayIdx === 0
            ? 'Posisi awal (Hari 1)'
            : `Rotasi ruang -${dayIdx % numRooms} (dari ${roomRows[sourceIdx].room.code})`;
      } else if (pattern === 'rotate-seat-shift') {
        sourceIdx = targetIdx;
        const shiftCols = targetRow.room.columns || 4;
        const shiftSeats = dayIdx === 0 ? 0 : (dayIdx * shiftCols) % Math.max(1, targetRow.total || 1);
        seatShiftNote =
          dayIdx === 0
            ? 'Meja awal (Baris 1)'
            : `Geser +${shiftSeats} nomor meja (+${dayIdx} baris)`;
      }

      const sourceRow = roomRows[sourceIdx];
      const classParts = matrix.classes
        .filter((cls) => (sourceRow.byClass[cls]?.count || 0) > 0)
        .map((cls) => `${cls} (${sourceRow.byClass[cls].count})`);

      return {
        room: targetRow.room,
        sourceGroupLabel: `Kelompok ${sourceRow.room.name}`,
        sourceRoomCode: sourceRow.room.code,
        studentCount: sourceRow.total,
        classBreakdownText: classParts.length > 0 ? classParts.join(', ') : 'Kosong',
        seatShiftNote,
      };
    });

    return {
      dayIndex: dayIdx,
      dayLabel: day.dayLabel,
      dateLabel: day.dateLabel,
      subjects: day.subjects,
      roomAssignments,
    };
  });
}

/**
 * Applies a specific circulation day's rotation directly to the active Student allocation
 */
export function applyCirculationDayToStudents(
  students: Student[],
  rooms: Room[],
  pattern: CirculationPattern,
  dayIndex: number,
  participantPrefix: string
): Student[] {
  const numRooms = rooms.length;
  if (numRooms === 0 || dayIndex === 0 || pattern === 'fixed') return students;

  const prefix = participantPrefix || 'UJN';
  const roomIndexMap = new Map<string, number>();
  rooms.forEach((r, idx) => roomIndexMap.set(r.id, idx));

  // Group allocated students per room for seat shift calculation
  const roomStudentCounts = new Map<string, number>();
  for (const s of students) {
    if (s.roomId) {
      roomStudentCounts.set(s.roomId, (roomStudentCounts.get(s.roomId) || 0) + 1);
    }
  }

  return students.map((student) => {
    if (!student.roomId || !student.seatNumber) return student;
    const currentRoomIdx = roomIndexMap.get(student.roomId);
    if (currentRoomIdx === undefined) return student;

    if (pattern === 'rotate-room-forward' || pattern === 'rotate-room-backward') {
      const targetRoomIdx =
        pattern === 'rotate-room-forward'
          ? (currentRoomIdx + (dayIndex % numRooms)) % numRooms
          : (currentRoomIdx - (dayIndex % numRooms) + numRooms) % numRooms;
      const targetRoom = rooms[targetRoomIdx];
      const clampedSeat = Math.min(student.seatNumber, Math.max(1, targetRoom.capacity));
      const seatFormatted = String(clampedSeat).padStart(2, '0');
      return {
        ...student,
        roomId: targetRoom.id,
        roomName: targetRoom.name,
        seatNumber: clampedSeat,
        participantNo: `${prefix}-${targetRoom.code}-${seatFormatted}`,
      };
    }

    if (pattern === 'rotate-seat-shift') {
      const room = rooms[currentRoomIdx];
      const countInRoom = roomStudentCounts.get(room.id) || 1;
      const shiftStep = (dayIndex * (room.columns || 4)) % countInRoom;
      const newSeat = ((student.seatNumber - 1 + shiftStep) % countInRoom) + 1;
      const seatFormatted = String(newSeat).padStart(2, '0');
      return {
        ...student,
        seatNumber: newSeat,
        participantNo: `${prefix}-${room.code}-${seatFormatted}`,
      };
    }

    return student;
  });
}

export type MatrixQuotaMap = Record<string, Record<string, number>>;
export type MatrixSeatStyle = 'by-class-nis' | 'interleave-class' | 'by-class-name';

function compareNisNatural(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Extracts current Room x Class counts into an editable quota map
 */
export function buildQuotaMapFromMatrix(matrix: RoomClassMatrixResult): MatrixQuotaMap {
  const map: MatrixQuotaMap = {};
  for (const row of matrix.rows) {
    map[row.room.id] = {};
    for (const cls of matrix.classes) {
      map[row.room.id][cls] = row.byClass[cls]?.count || 0;
    }
  }
  return map;
}

/**
 * Generates an evenly distributed quota map across all rooms for every class
 */
export function generateEvenQuotaMap(
  students: Student[],
  rooms: Room[],
  classes: string[]
): MatrixQuotaMap {
  const map: MatrixQuotaMap = {};
  const roomRemaining: Record<string, number> = {};
  for (const r of rooms) {
    map[r.id] = {};
    roomRemaining[r.id] = Math.max(0, r.capacity);
    for (const cls of classes) {
      map[r.id][cls] = 0;
    }
  }

  if (rooms.length === 0) return map;

  // Count students per class
  const classCounts: Record<string, number> = {};
  for (const s of students) {
    const cls = s.className?.trim() || 'Tanpa Kelas';
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  // Round-robin distribute each class across rooms while respecting capacity
  let startRoomIdx = 0;
  for (const cls of classes) {
    let remaining = classCounts[cls] || 0;
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (let i = 0; i < rooms.length && remaining > 0; i++) {
        const room = rooms[(startRoomIdx + i) % rooms.length];
        if (roomRemaining[room.id] > 0) {
          map[room.id][cls] += 1;
          roomRemaining[room.id] -= 1;
          remaining -= 1;
          progress = true;
        }
      }
    }
    startRoomIdx = (startRoomIdx + 1) % rooms.length;
  }

  return map;
}

/**
 * Generates a sequential per-class quota map across all rooms
 */
export function generateSequentialQuotaMap(
  students: Student[],
  rooms: Room[],
  classes: string[]
): MatrixQuotaMap {
  const map: MatrixQuotaMap = {};
  const roomRemaining: Record<string, number> = {};
  for (const r of rooms) {
    map[r.id] = {};
    roomRemaining[r.id] = Math.max(0, r.capacity);
    for (const cls of classes) {
      map[r.id][cls] = 0;
    }
  }

  const classCounts: Record<string, number> = {};
  for (const s of students) {
    const cls = s.className?.trim() || 'Tanpa Kelas';
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  let roomIdx = 0;
  for (const cls of classes) {
    let remaining = classCounts[cls] || 0;
    while (remaining > 0 && roomIdx < rooms.length) {
      const room = rooms[roomIdx];
      const canPlace = Math.min(remaining, roomRemaining[room.id]);
      if (canPlace > 0) {
        map[room.id][cls] += canPlace;
        roomRemaining[room.id] -= canPlace;
        remaining -= canPlace;
      }
      if (roomRemaining[room.id] === 0) {
        roomIdx += 1;
      }
    }
  }

  return map;
}

/**
 * Copies one room's class quota pattern to all rooms, clamping to each class's available students and room capacity
 */
export function applySingleRoomPatternToAllRooms(
  sourceRoomId: string,
  rooms: Room[],
  classes: string[],
  currentMap: MatrixQuotaMap,
  classTotalStudents: Record<string, number>
): MatrixQuotaMap {
  const sourcePattern = currentMap[sourceRoomId] || {};
  const remainingByClass: Record<string, number> = { ...classTotalStudents };
  const nextMap: MatrixQuotaMap = {};

  for (const room of rooms) {
    nextMap[room.id] = {};
    let roomLeft = Math.max(0, room.capacity);
    for (const cls of classes) {
      const desired = Math.max(0, sourcePattern[cls] || 0);
      const available = Math.max(0, remainingByClass[cls] || 0);
      const assigned = Math.min(desired, available, roomLeft);
      nextMap[room.id][cls] = assigned;
      remainingByClass[cls] = available - assigned;
      roomLeft -= assigned;
    }
  }

  return nextMap;
}

/**
 * Applies an edited Room x Class quota matrix directly to all rooms and returns updated Student[]
 */
export function applyQuotaMatrixToAllRooms(
  students: Student[],
  rooms: Room[],
  classes: string[],
  quotaMap: MatrixQuotaMap,
  participantPrefix: string,
  seatStyle: MatrixSeatStyle = 'interleave-class'
): Student[] {
  const prefix = participantPrefix || 'UJN';

  // Group and sort students per class
  const classPools: Record<string, Student[]> = {};
  for (const cls of classes) {
    classPools[cls] = [];
  }
  for (const s of students) {
    const cls = s.className?.trim() || 'Tanpa Kelas';
    if (!classPools[cls]) classPools[cls] = [];
    classPools[cls].push(s);
  }

  for (const cls of Object.keys(classPools)) {
    if (seatStyle === 'by-class-name') {
      classPools[cls].sort((a, b) =>
        a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
      );
    } else {
      classPools[cls].sort((a, b) => compareNisNatural(a.nis, b.nis));
    }
  }

  const classCursor: Record<string, number> = {};
  for (const cls of Object.keys(classPools)) {
    classCursor[cls] = 0;
  }

  const allocatedById = new Map<string, Student>();

  for (const room of rooms) {
    const roomQuotas = quotaMap[room.id] || {};
    const maxCap = Math.max(1, room.capacity);
    const buckets: Student[][] = [];
    let totalPulled = 0;

    for (const cls of classes) {
      const want = Math.max(0, Math.floor(roomQuotas[cls] || 0));
      if (want <= 0) continue;

      const pool = classPools[cls] || [];
      const start = classCursor[cls] || 0;
      const canTake = Math.min(want, Math.max(0, pool.length - start), Math.max(0, maxCap - totalPulled));

      if (canTake > 0) {
        buckets.push(pool.slice(start, start + canTake));
        classCursor[cls] = start + canTake;
        totalPulled += canTake;
      }
    }

    // Order students inside the room according to seatStyle
    const orderedForRoom: Student[] = [];
    if (seatStyle === 'interleave-class') {
      let idx = 0;
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        for (const bucket of buckets) {
          if (idx < bucket.length) {
            orderedForRoom.push(bucket[idx]);
            hasMore = true;
          }
        }
        idx += 1;
      }
    } else {
      for (const bucket of buckets) {
        orderedForRoom.push(...bucket);
      }
    }

    orderedForRoom.forEach((student, seatIdx) => {
      const seat = seatIdx + 1;
      const seatFormatted = String(seat).padStart(2, '0');
      allocatedById.set(student.id, {
        ...student,
        roomId: room.id,
        roomName: room.name,
        seatNumber: seat,
        participantNo: `${prefix}-${room.code}-${seatFormatted}`,
      });
    });
  }

  // Return all students (allocated + any remaining unallocated)
  return students.map((s) => {
    const updated = allocatedById.get(s.id);
    if (updated) return updated;
    return {
      ...s,
      roomId: undefined,
      roomName: undefined,
      seatNumber: undefined,
      participantNo: undefined,
    };
  });
}

/**
 * Moves a single student to a target room and renumbers seats cleanly in both affected rooms
 */
export function moveStudentToRoom(
  students: Student[],
  rooms: Room[],
  studentId: string,
  targetRoomId: string,
  participantPrefix: string
): Student[] {
  const prefix = participantPrefix || 'UJN';
  const targetRoom = rooms.find((r) => r.id === targetRoomId);
  const movingStudent = students.find((s) => s.id === studentId);
  if (!targetRoom || !movingStudent) return students;

  const sourceRoomId = movingStudent.roomId;
  if (sourceRoomId === targetRoomId) return students;

  // Build updated list: move student to targetRoom, then re-sequence seats in source & target rooms
  const updated = students.map((s) =>
    s.id === studentId
      ? {
          ...s,
          roomId: targetRoom.id,
          roomName: targetRoom.name,
          seatNumber: 9999,
        }
      : s
  );

  const resequenceRoom = (list: Student[], roomIdToFix: string): Student[] => {
    const rm = rooms.find((r) => r.id === roomIdToFix);
    if (!rm) return list;
    const inRoom = list
      .filter((s) => s.roomId === roomIdToFix)
      .sort((a, b) => (a.seatNumber || 9999) - (b.seatNumber || 9999));

    const seatMap = new Map<string, { seat: number; pNo: string }>();
    inRoom.forEach((st, idx) => {
      const seat = idx + 1;
      seatMap.set(st.id, {
        seat,
        pNo: `${prefix}-${rm.code}-${String(seat).padStart(2, '0')}`,
      });
    });

    return list.map((s) => {
      const info = seatMap.get(s.id);
      if (!info) return s;
      return {
        ...s,
        roomId: rm.id,
        roomName: rm.name,
        seatNumber: info.seat,
        participantNo: info.pNo,
      };
    });
  };

  let finalStudents = resequenceRoom(updated, targetRoomId);
  if (sourceRoomId) {
    finalStudents = resequenceRoom(finalStudents, sourceRoomId);
  }
  return finalStudents;
}

/**
 * Applies a custom edited daily circulation assignment (sourceRoomId -> targetRoomId + seatShift) across all rooms
 */
export function applyCustomDayMappingToStudents(
  students: Student[],
  rooms: Room[],
  targetToSourceRoomId: Record<string, string>,
  seatShiftStep: number,
  participantPrefix: string
): Student[] {
  const prefix = participantPrefix || 'UJN';
  const roomMap = new Map<string, Room>();
  rooms.forEach((r) => roomMap.set(r.id, r));

  // Reverse map: for each sourceRoomId, which targetRoomIds receive its students
  // In normal permutation each sourceRoomId maps to one targetRoomId
  const sourceToTarget = new Map<string, Room>();
  for (const [targetId, sourceId] of Object.entries(targetToSourceRoomId)) {
    const targetRoom = roomMap.get(targetId);
    if (targetRoom && sourceId) {
      sourceToTarget.set(sourceId, targetRoom);
    }
  }

  // Group current students per source room
  const bySourceRoom = new Map<string, Student[]>();
  for (const s of students) {
    if (s.roomId) {
      const list = bySourceRoom.get(s.roomId) || [];
      list.push(s);
      bySourceRoom.set(s.roomId, list);
    }
  }

  const updatedById = new Map<string, Student>();

  bySourceRoom.forEach((group, sourceRoomId) => {
    const targetRoom = sourceToTarget.get(sourceRoomId) || roomMap.get(sourceRoomId);
    if (!targetRoom) return;

    const sortedGroup = [...group].sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
    const count = sortedGroup.length;
    const shift = count > 0 ? ((seatShiftStep % count) + count) % count : 0;

    sortedGroup.forEach((st, idx) => {
      const newSeatIdx = (idx + shift) % count;
      const newSeat = newSeatIdx + 1;
      const seatFormatted = String(newSeat).padStart(2, '0');
      updatedById.set(st.id, {
        ...st,
        roomId: targetRoom.id,
        roomName: targetRoom.name,
        seatNumber: newSeat,
        participantNo: `${prefix}-${targetRoom.code}-${seatFormatted}`,
      });
    });
  });

  return students.map((s) => updatedById.get(s.id) || s);
}

