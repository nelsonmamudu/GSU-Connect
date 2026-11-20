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
        className="w-full max-w-4xl max-h-[90dvh] bg-surface border border-line rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-4 sm:px-5 py-3.5 border-b border-line/80 dark:border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-subtle dark:bg-brand-subtle/70 text-brand flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-ink truncate">
                {file.fileName}
              </h3>
              {file.subtitle && (
                <p className="text-[11px] text-ink-muted truncate">
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
              className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Saving...' : 'Download'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-w-[38px] min-h-[38px] rounded-xl border border-line text-ink-muted hover:bg-sunken flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[280px] overflow-auto bg-sunken dark:bg-canvas p-3 sm:p-5 flex items-center justify-center">
          {previewError ? (
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-xs text-ink-body dark:text-ink-soft">{previewError}</p>
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
                className="w-full h-[70dvh] rounded-xl bg-surface border border-line"
              />
            ) : (
              <p className="text-xs text-ink-muted">Loading PDF preview...</p>
            )
          ) : kind === 'text' ? (
            <pre className="w-full h-full max-h-[70dvh] overflow-auto p-4 rounded-2xl bg-surface border border-line text-xs font-mono text-ink dark:text-ink-soft whitespace-pre-wrap break-words leading-relaxed self-start">
              {textContent ?? 'Loading text preview...'}
            </pre>
          ) : (
            <div className="text-center space-y-2 max-w-sm">
              <FileText className="w-10 h-10 text-ink-muted mx-auto" />
              <p className="text-sm font-semibold text-ink">
                Inline preview unavailable for this file type
              </p>
              <p className="text-xs text-ink-muted">
                Tap Download above to open it on your device.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
