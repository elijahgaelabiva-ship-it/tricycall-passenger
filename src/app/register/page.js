'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'
import AuthShell, { inputClass, labelClass } from '@/components/AuthShell'
import LiveCamera from '@/components/LiveCamera'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Live selfie capture (camera only, no gallery picker), so a pre-existing
  // or edited photo can't be used.
  const [showCamera, setShowCamera] = useState(false)
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState(null)

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl)
    }
  }, [selfiePreviewUrl])

  const handleSelfie = (blob) => {
    setSelfieBlob(blob)
    setSelfiePreviewUrl(URL.createObjectURL(blob))
    setShowCamera(false)
    setError('')
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    if (!selfieBlob) {
      setError('Please take a live selfie with your camera to continue.')
      return
    }

    const normalizedPhone = normalizePhone(phone)

    if (!isValidPhone(normalizedPhone)) {
      setError('Please enter a valid PH mobile number (e.g. 09171234567).')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: phoneToAuthEmail(normalizedPhone),
      password,
    })

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError('This phone number is already registered. Try logging in instead.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    const userId = data.user.id

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      phone: normalizedPhone,
      role: 'passenger',
    })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    // Upload the live selfie to the same avatars bucket the driver app uses
    const filePath = `${userId}/avatar.jpg`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, selfieBlob, { upsert: true, contentType: 'image/jpeg' })

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const freshUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`

      await supabase.from('profiles').update({ avatar_url: freshUrl }).eq('id', userId)
    }
    // If the selfie upload fails, we still let registration succeed rather
    // than blocking the account — the photo can be retaken from the profile
    // page later. The account/profile itself was already created above.

    router.push('/login')
  }

  return (
    <AuthShell title="Create your account" subtitle="Book tricycle rides around San Felipe.">
      {showCamera && (
        <LiveCamera onCapture={handleSelfie} onCancel={() => setShowCamera(false)} />
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        <div className="flex flex-col items-center gap-2">
          {selfiePreviewUrl ? (
            <img
              src={selfiePreviewUrl}
              alt="Your selfie"
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-mist text-mute">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="h-10 rounded-xl px-4 text-sm font-bold text-ink underline underline-offset-2 active:bg-mist"
          >
            {selfieBlob ? 'Retake selfie' : 'Take a live selfie (required)'}
          </button>
          <p className="text-center text-xs text-mute">
            Your photo is taken with the camera. Gallery uploads aren't allowed.
          </p>
        </div>

        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09171234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !selfieBlob}
          className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-40"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <p className="text-center text-sm text-mute">
          Already have an account?{' '}
          <a href="/login" className="font-bold text-ink underline underline-offset-2">
            Log in
          </a>
        </p>
      </form>
    </AuthShell>
  )
}
