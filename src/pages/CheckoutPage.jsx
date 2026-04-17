import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/context/AuthContext'
import { paymentsAPI } from '@/api/api'

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace('/api', '')
function imgSrc(url) { return url ? `${BASE_URL}${url}` : null }

const AU_STATES = ['ACT','NSW','NT','QLD','SA','TAS','VIC','WA']
const TITLES    = ['Mr','Mrs','Ms','Miss','Dr','Prof']

// ── Stripe payment form ───────────────────────────────────────────────────────
function PaymentForm({ totalPrice, onSuccess }) {
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
    if (stripeErr) { setError(stripeErr.message); setLoading(false) }
    else if (paymentIntent?.status === 'succeeded') onSuccess()
    else { setError('Payment incomplete. Please try again.'); setLoading(false) }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-black text-white text-sm py-4 rounded hover:bg-gray-800 disabled:opacity-50 transition-colors font-medium tracking-wide mt-2"
      >
        {loading ? 'Processing…' : `Confirm & Pay — AUD ${totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}`}
      </button>
    </form>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ num, title, children, action, actionLabel }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg mb-4 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center font-medium">{num}</span>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        {action && (
          <button onClick={action} className="text-xs text-gray-500 underline underline-offset-2 hover:text-black transition-colors">
            {actionLabel}
          </button>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
const selectCls = inputCls + " bg-white"

