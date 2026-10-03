// Files in the "ITN Ops Files" shared drive. The dashboard service account is
// a member of that shared drive only and works there as itself (no
// delegation), so it can't see or change anything else in anyone's Drive.
// Layout: one folder per project ("P-2026-001 – Name") and a "Certificates"
// folder with a sub-folder per certificate type, all created on first use and
// found again by appProperties (renaming a folder in Drive doesn't break it).

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// What may be uploaded: photos, PDFs, Office files, plain text/CSV.
export const UPLOAD_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/heic': 'image',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'text',
  'text/plain': 'text',
};

export function createDrive({ token, driveId }) {
  async function api(url, init = {}) {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, ...(init.headers || {}) } });
    if (!res.ok) {
      const error = new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`);
      error.status = res.status;
      throw error;
    }
    return res;
  }
  const common = 'supportsAllDrives=true';
  const folderCache = new Map();

  /** The folder tagged key=value under parentId, created (named `name`) if missing. */
  async function folder(parentId, key, value, name) {
    const cacheKey = `${parentId}/${key}=${value}`;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);
    const q = [
      "mimeType='application/vnd.google-apps.folder'",
      'trashed=false',
      `'${parentId}' in parents`,
      `appProperties has { key='${key}' and value='${String(value).replace(/['\\]/g, '')}' }`,
    ].join(' and ');
    const list = await (
      await api(`${DRIVE}/files?${new URLSearchParams({ q, corpora: 'drive', driveId, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', fields: 'files(id)' })}`)
    ).json();
    let id = list.files?.[0]?.id;
    if (!id) {
      const created = await (
        await api(`${DRIVE}/files?${common}&fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId], appProperties: { [key]: String(value) } }),
        })
      ).json();
      id = created.id;
    }
    folderCache.set(cacheKey, id);
    return id;
  }

  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120);

  return {
    projectFolder: (code, name) => folder(driveId, 'itnProject', code, safeName(`${code} – ${name || 'Project'}`)),
    async certificateFolder(type) {
      const root = await folder(driveId, 'itnArea', 'certificates', 'Certificates');
      return folder(root, 'itnCertificateType', type || 'Other', safeName(type || 'Other'));
    },

    /** Uploads bytes into a folder (resumable upload, so 20 MB files are fine). Returns { id, name, mimeType, url }. */
    async upload({ parentId, name, mimeType, bytes, properties }) {
      const init = await api(`${UPLOAD}/files?uploadType=resumable&${common}&fields=id,name,mimeType,webViewLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(bytes.length) },
        body: JSON.stringify({ name: safeName(name) || 'Upload', parents: [parentId], appProperties: properties || {} }),
      });
      const location = init.headers.get('location');
      const put = await api(location, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: bytes });
      const file = await put.json();
      return { id: file.id, name: file.name, mimeType: file.mimeType, url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view` };
    },

    /** A file's bytes, only if it lives in the ITN Ops Files shared drive. */
    async download(id) {
      const meta = await (await api(`${DRIVE}/files/${encodeURIComponent(id)}?${common}&fields=id,name,mimeType,size,driveId`)).json();
      if (meta.driveId !== driveId) {
        const error = new Error('That file is not in the ITN Ops Files shared drive.');
        error.status = 403;
        throw error;
      }
      if (Number(meta.size) > MAX_UPLOAD_BYTES) throw Object.assign(new Error('That file is too large to read.'), { status: 413 });
      const res = await api(`${DRIVE}/files/${encodeURIComponent(id)}?${common}&alt=media`);
      return { id, name: meta.name, mimeType: meta.mimeType, bytes: Buffer.from(await res.arrayBuffer()) };
    },
  };
}

/** The Drive file ID in a drive.google.com link, or null. */
export function driveFileId(url) {
  const m = /^https:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|[a-z]+\/d\/)([A-Za-z0-9_-]{10,})/.exec(String(url || ''));
  return m ? m[1] : null;
}
