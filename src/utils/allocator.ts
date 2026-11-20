import { Student, Room, ExamSettings, SortMethod, AllocationSummary } from '../types';

/**
 * Natural comparison for NIS (works for numeric string like '240101' as well as alphanumeric)
 */
function compareNis(a: string, b: string): number {
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Orders students based on chosen algorithm
 */
export function sortStudentsByMethod(
  students: Student[],
  method: SortMethod,
  classOptions?: {
    customClassOrder?: string[];
    classSortInside?: 'nis-asc' | 'name-asc';
  }
): Student[] {
  const cloned = [...students];

  switch (method) {
    case 'class-order': {
      // 1. Group students by class
      const classMap: Record<string, Student[]> = {};
      for (const student of cloned) {
        const cls = student.className?.trim() || 'Tanpa Kelas';
        if (!classMap[cls]) {
          classMap[cls] = [];
        }
        classMap[cls].push(student);
      }

      // 2. Sort students within each class
      const sortInside = classOptions?.classSortInside || 'nis-asc';
      for (const cls of Object.keys(classMap)) {
        if (sortInside === 'name-asc') {
          classMap[cls].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
        } else {
          classMap[cls].sort((a, b) => compareNis(a.nis, b.nis));
        }
      }

      // 3. Determine ordered list of classes
      const detectedClasses = Object.keys(classMap);
      let orderedClasses: string[] = [];
      if (classOptions?.customClassOrder && classOptions.customClassOrder.length > 0) {
        const orderSet = new Set(classOptions.customClassOrder);
        orderedClasses = classOptions.customClassOrder.filter((c) => classMap[c]);
        // Append any classes not listed in customClassOrder
        const remaining = detectedClasses
          .filter((c) => !orderSet.has(c))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        orderedClasses.push(...remaining);
      } else {
        orderedClasses = detectedClasses.sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );
      }

      // 4. Flatten sequentially per class order
      const result: Student[] = [];
      for (const cls of orderedClasses) {
        if (classMap[cls]) {
          result.push(...classMap[cls]);
        }
      }
      return result;
    }

    case 'nis-asc':
      return cloned.sort((a, b) => compareNis(a.nis, b.nis));

    case 'nis-desc':
      return cloned.sort((a, b) => compareNis(b.nis, a.nis));

    case 'nis-cross-class': {
      // Group by class
      const classMap: Record<string, Student[]> = {};
      for (const student of cloned) {
        if (!classMap[student.className]) {
          classMap[student.className] = [];
        }
        classMap[student.className].push(student);
      }

      // Sort each class by NIS ascending
      const classNames = Object.keys(classMap).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      for (const cls of classNames) {
        classMap[cls].sort((a, b) => compareNis(a.nis, b.nis));
      }

      // Interleave / round-robin from each class
      const result: Student[] = [];
      let hasMore = true;
      let index = 0;

      while (hasMore) {
        hasMore = false;
        for (const cls of classNames) {
          const list = classMap[cls];
          if (index < list.length) {
            result.push(list[index]);
            hasMore = true;
          }
        }
        index++;
      }
      return result;
    }

    case 'nis-odd-even': {
      // Group by odd / even last digit of NIS
      const odds: Student[] = [];
      const evens: Student[] = [];

      for (const student of cloned) {
        const lastChar = student.nis.trim().slice(-1);
        const lastDigit = parseInt(lastChar, 10);
        if (!isNaN(lastDigit) && lastDigit % 2 === 0) {
          evens.push(student);
        } else {
          odds.push(student);
        }
      }

      odds.sort((a, b) => compareNis(a.nis, b.nis));
      evens.sort((a, b) => compareNis(a.nis, b.nis));

      const result: Student[] = [];
      const maxLen = Math.max(odds.length, evens.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < odds.length) result.push(odds[i]);
        if (i < evens.length) result.push(evens[i]);
      }
      return result;
    }

    default:
      return cloned.sort((a, b) => compareNis(a.nis, b.nis));
  }
}

/**
 * Automatically allocates students to rooms and assigns seat & participant numbers
 */
