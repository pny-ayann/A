import 'server-only';
import ExcelJS from 'exceljs';
import { kstDay, monthRange } from './month';

export type BillingLine = {
  order_no: string; completed_at: string; pickup_area: string; dropoff_area: string;
  vehicle_number: string; missions: string; fare: number; fuel: number;
};
export type BillingTotal = { supply: number; vat: number; fuel: number; total: number };

const NUM = '#,##0';

/** 업체 한 곳, 한 달 정산서 엑셀 (시트 하나). 금액은 서버 계산 결과를 그대로 쓴다. */
export async function buildStatement(company: string, m: string, lines: BillingLine[], t: BillingTotal): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('정산서');
  ws.columns = [14, 12, 16, 16, 12, 18, 12, 12].map(width => ({ width }));
  ws.getCell('A1').value = company;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `기간 ${monthRange(m)}`;
  const head = ws.getRow(4);
  head.values = ['오더 번호', '완료일', '출발', '도착', '차량번호', '미션', '요금', '주유비'];
  head.font = { bold: true };
  for (const l of lines) {
    const r = ws.addRow([l.order_no, kstDay(l.completed_at), l.pickup_area, l.dropoff_area, l.vehicle_number, l.missions, l.fare, l.fuel]);
    r.getCell(2).numFmt = 'yyyy-mm-dd';
    r.getCell(7).numFmt = NUM;
    r.getCell(8).numFmt = NUM;
  }
  ws.addRow([]);
  for (const [label, v] of [['공급가액', t.supply], ['부가세', t.vat], ['주유비(실비)', t.fuel], ['청구금액', t.total]] as const) {
    const r = ws.addRow([label, v]);
    r.getCell(2).numFmt = NUM;
    if (label === '청구금액') r.font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
