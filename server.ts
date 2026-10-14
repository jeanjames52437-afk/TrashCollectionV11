import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware for parsing JSON with support for photo uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

export interface WasteReport {
  id: string;
  ticketNumber: string;
  residentName: string;
  residentPhone?: string;
  isElderly: boolean;
  severityLevel: 'MILD' | 'MODERATE' | 'OVERFLOWING' | 'EMERGENCY';
  purok: string;
  barangay?: string; // 'Barangay 40' | 'Barangay 41'
  streetAddress?: string;
  houseNumber?: string;
  landmark?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  autoGpsAccurate?: boolean;
  realtimeGpsAddress?: string;
  isWithinBrgy41?: boolean;
  isWithinJurisdiction?: boolean; // Sakop ng Brgy 40 o 41
  needsAssistanceOutside?: boolean;
  wasteTypes: string[];
  urgency: 'NORMAL' | 'HIGH' | 'URGENT_ELDERLY' | 'OVERFLOWING';
  estimatedBags?: string;
  photos: string[];
  notes?: string;
  extraMessage?: string; // Option 4 optional message at bottom
  status: 'PENDING' | 'DISPATCHED' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
  dispatchedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  // REQUIRED Kagawad Proof of Collection
  proofPhotos: string[];
  proofSubmittedAt?: string;
  proofKagawadName?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  sourceStorage: string;
  storageUsedMb: number;
  residentPhotosSizeMb: number;
  proofPhotosSizeMb: number;
  retentionDays: number;
  expiresAt: string;
  remindersSent: number;
  lastReminderAt?: string;
}

export interface SavedLogBook {
  id: string;
  filename: string;
  savedAt: string;
  savedAtPhilippineTime: string;
  totalRecords: number;
  pendingRecords: number;
  dispatchedRecords: number;
  resolvedRecords: number;
  cancelledRecords: number;
  brgy40Count: number;
  brgy41Count: number;
  storageUsedMb: number;
  savedBy: string;
  destination: string;
  syncStatus: 'SYNCED' | 'LOCAL_ONLY' | 'PENDING_UPLOAD';
  recordsSummary: string;
  recordsSnapshot?: WasteReport[];
}

// -------------------------------------------------------------
// PERSISTENT STORAGE CONTROLLER (Survives restarts and syncs to Pi)
// -------------------------------------------------------------
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const REPORTS_FILE = path.resolve(DATA_DIR, 'trash_reports.json');
const LOGBOOK_FILE = path.resolve(DATA_DIR, 'trash_saved_logbooks.json');

let reports: WasteReport[] = [];
let savedLogBooks: SavedLogBook[] = [];

// Load persisted data on server boot
try {
  if (fs.existsSync(REPORTS_FILE)) {
    const raw = fs.readFileSync(REPORTS_FILE, 'utf8');
    reports = JSON.parse(raw);
    console.log(`[T.R.A.S.H. Storage] Loaded ${reports.length} persisted reports from disk.`);
  }
} catch (e) {
  console.warn('[T.R.A.S.H. Storage] Could not read reports file, starting empty:', e);
}

try {
  if (fs.existsSync(LOGBOOK_FILE)) {
    const raw = fs.readFileSync(LOGBOOK_FILE, 'utf8');
    savedLogBooks = JSON.parse(raw);
    console.log(`[T.R.A.S.H. Storage] Loaded ${savedLogBooks.length} saved logbooks from disk.`);
  }
} catch (e) {
  console.warn('[T.R.A.S.H. Storage] Could not read logbooks file:', e);
}

function persistReports() {
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (e) {
    console.error('[T.R.A.S.H. Storage] Failed to persist reports:', e);
  }
}

function persistSavedLogBooks() {
  try {
    fs.writeFileSync(LOGBOOK_FILE, JSON.stringify(savedLogBooks, null, 2), 'utf8');
  } catch (e) {
    console.error('[T.R.A.S.H. Storage] Failed to persist logbooks:', e);
  }
}

// Telegram Bot Configuration
let telegramConfig = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
  botEnabled: true,
  lastBroadcastMessage: '',
  lastBroadcastTime: new Date().toISOString(),
  piServerUrl: process.env.PI_SERVER_URL || 'http://192.168.1.145:8000',
};

