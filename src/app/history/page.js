'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

const STATUS_STYLES = {
  requested: { label: 'Requested', className: 'bg-mist text-mute' },
  accepted: { label: 'Driver on the way', className: 'bg-blue-50 text-blue-700' },
  arrived: { label: 'Driver arrived', className: 'bg-blue-50 text-blue-700' },
  ongoing: { label: 'In progress', className: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-[#e3f4ea] text-[#1f7a48]' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-600' },
}

export default function HistoryPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const loadTrips = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('passenger_id', user.id)
        .order('requested_at', { ascending: false })

      setTrips(data || [])
      setLoading(false)
    }

    loadTrips()
  }, [router])

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Trip history" backLabel="Back to booking" />

        <main className="mx-4 mt-4">
          {loading ? (
            <div className="space-y-3 motion-safe:animate-pulse" aria-busy="true">
              <div className="h-24 rounded-2xl bg-white" />
              <div className="h-24 rounded-2xl bg-white" />
              <div className="h-24 rounded-2xl bg-white" />
            </div>
          ) : trips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
              <p className="font-bold text-ink">No trips yet</p>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-relaxed text-mute">
                Your rides will show up here after you book your first trip.
              </p>
              <button
                onClick={() => router.push('/book')}
                className="mt-5 h-12 rounded-2xl bg-signal px-6 font-bold text-ink active:bg-signal-dark"
              >
                Book a ride
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => {
                const status = STATUS_STYLES[trip.status] || STATUS_STYLES.requested
                const when = new Date(trip.requested_at)

                return (
                  <button
                    key={trip.id}
                    onClick={() => router.push(`/trip/${trip.id}`)}
                    className="block w-full rounded-2xl border border-line bg-white p-4 text-left active:bg-mist"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-2xl font-extrabold tabular-nums text-ink">
                        ₱{Number(trip.fare || 0).toFixed(2)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-mute">
                      {Number(trip.distance_km || 0).toFixed(2)} km
                    </p>
                    <p className="mt-2 text-xs text-mute">
                      {when.toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {', '}
                      {when.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
