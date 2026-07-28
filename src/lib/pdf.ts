import { jsPDF } from 'jspdf';
import type { AppData, Holiday } from '../types';
import { calendarCells, formatDate, monthRange, parseLocalDate } from './date';
import { absenceLabel, minutesToHours } from './format';
import { aggregateSummaries, summariesForRange, timeWindowsForDate } from './time';

function shortText(text: string, max = 24): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function clock(timestamp?: string): string {
  if (!timestamp) return '–';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function workWindow(data: AppData, date: string): string {
  const windows = timeWindowsForDate(data.events, date);
  return windows.start ? `${clock(windows.start)}–${clock(windows.end)}` : '–';
}

function breakWindows(data: AppData, date: string): string {
  const windows = timeWindowsForDate(data.events, date);
  return windows.breaks.length
    ? windows.breaks.map((entry) => `${clock(entry.start)}–${clock(entry.end)}`).join(', ')
    : '–';
}

export function exportMonthlyPdf(data: AppData, month: Date, holidays: Holiday[], now = new Date()): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(month);
  const range = monthRange(month);
  const summaries = summariesForRange(data, range.from, range.to, holidays, now);
  const totals = aggregateSummaries(summaries);
  const cells = calendarCells(month);

  doc.setProperties({
    title: `Arbeitszeitkalender ${monthLabel}`,
    subject: 'Monatlicher Arbeitszeitbericht',
    author: data.settings.employeeName,
  });

  doc.setFillColor(20, 31, 54);
  doc.rect(0, 0, 297, 31, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`Arbeitszeitkalender ${monthLabel}`, 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${data.settings.employeeName} · ${data.settings.federalState}`, 14, 23);
  doc.text(`Erstellt: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(now)}`, 222, 23);

  const summary = [
    `Soll ${minutesToHours(totals.targetMinutes)} Std.`,
    `Arbeit ${minutesToHours(totals.workedMinutes)} Std.`,
    `Feiertag/Abwesenheit ${minutesToHours(totals.creditedMinutes)} Std.`,
    `Überstundenabbau ${minutesToHours(totals.overtimeDeductionMinutes)} Std.`,
    `Saldo ${minutesToHours(totals.balanceMinutes, true)} Std.`,
  ];
  doc.setTextColor(25, 33, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  summary.forEach((item, index) => doc.text(item, 14 + index * 55, 37));

  const x = 14;
  const y = 43;
  const cellWidth = 38.4;
  const rowHeight = 26;
  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  doc.setFontSize(9);
  weekdays.forEach((weekday, index) => {
    doc.setFillColor(237, 241, 247);
    doc.rect(x + index * cellWidth, y, cellWidth, 8, 'F');
    doc.text(weekday, x + index * cellWidth + 2, y + 5.5);
  });

  cells.forEach((date, index) => {
    const column = index % 7;
    const row = Math.floor(index / 7);
    const cellX = x + column * cellWidth;
    const cellY = y + 8 + row * rowHeight;
    doc.setDrawColor(215, 221, 231);
    if (!date) {
      doc.setFillColor(248, 249, 252);
      doc.rect(cellX, cellY, cellWidth, rowHeight, 'FD');
      return;
    }
    const summaryDay = summaries.find((entry) => entry.date === date)!;
    const weekend = column >= 5;
    if (summaryDay.holiday) doc.setFillColor(254, 239, 241);
    else if (weekend) doc.setFillColor(237, 245, 255);
    else doc.setFillColor(255, 255, 255);
    doc.rect(cellX, cellY, cellWidth, rowHeight, 'FD');

    doc.setTextColor(25, 33, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(parseLocalDate(date).getDate()), cellX + 2, cellY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);

    let line = cellY + 10;
    if (summaryDay.holiday) {
      doc.setTextColor(171, 45, 57);
      doc.text(shortText(summaryDay.holiday.name, 22), cellX + 2, line);
      line += 4;
    } else if (summaryDay.absence) {
      doc.setTextColor(52, 87, 213);
      doc.text(absenceLabel(summaryDay.absence.type), cellX + 2, line);
      line += 4;
    }
    doc.setTextColor(40, 48, 60);
    if (summaryDay.workedMinutes > 0) {
      doc.text(`${workWindow(data, date)} · ${minutesToHours(summaryDay.workedMinutes)}`, cellX + 2, line);
      line += 4;
    }
    if (summaryDay.breakMinutes > 0) {
      doc.text(`Pause ${minutesToHours(summaryDay.breakMinutes)}`, cellX + 2, line);
      line += 4;
    }
    if (summaryDay.targetMinutes > 0 || summaryDay.workedMinutes > 0) {
      doc.text(`Soll ${minutesToHours(summaryDay.targetMinutes)} · ${minutesToHours(summaryDay.balanceMinutes, true)}`, cellX + 2, line);
      line += 4;
    }
    if (summaryDay.note) {
      doc.setTextColor(100, 110, 125);
      doc.text(shortText(summaryDay.note, 24), cellX + 2, Math.min(line, cellY + rowHeight - 3));
    }
  });

  doc.addPage('a4', 'landscape');
  doc.setFillColor(20, 31, 54);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Tagesdetails · ${monthLabel}`, 14, 15.5);

  const columns = [14, 40, 70, 111, 133, 162, 192, 218];
  const widths = [24, 28, 39, 20, 27, 28, 24, 63];
  const headings = ['Datum', 'Arbeitszeit', 'Pausenzeiten', 'Soll', 'Abw./Feiertag', 'Überstundenabbau', 'Saldo', 'Bemerkung'];
  doc.setTextColor(25, 33, 45);
  doc.setFontSize(7.6);
  headings.forEach((heading, index) => doc.text(heading, columns[index], 31));
  doc.setDrawColor(190, 199, 212);
  doc.line(14, 34, 282, 34);

  let rowY = 40;
  doc.setFont('helvetica', 'normal');
  for (const day of summaries) {
    const description = day.holiday?.name ?? (day.absence ? absenceLabel(day.absence.type) : '');
    const note = day.note ?? '';
    const values = [
      formatDate(day.date, { weekday: 'short', day: '2-digit', month: '2-digit' }),
      `${workWindow(data, day.date)}\n${minutesToHours(day.workedMinutes)} Std.`,
      breakWindows(data, day.date),
      minutesToHours(day.targetMinutes),
      description || (day.creditedMinutes ? minutesToHours(day.creditedMinutes) : '–'),
      day.overtimeDeductionMinutes ? `${minutesToHours(day.overtimeDeductionMinutes)} Std.` : '–',
      minutesToHours(day.balanceMinutes, true),
      note || '–',
    ];
    const wrapped = values.map((value, index) => doc.splitTextToSize(value, widths[index]));
    const lineCount = Math.max(...wrapped.map((lines) => lines.length));
    const rowHeight = Math.max(7, lineCount * 3.5 + 2);
    if (rowY + rowHeight > 198) {
      doc.addPage('a4', 'landscape');
      rowY = 15;
    }
    wrapped.forEach((lines, index) => doc.text(lines, columns[index], rowY));
    doc.setDrawColor(235, 238, 243);
    doc.line(14, rowY + rowHeight - 2, 282, rowY + rowHeight - 2);
    rowY += rowHeight;
  }

  doc.save(`arbeitszeit-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.pdf`);
}
