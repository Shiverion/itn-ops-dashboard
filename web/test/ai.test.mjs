// How uploaded files are handed to the AI (no AI call; no network).
import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { fileBlocks } from '../ai.mjs';
import { driveFileId } from '../drive.mjs';

test('PDFs and photos go in as document/image blocks', async () => {
  const pdf = await fileBlocks({ name: 'mom.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.4') });
  assert.equal(pdf[1].type, 'document');
  assert.equal(pdf[1].source.media_type, 'application/pdf');
  const img = await fileBlocks({ name: 'site.jpg', mimeType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8]) });
  assert.equal(img[1].type, 'image');
});

test('Excel becomes tab-separated text per sheet; unknown formats become a note', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('BOQ').addRow(['Item', 'Qty', 'Price']);
  wb.getWorksheet('BOQ').addRow(['Pipe 6"', 12, 450000]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const [block] = await fileBlocks({ name: 'boq.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes });
  assert.match(block.text, /## Sheet: BOQ/);
  assert.match(block.text, /Pipe 6"\t12\t450000/);
  const [note] = await fileBlocks({ name: 'old.doc', mimeType: 'application/msword', bytes: Buffer.from('x') });
  assert.match(note.text, /can't be read/);
});

test('driveFileId accepts Drive/Docs links only', () => {
  assert.equal(driveFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=drive_link'), '1AbCdEfGhIjKlMnOp');
  assert.equal(driveFileId('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit'), '1AbCdEfGhIjKlMnOp');
  assert.equal(driveFileId('https://evil.example/file/d/1AbCdEfGhIjKlMnOp/view'), null);
});
