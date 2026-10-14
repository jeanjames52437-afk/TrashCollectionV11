import React, { useState, useEffect } from 'react';
import {
  Server,
  HardDrive,
  Clock,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Settings,
  HelpCircle,
  Camera,
  Smartphone,
} from 'lucide-react';
import { PiStatus } from '../types';
import { soundAlert } from '../utils/audioAlarm';

interface RaspberryPiCenterProps {
  activeStorageMode: 'pi' | 'cloud';
  onToggleStorageMode: () => void;
}

export const RaspberryPiCenter: React.FC<RaspberryPiCenterProps> = () => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem('trash_pi_setup_completed') === 'true' ||
        localStorage.getItem('draw_pi_setup_completed') === 'true'
      );
    } catch {
      return false;
    }
  });

  const [piEndpoint, setPiEndpoint] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('trash_pi_endpoint') ||
        localStorage.getItem('draw_pi_endpoint') ||
        'http://192.168.1.145:8000'
      );
    } catch {
      return 'http://192.168.1.145:8000';
    }
  });

  const [piData, setPiData] = useState<PiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fetchPiStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pi-status');
      const data = await res.json();
      setPiData(data);
    } catch (e) {
      console.error('Error fetching Pi status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPiStatus();
    const interval = setInterval(fetchPiStatus, 12000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveAndCompleteSetup = () => {
    try {
      localStorage.setItem('trash_pi_setup_completed', 'true');
      localStorage.setItem('trash_pi_endpoint', piEndpoint.trim());
    } catch (e) {
      console.error(e);
    }
    setIsSetupComplete(true);
    soundAlert.playChime();
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const setupCommands = [
    {
      title: '1. I-install ang Python 3 & Dependencies sa Pi',
      code: `sudo apt update && sudo apt install -y python3 python3-pip sqlite3\npip3 install fastapi uvicorn requests pyTelegramBotAPI python-multipart pydantic`,
    },
    {
      title: '2. I-setup ang Storage Folder para sa Reports & Proof Photos',
      code: `mkdir -p ~/trash_storage/photos/reports\nmkdir -p ~/trash_storage/photos/proofs\nmkdir -p ~/trash_server\ncd ~/trash_server`,
    },
    {
      title: '3. Simulan ang Server sa Pi',
      code: `python3 ~/trash_server/main.py --host 0.0.0.0 --port 8000`,
    },
    {
      title: '4. Kunin ang Local IP ng Raspberry Pi 4B',
      code: `hostname -I\n# Halimbawa ng lalabas: 192.168.1.145`,
    },
  ];

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Server className="w-5 h-5" />
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              Raspberry Pi 4B Cloud Storage Hub (Permanente)
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Permanenteng imbakan kung saan dadaan at nakatala ang lahat ng litrato ng residente at proeba ng Kagawad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSetupComplete ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE & SYNCED SA PI 4
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">
              <Clock className="w-3.5 h-3.5" />
              ONE-TIME SETUP NEEDED
            </span>
          )}
        </div>
      </div>

      {/* PIPELINE ARCHITECTURE DIAGRAM */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-white space-y-3">
        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
          Proseso ng Pagdaan ng Data & Storage (Pipeline):
        </span>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 space-y-1">
            <div className="text-emerald-400 font-bold flex items-center gap-1">
              <Smartphone className="w-4 h-4" />
              <span>1. Residente Phone</span>
            </div>
            <p className="text-[10px] text-slate-300">
              Kukuha ng litrato ng basura. Naka-save sa sariling cellphone memory.
            </p>
          </div>

          <div className="bg-slate-800/90 p-3 rounded-xl border border-amber-500/50 space-y-1">
            <div className="text-amber-400 font-bold flex items-center gap-1">
              <Server className="w-4 h-4" />
              <span>2. Pi 4 Cloud Storage</span>
            </div>
            <p className="text-[10px] text-slate-300">
              Nakatabi sa permanenteng database disk ng Pi 4 (o Cloud Server).
            </p>
          </div>

          <div className="bg-slate-800/90 p-3 rounded-xl border border-purple-500/50 space-y-1">
            <div className="text-purple-400 font-bold flex items-center gap-1">
              <Camera className="w-4 h-4" />
              <span>3. Kagawad Proeba</span>
            </div>
            <p className="text-[10px] text-slate-300">
              Obligadong mag-attach ng proeba photo bago ma-resolve.
            </p>
          </div>

          <div className="bg-slate-800/90 p-3 rounded-xl border border-teal-500/50 space-y-1">
            <div className="text-teal-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" />
              <span>4. Binalik sa Residente</span>
            </div>
            <p className="text-[10px] text-slate-300">
              Makikita ng residente ang proeba sa kanilang telepono!
            </p>
          </div>
        </div>
      </div>

      {!isSetupComplete ? (
        <div className="space-y-5 animate-in fade-in">
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-950 font-black text-sm">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>GABAY: PAANO I-SETUP ANG RASPBERRY PI 4B CLOUD SERVER:</span>
            </div>
            <p className="text-xs text-slate-600">
              Isang beses mo lamang itong patatakbuhin sa iyong Raspberry Pi 4B. Kapag nai-save mo na ito, live status na lamang ang makikita.
            </p>

            <div className="space-y-3 pt-1">
              {setupCommands.map((cmd, idx) => (
                <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-100 shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-black">
                        {idx + 1}
                      </span>
                      <span>{cmd.title}</span>
                    </span>
                    <button
                      onClick={() => copyToClipboard(cmd.code, idx)}
                      className="px-2 py-0.5 rounded-md text-[11px] text-amber-700 hover:bg-amber-50 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedIndex === idx ? 'Kopya na' : 'Kopyahin'}</span>
                    </button>
                  </div>
                  <pre className="p-2.5 rounded-lg bg-slate-900 text-amber-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {cmd.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-black text-sm text-slate-900">
              I-link ang Raspberry Pi 4B Server URL:
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Raspberry Pi Local IP / Endpoint:
              </label>
              <input
                type="text"
                placeholder="Hal. http://192.168.1.145:8000 o http://raspberrypi.local:8000"
                value={piEndpoint}
                onChange={(e) => setPiEndpoint(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveAndCompleteSetup}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 transition-transform active:scale-98 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span>I-save at I-mark bilang Complete (Itatago ang Tutorial)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 animate-in fade-in">
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                <Server className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm sm:text-base text-white">
                    Raspberry Pi 4 Model B (4GB RAM)
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ONLINE & PERMANENT STORAGE ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 font-mono">
                  Endpoint: <span className="text-amber-300">{piEndpoint}</span> • Naka-sync sa Database
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchPiStatus}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                <span>I-refresh</span>
              </button>
              <button
                onClick={() => setIsSetupComplete(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                title="I-reconfigure ang Pi Server Endpoint"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Granular Storage Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {/* Resident Photos Storage */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  <span>Resident Photos (Pi Storage)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {piData?.residentPhotosMb || 0} MB
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                {piData?.residentPhotosCount || 0} litrato
              </div>
              <div className="text-[10px] text-slate-500">
                Litrato ng mga iniulat na basura mula sa residente.
              </div>
            </div>

            {/* Kagawad Proof Photos Storage */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>Kagawad Proofs (Pi Storage)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {piData?.proofPhotosMb || 0} MB
                </span>
              </div>
              <div className="text-base font-black text-slate-900">
                {piData?.proofPhotosCount || 0} patunay
              </div>
              <div className="text-[10px] text-slate-500">
                Litrato ng nalinis na lugar bago na-resolve.
              </div>
            </div>

            {/* Total Disk Meter */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-amber-600" />
                  <span>Kabuuang Pi Disk Ginamit</span>
                </span>
                <span className="font-mono text-[11px] text-amber-700 font-bold">
                  {piData?.storageUsedMb || 0} MB
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((piData?.storageUsedMb || 2.4) / 32768) * 100 + 2)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>32 GB MicroSD/SSD</span>
                <span className="text-emerald-700 font-bold">Permanente at Safe</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
