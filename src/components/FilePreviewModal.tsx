import React, { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import {
  dataUrlToBlob,
  decodeDataUrlText,
  downloadDataUrl,
  getFilePreviewKind,
} from '../utils/fileHelpers';

export interface PreviewFileTarget {
  fileName: string;
  mimeType?: string;
  dataUrl: string;
  subtitle?: string;
}

interface FilePreviewModalProps {
  file: PreviewFileTarget | null;
  onClose: () => void;
  onDownload?: () => Promise<void> | void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  onClose,
  onDownload,
}) => {
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const kind = file ? getFilePreviewKind(file.mimeType, file.fileName, file.dataUrl) : null;

  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [file, onClose]);

  useEffect(() => {
    setPdfObjectUrl(null);
    setTextContent(null);
    setPreviewError(null);
    if (!file) return;

    let active = true;
    let createdUrl: string | null = null;

    if (kind === 'pdf') {
      dataUrlToBlob(file.dataUrl)
        .then((blob) => {
          const pdfBlob =
            blob.type === 'application/pdf'
              ? blob
              : new Blob([blob], { type: 'application/pdf' });
          createdUrl = URL.createObjectURL(pdfBlob);
          if (active) {
            setPdfObjectUrl(createdUrl);
          } else {
            URL.revokeObjectURL(createdUrl);
          }
        })
        .catch(() => {
          if (active) {
            setPreviewError('Browser could not open inline PDF preview. Please download to view.');
          }
        });
    } else if (kind === 'text') {
      if (file.dataUrl.startsWith('data:')) {
        try {
          const decoded = decodeDataUrlText(file.dataUrl);
          setTextContent(decoded);
        } catch {
          setPreviewError('Could not decode text file for preview. Please download to view.');
        }
      } else {
        fetch(file.dataUrl)
          .then((res) => {
            if (!res.ok) throw new Error('Failed to load file');
            return res.text();
          })
          .then((txt) => {
            if (active) setTextContent(txt);
          })
          .catch(() => {
            if (active) {
              setPreviewError('Could not load text file for preview. Please download to view.');
            }
          });
      }
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file, kind]);

  if (!file) return null;

  const handleDownloadClick = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (onDownload) {
        await onDownload();
      } else {
        await downloadDataUrl(file.dataUrl, file.fileName);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.fileName}`}
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-3 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {file.fileName}
              </h3>
              {file.subtitle && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {file.subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownloadClick}
              className="min-h-[38px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Saving...' : 'Download'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-w-[38px] min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[280px] overflow-auto bg-slate-100 dark:bg-slate-950 p-3 sm:p-5 flex items-center justify-center">
          {previewError ? (
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-xs text-slate-600 dark:text-slate-300">{previewError}</p>
            </div>
          ) : kind === 'image' ? (
            <img
              src={file.dataUrl}
              alt={file.fileName}
              className="max-h-[72dvh] w-auto rounded-2xl object-contain shadow-lg"
            />
          ) : kind === 'pdf' ? (
            pdfObjectUrl ? (
              <iframe
                src={pdfObjectUrl}
                title={file.fileName}
                className="w-full h-[70dvh] rounded-xl bg-white border border-slate-200 dark:border-slate-800"
              />
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Loading PDF preview...</p>
            )
          ) : kind === 'text' ? (
            <pre className="w-full h-full max-h-[70dvh] overflow-auto p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words leading-relaxed self-start">
              {textContent ?? 'Loading text preview...'}
            </pre>
          ) : (
            <div className="text-center space-y-2 max-w-sm">
              <FileText className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Inline preview unavailable for this file type
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tap Download above to open it on your device.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
