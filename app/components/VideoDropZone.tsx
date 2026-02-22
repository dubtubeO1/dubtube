'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, FileVideo } from 'lucide-react'

const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
])

interface VideoDropZoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export default function VideoDropZone({ onFile, disabled = false }: VideoDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setTypeError(null)
      if (!ALLOWED_TYPES.has(file.type)) {
        setTypeError('Unsupported format. Please use MP4, MOV, AVI, MKV, or WebM.')
        return
      }
      onFile(file)
    },
    [onFile],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !disabled && fileInputRef.current?.click()}
      className={`
        relative w-full rounded-2xl border-2 border-dashed p-12 text-center
        transition-all duration-300
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${
          isDragging
            ? 'border-slate-500 bg-slate-50/80 scale-[1.01]'
            : 'border-slate-300 bg-white/50 hover:border-slate-400 hover:bg-white/70'
        }
        backdrop-blur-sm
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />

      <div className="flex flex-col items-center gap-4">
        <div
          className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-slate-200' : 'bg-slate-100'}`}
        >
          {isDragging ? (
            <FileVideo className="w-8 h-8 text-slate-600" />
          ) : (
            <Upload className="w-8 h-8 text-slate-500" />
          )}
        </div>

        <div>
          <p className="text-lg font-medium text-slate-700">
            {isDragging ? 'Drop to upload' : 'Drop your video here or click to browse'}
          </p>
          <p className="text-sm text-slate-500 mt-1">MP4 · MOV · AVI · MKV · WebM</p>
        </div>
      </div>

      {typeError && (
        <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-red-500 px-4">
          {typeError}
        </p>
      )}
    </div>
  )
}
