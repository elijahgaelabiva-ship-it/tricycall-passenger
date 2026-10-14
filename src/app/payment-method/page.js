'use client'

import PageHeader from '@/components/PageHeader'

export default function PaymentMethodPage() {
  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Payment method" backLabel="Back" />

        <main className="mx-4 mt-4">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-xl font-bold text-white">
              ₱
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">Cash</p>
              <p className="text-sm leading-snug text-mute">
                Pay your driver directly at the end of your trip.
              </p>
            </div>
            <span className="rounded-full bg-[#e3f4ea] px-2.5 py-1 text-xs font-bold text-[#1f7a48]">
              Selected
            </span>
          </div>

          <p className="mt-4 px-1 text-center text-xs leading-relaxed text-mute">
            Online payment isn't available yet. All TRICYCALL.SF rides are paid in cash for now.
          </p>
        </main>
      </div>
    </div>
  )
}
