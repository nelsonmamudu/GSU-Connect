import React, { useEffect, useRef, useState } from 'react';
import { IdCard, Upload, X } from 'lucide-react';
import { formatFileSize } from '../types';
import { Button } from './ui/Button';

interface ProofDropzoneProps {
  /** Currently selected file. The parent owns validation and upload. */
  file: File | null;
  onFile: (file: File | null) => void;
  /** Accepted MIME types, e.g. ['image/*', 'application/pdf']. */
  accept: string[];
  error?: string;
  disabled?: boolean;
  title: string;
  /** Shows "(Required)" when true, "(Optional now — you can upload later)" when false. */
  required?: boolean;
  /** Extra helper line under the picker (e.g. OCR status). */
  note?: string;
  chooseLabel?: string;
  onCancel?: () => void;
}

/**
 * Shared proof picker: click, drag & drop, or paste. Shows a thumbnail for
 * images and a chip for PDFs. Used by the signup step and the pending screen.
 */
export function ProofDropzone({
  file,
  onFile,
  accept,
  error,
  disabled,
  title,
  required,
  note,
  chooseLabel = 'Choose File',
  onCancel,
}: ProofDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
    return;
  }, [file]);

  const pick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (selected) onFile(selected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const selected = e.dataTransfer.files?.[0];
    if (selected) onFile(selected);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return;
    const selected = e.clipboardData?.files?.[0];
    if (selected) {
      e.preventDefault();
      onFile(selected);
    }
  };

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFile(null);
  };

  const acceptHint = accept.includes('application/pdf')
    ? 'JPEG, PNG, WebP or PDF, up to 3 MB'
    : 'JPEG, PNG or WebP, up to 3 MB';

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className={`rounded-2xl border bg-sunken/70 dark:bg-sunken/60 p-3.5 space-y-3 text-left transition-colors ${
        dragOver
          ? 'border-brand ring-2 ring-emerald-600/20'
          : 'border-line/80 dark:border-line'
      }`}
    >
      <div className="flex items-start gap-2">
        <IdCard className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <span className="text-xs font-semibold text-ink leading-snug">
          {title}{' '}
          {required !== undefined && (
            <span className="font-normal text-ink-muted">
              {required ? '(Required)' : '(Optional now — you can upload later)'}
            </span>
          )}
        </span>
      </div>

      <input
        ref={(node) => {
          inputRef.current = node;
          if (node) {
            // The `cancel` event isn't exposed by React's typing; attach it natively.
            (node as HTMLInputElement & { oncancel?: (() => void) | null }).oncancel = onCancel ?? null;
          }
        }}
        type="file"
        accept={accept.join(',')}
        onChange={handleInput}
        className="hidden"
      />

      {file ? (
        <div className="flex items-start gap-3">
          {file.type.startsWith('image/') && previewUrl ? (
            <img
              src={previewUrl}
              alt="Preview of selected proof"
              className="h-24 w-24 rounded-xl border border-line object-cover shrink-0"
            />
          ) : (
            <div className="h-24 w-24 rounded-xl border border-line bg-surface flex flex-col items-center justify-center gap-1 shrink-0">
              <IdCard className="w-6 h-6 text-ink-muted" />
              <span className="text-[10px] font-semibold text-ink-muted">PDF</span>
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[11px] font-semibold text-ink break-all leading-snug">
              {file.name} ({formatFileSize(file.size)})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 px-2"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-line bg-white/60 dark:bg-surface/40 px-3 py-4 text-center">
          <Upload className="w-5 h-5 text-ink-muted" />
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Drag &amp; drop a file here, paste it, or
          </p>
          <Button
            type="button"
            id="proof-upload"
            variant="outline"
            size="sm"
            onClick={pick}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'proof-error' : undefined}
            className="hover:border-brand"
          >
            {chooseLabel}
          </Button>
          <p className="text-[10px] text-ink-muted leading-relaxed">
            {acceptHint}. Redact unrelated personal information.
          </p>
        </div>
      )}

      {note && (
        <p className="text-[11px] text-ink-muted leading-relaxed">{note}</p>
      )}
      {error && (
        <p id="proof-error" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
