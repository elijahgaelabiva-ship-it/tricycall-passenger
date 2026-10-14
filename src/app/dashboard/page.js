export default function DashboardPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mist px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center">
        <h1 className="text-xl font-extrabold text-ink">You're logged in</h1>
        <p className="mt-2 text-sm text-mute">Ready to book a ride?</p>
        <a
          href="/book"
          className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-signal font-bold text-ink active:bg-signal-dark"
        >
          Book a ride
        </a>
      </div>
    </div>
  )
}