export function allocateStudentsToRooms(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings
): { allocatedStudents: Student[]; summary: AllocationSummary } {
  // Sort students according to selected method
  const sortedStudents = sortStudentsByMethod(students, settings.sortMethod, {
    customClassOrder: settings.customClassOrder,
    classSortInside: settings.classSortInside,
  });

  const prefix = settings.participantPrefix || 'UJN';
  const allocatedStudents: Student[] = [];
  let studentIdx = 0;

  const roomBreakdowns: AllocationSummary['roomBreakdowns'] = [];

  // Calculate per-room allocation targets based on roomDistributionMode
  const roomTargetCounts: number[] = [];
  if (settings.roomDistributionMode === 'even-distribution' && rooms.length > 0) {
    const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
    let remaining = Math.min(sortedStudents.length, totalCapacity);
    const targets = rooms.map(() => 0);
    let changed = true;
    while (remaining > 0 && changed) {
      changed = false;
      for (let i = 0; i < rooms.length; i++) {
        if (remaining > 0 && targets[i] < rooms[i].capacity) {
          targets[i]++;
          remaining--;
          changed = true;
        }
      }
    }
    roomTargetCounts.push(...targets);
  } else {
    // Standard POS fill-first (sequential filling)
    for (const room of rooms) {
      roomTargetCounts.push(room.capacity);
    }
  }

  // Handle allocation
  for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
    const room = rooms[rIdx];
    const roomStudents: Student[] = [];
    const capacity = Math.max(1, room.capacity);
    const maxSeatsForRoom = roomTargetCounts[rIdx] ?? capacity;

    for (let seat = 1; seat <= maxSeatsForRoom && studentIdx < sortedStudents.length; seat++) {
      const student = sortedStudents[studentIdx];

      // If separate-room policy is active in class-order mode and class changed while we have next rooms:
      if (
        settings.sortMethod === 'class-order' &&
        settings.classFillPolicy === 'separate-room' &&
        roomStudents.length > 0 &&
        rIdx < rooms.length - 1 &&
        student.className !== roomStudents[0].className
      ) {
        // Stop filling current room, move to next room for next class
        break;
      }

      const seatNoFormatted = String(seat).padStart(2, '0');
      const participantNo = `${prefix}-${room.code}-${seatNoFormatted}`;

      const updatedStudent: Student = {
        ...student,
        roomId: room.id,
        roomName: room.name,
        seatNumber: seat,
        participantNo,
      };

      roomStudents.push(updatedStudent);
      allocatedStudents.push(updatedStudent);
      studentIdx++;
    }

    // NIS min & max for room summary
    const roomNisList = roomStudents.map((s) => s.nis).sort(compareNis);
    const nisMin = roomNisList[0];
    const nisMax = roomNisList[roomNisList.length - 1];

    // Class distribution breakdown for this room
    const classCountMap: Record<string, number> = {};
    for (const s of roomStudents) {
      const c = s.className?.trim() || 'Tanpa Kelas';
      classCountMap[c] = (classCountMap[c] || 0) + 1;
    }
    const classCounts = Object.entries(classCountMap).map(([className, count]) => ({
      className,
      count,
    }));

    roomBreakdowns.push({
      room,
      allocatedCount: roomStudents.length,
      occupancyRate: Math.round((roomStudents.length / capacity) * 100),
      nisMin,
      nisMax,
      classCounts,
    });
  }

  // Any remaining students that didn't fit into rooms
  while (studentIdx < sortedStudents.length) {
    const unallocated = sortedStudents[studentIdx];
    allocatedStudents.push({
      ...unallocated,
      roomId: undefined,
      roomName: undefined,
      seatNumber: undefined,
      participantNo: undefined,
    });
    studentIdx++;
  }

  const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
  const totalAllocated = allocatedStudents.filter((s) => s.roomId).length;
  const unallocatedStudents = allocatedStudents.filter((s) => !s.roomId).length;

  const summary: AllocationSummary = {
    totalStudents: students.length,
    allocatedStudents: totalAllocated,
    unallocatedStudents,
    totalRooms: rooms.length,
    totalCapacity,
    remainingCapacity: Math.max(0, totalCapacity - totalAllocated),
    roomBreakdowns,
  };

  return { allocatedStudents, summary };
}
