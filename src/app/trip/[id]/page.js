'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function TripPage() {
  const { id } = useParams()
  const router = useRouter()

  const [trip, setTrip] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null)
  const [availableDrivers, setAvailableDrivers] = useState([])
  const [showNoDriversHint, setShowNoDriversHint] = useState(false)
  const [driverContact, setDriverContact] = useState(null)
  const [driverContactError, setDriverContactError] = useState('')

  useEffect(() => {
    if (!trip || trip.status !== 'requested') {
      setShowNoDriversHint(false)
      return
    }

    const requestedTime = new Date(trip.requested_at).getTime()
    const now = Date.now()
    const elapsed = now - requestedTime
    const remaining = 20000 - elapsed

    if (remaining <= 0) {
      setShowNoDriversHint(true)
      return
    }

    const timer = setTimeout(() => setShowNoDriversHint(true), remaining)
    return () => clearTimeout(timer)
  }, [trip?.status, trip?.requested_at])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [existingRating, setExistingRating] = useState(null)
  const [driverLocationUpdatedAt, setDriverLocationUpdatedAt] = useState(null)
  const [isDriverLocationStale, setIsDriverLocationStale] = useState(false)
  const tripStatusRef = useRef(null)

  // Recheck staleness on a timer (independent of new locations arriving) so
  // the "Last known location" hint appears even if updates fully stop.
  useEffect(() => {
    const STALE_AFTER_MS = 20000
    const check = () => {
      setIsDriverLocationStale(
        Boolean(driverLocationUpdatedAt) && Date.now() - driverLocationUpdatedAt > STALE_AFTER_MS
      )
    }
    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [driverLocationUpdatedAt])

useEffect(() => {
    const loadTrip = async () => {
      const { data } = await supabase.from('trips').select('*').eq('id', id).single()
      setTrip(data)

      const { data: ratingData } = await supabase
        .from('ratings')
        .select('*')
        .eq('trip_id', id)
        .maybeSingle()

      if (ratingData) setExistingRating(ratingData)
    }
    loadTrip()

    const tripChannel = supabase
      .channel(`trip-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${id}` },
        (payload) => setTrip(payload.new)
      )
      .subscribe()

    // Backup polling every 4 seconds in case realtime is delayed/missed
    const pollInterval = setInterval(loadTrip, 4000)

    return () => {
      supabase.removeChannel(tripChannel)
      clearInterval(pollInterval)
    }
  }, [id])

  useEffect(() => {
    tripStatusRef.current = trip?.status
  }, [trip?.status])

  useEffect(() => {
    if (!trip?.driver_id) return

    const loadDriverContact = async () => {
      const { data, error } = await supabase.rpc('get_trip_driver_contact', {
        target_trip_id: id,
      })

      if (error) {
        setDriverContactError(error.message)
        return
      }

      if (data && data.length > 0) {
        setDriverContact(data[0])
      }
    }

    loadDriverContact()
  }, [trip?.driver_id, id])

  // Continuous live driver tracking for the whole trip — this is the core
  // "Yango-style" requirement: the passenger must keep receiving location
  // updates without interruption for the entire active trip.
  //
  // Deliberately keyed only on trip?.driver_id (NOT trip?.status) so the
  // realtime channel is created exactly once per assigned driver and never
  // torn down/recreated as status moves accepted -> arrived -> ongoing.
  // Previously this effect also depended on status, which meant the
  // subscription was destroyed and rebuilt at every one of those
  // transitions — the most likely cause of the marker appearing frozen
  // between status changes.
  useEffect(() => {
    if (!trip?.driver_id) return
    if (['completed', 'cancelled'].includes(tripStatusRef.current)) return

    const loadDriverLocation = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('current_lat, current_lng')
        .eq('id', trip.driver_id)
        .single()

      if (data?.current_lat && data?.current_lng) {
        setDriverLocation({ lat: data.current_lat, lng: data.current_lng })
        setDriverLocationUpdatedAt(Date.now())
      }
    }

    loadDriverLocation()

    const driverChannel = supabase
      .channel(`driver-${trip.driver_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
          filter: `id=eq.${trip.driver_id}`,
        },
        (payload) => {
          if (payload.new.current_lat && payload.new.current_lng) {
            setDriverLocation({
              lat: payload.new.current_lat,
              lng: payload.new.current_lng,
            })
            setDriverLocationUpdatedAt(Date.now())
          }
        }
      )
      .subscribe()

    // Backup poll in case a realtime event is ever dropped (weak signal,
    // brief disconnect, etc.) — mirrors the trip-status effect's existing
    // pattern. Skips the query once the trip has actually ended.
    const pollInterval = setInterval(() => {
      if (!['completed', 'cancelled'].includes(tripStatusRef.current)) {
        loadDriverLocation()
      }
    }, 7000)

    // Android/mobile browsers commonly suspend background tabs; force a
    // fresh fetch the moment the passenger returns to the tab instead of
    // waiting for the next scheduled poll or realtime event.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadDriverLocation()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      supabase.removeChannel(driverChannel)
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [trip?.driver_id])

  // While no driver has accepted yet, show every online tricycle on the
  // map so the passenger can see activity nearby instead of a blank/text
  // "looking for driver" screen. Stops once a driver is assigned.
  useEffect(() => {
    if (trip?.status !== 'requested') {
      setAvailableDrivers([])
      return
    }

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
  }, [trip?.status])

  const statusMessages = {
    requested: { title: 'Looking for a driver', sub: "Hang tight, we're contacting tricycles near you." },
    accepted: { title: 'Driver on the way', sub: 'Your driver is heading to your pickup point.' },
    arrived: { title: 'Your driver has arrived', sub: 'Meet your driver at the pickup point.' },
    ongoing: { title: 'Trip in progress', sub: "You're on your way." },
    completed: { title: 'Trip completed', sub: 'Thanks for riding with TRICYCALL.SF.' },
    cancelled: { title: 'Trip cancelled', sub: 'This ride was cancelled.' },
  }

  const submitRating = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('ratings').insert({
      trip_id: id,
      passenger_id: user.id,
      driver_id: trip.driver_id,
      rating,
      comment,
    })

    if (!error) {
      setSubmitted(true)
    }
  }

  const ACTIVE_STATUSES = ['requested', 'accepted', 'arrived', 'ongoing']

  const cancelTrip = async () => {
    if (['accepted', 'arrived', 'ongoing'].includes(trip.status)) {
      const confirmed = window.confirm(
        'A driver has already accepted this trip. Are you sure you want to cancel? (e.g. if the driver seems unreachable)'
      )
      if (!confirmed) return
    }

    const { error } = await supabase
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .in('status', ACTIVE_STATUSES)

    if (error) {
      alert('Could not cancel: ' + error.message)
      return
    }

    router.push('/book')
  }

  const showMap =
    trip &&
    !['completed', 'cancelled'].includes(trip.status)

const isActive = trip && ['requested', 'accepted', 'arrived', 'ongoing'].includes(trip.status)
  const hasDriver = trip && ['accepted', 'arrived', 'ongoing'].includes(trip.status)
  const message = trip ? statusMessages[trip.status] : null

  if (!trip) {
    return (
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-48 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 h-64 rounded-2xl bg-white motion-safe:animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-mist">
      {/* Status header */}
      <header className="shrink-0 rounded-b-[28px] bg-ink px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-white/80">TRICYCALL.SF</span>
          {hasDriver && driverLocation && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                isDriverLocationStale ? 'text-[#ffb703]' : 'text-white/80'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isDriverLocationStale ? 'bg-[#ffb703]' : 'bg-live'
                }`}
              />
              {isDriverLocationStale ? 'Last known location' : 'Live'}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {trip.status === 'requested' && (
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-signal" />
            </span>
          )}
          <h1 className="text-2xl font-extrabold leading-tight">{message.title}</h1>
        </div>
        <p className="mt-1 text-sm text-white/70">{message.sub}</p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-white/60">Fare</p>
            <p className="text-3xl font-extrabold tabular-nums">
              ₱{Number(trip.fare).toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">Distance</p>
            <p className="text-lg font-bold tabular-nums">
              {Number(trip.distance_km).toFixed(2)} km
            </p>
          </div>
        </div>

        {trip.status === 'requested' && showNoDriversHint && (
          <p className="mt-3 rounded-lg bg-[#ffb703]/15 px-3 py-2 text-xs leading-snug text-[#ffd77a]">
            No drivers have accepted yet. You can keep waiting, or cancel and try again later.
          </p>
        )}
      </header>

      {showMap ? (
        <div className="relative min-h-0 flex-1 [&_.leaflet-bottom]:mb-6">
          <div className="absolute inset-0">
            <MapView
              currentLocation={{
                lat: trip.pickup_lat,
                lng: trip.pickup_lng,
              }}
              destination={{
                lat: trip.dropoff_lat,
                lng: trip.dropoff_lng,
              }}
              driverLocation={driverLocation}
              driverLocationUpdatedAt={driverLocationUpdatedAt}
              availableDrivers={availableDrivers}
              showCurrentMarker={trip.status !== 'ongoing'}
              routeTarget={
                trip.status === 'ongoing'
                  ? { lat: trip.dropoff_lat, lng: trip.dropoff_lng }
                  : { lat: trip.pickup_lat, lng: trip.pickup_lng }
              }
            />
          </div>
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-5">
          {trip.status === 'completed' && !existingRating && !submitted && (
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-lg font-extrabold text-ink">Rate your driver</p>
              <p className="mt-0.5 text-sm text-mute">How was your ride?</p>

              <div className="mt-4 flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                    className={`flex h-12 w-12 items-center justify-center text-4xl ${
                      star <= rating ? 'text-[#ffb703]' : 'text-line'
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                placeholder="Leave a comment (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-base text-ink placeholder:text-mute/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15"
                rows={3}
              />

              <button
                onClick={submitRating}
                disabled={rating === 0}
                className="mt-3 h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-40"
              >
                Submit rating
              </button>
            </div>
          )}

          {(submitted || existingRating) && (
            <div className="rounded-2xl border border-line bg-white p-5 text-center">
              <p className="font-bold text-ink">Thanks for rating your trip!</p>
            </div>
          )}

          {trip.status === 'cancelled' && (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <p className="font-bold text-ink">This trip was cancelled</p>
              <p className="mt-1 text-sm text-mute">You can book another ride any time.</p>
            </div>
          )}
        </main>
      )}

      {/* Bottom sheet */}
      <div
        className="relative shrink-0 rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_24px_rgba(23,33,43,0.12)]"
        style={{ zIndex: 1100, marginTop: showMap ? '-1.5rem' : 0 }}
      >
        {trip.status === 'requested' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-mute">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                availableDrivers.length > 0 ? 'bg-live' : 'bg-line'
              }`}
            />
            {availableDrivers.length > 0
              ? `${availableDrivers.length} ${
                  availableDrivers.length === 1 ? 'tricycle' : 'tricycles'
                } online`
              : 'No tricycles online right now'}
          </p>
        )}

        {hasDriver && driverContact && (
          <div className="flex items-center gap-3">
            {driverContact.avatar_url ? (
              <img
                src={driverContact.avatar_url}
                alt={driverContact.full_name}
                className="h-14 w-14 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-mist text-lg font-bold text-ink">
                {driverContact.full_name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">{driverContact.full_name}</p>
              <p className="text-sm text-mute">
                {driverContact.rating_count > 0 ? (
                  <>
                    <span className="text-[#ffb703]">★</span>{' '}
                    {Number(driverContact.avg_rating).toFixed(1)} ({driverContact.rating_count}{' '}
                    {driverContact.rating_count === 1 ? 'rating' : 'ratings'})
                  </>
                ) : (
                  'New driver, no ratings yet'
                )}
              </p>
              <p className="text-sm text-mute">{driverContact.phone}</p>
            </div>

            <a
              href={`tel:${driverContact.phone}`}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white active:bg-ink/90"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />
              </svg>
              Call
            </a>
          </div>
        )}

        {hasDriver && driverContact?.plate_number && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2">
            <span className="text-xs text-mute">Plate number</span>
            <span className="rounded-md border-2 border-ink bg-white px-2.5 py-0.5 font-mono text-base font-black tracking-[0.12em] text-ink">
              {driverContact.plate_number}
            </span>
          </div>
        )}

        {hasDriver && driverContactError && !driverContact && (
          <p className="text-sm text-red-600">
            Could not load driver contact: {driverContactError}
          </p>
        )}

        {isActive && (
          <button
            onClick={cancelTrip}
            className={`h-12 w-full rounded-2xl border border-red-200 font-semibold text-red-600 active:bg-red-50 ${
              trip.status === 'requested' ? 'mt-3' : 'mt-4'
            }`}
          >
            {trip.status === 'requested' ? 'Cancel ride request' : 'Cancel trip'}
          </button>
        )}

        {!isActive && (
          <button
            onClick={() => router.push('/book')}
            className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark"
          >
            Back to home
          </button>
        )}

        <button
          onClick={() => router.push('/history')}
          className="mt-2 h-10 w-full rounded-xl text-sm font-semibold text-mute active:bg-mist"
        >
          View trip history
        </button>
      </div>
    </div>
  )
}
