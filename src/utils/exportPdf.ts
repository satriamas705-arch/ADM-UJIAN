import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, Room, ExamSettings, ExamScheduleItem } from '../types';
import {
  buildRoomClassMatrix,
  buildCirculationSchedule,
  CirculationPattern,
} from './circulation';

/**
 * Creates official header (Kop Surat) on jsPDF document
 */
/**
 * Creates official header (Kop Surat) on jsPDF document with dual logos
 */
function renderLetterhead(
  doc: jsPDF,
  settings: ExamSettings,
  title: string,
  subTitle?: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Draw Left Logo (Pemda)
  if (settings.logoLeftPemda) {
    try {
      doc.addImage(settings.logoLeftPemda, 'PNG', 14, 8, 18, 18);
    } catch {
      // Graceful fallback if image format requires conversion
    }
  }

  // Draw Right Logo (School)
  if (settings.logoRightSchool) {
    try {
      doc.addImage(settings.logoRightSchool, 'PNG', pageWidth - 32, 8, 18, 18);
    } catch {
      // Graceful fallback if image format requires conversion
    }
  }

  // Kop Text (Center Aligned)
  let curY = 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text((settings.governmentName || 'PEMERINTAH DAERAH').toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  curY += 6;
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.schoolName.toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  curY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const contactLine = `${settings.schoolAddress}${settings.schoolPhone ? ' | Telp: ' + settings.schoolPhone : ''}${settings.postalCode ? ' Kode Pos: ' + settings.postalCode : ''}`;
  doc.text(contactLine, pageWidth / 2, curY, { align: 'center' });

  curY += 3.5;
  const webLine = `${settings.schoolEmail ? 'Email: ' + settings.schoolEmail : ''}${settings.schoolWebsite ? ' | Website: ' + settings.schoolWebsite : ''}`;
  doc.setFontSize(7);
  doc.text(webLine, pageWidth / 2, curY, { align: 'center' });

  // Official Double Line Divider
  curY += 3.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.0);
  doc.line(14, curY, pageWidth - 14, curY);
  doc.setLineWidth(0.3);
  doc.line(14, curY + 1.2, pageWidth - 14, curY + 1.2);

  // Document Title
  curY += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(title.toUpperCase(), pageWidth / 2, curY, { align: 'center' });

  if (subTitle) {
    curY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(subTitle, pageWidth / 2, curY, { align: 'center' });
  }

  return curY + 6;
}

/**
 * Export official Exam Attendance Sheet (Daftar Hadir & Tanda Tangan) for one room
 */
