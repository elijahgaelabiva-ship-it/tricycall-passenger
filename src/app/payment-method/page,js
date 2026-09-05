'use client'

import { useRouter } from 'next/navigation'

export default function PaymentMethodPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white px-4 py-8 flex flex-col items-center">
      <button
        onClick={() => router.push('/book')}
        className="self-start text-sm text-gray-500 underline mb-4"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-green-600 mb-6">Payment Method</h1>

      <div className="w-full max-w-sm">
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
            ₱
          </div>
          <div>
            <p className="font-semibold text-gray-800">Cash</p>
            <p className="text-sm text-gray-500">Pay your driver directly at the end of your trip</p>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          Online payment methods aren't available yet — all TRICYCALL.SF rides are paid in cash for now.
        </p>
      </div>
    </div>
  )
}
