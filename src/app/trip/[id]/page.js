'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function TripPage() {
  const { id } = useParams()
  const router = useRouter()

  const [trip, setTrip] = useState(null)
  const [driverLocation, setDriverLocation] = useState(null)
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

  useEffect(() => {
    if (!trip?.driver_id) return
    if (['completed', 'cancelled'].includes(trip.status)) return

    const loadDriverLocation = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('current_lat, current_lng')
        .eq('id', trip.driver_id)
        .single()

      if (data?.current_lat && data?.current_lng) {
        setDriverLocation({
          lat: data.current_lat,
          lng: data.current_lng,
        })
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
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(driverChannel)
    }
  }, [trip?.driver_id, trip?.status])

  const statusMessages = {
    requested: 'no drivers available...',
    accepted: 'A driver is on the way!',
    arrived: 'Your driver has arrived!',
    ongoing: 'Trip in progress',
    completed: 'Trip completed',
    cancelled: 'Trip cancelled',
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
    driverLocation &&
    !['completed', 'cancelled'].includes(trip.status)

return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="p-4 text-center relative">
        <button
          onClick={() => router.push('/book')}
          className="absolute top-4 left-4 text-sm text-gray-500 underline"
        >
          Home
        </button>
        <h1 className="text-2xl font-bold text-green-600">
          {trip ? statusMessages[trip.status] : 'Loading...'}
        </h1>

        {trip && (
          <div className="text-gray-700 mt-1">
            <p>Fare: ₱{Number(trip.fare).toFixed(2)}</p>
            <p>Distance: {Number(trip.distance_km).toFixed(2)} km</p>
          </div>
        )}
        {trip?.status === 'requested' && showNoDriversHint && (
          <p className="text-sm text-orange-500 mt-2">
            No drivers nearby yet. You can keep waiting or cancel and try again later.
          </p>
        )}
      </div>

      {driverContact && !['requested', 'completed', 'cancelled'].includes(trip?.status) && (
        <div className="mx-4 mb-2 p-4 bg-green-50 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Your Driver</p>
            <p className="font-semibold text-gray-800">{driverContact.full_name}</p>
            <p className="text-sm text-gray-600">{driverContact.phone}</p>
            <p className="text-sm text-yellow-500 mt-1">
              {driverContact.rating_count > 0
                ? `★ ${Number(driverContact.avg_rating).toFixed(1)} (${driverContact.rating_count} ratings)`
                : 'New driver — no ratings yet'}
            </p>
          </div>
          <a
            href={`tel:${driverContact.phone}`}
            className="bg-green-600 text-white rounded-full px-4 py-2 text-sm font-semibold"
          >
            Call
          </a>
        </div>
      )}

      {driverContactError && !driverContact && !['requested', 'completed', 'cancelled'].includes(trip?.status) && (
        <p className="text-center text-xs text-red-500 px-4 mb-2">
          Could not load driver contact: {driverContactError}
        </p>
      )}

      {showMap && (
        <div
          style={{
            height: '350px',
            width: '100%',
            position: 'relative',
          }}
        >
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
          />
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="text-center space-y-4 w-full max-w-sm">
          {trip?.status === 'completed' &&
            !existingRating &&
            !submitted && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <p className="font-semibold text-gray-700">
                  Rate your driver
                </p>

                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-3xl ${
                        star <= rating
                          ? 'text-yellow-400'
                          : 'text-gray-300'
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
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
                  rows={3}
                />

                <button
                  onClick={submitRating}
                  disabled={rating === 0}
                  className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold disabled:opacity-40"
                >
                  Submit Rating
                </button>
              </div>
            )}

          {(submitted || existingRating) && (
            <p className="text-green-600 font-semibold">
              Thanks for rating your trip!
            </p>
          )}

          {trip && ['requested', 'accepted', 'arrived', 'ongoing'].includes(trip.status) && (
            <button
              onClick={cancelTrip}
              className="w-full bg-red-500 text-white rounded-xl py-3 font-semibold hover:bg-red-600 transition"
            >
              {trip.status === 'requested' ? 'Cancel Ride Request' : 'Cancel Trip'}
            </button>
          )}

          <button
            onClick={() => router.push('/history')}
            className="text-green-600 text-sm font-medium"
          >
            View Trip History
          </button>
        </div>
      </div>
    </div>
  )
}