export function exportAttendancePdfForRoom(
  room: Room,
  students: Student[],
  settings: ExamSettings,
  saveFile = true
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

  const startY = renderLetterhead(
    doc,
    settings,
    'DAFTAR HADIR PESERTA UJIAN',
    settings.examTitle
  );

  // Info Ruangan Box
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  const col1Left = 14;
  const col2Left = 110;
  let infoY = startY;

  doc.text(`Ruang Ujian     : ${room.name} (${room.code})`, col1Left, infoY);
  doc.text(`Gedung/Lokasi : ${room.building}`, col2Left, infoY);
  infoY += 5;
  doc.text(`Tanggal          : ${settings.examDate}`, col1Left, infoY);
  doc.text(`Sesi Ujian       : ${settings.examSession}`, col2Left, infoY);
  infoY += 5;
  doc.text(`Aturan Kursi    : Kapasitas ${room.capacity} Kursi (Terisi: ${roomStudents.length}, Kosong: ${Math.max(0, room.capacity - roomStudents.length)})`, col1Left, infoY);
  doc.text(`Pengawas 1    : ${room.invigilator1}`, col2Left, infoY);
  infoY += 7;

  // Table Data based on Chair Rules (Full capacity seats 1..room.capacity)
  const capacity = Math.max(1, room.capacity);
  const tableRows = [];
  for (let seat = 1; seat <= capacity; seat++) {
    const st = roomStudents.find((s) => s.seatNumber === seat);
    const isOdd = seat % 2 !== 0;

    if (st) {
      tableRows.push([
        seat,
        String(seat).padStart(2, '0'),
        st.participantNo || '-',
        st.nis,
        st.name,
        st.gender,
        st.className,
        isOdd ? `${seat}. .............` : '',
        !isOdd ? `${seat}. .............` : '',
      ]);
    } else {
      tableRows.push([
        seat,
        String(seat).padStart(2, '0'),
        '-',
        '-',
        '[ KURSI KOSONG / TERSEDIA ]',
        '-',
        '-',
        '----------',
        '----------',
      ]);
    }
  }

  autoTable(doc, {
    startY: infoY,
    head: [
      [
        'No',
        'Kursi',
        'No Peserta',
        'NIS',
        'Nama Lengkap Siswa',
        'L/P',
        'Kelas',
        'Tanda Tangan 1',
        'Tanda Tangan 2',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 12 },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'left', cellWidth: 'auto' },
      5: { halign: 'center', cellWidth: 10 },
      6: { halign: 'center', cellWidth: 18 },
      7: { halign: 'left', cellWidth: 22 },
      8: { halign: 'left', cellWidth: 22 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Footer page number
      const pageStr = `Halaman ${doc.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        pageStr,
        doc.internal.pageSize.getWidth() - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
    },
  });

  // Signature Block at Bottom
  // Get final Y after table
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 220;
  const pageHeight = doc.internal.pageSize.getHeight();

  // If near bottom of page, add new page for signature
  let sigY = finalY + 12;
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 25;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  const sigCol1 = 40;
  const sigCol2 = 150;

  doc.text('Mengetahui,', sigCol1, sigY, { align: 'center' });
  doc.text('Pengawas Ruang 1', sigCol1, sigY + 5, { align: 'center' });
  doc.text(`( ${room.invigilator1} )`, sigCol1, sigY + 28, { align: 'center' });

  doc.text('Petugas Ujian,', sigCol2, sigY, { align: 'center' });
  doc.text('Pengawas Ruang 2', sigCol2, sigY + 5, { align: 'center' });
  doc.text(`( ${room.invigilator2 || '.....................................'} )`, sigCol2, sigY + 28, { align: 'center' });

  if (saveFile) {
    doc.save(`Daftar_Hadir_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
  }

  return doc;
}

/**
 * Export all rooms attendance into a single compiled PDF file
 */
export function exportAllRoomsAttendancePdf(
  rooms: Room[],
  students: Student[],
  settings: ExamSettings
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  rooms.forEach((room, roomIdx) => {
    if (roomIdx > 0) {
      doc.addPage();
    }

    const roomStudents = students
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

    const startY = renderLetterhead(
      doc,
      settings,
      'DAFTAR HADIR PESERTA UJIAN',
      settings.examTitle
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    const col1Left = 14;
    const col2Left = 110;
    let infoY = startY;

    doc.text(`Ruang Ujian     : ${room.name} (${room.code})`, col1Left, infoY);
    doc.text(`Gedung/Lokasi : ${room.building}`, col2Left, infoY);
    infoY += 5;
    doc.text(`Tanggal          : ${settings.examDate}`, col1Left, infoY);
    doc.text(`Sesi Ujian       : ${settings.examSession}`, col2Left, infoY);
    infoY += 5;
    doc.text(`Aturan Kursi    : Kapasitas ${room.capacity} Kursi (Terisi: ${roomStudents.length}, Kosong: ${Math.max(0, room.capacity - roomStudents.length)})`, col1Left, infoY);
    doc.text(`Pengawas 1    : ${room.invigilator1}`, col2Left, infoY);
    infoY += 7;

    const capacity = Math.max(1, room.capacity);
    const tableRows = [];
    for (let seat = 1; seat <= capacity; seat++) {
      const st = roomStudents.find((s) => s.seatNumber === seat);
      const isOdd = seat % 2 !== 0;

      if (st) {
        tableRows.push([
          seat,
          String(seat).padStart(2, '0'),
          st.participantNo || '-',
          st.nis,
          st.name,
          st.gender,
          st.className,
          isOdd ? `${seat}. .............` : '',
          !isOdd ? `${seat}. .............` : '',
        ]);
      } else {
        tableRows.push([
          seat,
          String(seat).padStart(2, '0'),
          '-',
          '-',
          '[ KURSI KOSONG / TERSEDIA ]',
          '-',
          '-',
          '----------',
          '----------',
        ]);
      }
    }

    autoTable(doc, {
      startY: infoY,
      head: [
        [
          'No',
          'Kursi',
          'No Peserta',
          'NIS',
          'Nama Lengkap Siswa',
          'L/P',
          'Kelas',
          'Tanda Tangan 1',
          'Tanda Tangan 2',
        ],
      ],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        halign: 'center',
        valign: 'middle',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: [30, 41, 59],
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 12 },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'left', cellWidth: 'auto' },
        5: { halign: 'center', cellWidth: 10 },
        6: { halign: 'center', cellWidth: 18 },
        7: { halign: 'left', cellWidth: 22 },
        8: { halign: 'left', cellWidth: 22 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 220;
    let sigY = finalY + 10;
    if (sigY + 35 > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      sigY = 25;
    }

    const sigCol1 = 40;
    const sigCol2 = 150;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Mengetahui,', sigCol1, sigY, { align: 'center' });
    doc.text('Pengawas Ruang 1', sigCol1, sigY + 5, { align: 'center' });
    doc.text(`( ${room.invigilator1} )`, sigCol1, sigY + 26, { align: 'center' });

    doc.text('Petugas Ujian,', sigCol2, sigY, { align: 'center' });
    doc.text('Pengawas Ruang 2', sigCol2, sigY + 5, { align: 'center' });
    doc.text(`( ${room.invigilator2 || '.....................................'} )`, sigCol2, sigY + 26, { align: 'center' });
  });

  doc.save(`Daftar_Hadir_Semua_Ruang_${Date.now()}.pdf`);
}

/**
 * Export Door Poster PDF (Daftar Tempel Pintu Ruang)
 * Designed with large fonts and clear seat indicators for classroom doors
 */
export function exportDoorPosterPdf(
  room: Room,
  students: Student[],
  settings: ExamSettings
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const roomStudents = students
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));

  // Big Header banner
  doc.setFillColor(30, 41, 59); // slate-900
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(settings.schoolName.toUpperCase(), pageWidth / 2, 12, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(`DAFTAR PESERTA UJIAN - ${room.name.toUpperCase()}`, pageWidth / 2, 23, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text(`${settings.examTitle} (${settings.academicYear}) | ${room.building}`, pageWidth / 2, 33, { align: 'center' });

  // Quick stats ribbon
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 48, pageWidth - 28, 14, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(14, 48, pageWidth - 28, 14, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Aturan Kapasitas: ${room.capacity} Meja (${room.columns} Kolom)  |  Terisi: ${roomStudents.length} Siswa  |  Kosong: ${Math.max(0, room.capacity - roomStudents.length)} Meja`, 20, 56);

  const nisList = roomStudents.map((s) => s.nis).sort();
  const nisRange = nisList.length > 0 ? `${nisList[0]} s/d ${nisList[nisList.length - 1]}` : '-';
  doc.text(`Rentang NIS: ${nisRange}  |  Sesi: ${settings.examSession}`, pageWidth - 20, 56, { align: 'right' });

  // Table of students conforming to chair capacity rules (Meja 01 s/d Kapasitas)
  const capacity = Math.max(1, room.capacity);
  const tableData = [];
  for (let seat = 1; seat <= capacity; seat++) {
    const st = roomStudents.find((s) => s.seatNumber === seat);
    if (st) {
      tableData.push([
        `Meja ${String(seat).padStart(2, '0')}`,
        st.participantNo || '-',
        st.nis,
        st.name,
        st.className,
        st.gender === 'L' ? 'Laki-Laki' : 'Perempuan',
      ]);
    } else {
      tableData.push([
        `Meja ${String(seat).padStart(2, '0')}`,
        '-',
        '-',
        '[ KURSI KOSONG / TERSEDIA ]',
        '-',
        '-',
      ]);
    }
  }

  autoTable(doc, {
    startY: 68,
    head: [['No Meja', 'No Peserta', 'NIS', 'Nama Siswa', 'Kelas', 'JK']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [51, 65, 85],
      textColor: [255, 255, 255],
      fontSize: 9.5,
      halign: 'center',
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 28 },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'left', cellWidth: 'auto' },
      4: { halign: 'center', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 22 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  doc.save(`Tempelan_Pintu_${room.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}

/**
 * Export Student Exam Cards (Kartu Peserta Ujian)
 * Layouts 4 cards per page in a 2x2 grid with dotted cut borders
 */
/**
 * Export Student Exam Cards (Kartu Peserta Ujian Lengkap)
 * Layouts 2 cards per page (top & bottom) containing:
 * - Kop Sekolah & Dua Logo
 * - Nama Kegiatan & Tahun Pelajaran
 * - Identitas Peserta Lengkap (NIS, Nama, Kelas, No Meja, Ruang)
 * - Tabel Jadwal Ujian
 * - Kolom TTD / Paraf Pengawas Ruang per Mata Pelajaran
 * - Pengesahan Panitia & TTD Siswa
 */
export function exportExamCardsPdf(
  students: Student[],
  settings: ExamSettings,
  schedules?: ExamScheduleItem[],
  roomIdFilter?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const filteredStudents = roomIdFilter
    ? students.filter((s) => s.roomId === roomIdFilter)
    : students.filter((s) => s.roomId); // Only allocated students

  if (filteredStudents.length === 0) {
    throw new Error('Tidak ada siswa yang teralokasi pada ruangan ini.');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const cardWidth = 186; // mm
  const cardHeight = 134; // mm
  const marginX = (pageWidth - cardWidth) / 2; // ~12mm

  // Default schedule items if not provided
  const scheduleList =
    schedules && schedules.length > 0
      ? schedules
      : [
          { id: '1', day: 'Senin', date: '20 Okt 2026', time: '07.30 - 09.30', subject: 'Bahasa Indonesia', grade: 'Semua' },
          { id: '2', day: 'Senin', date: '20 Okt 2026', time: '10.00 - 11.30', subject: 'Pendidikan Agama', grade: 'Semua' },
          { id: '3', day: 'Selasa', date: '21 Okt 2026', time: '07.30 - 09.30', subject: 'Matematika Wajib', grade: 'Semua' },
          { id: '4', day: 'Selasa', date: '21 Okt 2026', time: '10.00 - 11.30', subject: 'Pendidikan Pancasila', grade: 'Semua' },
          { id: '5', day: 'Rabu', date: '22 Okt 2026', time: '07.30 - 09.30', subject: 'Bahasa Inggris', grade: 'Semua' },
          { id: '6', day: 'Rabu', date: '22 Okt 2026', time: '10.00 - 11.30', subject: 'Sejarah Indonesia', grade: 'Semua' },
        ];

  filteredStudents.forEach((student, index) => {
    const cardIndexOnPage = index % 2;

    if (index > 0 && cardIndexOnPage === 0) {
      doc.addPage();
    }

    const y = cardIndexOnPage === 0 ? 10 : 152;
    const x = marginX;

    // Card Outer Border
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.rect(x, y, cardWidth, cardHeight, 'S');

    // Header Background Strip
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, cardWidth, 18, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.line(x, y + 18, x + cardWidth, y + 18);

    // Left Logo (Pemda)
    if (settings.logoLeftPemda) {
      try {
        doc.addImage(settings.logoLeftPemda, 'PNG', x + 3, y + 2, 14, 14);
      } catch {
        // fallback
      }
    }

    // Right Logo (School)
    if (settings.logoRightSchool) {
      try {
        doc.addImage(settings.logoRightSchool, 'PNG', x + cardWidth - 17, y + 2, 14, 14);
      } catch {
        // fallback
      }
    }

    // Kop Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(settings.schoolName.toUpperCase(), x + cardWidth / 2, y + 6, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('KARTU PESERTA UJIAN', x + cardWidth / 2, y + 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${settings.examTitle} - TAHUN PELAJARAN ${settings.academicYear}`.toUpperCase(),
      x + cardWidth / 2,
      y + 15.5,
      { align: 'center' }
    );

    // Photo Box (2x3 format)
    const photoX = x + 5;
    const photoY = y + 22;
    doc.setDrawColor(203, 213, 225);
    doc.rect(photoX, photoY, 18, 24, 'S');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Pas Foto', photoX + 9, photoY + 11, { align: 'center' });
    doc.text('2 x 3', photoX + 9, photoY + 15, { align: 'center' });

    // Student Identity Grid (2 Columns next to photo)
    const idX1 = photoX + 22;
    const idX2 = idX1 + 22;
    const idX3 = idX1 + 82;
    const idX4 = idX3 + 20;

    let idY = y + 25;
    const printField = (label: string, val: string, xLabel: number, xVal: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(label, xLabel, idY);
      doc.text(':', xLabel + 18, idY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(val, xVal, idY);
    };

    // Row 1
    printField('No. Peserta', student.participantNo || '-', idX1, idX2);
    printField('Ruang Ujian', `${student.roomName || '-'} (Meja ${String(student.seatNumber || 1).padStart(2, '0')})`, idX3, idX4);

    // Row 2
    idY += 5;
    printField('NIS / NISN', `${student.nis} / ${student.nisn || '-'}`, idX1, idX2);
    printField('Kelas', student.className, idX3, idX4);

    // Row 3
    idY += 5;
    printField('Nama Siswa', student.name.length > 28 ? student.name.slice(0, 26) + '..' : student.name, idX1, idX2);
    printField('Kelamin', student.gender === 'L' ? 'Laki-Laki (L)' : 'Perempuan (P)', idX3, idX4);

    // Row 4
    idY += 5;
    printField('Sesi Ujian', settings.examSession, idX1, idX2);

    // Divider above timetable
    const tableStartY = y + 50;

    // Timetable AutoTable on the card
    const tableBody = scheduleList.slice(0, 7).map((sch, schIdx) => [
      schIdx + 1,
      `${sch.day}, ${sch.date}`,
      sch.time,
      sch.subject,
      '', // Blank for invigilator signature paraf
    ]);

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: x + 4, right: pageWidth - (x + cardWidth - 4) },
      head: [['No', 'Hari / Tanggal', 'Waktu', 'Mata Pelajaran Ujian', 'Paraf Pengawas']],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 6.8,
        halign: 'center',
        cellPadding: 1.2,
      },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.1,
        textColor: [15, 23, 42],
        valign: 'middle',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 7 },
        1: { halign: 'left', cellWidth: 32 },
        2: { halign: 'center', cellWidth: 26 },
        3: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
        4: { halign: 'center', cellWidth: 28 }, // Paraf column
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    // Signature Area at bottom of card
    const bottomSigY = y + cardHeight - 19;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);

    // Left: Student Signature
    doc.text('Peserta Ujian,', x + 25, bottomSigY, { align: 'center' });
    doc.line(x + 10, bottomSigY + 12, x + 40, bottomSigY + 12);
    doc.text(`( ${student.name.slice(0, 18)} )`, x + 25, bottomSigY + 15, { align: 'center' });

    // Right: Committee Head Signature
    doc.text(`Jakarta, ${settings.examDate.split('-')[0].trim() || '20 Oktober 2026'}`, x + cardWidth - 35, bottomSigY - 3, { align: 'center' });
    doc.text('Ketua Panitia Ujian,', x + cardWidth - 35, bottomSigY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(settings.committeeHead, x + cardWidth - 35, bottomSigY + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text(`NIP. ${settings.committeeNip || '-'}`, x + cardWidth - 35, bottomSigY + 15, { align: 'center' });

    // Dotted cutting line between cards
    if (cardIndexOnPage === 0) {
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.setDrawColor(148, 163, 184);
      doc.line(x - 5, y + cardHeight + 4, x + cardWidth + 5, y + cardHeight + 4);
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text('- - - - - - - - - - - - - - - - - - Gunting Di Sini - - - - - - - - - - - - - - - - - -', pageWidth / 2, y + cardHeight + 5.5, { align: 'center' });
      doc.setLineDashPattern([], 0);
    }
  });

  doc.save(`Kartu_Peserta_Ujian_Lengkap_${Date.now()}.pdf`);
}

/**
 * Export single student exam card to PDF immediately
 */
export function exportSingleStudentCardPdf(
  student: Student,
  settings: ExamSettings,
  schedules?: ExamScheduleItem[]
): void {
  exportExamCardsPdf([student], settings, schedules);
}

/**
 * Export official exam schedule document (Jadwal Pelaksanaan Ujian) to PDF with Kop Surat
 */
export function exportSchedulePdf(
  schedules: ExamScheduleItem[],
  settings: ExamSettings
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Official Letterhead with dual logos
  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'JADWAL PELAKSANAAN UJIAN',
    `TAHUN PELAJARAN ${settings.academicYear}`
  );

  // Activity Information Ribbon
  let currentY = headerBottomY + 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Nama Kegiatan', 18, currentY + 6);
  doc.text(':', 46, currentY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.activityName || settings.examTitle, 50, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Tahun Pelajaran', 18, currentY + 12);
  doc.text(':', 46, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.academicYear, 50, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Rentang Tanggal', pageWidth - 80, currentY + 6);
  doc.text(':', pageWidth - 52, currentY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.examDate, pageWidth - 48, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Sesi Ujian', pageWidth - 80, currentY + 12);
  doc.text(':', pageWidth - 52, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(settings.examSession, pageWidth - 48, currentY + 12);

  currentY += 21;

  // Schedule Table
  const tableRows = schedules.map((item, idx) => [
    idx + 1,
    `${item.day}\n${item.date}`,
    item.time,
    item.subject,
    item.grade || 'Semua Kelas',
    item.roomNotes || 'Sesi 1',
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['No', 'Hari & Tanggal', 'Waktu / Jam', 'Mata Pelajaran Ujian', 'Tingkat / Kelas', 'Keterangan']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', cellWidth: 32 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'left', fontStyle: 'bold', cellWidth: 'auto' },
      4: { halign: 'center', cellWidth: 26 },
      5: { halign: 'center', cellWidth: 24 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || currentY + 60;
  let sigY = finalY + 12;
  if (sigY + 35 > pageHeight) {
    doc.addPage();
    sigY = 25;
  }

  // Official Signatures: Kepala Sekolah & Ketua Panitia
  const sigColLeft = 45;
  const sigColRight = pageWidth - 45;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  // Left: Mengetahui Kepala Sekolah
  doc.text('Mengetahui,', sigColLeft, sigY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, sigY + 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, sigY + 29, { align: 'center' });

  // Right: Ketua Panitia Ujian
  const todayStr = settings.examDate.split('-')[0].trim() || '20 Oktober 2026';
  doc.setFontSize(8.5);
  doc.text(`Jakarta, ${todayStr}`, sigColRight, sigY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, sigY + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, sigY + 25, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, sigY + 29, { align: 'center' });

  doc.save(`Jadwal_Ujian_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}

/**
 * Export official participant circulation breakdown per Room & Class (PDF Landscape A4)
 */
export function exportCirculationPdf(
  students: Student[],
  rooms: Room[],
  settings: ExamSettings,
  schedules: ExamScheduleItem[] = [],
  options?: {
    pattern?: CirculationPattern;
    dayCount?: number;
    includeRotation?: boolean;
  }
): void {
  const matrix = buildRoomClassMatrix(students, rooms, settings.customClassOrder);
  const pattern = options?.pattern || 'fixed';
  const includeRotation = options?.includeRotation ?? false;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Official Letterhead
  const headerBottomY = renderLetterhead(
    doc,
    settings,
    'PEMBAGIAN SIRKULASI PESERTA TIAP RUANG DAN KELAS',
    `${(settings.activityName || settings.examTitle).toUpperCase()} — TAHUN PELAJARAN ${settings.academicYear}`
  );

  // Meta Info Bar
  let currentY = headerBottomY + 2;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 10, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Total Ruang: ${rooms.length} Ruang   |   Total Kelas: ${matrix.classes.length} Rombel   |   Peserta Teralokasi: ${matrix.grandTotalAllocated} / ${matrix.grandTotalStudents} Siswa (L: ${matrix.grandTotalMale}, P: ${matrix.grandTotalFemale})   |   Kapasitas: ${matrix.grandTotalCapacity} Kursi`,
    pageWidth / 2,
    currentY + 6.3,
    { align: 'center' }
  );

  currentY += 14;

  // Section 1: Matriks Ruang x Kelas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('A. MATRIKS DISTRIBUSI PESERTA PER RUANG DAN KELAS', 14, currentY);
  currentY += 3;

  const matrixHead = [
    [
      'No',
      'Ruang',
      'Lokasi',
      ...matrix.classes,
      'L',
      'P',
      'Jml',
      'Kap',
      'Sisa',
      'Rentang No. Peserta',
    ],
  ];

  const matrixBody: (string | number)[][] = matrix.rows.map((row, idx) => {
    const classCounts = matrix.classes.map((cls) => {
      const cnt = row.byClass[cls]?.count || 0;
      return cnt > 0 ? cnt : '-';
    });
    const pRange =
      row.participantMin && row.participantMax
        ? `${row.participantMin} s/d ${row.participantMax}`
        : '-';

    return [
      idx + 1,
      `${row.room.name} (${row.room.code})`,
      row.room.building,
      ...classCounts,
      row.male,
      row.female,
      row.total,
      row.room.capacity,
      row.remainingSeats,
      pRange,
    ];
  });

  // Footer total row
  const matrixFoot = [
    [
      '',
      'TOTAL KESELURUHAN',
      `${rooms.length} Ruang`,
      ...matrix.classes.map((cls) => matrix.classTotals[cls]?.allocated || 0),
      matrix.grandTotalMale,
      matrix.grandTotalFemale,
      matrix.grandTotalAllocated,
      matrix.grandTotalCapacity,
      matrix.grandTotalRemaining,
      '',
    ],
  ];

  const colStyles: Record<number, { halign?: 'left' | 'center' | 'right'; fontStyle?: 'normal' | 'bold'; cellWidth?: number | 'auto' }> = {
    0: { halign: 'center', cellWidth: 9 },
    1: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
    2: { halign: 'left', cellWidth: 34 },
  };

  matrix.classes.forEach((_, i) => {
    colStyles[3 + i] = { halign: 'center' };
  });

  const baseIdx = 3 + matrix.classes.length;
  colStyles[baseIdx] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 1] = { halign: 'center', cellWidth: 10 };
  colStyles[baseIdx + 2] = { halign: 'center', fontStyle: 'bold', cellWidth: 12 };
  colStyles[baseIdx + 3] = { halign: 'center', cellWidth: 12 };
  colStyles[baseIdx + 4] = { halign: 'center', cellWidth: 12 };
  colStyles[baseIdx + 5] = { halign: 'center', cellWidth: 42 };

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: matrixHead,
    body: matrixBody,
    foot: matrixFoot,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      halign: 'center',
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  let nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || currentY + 45) + 8;

  // Section 2: Rekapitulasi Sirkulasi per Kelas
  if (nextY + 40 > pageHeight) {
    doc.addPage();
    nextY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('B. REKAPITULASI SEBARAN SIRKULASI PER KELAS', 14, nextY);
  nextY += 3;

  const classRows = matrix.classSummaries.map((cs, idx) => {
    const distText =
      cs.roomDistributions.length > 0
        ? cs.roomDistributions
            .map((rd) => {
              const seatRange =
                rd.seatMin !== undefined && rd.seatMax !== undefined
                  ? `Meja ${String(rd.seatMin).padStart(2, '0')}-${String(rd.seatMax).padStart(2, '0')}`
                  : '';
              return `${rd.room.name} (${rd.count} siswa${seatRange ? ', ' + seatRange : ''})`;
            })
            .join('  |  ')
        : 'Belum dialokasikan';

    return [
      idx + 1,
      cs.className,
      cs.male,
      cs.female,
      cs.totalStudents,
      cs.allocatedStudents,
      distText,
    ];
  });

  autoTable(doc, {
    startY: nextY,
    margin: { left: 14, right: 14 },
    head: [['No', 'Kelas / Rombel', 'L', 'P', 'Total', 'Teralokasi', 'Sebaran Ruang & Nomor Meja']],
    body: classRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left', fontStyle: 'bold', cellWidth: 28 },
      2: { halign: 'center', cellWidth: 12 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 15 },
      5: { halign: 'center', cellWidth: 18 },
      6: { halign: 'left', cellWidth: 'auto' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  nextY =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || nextY + 35) + 8;

  // Section 3 (Optional): Jadwal Sirkulasi / Rotasi Ruang per Hari Ujian
  if (includeRotation) {
    const rotationDays = buildCirculationSchedule(matrix, schedules, pattern, options?.dayCount);
    if (rotationDays.length > 0) {
      if (nextY + 45 > pageHeight) {
        doc.addPage();
        nextY = 16;
      }

      const patternLabelMap: Record<CirculationPattern, string> = {
        fixed: 'Tetap (Tanpa Rotasi Ruang)',
        'rotate-room-forward': 'Rotasi Ruang Maju (+1 Ruang / Hari)',
        'rotate-room-backward': 'Rotasi Ruang Mundur (-1 Ruang / Hari)',
        'rotate-seat-shift': 'Rotasi Pergeseran Meja Dalam Ruang',
      };

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `C. JADWAL SIRKULASI / ROTASI PESERTA PER HARI UJIAN — POLA: ${patternLabelMap[pattern].toUpperCase()}`,
        14,
        nextY
      );
      nextY += 3;

      const rotHead = [['Hari / Tanggal', 'Mata Pelajaran', ...rooms.map((r) => `${r.name} (${r.code})`)]];
      const rotBody = rotationDays.map((day) => [
        `${day.dayLabel}\n${day.dateLabel}`,
        day.subjects.join(', '),
        ...day.roomAssignments.map(
          (ra) => `${ra.sourceGroupLabel} (${ra.studentCount} org)\n${ra.classBreakdownText}\n[${ra.seatShiftNote}]`
        ),
      ]);

      autoTable(doc, {
        startY: nextY,
        margin: { left: 14, right: 14 },
        head: rotHead,
        body: rotBody,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          halign: 'center',
        },
        styles: {
          fontSize: 7,
          cellPadding: 2,
          textColor: [30, 41, 59],
          valign: 'top',
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 32 },
          1: { halign: 'left', cellWidth: 44 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      nextY =
        ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || nextY + 40) + 10;
    }
  }

  // Official Signatures
  if (nextY + 32 > pageHeight) {
    doc.addPage();
    nextY = 20;
  }

  const sigColLeft = 58;
  const sigColRight = pageWidth - 58;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  doc.text('Mengetahui,', sigColLeft, nextY, { align: 'center' });
  doc.text('Kepala Sekolah', sigColLeft, nextY + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(settings.headmaster, sigColLeft, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.headmasterNip || '-'}`, sigColLeft, nextY + 25, { align: 'center' });

  const todayStr = settings.examDate.split('-')[0].trim() || '20 Oktober 2026';
  doc.setFontSize(8.5);
  doc.text(`Dicetak: ${todayStr}`, sigColRight, nextY, { align: 'center' });
  doc.text('Ketua Panitia Ujian', sigColRight, nextY + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(settings.committeeHead, sigColRight, nextY + 21, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`NIP. ${settings.committeeNip || '-'}`, sigColRight, nextY + 25, { align: 'center' });

  doc.save(`Sirkulasi_Peserta_Ruang_Kelas_${settings.academicYear.replace('/', '-')}_${Date.now()}.pdf`);
}


