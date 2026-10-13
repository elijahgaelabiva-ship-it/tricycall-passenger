'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

// Calculates distance in km between two lat/lng points
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const ACTIVE_STATUSES = ['requested', 'accepted', 'arrived', 'ongoing']
const STRIKE_LIMIT = 3

export default function BookPage() {
  const [currentLocation, setCurrentLocation] = useState(null)
  const [destination, setDestination] = useState(null)
  const [destinationAddress, setDestinationAddress] = useState('')
  const [locationError, setLocationError] = useState('')
  const [fareSettings, setFareSettings] = useState(null)
  const [distanceKm, setDistanceKm] = useState(null)
  const [estimatedFare, setEstimatedFare] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [blockedMessage, setBlockedMessage] = useState('')
  const [availableDrivers, setAvailableDrivers] = useState([])
  const [passengerProfile, setPassengerProfile] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()

  // Before letting the passenger book, make sure they don't already have
  // an active trip, and that their account isn't restricted for repeated no-shows.
  useEffect(() => {
    const checkPassengerStatus = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: existingTrip } = await supabase
        .from('trips')
        .select('id, status')
        .eq('passenger_id', user.id)
        .in('status', ACTIVE_STATUSES)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingTrip) {
        router.push(`/trip/${existingTrip.id}`)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) setPassengerProfile(profile)

      if (profile && profile.strike_count >= STRIKE_LIMIT) {
        setBlockedMessage(
          'Your account has been temporarily restricted due to repeated no-shows/cancellations. Please contact support.'
        )
      }

      setCheckingStatus(false)
    }

    checkPassengerStatus()
  }, [router])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Your browser does not support location detection.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        setLocationError('Could not detect your location. Please allow location access.')
      }
    )
  }, [])

  // Show all currently online, available tricycles on the map while the
  // passenger is choosing where to go. Refreshes every 5 seconds so drivers
  // moving around update live, same pattern as the driver app's ride requests.
  useEffect(() => {
    const loadAvailableDrivers = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id, current_lat, current_lng')
        .eq('is_online', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null)

      setAvailableDrivers(data || [])
    }

    loadAvailableDrivers()
    const interval = setInterval(loadAvailableDrivers, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const loadFareSettings = async () => {
      const { data } = await supabase
        .from('fare_settings')
        .select('*')
        .limit(1)
        .single()
      if (data) setFareSettings(data)
    }
    loadFareSettings()
  }, [])

  useEffect(() => {
    if (currentLocation && destination && fareSettings) {
      const km = getDistanceKm(
        currentLocation.lat,
        currentLocation.lng,
        destination.lat,
        destination.lng
      )
      const fare =
        Number(fareSettings.base_fare) + km * Number(fareSettings.per_km_rate)

      setDistanceKm(km)
      setEstimatedFare(fare)
    }
  }, [currentLocation, destination, fareSettings])

  const handleMapClick = (latlng) => {
    setDestination(latlng)
    setDestinationAddress('')
  }

  // Called when the passenger picks an address from the "Where to?" search box.
  const handleDestinationSelect = (location, address) => {
    setDestination(location)
    setDestinationAddress(address)
  }

  const handleRequestRide = async () => {
    if (distanceKm === null || estimatedFare === null) {
      setRequestError('Please wait, calculating fare...')
      return
    }

    setRequesting(true)
    setRequestError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setRequestError('You must be logged in to request a ride.')
      setRequesting(false)
      return
    }

    // Re-check right before booking too, in case another tab already created a trip
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id')
      .eq('passenger_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .limit(1)
      .maybeSingle()

    if (existingTrip) {
      router.push(`/trip/${existingTrip.id}`)
      return
    }

    const { data, error } = await supabase
      .from('trips')
      .insert({
        passenger_id: user.id,
        pickup_lat: currentLocation.lat,
        pickup_lng: currentLocation.lng,
        dropoff_lat: destination.lat,
        dropoff_lng: destination.lng,
        distance_km: distanceKm,
        fare: estimatedFare,
        status: 'requested',
      })
      .select()
      .single()

    if (error) {
      setRequestError(error.message)
      setRequesting(false)
      return
    }

    router.push(`/trip/${data.id}`)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const onlineCount = availableDrivers.length

  const menuItems = [
    { label: 'Edit profile', href: '/profile', icon: <PersonIcon /> },
    { label: 'Trip history', href: '/history', icon: <ClockIcon /> },
    { label: 'Payment method', href: '/payment-method', icon: <CardIcon /> },
  ]

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist">
        <p className="text-mute font-medium">Loading...</p>
      </div>
    )
  }

  if (blockedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-6">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center">
          <h1 className="text-xl font-extrabold text-ink">Account restricted</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">{blockedMessage}</p>
          <button
            onClick={handleLogout}
            className="mt-5 h-11 w-full rounded-xl border border-line font-semibold text-ink"
          >
            Log out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-mist">
      {/* Map with floating menu button and search */}
      <div className="relative min-h-0 flex-1 [&_.leaflet-bottom]:mb-6">
        <button
          onClick={() => setMenuOpen(true)}
          className="absolute left-3 top-[max(12px,env(safe-area-inset-top))] flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-[0_2px_12px_rgba(23,33,43,0.22)] active:bg-mist"
          style={{ zIndex: 1001 }}
          aria-label="Open menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        {currentLocation ? (
          <MapView
            currentLocation={currentLocation}
            destination={destination}
            onMapClick={handleMapClick}
            onDestinationSelect={handleDestinationSelect}
            availableDrivers={availableDrivers}
            searchInset={72}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="font-medium text-mute">Detecting your location...</p>
          </div>
        )}
      </div>

      {/* Booking sheet */}
      <div
        className="relative -mt-6 rounded-t-[28px] bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(23,33,43,0.12)]"
        style={{ zIndex: 1100 }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-mute">
          <span
            className={`h-2.5 w-2.5 rounded-full ${onlineCount > 0 ? 'bg-live' : 'bg-line'}`}
          />
          {onlineCount > 0
            ? `${onlineCount} ${onlineCount === 1 ? 'tricycle' : 'tricycles'} online`
            : 'No tricycles online right now'}
        </div>

        {locationError && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {locationError}
          </p>
        )}

        {!destination ? (
          <div className="mt-3">
            <p className="text-xl font-extrabold text-ink">Where are you going?</p>
            <p className="mt-0.5 text-sm text-mute">
              Search above or tap the map to set your destination.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <p className="flex items-start gap-2 text-sm font-semibold text-ink">
              <PinIcon />
              <span className="line-clamp-2 min-w-0">
                {destinationAddress || 'Pinned location'}
              </span>
            </p>

            {distanceKm !== null && estimatedFare !== null ? (
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-mute">Estimated fare</p>
                  <p className="text-3xl font-extrabold tabular-nums text-ink">
                    ₱{estimatedFare.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-mute">Distance</p>
                  <p className="text-lg font-bold tabular-nums text-ink">
                    {distanceKm.toFixed(2)} km
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-mute">Calculating fare...</p>
            )}
          </div>
        )}

        {requestError && <p className="mt-3 text-sm text-red-600">{requestError}</p>}

        <button
          onClick={handleRequestRide}
          disabled={!destination || requesting || estimatedFare === null}
          className="mt-4 h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {requesting ? 'Requesting...' : 'Request ride'}
        </button>
      </div>

      {/* Side menu */}
      {menuOpen && (
        <div className="fixed inset-0 flex" style={{ zIndex: 9999 }}>
          <div
            className="absolute inset-0 bg-ink/50"
            onClick={() => setMenuOpen(false)}
          />

          <aside className="menu-slide-in relative flex h-full w-80 max-w-[86%] flex-col bg-white shadow-xl">
            <div className="rounded-br-[28px] bg-ink px-6 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
              <div className="flex justify-end">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-white/80 active:bg-white/10"
                  aria-label="Close menu"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-4">
                {passengerProfile?.avatar_url ? (
                  <img
                    src={passengerProfile.avatar_url}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-white/30 ring-offset-2 ring-offset-ink"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-bold">
                    {passengerProfile?.full_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold">{passengerProfile?.full_name}</p>
                  <p className="text-sm text-white/70">{passengerProfile?.phone}</p>
                </div>
              </div>
            </div>

            <nav className="mt-3 flex-1 px-3">
              {menuItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className="flex h-14 w-full items-center gap-4 rounded-xl px-3 text-left text-ink active:bg-mist"
                >
                  <span className="text-mute">{item.icon}</span>
                  <span className="flex-1 font-semibold">{item.label}</span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-line"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ))}
            </nav>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <button
                onClick={handleLogout}
                className="h-12 w-full rounded-xl border border-line font-semibold text-ink active:bg-mist"
              >
                Log out
              </button>
              <p className="mt-3 text-center text-xs text-mute">TRICYCALL.SF Passenger</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function IconBase({ children }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function PersonIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </IconBase>
  )
}

function ClockIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconBase>
  )
}

function CardIcon() {
  return (
    <IconBase>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </IconBase>
  )
}

function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-signal"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}
