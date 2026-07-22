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
  const [locationError, setLocationError] = useState('')
  const [fareSettings, setFareSettings] = useState(null)
  const [distanceKm, setDistanceKm] = useState(null)
  const [estimatedFare, setEstimatedFare] = useState(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [blockedMessage, setBlockedMessage] = useState('')
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
        .select('strike_count')
        .eq('id', user.id)
        .single()

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

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (blockedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-red-600 font-semibold">{blockedMessage}</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/login')
            }}
            className="text-green-600 text-sm underline"
          >
            Logout
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <div className="p-4 bg-white shadow-sm z-10 relative">
        <h1 className="text-xl font-bold text-green-600 text-center">
          Where are you going?
        </h1>
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            router.push('/login')
          }}
          className="absolute top-4 right-4 text-sm text-gray-500 underline"
        >
          Logout
        </button>
        {locationError && (
          <p className="text-red-600 text-sm text-center mt-2">{locationError}</p>
        )}
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden" style={{ position: 'relative' }}>
        {currentLocation ? (
          <MapView
            currentLocation={currentLocation}
            destination={destination}
            onMapClick={handleMapClick}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Detecting your location...</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-white shadow-inner space-y-2">
        {!destination && (
          <p className="text-sm text-gray-600">Tap on the map to set your destination</p>
        )}

        {destination && distanceKm !== null && (
          <div className="text-sm text-gray-700 space-y-1">
            <p>Distance: {distanceKm.toFixed(2)} km</p>
            <p className="font-semibold text-green-700">
              Estimated Fare: ₱{estimatedFare.toFixed(2)}
            </p>
          </div>
        )}

        {requestError && (
          <p className="text-red-600 text-sm">{requestError}</p>
        )}

        <button
          onClick={handleRequestRide}
          disabled={!destination || requesting || estimatedFare === null}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {requesting ? 'Requesting...' : 'Request Ride'}
        </button>
      </div>
    </div>
  )
}