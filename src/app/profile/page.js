'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/PageHeader'
import LiveCamera from '@/components/LiveCamera'
import { inputClass, labelClass } from '@/components/AuthShell'

export default function PassengerProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Live camera photo retake (camera only, no gallery picker), same policy
  // as registration, so a passenger can't swap in an unrelated photo.
  const [showCamera, setShowCamera] = useState(false)
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl)
    }
  }, [selfiePreviewUrl])

  const handleSelfie = (blob) => {
    setSelfieBlob(blob)
    setSelfiePreviewUrl(URL.createObjectURL(blob))
    setShowCamera(false)
    setSaveSuccess(false)
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
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-72 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 space-y-3 motion-safe:animate-pulse">
            <div className="h-20 rounded-2xl bg-white" />
            <div className="h-28 rounded-2xl bg-white" />
          </div>
        </div>
      </div>
    )
  }

  const shownPhoto = selfiePreviewUrl || profile?.avatar_url

  return (
    <div className="min-h-screen bg-mist">
      {showCamera && (
        <LiveCamera onCapture={handleSelfie} onCancel={() => setShowCamera(false)} />
      )}

      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Edit profile" backLabel="Back">
          <div className="mt-4 flex flex-col items-center text-center">
            {shownPhoto ? (
              <img
                src={shownPhoto}
                alt="Your photo"
                className="h-28 w-28 rounded-full object-cover ring-2 ring-white/30 ring-offset-2 ring-offset-ink"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-bold">
                {profile?.full_name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-semibold active:bg-white/20"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              {selfieBlob ? 'Retake photo' : 'Take new photo'}
            </button>

            {selfieBlob && (
              <p className="mt-2 text-xs text-white/70">Tap Save changes to keep this photo.</p>
            )}
          </div>
        </PageHeader>

        <main className="mx-4 mt-4 space-y-4 rounded-2xl border border-line bg-white p-5">
          <div>
            <label htmlFor="name" className={labelClass}>
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setSaveSuccess(false)
              }}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone number
            </label>
            <input
              id="phone"
              type="text"
              value={profile?.phone || ''}
              disabled
              className="mt-1.5 h-12 w-full rounded-xl border border-line bg-mist px-4 text-base text-mute"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-mute">
              Your phone number is tied to your login, so it can't be changed here. Contact
              support if it needs updating.
            </p>
          </div>

          {saveError && (
            <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{saveError}</p>
          )}
          {saveSuccess && (
            <p className="rounded-xl bg-[#e3f4ea] px-3 py-2.5 text-sm font-semibold text-[#1f7a48]">
              Profile updated.
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-50"
          >
            {uploadingPhoto ? 'Uploading photo...' : saving ? 'Saving...' : 'Save changes'}
          </button>
        </main>
      </div>
    </div>
  )
}