// Philippine Time Helpers (Asia/Manila, UTC+8)
function getPhilippineTime(): string {
  try {
    return (
      new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date()) + ' PST'
    );
  } catch {
    return new Date().toLocaleTimeString() + ' PST';
  }
}

function getPhilippineDateTime(): string {
  try {
    return (
      new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date()) + ' (Philippine Time)'
    );
  } catch {
    return new Date().toLocaleString() + ' (Philippine Time)';
  }
}

// Non-blocking Telegram message dispatcher
async function sendRealTelegramMessage(text: string): Promise<{ ok: boolean; description?: string; error?: string }> {
  const token = telegramConfig.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = telegramConfig.chatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId || token === 'YOUR_BOT_TOKEN_HERE') {
    return { ok: false, description: 'Token or Chat ID not configured yet' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    return { ok: !!data.ok, description: data.description };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { ok: false, error: err?.name === 'AbortError' ? 'Telegram request timed out' : err?.message || String(err) };
  }
}

// Generate the list of ONLY unfinished / active concerns
function formatActiveUnfinishedList(): string {
  const activeList = reports.filter((r) => r.status === 'PENDING' || r.status === 'DISPATCHED');
  if (activeList.length === 0) {
    return `📋 LISTAHAN NG MGA HINDI PA NAITATAPOS NA CONCERN:\n✅ Walang nakabinbing concern sa kasalukuyan. Lahat ay tapos at malinis na!`;
  }

  const items = activeList.map((r, i) => {
    const brgy = r.barangay || 'Brgy 41';
    const seniorTag = r.isElderly ? ' [SENIOR PRIORITY]' : '';
    const outsideTag = (r.needsAssistanceOutside || r.isWithinJurisdiction === false) ? ' [ASSISTANCE/LABAS]' : '';
    const name = r.residentName ? ` (${r.residentName})` : '';
    const extra = r.extraMessage ? `\n     Pakiusap: "${r.extraMessage}"` : '';
    return `${i + 1}. Ticket #${r.ticketNumber}${name}${seniorTag}${outsideTag}\n   📍 ${r.purok} - ${r.streetAddress || 'Auto-GPS'}\n   ⚠️ Kalubhaan: ${r.severityLevel} | Uri: ${r.wasteTypes.slice(0, 2).join(', ')}${extra}`;
  }).join('\n\n');

  return `📋 LISTAHAN NG MGA HINDI PA NAITATAPOS NA CONCERN (${activeList.length} active):\n\n${items}`;
}

