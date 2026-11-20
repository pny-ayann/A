import ExcelJS from 'exceljs';
import { buildStatement } from './excel';

vi.mock('server-only', () => ({}));

test('정산서 엑셀: 줄과 합계가 들어간다', async () => {
  const buf = await buildStatement('개발상사A', '2026-11', [
    { order_no: '1103-001', completed_at: '2026-11-30T14:59:00Z', pickup_area: '중구', dropoff_area: '강남구',
      vehicle_number: '12가3456', missions: '세차', fare: 300000, fuel: 50000 },
    { order_no: '1105-002', completed_at: '2026-11-05T01:00:00Z', pickup_area: '마포구', dropoff_area: '송파구',
      vehicle_number: '34나5678', missions: '', fare: 100000, fuel: 0 },
  ], { supply: 400000, vat: 40000, fuel: 50000, total: 490000 });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer); // exceljs 타입이 새 Buffer 타입을 모름
  const ws = wb.getWorksheet('정산서')!;
  expect(ws.getCell('A1').value).toBe('개발상사A');
  expect(ws.getCell('A2').value).toBe('기간 2026-11-01 ~ 2026-11-30');
  expect(ws.getRow(4).values).toEqual([undefined, '오더 번호', '완료일', '출발', '도착', '차량번호', '미션', '요금', '주유비']);
  expect(ws.getCell('B5').value).toEqual(new Date(Date.UTC(2026, 11 - 1, 30)));
  expect(ws.getCell('B5').numFmt).toBe('yyyy-mm-dd');
  expect(ws.getCell('B6').value).toEqual(new Date(Date.UTC(2026, 11 - 1, 5)));
  expect(ws.getRow(5).values).toEqual([undefined, '1103-001', new Date(Date.UTC(2026, 10, 30)), '중구', '강남구', '12가3456', '세차', 300000, 50000]);
  expect(ws.getCell('G5').numFmt).toBe('#,##0');
  expect(ws.getCell('G6').value).toBe(100000);

  const last = ws.lastRow!;
  expect(last.getCell(1).value).toBe('청구금액');
  expect(last.getCell(2).value).toBe(490000);
  expect(last.getCell(2).font?.bold).toBe(true);
  const labels = [last.number - 3, last.number - 2, last.number - 1].map(n => [ws.getRow(n).getCell(1).value, ws.getRow(n).getCell(2).value]);
  expect(labels).toEqual([['공급가액', 400000], ['부가세', 40000], ['주유비(실비)', 50000]]);
});
