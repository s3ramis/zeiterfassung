import { jsPDF } from 'jspdf';
import type { AppData, Holiday } from '../types';
import { calendarCells, formatDate, monthRange, parseLocalDate } from './date';
import { absenceLabel, minutesToHours } from './format';
import { aggregateSummaries, summariesForRange } from './time';

function shortText(text: string, max = 24): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
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

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`Arbeitszeitkalender ${monthLabel}`, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${data.settings.employeeName} · Bundesland ${data.settings.federalState}`, 14, 23);
  doc.text(`Erstellt am ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(now)}`, 205, 23);

  const summary = [
    `Soll: ${minutesToHours(totals.targetMinutes)} Std.`,
    `Arbeit: ${minutesToHours(totals.workedMinutes)} Std.`,
    `Gutschrift: ${minutesToHours(totals.creditedMinutes)} Std.`,
    `Pausen: ${minutesToHours(totals.breakMinutes)} Std.`,
    `Saldo: ${minutesToHours(totals.balanceMinutes, true)} Std.`,
  ];
  doc.setFont('helvetica', 'bold');
  summary.forEach((item, index) => doc.text(item, 14 + index * 54, 32));

  const x = 14;
  const y = 39;
  const cellWidth = 38.4;
  const rowHeight = 27;
  const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  doc.setFontSize(9);
  weekdays.forEach((weekday, index) => {
    doc.setFillColor(235, 239, 246);
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
    if (summaryDay.holiday) doc.setFillColor(253, 236, 239);
    else if (weekend) doc.setFillColor(234, 243, 255);
    else doc.setFillColor(255, 255, 255);
    doc.rect(cellX, cellY, cellWidth, rowHeight, 'FD');

    doc.setTextColor(25, 33, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(parseLocalDate(date).getDate()), cellX + 2, cellY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

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
      doc.text(`Arbeit ${minutesToHours(summaryDay.workedMinutes)}`, cellX + 2, line);
      line += 4;
    }
    if (summaryDay.targetMinutes > 0) {
      doc.text(`Soll ${minutesToHours(summaryDay.targetMinutes)} · ${minutesToHours(summaryDay.balanceMinutes, true)}`, cellX + 2, line);
      line += 4;
    }
    if (summaryDay.note) {
      doc.setTextColor(100, 110, 125);
      doc.text(shortText(summaryDay.note, 24), cellX + 2, Math.min(line, cellY + rowHeight - 3));
    }
  });

  doc.addPage('a4', 'landscape');
  doc.setTextColor(25, 33, 45);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Tagesdetails · ${monthLabel}`, 14, 16);

  const columns = [14, 45, 75, 105, 135, 165, 195];
  const headings = ['Datum', 'Soll', 'Arbeit', 'Pause', 'Gutschrift', 'Saldo', 'Bemerkung'];
  doc.setFontSize(8);
  headings.forEach((heading, index) => doc.text(heading, columns[index], 25));
  doc.setDrawColor(200, 207, 218);
  doc.line(14, 28, 282, 28);

  let rowY = 34;
  doc.setFont('helvetica', 'normal');
  for (const day of summaries) {
    if (rowY > 194) {
      doc.addPage('a4', 'landscape');
      rowY = 16;
    }
    const description = day.holiday?.name ?? (day.absence ? absenceLabel(day.absence.type) : day.note ?? '');
    const values = [
      formatDate(day.date, { weekday: 'short', day: '2-digit', month: '2-digit' }),
      minutesToHours(day.targetMinutes),
      minutesToHours(day.workedMinutes),
      minutesToHours(day.breakMinutes),
      minutesToHours(day.creditedMinutes),
      minutesToHours(day.balanceMinutes, true),
      shortText(description, 48),
    ];
    values.forEach((value, index) => doc.text(value, columns[index], rowY));
    doc.setDrawColor(235, 238, 243);
    doc.line(14, rowY + 2, 282, rowY + 2);
    rowY += 6;
  }

  doc.save(`arbeitszeit-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.pdf`);
}
