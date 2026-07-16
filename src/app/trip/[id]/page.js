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

  useEffect(() => {
    if (trip?.status !== 'requested') {
      setShowNoDriversHint(false)
      return
    }
    const timer = setTimeout(() => setShowNoDriversHint(true), 20000) // 20 seconds
    return () => clearTimeout(timer)
  }, [trip?.status])
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [existingRating, setExistingRating] = useState(null)

  useEffect(() => {
    const loadTrip = async () => {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single()

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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${id}`,
        },
        (payload) => setTrip(payload.new)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tripChannel)
    }
  }, [id])

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

  const cancelTrip = async () => {
    const { error } = await supabase
      .from('trips')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'requested')

    if (error) {
      alert('Could not cancel: ' + error.message)
      return
    }

    setTrip((prev) => ({
      ...prev,
      status: 'cancelled',
    }))
  }

  const showMap =
    trip &&
    driverLocation &&
    !['completed', 'cancelled'].includes(trip.status)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="p-4 text-center">
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

          {trip?.status === 'requested' && (
            <button
              onClick={cancelTrip}
              className="w-full bg-red-500 text-white rounded-xl py-3 font-semibold hover:bg-red-600 transition"
            >
              Cancel Ride Request
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