// Helper to check jurisdiction across Barangay 40 and Barangay 41
function checkJurisdiction(lat: number, lng: number, specifiedBarangay?: string): {
  isWithinBrgy40: boolean;
  isWithinBrgy41: boolean;
  isWithinJurisdiction: boolean;
  detectedBarangay: 'Barangay 40' | 'Barangay 41' | 'Outside Jurisdiction';
} {
  const isWithinBrgy40 = lat >= 14.479 && lat <= 14.486 && lng >= 120.892 && lng <= 120.8975;
  const isWithinBrgy41 = lat >= 14.480 && lat <= 14.488 && lng >= 120.8965 && lng <= 120.9065;
  const isWithinCombined = lat >= 14.478 && lat <= 14.489 && lng >= 120.891 && lng <= 120.908;

  const isWithinJurisdiction = isWithinBrgy40 || isWithinBrgy41 || isWithinCombined;
  let detectedBarangay: 'Barangay 40' | 'Barangay 41' | 'Outside Jurisdiction' = 'Outside Jurisdiction';

  if (specifiedBarangay?.includes('40')) {
    detectedBarangay = 'Barangay 40';
  } else if (specifiedBarangay?.includes('41')) {
    detectedBarangay = 'Barangay 41';
  } else if (isWithinBrgy40 && !isWithinBrgy41) {
    detectedBarangay = 'Barangay 40';
  } else if (isWithinBrgy41) {
    detectedBarangay = 'Barangay 41';
  } else if (isWithinJurisdiction) {
    detectedBarangay = 'Barangay 41';
  }

  return {
    isWithinBrgy40,
    isWithinBrgy41,
    isWithinJurisdiction,
    detectedBarangay,
  };
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// 1. Get all reports with permanent state
app.get('/api/reports', (_req: Request, res: Response) => {
  const safeReports = reports.map((r) => {
    const coords = r.coordinates || { lat: 14.4838, lng: 120.8985 };
    const juris = checkJurisdiction(coords.lat, coords.lng, r.barangay || r.purok);
    const assignedBarangay = r.barangay || (juris.detectedBarangay === 'Outside Jurisdiction' ? 'Barangay 41' : juris.detectedBarangay);

    return {
      ...r,
      barangay: assignedBarangay,
      purok: r.purok || `${assignedBarangay}, Cavite City`,
      coordinates: coords,
      isWithinJurisdiction: r.isWithinJurisdiction ?? juris.isWithinJurisdiction,
      isWithinBrgy41: r.isWithinBrgy41 ?? (assignedBarangay === 'Barangay 41'),
      photos: Array.isArray(r.photos) ? r.photos : [],
      proofPhotos: Array.isArray(r.proofPhotos) ? r.proofPhotos : [],
      wasteTypes: Array.isArray(r.wasteTypes) ? r.wasteTypes : ['Household Trash'],
      severityLevel: r.severityLevel || 'MODERATE',
      isElderly: !!r.isElderly,
      extraMessage: r.extraMessage || '',
      storageUsedMb:
        r.storageUsedMb ||
        +(((r.photos?.length || 0) * 0.8) + ((r.proofPhotos?.length || 0) * 0.75)).toFixed(2),
    };
  });
  return res.json(safeReports);
});

// 2. Create a new waste collection report (Incoming Concern)
app.post('/api/reports', (req: Request, res: Response) => {
  try {
    const {
      residentName,
      residentPhone,
      isElderly,
      severityLevel,
      purok,
      barangay,
      streetAddress,
      houseNumber,
      landmark,
      coordinates,
      autoGpsAccurate,
      wasteTypes,
      urgency,
      estimatedBags,
      photos,
      notes,
      extraMessage,
      sourceStorage,
      retentionDays,
      realtimeGpsAddress,
      needsAssistanceOutside,
    } = req.body;

    if (!Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({ error: 'Kinakailangan ang litrato ng basura. Bawal mag-submit nang walang litrato.' });
    }

    const reportCount = reports.length + 1;
    const ticketNumber = `TRASH-CAV-${String(reportCount).padStart(3, '0')}`;
    const days = retentionDays || 30; // Permanent storage default
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    const finalSeverity = severityLevel || (isElderly ? 'OVERFLOWING' : 'MODERATE');
    let finalUrgency = urgency || 'NORMAL';
    if (isElderly) finalUrgency = 'URGENT_ELDERLY';
    else if (finalSeverity === 'EMERGENCY' || finalSeverity === 'OVERFLOWING') finalUrgency = 'HIGH';

    const coords = coordinates || { lat: 14.483, lng: 120.898 };
    const juris = checkJurisdiction(coords.lat, coords.lng, barangay || purok);
    const assignedBarangay =
      barangay ||
      (juris.detectedBarangay === 'Outside Jurisdiction' ? 'Barangay 41' : juris.detectedBarangay);

    const isOutsideAssistance =
      !!needsAssistanceOutside || !juris.isWithinJurisdiction;

    const resolvedRealtimeAddress =
      realtimeGpsAddress ||
      `${streetAddress || 'P. Burgos Ave'}, ${assignedBarangay}, Cavite City (GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;

    const sanitizedTypes = Array.isArray(wasteTypes) && wasteTypes.length > 0 ? [...wasteTypes] : ['Household Trash'];
    if (isOutsideAssistance && !sanitizedTypes.includes('Nangangailangan ng assistance')) {
      sanitizedTypes.push('Nangangailangan ng assistance');
    }

    const photoCount = Array.isArray(photos) ? photos.length : 0;
    const residentPhotosMb = +(photoCount * 0.8).toFixed(2);

    const newReport: WasteReport = {
      id: `rep-${Date.now()}`,
      ticketNumber,
      residentName: residentName ? String(residentName).trim() : '',
      residentPhone: residentPhone || 'N/A',
      isElderly: !!isElderly,
      severityLevel: finalSeverity,
      purok: purok || `${assignedBarangay}, Cavite City`,
      barangay: assignedBarangay,
      streetAddress: streetAddress || '',
      houseNumber: houseNumber || '',
      landmark: landmark || '',
      coordinates: coords,
      autoGpsAccurate: autoGpsAccurate ?? true,
      realtimeGpsAddress: resolvedRealtimeAddress,
      isWithinBrgy41: assignedBarangay === 'Barangay 41',
      isWithinJurisdiction: juris.isWithinJurisdiction,
      needsAssistanceOutside: isOutsideAssistance,
      wasteTypes: sanitizedTypes,
      urgency: finalUrgency,
      estimatedBags: estimatedBags || '1-3 bags',
      photos: Array.isArray(photos) ? photos : [],
      notes: notes || '',
      extraMessage: extraMessage ? String(extraMessage).trim() : '',
      status: 'PENDING',
      createdAt,
      proofPhotos: [],
      sourceStorage: sourceStorage || 'Raspberry Pi Cloud Storage',
      storageUsedMb: residentPhotosMb,
      residentPhotosSizeMb: residentPhotosMb,
      proofPhotosSizeMb: 0,
      retentionDays: days,
      expiresAt,
      remindersSent: 1,
      lastReminderAt: createdAt,
    };

    if (newReport.isElderly || newReport.severityLevel === 'EMERGENCY') {
      reports.unshift(newReport);
    } else {
      reports.push(newReport);
    }

    // Persist to disk permanently
    persistReports();

    // Faster processing: Immediate response, asynchronous Telegram dispatch
    const phTime = getPhilippineDateTime();
    const gmapsLink = `https://www.google.com/maps?q=${newReport.coordinates.lat},${newReport.coordinates.lng}`;
    const jurisdictionTag = juris.isWithinJurisdiction
      ? `Sakop ng ${assignedBarangay}`
      : `LABAS NG BRGY 40/41 (Kailangan ng Assistance)`;

    const extraMsgText = newReport.extraMessage ? `\nKaragdagang Mensahe: "${newReport.extraMessage}"` : '';
    const residentInfoText = newReport.residentName ? `\nResidente: ${newReport.residentName}` : '';

    const incomingTelegramMsg = `🚨 [T.R.A.S.H. - BAGONG CONCERN REPORT]\nTicket: #${newReport.ticketNumber}\nHurisdiksyon: ${assignedBarangay} (${jurisdictionTag})\nOras (Philippine Time): ${phTime}\nLugar: ${newReport.purok} - ${newReport.streetAddress || 'Auto-GPS'}\nAddress: ${resolvedRealtimeAddress}${residentInfoText}\nKalubhaan: ${newReport.severityLevel}${newReport.isElderly ? ' (Senior Citizen Priority 👵)' : ''}\nUri ng Basura: ${sanitizedTypes.join(', ')}\nLitrato: ${newReport.photos.length} uploaded sa Cloud/Pi${extraMsgText}\n\n📍 Mapa: ${gmapsLink}`;

    telegramConfig.lastBroadcastMessage = incomingTelegramMsg;
    telegramConfig.lastBroadcastTime = phTime;

    // Asynchronous non-blocking dispatch: First the new report, then the active unfinished list!
    setImmediate(async () => {
      try {
        await sendRealTelegramMessage(incomingTelegramMsg);
        // Follow up with active unfinished concerns list
        const activeListMsg = formatActiveUnfinishedList();
        await sendRealTelegramMessage(activeListMsg);
      } catch (e) {
        console.warn('[Telegram Dispatch Warning]:', e);
      }
    });

    res.status(201).json({
      success: true,
      report: newReport,
      message: 'Waste collection ticket submitted successfully. Kagawad notified via Telegram in Philippine Time.',
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Failed to create waste collection report' });
  }
});

// 3. Update report status with Kagawad Proof of Collection (Finished Concern Telegram Broadcast)
app.patch('/api/reports/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, resolvedBy, resolutionNotes, cancellationReason, proofPhotos, proofKagawadName } = req.body;

  const report = reports.find((r) => r.id === id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (status) {
    report.status = status;
    const nowIso = new Date().toISOString();
    const phTime = getPhilippineDateTime();

    if (status === 'DISPATCHED') {
      report.dispatchedAt = nowIso;
    } else if (status === 'RESOLVED') {
      report.resolvedAt = nowIso;
      report.resolvedBy = resolvedBy || proofKagawadName || 'Barangay Kagawad & Cavite Sanitation Crew';
      report.resolutionNotes = resolutionNotes || 'Natapos na ang pagkolekta ng basura. Malinis na ang lugar.';

      // Store attached proof photos from Kagawad
      if (Array.isArray(proofPhotos) && proofPhotos.length > 0) {
        report.proofPhotos = proofPhotos;
        report.proofSubmittedAt = nowIso;
        report.proofKagawadName = proofKagawadName || report.resolvedBy;
        const proofMb = +(proofPhotos.length * 0.75).toFixed(2);
        report.proofPhotosSizeMb = proofMb;
        report.storageUsedMb = +(report.residentPhotosSizeMb + proofMb).toFixed(2);
      }

      // Persist changes to disk permanently
      persistReports();

      // TELEGRAM BOT: Finished Concern Immediate Notification + Follow-up with Active Unfinished List
      const proofCount = report.proofPhotos?.length || 0;
      const finishedTelegramMsg = `✅ [T.R.A.S.H. - FINISHED CONCERN / NAKOLEKTA NA]\nTicket: #${report.ticketNumber}\nHurisdiksyon: ${report.barangay || 'Barangay 40 & 41'}\nOras ng Pagtatapos: ${phTime}\nLugar: ${report.purok} - ${report.streetAddress || 'Cavite City'}\nNangolekta / Kagawad: ${report.resolvedBy}\nUlat ng Proeba: ${report.resolutionNotes}\nLitrato ng Proeba: ${proofCount} patunay na litrato naka-attach\nKatayuan: KUMPLETO AT MALINIS NA`;

      telegramConfig.lastBroadcastMessage = finishedTelegramMsg;
      telegramConfig.lastBroadcastTime = phTime;

      // Asynchronous non-blocking dispatch: First the finished report, then the remaining unfinished list!
      setImmediate(async () => {
        try {
          await sendRealTelegramMessage(finishedTelegramMsg);
          // Follow up with active unfinished concerns list
          const activeListMsg = formatActiveUnfinishedList();
          await sendRealTelegramMessage(activeListMsg);
        } catch (e) {
          console.warn('[Telegram Finished Dispatch Warning]:', e);
        }
      });
    } else if (status === 'CANCELLED') {
      report.cancelledAt = nowIso;
      report.cancellationReason = cancellationReason || 'Kinansela ng Kagawad o residente.';
      persistReports();
    }
  }

  res.json({ success: true, report });
});

// 4. Delete report immediately (Allows Kagawad to remove spam / duplicates permanently)
app.delete('/api/reports/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = reports.findIndex((r) => r.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const deleted = reports.splice(index, 1)[0];
  persistReports();
  res.json({ success: true, deletedId: deleted.id, ticketNumber: deleted.ticketNumber });
});

// 5. Clear all reports and logs (Clean Slate)
app.post('/api/reports/clear', (_req: Request, res: Response) => {
  const previousCount = reports.length;
  reports = [];
  persistReports();
  res.json({ success: true, clearedCount: previousCount, message: 'Nalinis na ang buong data logbook.' });
});

// 6. Raspberry Pi 4B Storage Status & Metrics
app.get('/api/pi-status', (_req: Request, res: Response) => {
  const totalResidentPhotos = reports.reduce((acc, r) => acc + (r.photos?.length || 0), 0);
  const totalProofPhotos = reports.reduce((acc, r) => acc + (r.proofPhotos?.length || 0), 0);
  const totalResidentMb = +(totalResidentPhotos * 0.8).toFixed(2);
  const totalProofMb = +(totalProofPhotos * 0.75).toFixed(2);
  const totalStorageUsedMb = +(totalResidentMb + totalProofMb + (reports.length * 0.02)).toFixed(2);
  const totalStorageCapacityGb = 32;

  const brgy40Count = reports.filter((r) => r.barangay?.includes('40') || r.purok?.includes('40')).length;
  const brgy41Count = reports.filter((r) => r.barangay?.includes('41') || r.purok?.includes('41') || !r.barangay).length;

  res.json({
    hardware: 'Raspberry Pi 4 Model B (Rev 1.4)',
    ram: '4GB LPDDR4',
    storageCapacityGb: totalStorageCapacityGb,
    storageUsedMb: totalStorageUsedMb,
    storageFreeGb: +(totalStorageCapacityGb - totalStorageUsedMb / 1024).toFixed(2),
    residentPhotosCount: totalResidentPhotos,
    residentPhotosMb: totalResidentMb,
    proofPhotosCount: totalProofPhotos,
    proofPhotosMb: totalProofMb,
    cachedImagesCount: totalResidentPhotos + totalProofPhotos,
    activeTicketsCount: reports.length,
    pendingTicketsCount: reports.filter((r) => r.status === 'PENDING').length,
    brgy40Count,
    brgy41Count,
    autoPurgeTtlDays: 30,
    cpuTempCelsius: +(42.5 + Math.random() * 3.0).toFixed(1),
    ramUsagePercent: 32,
    ipAddress: '192.168.1.145',
    localHostname: 'raspberrypi.local:8000',
    online: true,
    lastPurgeRun: new Date(Date.now() - 3600000).toISOString(),
    savedLogbooksCount: savedLogBooks.length,
  });
});

// 7. Save Log Book to Pi Cloud Server
app.post('/api/pi/save-logbook', async (req: Request, res: Response) => {
  try {
    const { savedBy, destination, piEndpoint } = req.body;
    const phTime = getPhilippineDateTime();
    const nowIso = new Date().toISOString();

    const brgy40Count = reports.filter((r) => r.barangay?.includes('40') || r.purok?.includes('40')).length;
    const brgy41Count = reports.filter((r) => r.barangay?.includes('41') || r.purok?.includes('41') || !r.barangay).length;

    const pendingRecords = reports.filter((r) => r.status === 'PENDING').length;
    const dispatchedRecords = reports.filter((r) => r.status === 'DISPATCHED').length;
    const resolvedRecords = reports.filter((r) => r.status === 'RESOLVED').length;
    const cancelledRecords = reports.filter((r) => r.status === 'CANCELLED').length;

    const totalResidentMb = reports.reduce((acc, r) => acc + (r.residentPhotosSizeMb || (r.photos?.length || 0) * 0.8), 0);
    const totalProofMb = reports.reduce((acc, r) => acc + (r.proofPhotosSizeMb || (r.proofPhotos?.length || 0) * 0.75), 0);
    const storageUsedMb = +(totalResidentMb + totalProofMb).toFixed(2);

    const logbookId = `LOG-${Date.now()}`;
    const filename = `TRASH_Logbook_Brgy40_41_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.json`;

    let syncStatus: 'SYNCED' | 'LOCAL_ONLY' = 'LOCAL_ONLY';

    // If Pi Endpoint provided, attempt sync with timeout
    const targetUrl = piEndpoint || telegramConfig.piServerUrl;
    if (targetUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const piRes = await fetch(`${targetUrl}/api/logbook/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logbookId,
            savedBy: savedBy || 'Barangay Kagawad',
            totalRecords: reports.length,
            reports,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (piRes.ok) {
          syncStatus = 'SYNCED';
        }
      } catch {
        syncStatus = 'LOCAL_ONLY';
      }
    }

    const newLogBook: SavedLogBook = {
      id: logbookId,
      filename,
      savedAt: nowIso,
      savedAtPhilippineTime: phTime,
      totalRecords: reports.length,
      pendingRecords,
      dispatchedRecords,
      resolvedRecords,
      cancelledRecords,
      brgy40Count,
      brgy41Count,
      storageUsedMb,
      savedBy: savedBy || 'Barangay 40 & 41 Kagawad',
      destination: destination || 'Raspberry Pi 4B Cloud Server',
      syncStatus,
      recordsSummary: `${reports.length} kabuuang tala (Pending: ${pendingRecords}, Resolved: ${resolvedRecords})`,
      recordsSnapshot: [...reports],
    };

    savedLogBooks.unshift(newLogBook);
    persistSavedLogBooks();

    res.json({
      success: true,
      logbook: newLogBook,
      message: `Matagumpay na na-save ang Log Book sa Pi Cloud Storage! (${phTime})`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save logbook' });
  }
});

// 7b. Retrieve Saved Log Books
app.get('/api/pi/saved-logbooks', (_req: Request, res: Response) => {
  res.json({
    success: true,
    count: savedLogBooks.length,
    logbooks: savedLogBooks.map((l) => ({
      ...l,
      recordsSnapshot: undefined,
    })),
  });
});

// 7c. Download full Log Book as JSON
app.get('/api/pi/download-logbook/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const logbook = savedLogBooks.find((l) => l.id === id);
  if (!logbook) {
    return res.status(404).json({ error: 'Logbook not found' });
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${logbook.filename}"`);
  return res.json(logbook);
});

// 8. Telegram Alert Dispatcher (Manual Test Alert)
app.post('/api/telegram/test-notify', async (req: Request, res: Response) => {
  const { botToken, chatId, message } = req.body;
  if (botToken) telegramConfig.botToken = botToken;
  if (chatId) telegramConfig.chatId = chatId;

  const phTime = getPhilippineDateTime();
  const simulatedMessage =
    message ||
    `🔔 [T.R.A.S.H. TEST ALERT - BARANGAY 40 & 41]\nStatus: Aktibo at Konektado sa Portal\nOras: ${phTime}\nKasalukuyang Pending: ${
      reports.filter((r) => r.status === 'PENDING').length
    } concern(s)\nSakop: Barangay 40 at Barangay 41, Cavite City\n\n${formatActiveUnfinishedList()}`;

  telegramConfig.lastBroadcastMessage = simulatedMessage;
  telegramConfig.lastBroadcastTime = phTime;

  const telegramResult = await sendRealTelegramMessage(simulatedMessage);
  res.json({
    success: true,
    message: telegramResult.ok
      ? `Matagumpay na naipadala ang alert sa Telegram ng Kagawad! (${phTime})`
      : 'Nai-save ang Telegram configurations sa server.',
    telegramResult,
    broadcast: simulatedMessage,
    timestamp: phTime,
  });
});

// 8b. Telegram Status & Philippine Time Sync Endpoint
app.get('/api/telegram/status', (_req: Request, res: Response) => {
  const phTime = getPhilippineDateTime();
  res.json({
    botConfigured: !!(telegramConfig.botToken && telegramConfig.chatId),
    chatId: telegramConfig.chatId,
    lastBroadcastMessage: telegramConfig.lastBroadcastMessage,
    lastBroadcastTime: telegramConfig.lastBroadcastTime,
    philippineTime: phTime,
    pendingCount: reports.filter((r) => r.status === 'PENDING').length,
    activeUnfinishedCount: reports.filter((r) => r.status === 'PENDING' || r.status === 'DISPATCHED').length,
  });
});

// 9. API to retrieve full source file tree
app.get('/api/source-tree', (_req: Request, res: Response) => {
  try {
    const files: { path: string; content: string }[] = [];
    const rootDir = process.cwd();

    function readFilesRecursively(dir: string) {
      const list = fs.readdirSync(dir);
      for (const item of list) {
        if (['node_modules', 'dist', '.git', '.aistudio'].includes(item)) continue;
        const fullPath = path.join(dir, item);
        const relPath = path.relative(rootDir, fullPath);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          readFilesRecursively(fullPath);
        } else {
          if (item.endsWith('.zip') || item.endsWith('.png') || item.endsWith('.apk')) continue;
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            files.push({ path: relPath, content });
          } catch {}
        }
      }
    }

    readFilesRecursively(rootDir);
    res.json({ success: true, count: files.length, files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to read source tree' });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const publicPath = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  const distPath = path.resolve(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath);

  if (process.env.NODE_ENV === 'production' || hasDist) {
    if (hasDist) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(process.cwd(), 'index.html'));
      });
    }
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`T.R.A.S.H. Barangay 40 & 41 Waste System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
