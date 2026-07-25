'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Live selfie capture (camera only — no file/gallery picker, so we
  // can't accept a pre-existing/edited photo here).
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [selfieBlob, setSelfieBlob] = useState(null)
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  useEffect(() => {
    // Make sure the camera is always released if the passenger navigates away
    return () => stopCamera()
  }, [])

  const openCamera = async () => {
    setCameraError('')
    setError('')

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

      // videoRef isn't mounted yet on this same tick since cameraOpen just
      // flipped, so attach the stream on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
    } catch (err) {
      setCameraError(
        'Could not access camera. Please allow camera permission and try again.'
      )
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

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    if (!selfieBlob) {
      setError('Please take a live selfie using your camera to continue.')
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <form
        onSubmit={handleRegister}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center text-green-600">
          Create Account
        </h1>
        <p className="text-center text-gray-500 text-sm">TRICYCALL.SF</p>

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="tel"
          placeholder="Phone Number (e.g. 09171234567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Live Selfie (required)</p>

          {cameraError && (
            <p className="text-red-600 text-xs text-center bg-red-50 p-2 rounded">
              {cameraError}
            </p>
          )}

          {/* Live camera preview */}
          {cameraOpen && (
            <div className="space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl bg-black aspect-square object-cover"
              />
              <button
                type="button"
                onClick={captureSelfie}
                className="w-full bg-green-600 text-white rounded-xl py-2 font-semibold hover:bg-green-700 transition"
              >
                Capture Selfie
              </button>
            </div>
          )}

          {/* Captured preview */}
          {!cameraOpen && selfiePreviewUrl && (
            <div className="space-y-2">
              <img
                src={selfiePreviewUrl}
                alt="Your selfie"
                className="w-full rounded-xl aspect-square object-cover"
              />
              <button
                type="button"
                onClick={retakeSelfie}
                className="w-full bg-gray-200 text-gray-700 rounded-xl py-2 font-semibold hover:bg-gray-300 transition"
              >
                Retake Selfie
              </button>
            </div>
          )}

          {/* Nothing captured yet */}
          {!cameraOpen && !selfiePreviewUrl && (
            <button
              type="button"
              onClick={openCamera}
              className="w-full bg-gray-100 text-gray-700 border border-gray-300 rounded-xl py-3 font-semibold hover:bg-gray-200 transition"
            >
              Open Camera to Take Selfie
            </button>
          )}

          {/* Hidden canvas used only to grab a frame from the video stream */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <button
          type="submit"
          disabled={loading || !selfieBlob}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="text-green-600 font-medium">
            Login
          </a>
        </p>
      </form>
    </div>
  )
}