import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCart } from '@/context/CartContext'
import { paymentsAPI } from '@/api/api'

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '')
function imgSrc(url) { return url ? `${BASE_URL}${url}` : null }

// ── Stripe checkout form ──────────────────────────────────────────────────────
function CheckoutForm({ totalPrice, onSuccess, onCancel }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handlePay(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true); setError(null)
    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '/order-confirmed' },
      redirect: 'if_required',
    })
    if (stripeErr) {
      setError(stripeErr.message)
      setLoading(false)
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess()
    } else {
      setError('Payment incomplete. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-gray-200 text-sm py-3 rounded hover:border-gray-400 transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-black text-white text-sm py-3 rounded hover:bg-gray-800 disabled:opacity-50 transition-colors font-medium"
        >
          {loading ? 'Processing…' : `Pay AUD ${totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}`}
        </button>
      </div>
    </form>
  )
}

// ── Checkout modal ────────────────────────────────────────────────────────────
function CheckoutModal({ items, totalPrice, onClose, onSuccess }) {
  const [stripePromise, setStripePromise] = useState(null)
  const [clientSecret,  setClientSecret]  = useState(null)
  const [error,         setError]         = useState(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    paymentsAPI.getConfig()
      .then(({ data }) => setStripePromise(loadStripe(data.publishableKey)))
      .catch(() => setError('Payment system unavailable.'))

    const payload = items.map(i => ({ product_id: i.id, qty: i.qty }))
    paymentsAPI.shopIntent(payload)
      .then(({ data }) => setClientSecret(data.clientSecret))
      .catch(err => setError(err.response?.data?.message ?? 'Could not start checkout.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">
          {loading && (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-500 py-4">{error}</p>}
          {!loading && !error && stripePromise && clientSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
              <CheckoutForm
                totalPrice={totalPrice}
                onSuccess={onSuccess}
                onCancel={onClose}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Info accordion row ────────────────────────────────────────────────────────
function InfoRow({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 transition-colors px-1">
      <div className="w-8 text-gray-400 flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </div>
  )
}

// ── Main cart page ────────────────────────────────────────────────────────────
export default function CartPage() {
  const { items, updateQty, removeItem, clearCart, totalPrice } = useCart()
  const navigate = useNavigate()
  const [checkout, setCheckout] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  function handleSuccess() {
    setCheckout(false)
    clearCart()
    setConfirmed(true)
  }

  if (confirmed) return (
    <div className="min-h-screen bg-white pt-[84px] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 bg-black rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-light text-gray-900 mb-2">Order confirmed</h1>
        <p className="text-sm text-gray-500 mb-8">Thank you for your purchase. You'll receive a confirmation shortly.</p>
        <Link to="/shopping" className="text-sm underline underline-offset-4 text-gray-700 hover:text-black transition-colors">
          Continue Shopping
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white pt-[84px]">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">

        <h1 className="text-2xl font-light text-gray-900 mb-8">
          My Shopping Bag {items.length > 0 && <span className="text-gray-400 text-lg">({items.length})</span>}
        </h1>

        {items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-gray-400 text-sm mb-6">Your bag is empty.</p>
            <Link to="/shopping" className="text-sm underline underline-offset-4 text-gray-700 hover:text-black transition-colors">
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div className="lg:flex lg:gap-16">

            {/* ── Left: items ──────────────────────────────────────── */}
            <div className="flex-1 space-y-6">
              {items.map(item => (
                <div key={item.id} className="flex gap-5 pb-6 border-b border-gray-100">
                  {/* Image */}
                  <div className="w-28 h-28 flex-shrink-0 bg-gray-50 overflow-hidden">
                    {imgSrc(item.image) ? (
                      <img src={imgSrc(item.image)} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-100" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    {item.code && <p className="text-xs text-gray-400 mb-0.5">{item.code}</p>}
                    <p className="text-sm font-medium text-gray-900 leading-snug">{item.name}</p>
                    <Link
                      to={`/shopping/${item.id}`}
                      className="text-xs text-gray-500 underline underline-offset-2 hover:text-black transition-colors mt-0.5 inline-block"
                    >
                      View details
                    </Link>

                    <div className="mt-3 flex items-center justify-between">
                      {/* Qty stepper */}
                      <div className="flex items-center border border-gray-200 rounded">
                        <button
                          onClick={() => updateQty(item.id, item.qty - 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-black transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                          </svg>
                        </button>
                        <span className="w-8 text-center text-sm">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.id, item.qty + 1)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-black transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex items-center gap-4">
                        {item.price != null && (
                          <p className="text-sm text-gray-700">
                            AUD {(Number(item.price) * item.qty).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                          </p>
                        )}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Right: summary ───────────────────────────────────── */}
            <div className="lg:w-80 mt-8 lg:mt-0 lg:sticky lg:top-[100px] lg:self-start">

              {/* Order summary */}
              <div className="space-y-3 pb-5 border-b border-gray-100 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>AUD {totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Shipping</span>
                  <span>AUD 0</span>
                </div>
                <div className="flex justify-between font-medium text-gray-900 pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span>AUD {totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</span>
                </div>
              </div>

              {/* Checkout button */}
              <div className="pt-5 space-y-3">
                <button
                  onClick={() => setCheckout(true)}
                  className="w-full bg-black text-white text-sm py-3.5 rounded hover:bg-gray-800 transition-colors font-medium tracking-wide"
                >
                  Proceed to Checkout
                </button>
                <button
                  onClick={() => navigate('/shopping')}
                  className="w-full text-sm text-gray-600 hover:text-black py-2 transition-colors underline underline-offset-4"
                >
                  Continue Shopping
                </button>
              </div>

              {/* Info rows */}
              <div className="mt-6">
                <InfoRow
                  icon={<svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>}
                  title="Payment information"
                  subtitle="Credit card, debit card, or Bank Transfer"
                />
                <InfoRow
                  icon={<svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
                  title="Delivery details"
                  subtitle="Collect in store or arrange delivery"
                />
                <InfoRow
                  icon={<svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>}
                  title="Exchange & Return"
                  subtitle="Contact us within 14 days"
                />
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Stripe checkout modal */}
      {checkout && (
        <CheckoutModal
          items={items}
          totalPrice={totalPrice}
          onClose={() => setCheckout(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}