// ── Main checkout page ────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const { items, totalPrice, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [delivery, setDelivery] = useState('home') // 'home' | 'collect'
  const [addr, setAddr] = useState({
    title: '', firstName: '', lastName: '', company: '',
    address1: '', address2: '', postcode: '', city: '', state: 'NSW',
    country: 'Australia', phoneType: 'Mobile', phonePrefix: '+61', phone: '',
  })
  const [errors,       setErrors]       = useState({})
  const [step,         setStep]         = useState(1) // 1=delivery, 2=payment
  const [stripePromise, setStripePromise] = useState(null)
  const [clientSecret,  setClientSecret]  = useState(null)
  const [stripeError,   setStripeError]   = useState(null)
  const [confirmed,     setConfirmed]     = useState(false)

  useEffect(() => {
    if (items.length === 0 && !confirmed) navigate('/bag')
  }, [items])

  function set(k, v) { setAddr(a => ({ ...a, [k]: v })); setErrors(e => ({ ...e, [k]: null })) }

  function validate() {
    const e = {}
    if (!addr.firstName.trim()) e.firstName = 'Required'
    if (!addr.lastName.trim())  e.lastName  = 'Required'
    if (delivery === 'home') {
      if (!addr.address1.trim()) e.address1 = 'Required'
      if (!addr.postcode.trim()) e.postcode = 'Required'
      if (!addr.city.trim())     e.city     = 'Required'
      if (!addr.phone.trim())    e.phone    = 'Required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleContinueToPayment() {
    if (!validate()) return
    try {
      const [configRes, intentRes] = await Promise.all([
        paymentsAPI.getConfig(),
        paymentsAPI.shopIntent(items.map(i => ({ product_id: i.id, qty: i.qty }))),
      ])
      setStripePromise(loadStripe(configRes.data.publishableKey))
      setClientSecret(intentRes.data.clientSecret)
      setStep(2)
      setTimeout(() => document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      setStripeError(err.response?.data?.message ?? 'Could not start payment. Please try again.')
    }
  }

  function handleSuccess() {
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
        <p className="text-sm text-gray-500 mb-2">Thank you, {addr.firstName}.</p>
        <p className="text-sm text-gray-500 mb-8">Your order will be ready for {delivery === 'collect' ? 'collection' : 'delivery'} shortly.</p>
        <Link to="/shopping" className="text-sm underline underline-offset-4 text-gray-700 hover:text-black transition-colors">
          Continue Shopping
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 pt-[84px]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/bag')} className="text-gray-400 hover:text-black transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          Secure Payment
        </div>
        <div className="w-5" />
      </div>

      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 lg:flex lg:gap-10 lg:items-start">

        {/* ── Left: form ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* 1. Account */}
          <Section num="✓" title="My Account">
            <p className="text-xs text-gray-400 mb-1">Your email is</p>
            <p className="text-sm text-gray-700">{user?.email ?? 'Not signed in'}</p>
          </Section>

          {/* 2. Delivery options */}
          <Section num={2} title="Delivery Options">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Select a Delivery Option</p>
            <div className="flex gap-3 mb-6 flex-wrap">
              {[['home','Home Delivery'],['collect','Collect in Store']].map(([val, label]) => (
                <label
                  key={val}
                  className={`flex items-center gap-2.5 flex-1 min-w-[140px] border rounded-md px-4 py-3 cursor-pointer transition-colors ${delivery === val ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-400'}`}
                >
                  <input
                    type="radio" name="delivery" value={val} checked={delivery === val}
                    onChange={() => setDelivery(val)} className="accent-black"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>

            {delivery === 'home' && (
              <>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-4">Delivery address</p>
                <p className="text-xs text-red-400 text-right mb-4">Required Fields *</p>
                <div className="space-y-4">
                  <Field label="Address Description (e.g. Home, Work…)">
                    <input value={addr.addrLabel ?? ''} onChange={e => set('addrLabel', e.target.value)} className={inputCls} placeholder='e.g. "Home"' />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Title">
                      <select value={addr.title} onChange={e => set('title', e.target.value)} className={selectCls}>
                        <option value="">—</option>
                        {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <div />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="First Name" required>
                      <input value={addr.firstName} onChange={e => set('firstName', e.target.value)} className={`${inputCls} ${errors.firstName ? 'border-red-300' : ''}`} placeholder="First name" />
                      {errors.firstName && <p className="text-xs text-red-400 mt-0.5">{errors.firstName}</p>}
                    </Field>
                    <Field label="Last Name" required>
                      <input value={addr.lastName} onChange={e => set('lastName', e.target.value)} className={`${inputCls} ${errors.lastName ? 'border-red-300' : ''}`} placeholder="Last name" />
                      {errors.lastName && <p className="text-xs text-red-400 mt-0.5">{errors.lastName}</p>}
                    </Field>
                  </div>

                  <Field label="Company name">
                    <input value={addr.company} onChange={e => set('company', e.target.value)} className={inputCls} placeholder="Optional" />
                  </Field>

                  <Field label="Address 1 (Street number, street name)" required>
                    <input value={addr.address1} onChange={e => set('address1', e.target.value)} className={`${inputCls} ${errors.address1 ? 'border-red-300' : ''}`} placeholder="Street address" />
                    {errors.address1 && <p className="text-xs text-red-400 mt-0.5">{errors.address1}</p>}
                  </Field>

                  <Field label="Address 2 (Apartment, unit, suite, or floor number)">
                    <input value={addr.address2} onChange={e => set('address2', e.target.value)} className={inputCls} placeholder="Optional" />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Postal Code" required>
                      <input value={addr.postcode} onChange={e => set('postcode', e.target.value)} className={`${inputCls} ${errors.postcode ? 'border-red-300' : ''}`} placeholder="e.g. 2121" />
                      {errors.postcode && <p className="text-xs text-red-400 mt-0.5">{errors.postcode}</p>}
                    </Field>
                    <Field label="City / Suburb" required>
                      <input value={addr.city} onChange={e => set('city', e.target.value)} className={`${inputCls} ${errors.city ? 'border-red-300' : ''}`} placeholder="e.g. Epping" />
                      {errors.city && <p className="text-xs text-red-400 mt-0.5">{errors.city}</p>}
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="State / Suburb" required>
                      <select value={addr.state} onChange={e => set('state', e.target.value)} className={selectCls}>
                        {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Country / Region">
                      <input value="Australia" readOnly className={`${inputCls} bg-gray-50 text-gray-500`} />
                    </Field>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Main phone number <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-2">
                      <select value={addr.phoneType} onChange={e => set('phoneType', e.target.value)} className={`${selectCls} w-28`}>
                        {['Mobile','Home','Work'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={addr.phonePrefix} onChange={e => set('phonePrefix', e.target.value)} className={`${selectCls} w-24`}>
                        <option value="+61">+61</option>
                        <option value="+1">+1</option>
                        <option value="+44">+44</option>
                        <option value="+86">+86</option>
                        <option value="+852">+852</option>
                        <option value="+886">+886</option>
                      </select>
                      <input
                        value={addr.phone} onChange={e => set('phone', e.target.value)}
                        className={`${inputCls} flex-1 ${errors.phone ? 'border-red-300' : ''}`}
                        placeholder="Phone number"
                        type="tel"
                      />
                    </div>
                    {errors.phone && <p className="text-xs text-red-400 mt-0.5">{errors.phone}</p>}
                  </div>

                </div>
              </>
            )}

            {delivery === 'collect' && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 mb-1">Epping Table Tennis Club</p>
                <p className="text-sm text-gray-500">You will be contacted to arrange a pick-up time.</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="First Name" required>
                    <input value={addr.firstName} onChange={e => set('firstName', e.target.value)} className={`${inputCls} ${errors.firstName ? 'border-red-300' : ''}`} placeholder="First name" />
                    {errors.firstName && <p className="text-xs text-red-400 mt-0.5">{errors.firstName}</p>}
                  </Field>
                  <Field label="Last Name" required>
                    <input value={addr.lastName} onChange={e => set('lastName', e.target.value)} className={`${inputCls} ${errors.lastName ? 'border-red-300' : ''}`} placeholder="Last name" />
                    {errors.lastName && <p className="text-xs text-red-400 mt-0.5">{errors.lastName}</p>}
                  </Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <button
                onClick={handleContinueToPayment}
                className="w-full mt-6 bg-black text-white text-sm py-3.5 rounded hover:bg-gray-800 transition-colors font-medium tracking-wide"
              >
                Continue to Payment
              </button>
            )}
            {stripeError && <p className="text-sm text-red-500 mt-3">{stripeError}</p>}
          </Section>

          {/* 3. Payment */}
          <div id="payment-section">
            <Section num={3} title="Payment">
              {step < 2 ? (
                <p className="text-sm text-gray-400">Complete delivery details above to continue.</p>
              ) : stripePromise && clientSecret ? (
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                  <PaymentForm totalPrice={totalPrice} onSuccess={handleSuccess} />
                </Elements>
              ) : (
                <div className="py-4 flex justify-center">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
                </div>
              )}
            </Section>
          </div>

        </div>

        {/* ── Right: bag summary ───────────────────────────────── */}
        <div className="lg:w-80 mt-6 lg:mt-0 lg:sticky lg:top-[100px]">
          <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">My Shopping Bag ({items.length})</p>
              <Link to="/bag" className="text-xs text-gray-500 underline underline-offset-2 hover:text-black transition-colors">
                Modify
              </Link>
            </div>

            {/* Items */}
            <div className="divide-y divide-gray-50 px-5">
              {items.map(item => (
                <div key={item.id} className="flex gap-3 py-4">
                  <div className="w-14 h-14 flex-shrink-0 bg-gray-50 overflow-hidden rounded">
                    {imgSrc(item.image) ? (
                      <img src={imgSrc(item.image)} alt={item.name} className="w-full h-full object-cover" />
                    ) : <div className="w-full h-full bg-gray-100" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.code && <p className="text-[10px] text-gray-400">{item.code}</p>}
                    <p className="text-xs font-medium text-gray-900 leading-snug">{item.name}</p>
                    {item.price != null && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        AUD {(Number(item.price) * item.qty).toLocaleString('en-AU', { minimumFractionDigits: 0 })}
                        {item.qty > 1 && <span className="text-gray-400"> ×{item.qty}</span>}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="px-5 py-4 border-t border-gray-100 space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>AUD {totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Shipping</span>
                <span>AUD 0</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-100">
                <span>Total</span>
                <span>AUD {totalPrice.toLocaleString('en-AU', { minimumFractionDigits: 0 })}</span>
              </div>
            </div>

            {/* Payment info row */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              <div>
                <p className="text-xs font-medium text-gray-900">Payment information</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Credit card, debit card, or Bank Transfer</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
