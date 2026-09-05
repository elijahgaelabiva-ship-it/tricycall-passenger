'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PassengerProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Live camera photo retake — camera only, no gallery picker, same policy
  // as registration, so a passenger can't swap in an unrelated photo.
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()

      if (data) {
        setProfile(data)
        setFullName(data.full_name || '')
      }
      setLoading(false)
    }

    loadProfile()
  }, [router])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  const openCamera = async () => {
    setCameraError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Your browser does not support camera access.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })

      streamRef.current = stream
      setCameraOpen(true)

      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch {
      setCameraError('Could not access camera. Please allow camera permission and try again.')
    }
  }

  const captureSelfie = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setSelfieBlob(blob)
          setSelfiePreviewUrl(URL.createObjectURL(blob))
        }
      },
      'image/jpeg',
      0.9
    )

    stopCamera()
  }

  const retakeSelfie = () => {
    setSelfieBlob(null)
    if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl)
    setSelfiePreviewUrl(null)
    openCamera()
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const updates = { full_name: fullName }

    // If a new photo was captured, upload it first and include the URL.
    if (selfieBlob) {
      setUploadingPhoto(true)
      const filePath = `${user.id}/avatar.jpg`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selfieBlob, { upsert: true, contentType: 'image/jpeg' })

      setUploadingPhoto(false)

      if (uploadError) {
        setSaveError(uploadError.message)
        setSaving(false)
        return
      }

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
      updates.avatar_url = `${publicUrlData.publicUrl}?t=${Date.now()}`
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)

    if (error) {
      setSaveError(error.message)
      setSaving(false)
      return
    }

    setProfile((prev) => ({ ...prev, ...updates }))
    setSelfieBlob(null)
    setSelfiePreviewUrl(null)
    setSaveSuccess(true)
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8 flex flex-col items-center">
      <button
        onClick={() => router.push('/book')}
        className="self-start text-sm text-gray-500 underline mb-4"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-green-600 mb-6">Edit Profile</h1>

      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center">
          {!cameraOpen && !selfiePreviewUrl && (
            <>
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-28 h-28 rounded-full object-cover"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-3xl">
                  {profile?.full_name?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <button
                onClick={openCamera}
                className="mt-3 text-sm text-green-600 font-semibold underline"
              >
                Retake Photo
              </button>
            </>
          )}

          {cameraError && (
            <p className="text-red-600 text-xs text-center bg-red-50 p-2 rounded mt-2">
              {cameraError}
            </p>
          )}

          {cameraOpen && (
            <div className="w-full space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl bg-black aspect-square object-cover"
              />
              <button
                onClick={captureSelfie}
                className="w-full bg-green-600 text-white rounded-xl py-2 font-semibold hover:bg-green-700 transition"
              >
                Capture Photo
              </button>
            </div>
          )}

          {!cameraOpen && selfiePreviewUrl && (
            <div className="w-full space-y-2">
              <img
                src={selfiePreviewUrl}
                alt="New photo preview"
                className="w-28 h-28 rounded-full object-cover mx-auto"
              />
              <button
                onClick={retakeSelfie}
                className="w-full bg-gray-200 text-gray-700 rounded-xl py-2 font-semibold hover:bg-gray-300 transition"
              >
                Retake
              </button>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 mt-1 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Phone Number</label>
          <input
            type="text"
            value={profile?.phone || ''}
            disabled
            className="w-full border border-gray-200 bg-gray-50 text-gray-500 rounded-xl px-4 py-3 mt-1"
          />
          <p className="text-xs text-gray-400 mt-1">
            Phone number can't be changed here since it's tied to your login. Contact support if it needs updating.
          </p>
        </div>

        {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
        {saveSuccess && <p className="text-green-600 text-sm">Profile updated.</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {uploadingPhoto ? 'Uploading photo...' : saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
